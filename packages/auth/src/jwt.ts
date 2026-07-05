import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";

export interface JWTConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn?: string | number;
  refreshExpiresIn?: string | number;
  issuer?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTAuth {
  constructor(private config: JWTConfig) {
    if (!config.accessSecret || !config.refreshSecret) {
      throw new Error("JWTAuth requires accessSecret and refreshSecret");
    }
  }

  signAccessToken(payload: object): string {
    const options: SignOptions = {
      expiresIn: (this.config.accessExpiresIn ?? "15m") as any,
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    };
    return jwt.sign(payload, this.config.accessSecret, options);
  }

  signRefreshToken(payload: object): string {
    const options: SignOptions = {
      expiresIn: (this.config.refreshExpiresIn ?? "7d") as any,
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    };
    return jwt.sign(payload, this.config.refreshSecret, options);
  }

  issueTokenPair(payload: object): TokenPair {
    return {
      accessToken: this.signAccessToken(payload),
      refreshToken: this.signRefreshToken(payload),
    };
  }

  verifyAccessToken<T = JwtPayload>(token: string): T {
    return jwt.verify(token, this.config.accessSecret, {
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    }) as T;
  }

  verifyRefreshToken<T = JwtPayload>(token: string): T {
    return jwt.verify(token, this.config.refreshSecret, {
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    }) as T;
  }

  decode(token: string): null | JwtPayload | string {
    return jwt.decode(token);
  }

  /** Express-style middleware that validates the Authorization: Bearer <token> header */
  middleware() {
    return (req: any, res: any, next: any) => {
      const header = req.headers?.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing bearer token" });
      }
      const token = header.slice(7);
      try {
        req.user = this.verifyAccessToken(token);
        next();
      } catch (err: any) {
        return res.status(401).json({ error: "Invalid or expired token", detail: err.message });
      }
    };
  }
}
