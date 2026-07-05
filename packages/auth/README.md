# @stack-hq/auth

JWT authentication, OAuth 2.0 (Google/GitHub/Facebook), session auth, refresh-token rotation with theft detection, and token blacklisting.

## Install
```bash
npm install @stack-hq/auth
```

## Usage
```ts
import { JWTAuth, OAuthManager, SessionManager, TokenRefreshService, InMemoryTokenBlacklist } from "@stack-hq/auth";

const jwtAuth = new JWTAuth({ accessSecret: "...", refreshSecret: "..." });
const { accessToken, refreshToken } = jwtAuth.issueTokenPair({ sub: "user-123" });

app.use("/api", jwtAuth.middleware());

const oauth = new OAuthManager().register("google", {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: "https://myapp.com/auth/google/callback",
});
```

See the exported types (`JWTAuth`, `OAuthClient`, `OAuthManager`, `SessionManager`, `TokenRefreshService`, `InMemoryTokenBlacklist`) for full API.

## License
MIT
