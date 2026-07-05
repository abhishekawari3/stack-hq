import { randomBytes } from "crypto";

export interface SessionData {
  [key: string]: any;
}

export interface SessionRecord<T extends SessionData = SessionData> {
  id: string;
  data: T;
  createdAt: number;
  expiresAt: number;
}

export interface SessionStore {
  get(id: string): Promise<SessionRecord | null> | SessionRecord | null;
  set(id: string, record: SessionRecord): Promise<void> | void;
  delete(id: string): Promise<void> | void;
}

/** Default in-memory store. Swap with a Redis-backed SessionStore in production. */
export class InMemorySessionStore implements SessionStore {
  private map = new Map<string, SessionRecord>();

  get(id: string): SessionRecord | null {
    const record = this.map.get(id);
    if (!record) return null;
    if (record.expiresAt < Date.now()) {
      this.map.delete(id);
      return null;
    }
    return record;
  }

  set(id: string, record: SessionRecord): void {
    this.map.set(id, record);
  }

  delete(id: string): void {
    this.map.delete(id);
  }
}

export interface SessionManagerConfig {
  store?: SessionStore;
  ttlMs?: number; // default session lifetime
  cookieName?: string;
}

export class SessionManager<T extends SessionData = SessionData> {
  private store: SessionStore;
  private ttlMs: number;
  public cookieName: string;

  constructor(config: SessionManagerConfig = {}) {
    this.store = config.store ?? new InMemorySessionStore();
    this.ttlMs = config.ttlMs ?? 1000 * 60 * 60 * 24; // 24h default
    this.cookieName = config.cookieName ?? "sid";
  }

  private generateId(): string {
    return randomBytes(32).toString("hex");
  }

  async create(data: T, ttlMs?: number): Promise<SessionRecord<T>> {
    const id = this.generateId();
    const now = Date.now();
    const record: SessionRecord<T> = {
      id,
      data,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.ttlMs),
    };
    await this.store.set(id, record);
    return record;
  }

  async get(id: string): Promise<SessionRecord<T> | null> {
    return (await this.store.get(id)) as SessionRecord<T> | null;
  }

  async touch(id: string, extendMs?: number): Promise<SessionRecord<T> | null> {
    const record = await this.get(id);
    if (!record) return null;
    record.expiresAt = Date.now() + (extendMs ?? this.ttlMs);
    await this.store.set(id, record);
    return record;
  }

  async destroy(id: string): Promise<void> {
    await this.store.delete(id);
  }

  /** Express-style middleware: reads session cookie, attaches req.session */
  middleware() {
    return async (req: any, res: any, next: any) => {
      const id = req.cookies?.[this.cookieName];
      let record = id ? await this.get(id) : null;

      if (!record) {
        record = await this.create({} as T);
        res.setHeader?.(
          "Set-Cookie",
          `${this.cookieName}=${record.id}; HttpOnly; Path=/; Max-Age=${Math.floor(this.ttlMs / 1000)}`
        );
      }

      req.session = record.data;
      req.sessionId = record.id;
      next();
    };
  }
}
