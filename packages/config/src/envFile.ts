/**
 * Minimal, dependency-free .env parser (dotenv-compatible subset):
 * supports KEY=value, quoted values, comments, and blank lines.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Unescape \n inside double-quoted values (common dotenv behavior)
    value = value.replace(/\\n/g, "\n");

    result[key] = value;
  }

  return result;
}

/** Load a .env file from disk and merge it into process.env (without overwriting existing vars by default) */
export function loadEnvFile(path: string, options: { override?: boolean } = {}): Record<string, string> {
  const fs = require("fs") as typeof import("fs");
  let content: string;
  try {
    content = fs.readFileSync(path, "utf-8");
  } catch {
    return {}; // missing .env file is not fatal
  }

  const parsed = parseEnvFile(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (options.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
}
