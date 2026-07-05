export type MetricType = "counter" | "gauge" | "histogram";

interface HistogramData {
  count: number;
  sum: number;
  buckets: Map<number, number>; // upper bound -> cumulative count
}

/**
 * Lightweight, dependency-free metrics registry supporting counters,
 * gauges, and histograms, with Prometheus-style text exposition so it
 * can be scraped directly or bridged into a real Prometheus client.
 */
export class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, HistogramData>();
  private defaultBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + value);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.gauges.set(this.key(name, labels), value);
  }

  incrementGauge(name: string, delta = 1, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    this.gauges.set(k, (this.gauges.get(k) ?? 0) + delta);
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>, buckets?: number[]): void {
    const k = this.key(name, labels);
    let hist = this.histograms.get(k);
    if (!hist) {
      hist = { count: 0, sum: 0, buckets: new Map((buckets ?? this.defaultBuckets).map((b) => [b, 0])) };
      this.histograms.set(k, hist);
    }
    hist.count++;
    hist.sum += value;
    for (const bound of hist.buckets.keys()) {
      if (value <= bound) hist.buckets.set(bound, hist.buckets.get(bound)! + 1);
    }
  }

  /** Convenience: time an async function and record it into a histogram (ms) */
  async time<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.observeHistogram(name, Date.now() - start, labels);
    }
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.key(name, labels)) ?? 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    return this.gauges.get(this.key(name, labels)) ?? 0;
  }

  /** Render all metrics in Prometheus text exposition format */
  export(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters) lines.push(`${k} ${v}`);
    for (const [k, v] of this.gauges) lines.push(`${k} ${v}`);
    for (const [k, hist] of this.histograms) {
      const baseName = k.split("{")[0];
      for (const [bound, count] of hist.buckets) {
        lines.push(`${baseName}_bucket{le="${bound}"} ${count}`);
      }
      lines.push(`${baseName}_bucket{le="+Inf"} ${hist.count}`);
      lines.push(`${baseName}_sum ${hist.sum}`);
      lines.push(`${baseName}_count ${hist.count}`);
    }
    return lines.join("\n");
  }

  /** Express-style handler for a /metrics endpoint */
  handler() {
    return (_req: any, res: any) => {
      res.setHeader?.("Content-Type", "text/plain; version=0.0.4");
      res.send ? res.send(this.export()) : res.end(this.export());
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
