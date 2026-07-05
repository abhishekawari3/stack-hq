export type FieldType = "string" | "number" | "boolean" | "json" | "array";

export interface FieldSpec<T = any> {
  type: FieldType;
  required?: boolean;
  default?: T;
  /** For "array" type: the delimiter to split on (default ",") */
  delimiter?: string;
  /** Custom validator; return an error message string to reject, or undefined/null to accept */
  validate?: (value: T) => string | undefined | null;
}

export type ConfigSchema = Record<string, FieldSpec>;

export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Config validation failed:\n${errors.map((e) => ` - ${e}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

function coerce(raw: string, spec: FieldSpec): any {
  switch (spec.type) {
    case "string":
      return raw;
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`expected a number, got "${raw}"`);
      return n;
    }
    case "boolean":
      return ["true", "1", "yes", "on"].includes(raw.toLowerCase());
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`expected valid JSON, got "${raw}"`);
      }
    case "array":
      return raw.split(spec.delimiter ?? ",").map((s) => s.trim()).filter(Boolean);
    default:
      return raw;
  }
}

/**
 * Loads and validates configuration from an environment-variable-like
 * source (defaults to process.env), coercing string values into the
 * declared types and enforcing required fields + custom validators.
 * Throws ConfigValidationError with ALL problems at once, rather than
 * failing on the first one, so you can fix everything in one pass.
 */
export function loadConfig<S extends ConfigSchema>(
  schema: S,
  source: Record<string, string | undefined> = process.env
): { [K in keyof S]: any } {
  const result: Record<string, any> = {};
  const errors: string[] = [];

  for (const [key, spec] of Object.entries(schema)) {
    const raw = source[key];

    if (raw === undefined || raw === "") {
      if (spec.default !== undefined) {
        result[key] = spec.default;
        continue;
      }
      if (spec.required) {
        errors.push(`"${key}" is required but not set`);
        continue;
      }
      result[key] = undefined;
      continue;
    }

    try {
      const value = coerce(raw, spec);
      const validationError = spec.validate?.(value);
      if (validationError) {
        errors.push(`"${key}": ${validationError}`);
        continue;
      }
      result[key] = value;
    } catch (err: any) {
      errors.push(`"${key}": ${err.message}`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return Object.freeze(result) as { [K in keyof S]: any };
}
