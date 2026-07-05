# @stackhq/auth

JWT authentication, OAuth 2.0 (Google/GitHub/Facebook), session authentication,
refresh-token rotation with theft detection, and token blacklisting.

```bash
npm install @stackhq/auth
```

## Table of contents

- [JWTAuth](#jwtauth)
- [OAuthClient / OAuthManager](#oauthclient--oauthmanager)
- [SessionManager](#sessionmanager)
- [TokenRefreshService](#tokenrefreshservice)
- [TokenBlacklist](#tokenblacklist)

---

## JWTAuth

Signs and verifies access/refresh JWTs, and exposes an Express-style
middleware.

### Constructor

```ts
new JWTAuth(config: JWTConfig)
```

```ts
interface JWTConfig {
  accessSecret: string; // required
  refreshSecret: string; // required
  accessExpiresIn?: string | number; // default: "15m"
  refreshExpiresIn?: string | number; // default: "7d"
  issuer?: string;
}
```

### Methods

| Method                  | Signature                                         | Description                                                                |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `signAccessToken`       | `(payload: object) => string`                     | Sign a short-lived access token                                            |
| `signRefreshToken`      | `(payload: object) => string`                     | Sign a long-lived refresh token                                            |
| `issueTokenPair`        | `(payload: object) => TokenPair`                  | Sign both at once: `{ accessToken, refreshToken }`                         |
| `verifyAccessToken<T>`  | `(token: string) => T`                            | Verify + decode an access token, throws if invalid/expired                 |
| `verifyRefreshToken<T>` | `(token: string) => T`                            | Verify + decode a refresh token                                            |
| `decode`                | `(token: string) => JwtPayload \| string \| null` | Decode without verifying (no signature check)                              |
| `middleware`            | `() => (req, res, next) => void`                  | Express middleware; reads `Authorization: Bearer <token>`, sets `req.user` |

### Example

```ts
import { JWTAuth } from "@stackhq/auth";

const auth = new JWTAuth({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  accessExpiresIn: "15m",
  refreshExpiresIn: "30d",
  issuer: "my-app",
});

const { accessToken, refreshToken } = auth.issueTokenPair({
  sub: "user-123",
  role: "admin",
});

// Protect routes
app.use("/api", auth.middleware());

app.get("/api/me", (req, res) => {
  res.json({ userId: req.user.sub }); // req.user is the decoded payload
});
```

---

## OAuthClient / OAuthManager

Generic OAuth 2.0 client with built-in endpoint configs for **Google**,
**GitHub**, and **Facebook**.

### OAuthManager

```ts
new OAuthManager()
  .register(provider: "google" | "github" | "facebook", config: OAuthProviderConfig): OAuthManager
  .get(provider): OAuthClient
```

```ts
interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string[]; // defaults to sensible per-provider scopes if omitted
}
```

### OAuthClient methods

| Method                                | Description                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `getAuthorizationUrl(state: string)`  | Build the URL to redirect the user to for consent                             |
| `exchangeCodeForToken(code: string)`  | Exchange an auth code for `{ access_token, refresh_token?, ... }`             |
| `getUserProfile(accessToken: string)` | Fetch the normalized profile: `{ provider, id, email, name, avatarUrl, raw }` |
| `authenticate(code: string)`          | Full flow: code → tokens → profile, returns `{ tokens, profile }`             |

### Example

```ts
import { OAuthManager } from "@stackhq/auth";

const oauth = new OAuthManager().register("google", {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: "https://myapp.com/auth/google/callback",
});

// Step 1: redirect the user
app.get("/auth/google", (req, res) => {
  const url = oauth.get("google").getAuthorizationUrl(generateStateToken());
  res.redirect(url);
});

// Step 2: handle the callback
app.get("/auth/google/callback", async (req, res) => {
  const { profile } = await oauth
    .get("google")
    .authenticate(req.query.code as string);
  // profile.email, profile.name, profile.avatarUrl, profile.id
  const user = await findOrCreateUser(profile);
  res.redirect("/dashboard");
});
```

---

## SessionManager

Cookie-based session management with a pluggable store (in-memory by
default; swap in `@stackhq/redis`'s `RedisSessionStore` for multi-instance
apps).

### Constructor

```ts
new SessionManager<T>(config?: SessionManagerConfig)
```

```ts
interface SessionManagerConfig {
  store?: SessionStore; // default: InMemorySessionStore
  ttlMs?: number; // default: 24h
  cookieName?: string; // default: "sid"
}
```

### Methods

| Method                 | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `create(data, ttlMs?)` | Create a new session record                                                |
| `get(id)`              | Fetch a session by ID (returns `null` if missing/expired)                  |
| `touch(id, extendMs?)` | Extend a session's expiry                                                  |
| `destroy(id)`          | Delete a session                                                           |
| `middleware()`         | Express middleware; reads/sets the session cookie, populates `req.session` |

### Example

```ts
import { SessionManager } from "@stackhq/auth";

const sessions = new SessionManager({ ttlMs: 1000 * 60 * 60 * 2 }); // 2h

app.use(sessions.middleware());

app.post("/login", async (req, res) => {
  req.session.userId = await authenticateUser(req.body); // persisted automatically
  res.json({ ok: true });
});
```

---

## TokenRefreshService

Implements **refresh-token rotation**: every use of a refresh token issues a
new one and revokes the old one, all within a "family". If a revoked token
is ever replayed (a signal of token theft), the entire family is revoked.

### Constructor

```ts
new TokenRefreshService(
  jwtAuth: JWTAuth,
  store?: RefreshTokenStore,      // default: InMemoryRefreshTokenStore
  blacklist?: TokenBlacklist      // optional, recommended
)
```

### Methods

| Method                                 | Description                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `issueInitialTokens(userId, payload?)` | Issue the first token pair for a login, returns `{ accessToken, refreshToken, familyId }` |
| `rotate(refreshToken)`                 | Validate + rotate a refresh token, returns a new `TokenPair`. Throws on reuse/theft.      |
| `revokeFamily(familyId)`               | Manually revoke an entire token family (e.g. on "log out everywhere")                     |

### Example

```ts
import {
  JWTAuth,
  TokenRefreshService,
  InMemoryTokenBlacklist,
} from "@stackhq/auth";

const jwtAuth = new JWTAuth({ accessSecret: "a", refreshSecret: "b" });
const blacklist = new InMemoryTokenBlacklist();
const refreshService = new TokenRefreshService(jwtAuth, undefined, blacklist);

app.post("/login", async (req, res) => {
  const user = await authenticateUser(req.body);
  const tokens = await refreshService.issueInitialTokens(user.id);
  res.json(tokens);
});

app.post("/refresh", async (req, res) => {
  try {
    const tokens = await refreshService.rotate(req.body.refreshToken);
    res.json(tokens);
  } catch (err) {
    // reuse detected, or invalid/expired token
    res.status(401).json({ error: "Please log in again" });
  }
});
```

---

## TokenBlacklist

Tracks revoked JWT IDs (`jti`) so a token can be invalidated before its
natural expiry (e.g. on logout or password change).

### InMemoryTokenBlacklist

| Method                     | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `add(tokenId, expiresAt?)` | Blacklist a token ID until `expiresAt` (default: 7 days)          |
| `isBlacklisted(tokenId)`   | Check if a token ID is currently blacklisted                      |
| `remove(tokenId)`          | Un-blacklist a token ID                                           |
| `sweep()`                  | Purge expired entries (call periodically, e.g. via `setInterval`) |

### Example

```ts
import { InMemoryTokenBlacklist } from "@stackhq/auth";

const blacklist = new InMemoryTokenBlacklist();

app.post("/logout", (req, res) => {
  blacklist.add(req.user.jti);
  res.json({ ok: true });
});

// In your JWT middleware, additionally check:
if (await blacklist.isBlacklisted(decoded.jti)) {
  return res.status(401).json({ error: "Token revoked" });
}
```

> For multi-instance deployments, swap the in-memory blacklist/session/refresh
> stores for Redis-backed ones — see [`@stackhq/redis`](./redis.md).
