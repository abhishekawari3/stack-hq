# @stackhq/config

Environment-based config loader with schema validation, type coercion, and
a dependency-free `.env` parser.

```bash
npm install @stackhq/config
```

## Table of contents

- [loadConfig](#loadconfig)
- [loadEnvFile / parseEnvFile](#loadenvfile--parseenvfile)

---

## loadConfig

Validates and coerces environment variables (or any string-keyed source)
against a declared schema, collecting **all** errors at once instead of
failing on the first bad field.

```ts
loadConfig<S extends ConfigSchema>(
  schema: S,
  source?: Record<string, string | undefined> // default: process.env
): { [K in keyof S]: any } // frozen object
```

```ts
interface FieldSpec<T = any> {
  type: "string" | "number" | "boolean" | "json" | "array";
  required?: boolean;
  default?: T;
  delimiter?: string; // for "array" type, default ","
  validate?: (value: T) => string | undefined | null; // return an error message to reject
}
```

### Type coercion rules

| `type`    | Behavior                                                                          |
| --------- | --------------------------------------------------------------------------------- |
| `string`  | Passed through as-is                                                              |
| `number`  | `Number(raw)`; throws if `NaN`                                                    |
| `boolean` | `true` for `"true"`, `"1"`, `"yes"`, `"on"` (case-insensitive); `false` otherwise |
| `json`    | `JSON.parse(raw)`; throws on invalid JSON                                         |
| `array`   | Splits on `delimiter` (default `,`), trims, drops empty entries                   |

### Example

```ts
import { loadConfig, ConfigValidationError } from "@stackhq/config";

try {
  const config = loadConfig({
    PORT: { type: "number", default: 3000 },
    DATABASE_URL: { type: "string", required: true },
    FEATURE_FLAGS: { type: "array" },
    DEBUG: { type: "boolean", default: false },
    CORS_ORIGINS: {
      type: "array",
      validate: (origins) =>
        origins.length === 0 ? "must specify at least one origin" : undefined,
    },
  });

  // config.PORT: number, config.FEATURE_FLAGS: string[], fully typed and frozen
} catch (err) {
  if (err instanceof ConfigValidationError) {
    console.error(err.message); // lists every invalid/missing field at once
    process.exit(1);
  }
  throw err;
}
```

---

## loadEnvFile / parseEnvFile

A minimal, dependency-free `.env` parser — supports `KEY=value`, quoted
values, `#` comments, and blank lines.

```ts
parseEnvFile(content: string): Record<string, string>
loadEnvFile(path: string, options?: { override?: boolean }): Record<string, string>
```

`loadEnvFile` reads a file from disk and merges it into `process.env`
(without overwriting existing variables unless `override: true`). A missing
file is not an error — it simply returns `{}`.

### Example

```ts
import { loadEnvFile, loadConfig } from "@stackhq/config";

loadEnvFile(".env"); // merge .env into process.env before validating

const config = loadConfig({
  PORT: { type: "number", default: 3000 },
});
```

`.env` file format supported:

```
# Comments are ignored
PORT=3000
DATABASE_URL="postgres://user:pass@localhost:5432/db"
FEATURE_FLAGS=a,b,c
MULTILINE_VALUE="line one\nline two"
```
