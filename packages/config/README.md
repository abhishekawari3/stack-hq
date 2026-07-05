# @stack-hq/config

Environment-based config loader with schema validation, type coercion (string/number/boolean/array/json), defaults, required-field enforcement, and a dependency-free `.env` parser.

## Install
```bash
npm install @stack-hq/config
```

## Usage
```ts
import { loadConfig, loadEnvFile } from "@stack-hq/config";

loadEnvFile(".env"); // optional — merges .env into process.env

const config = loadConfig({
  PORT: { type: "number", default: 3000 },
  DATABASE_URL: { type: "string", required: true },
  FEATURE_FLAGS: { type: "array" },
  DEBUG: { type: "boolean", default: false },
});

// config.PORT is a number, config.FEATURE_FLAGS is a string[], fully typed & frozen
```

All validation errors are collected and thrown together via `ConfigValidationError`, so you fix everything in one pass instead of one env var at a time.

## License
MIT
