import { v4 as uuidv4 } from "uuid";
import { JWTAuth, TokenPair } from "./jwt";
import { TokenBlacklist } from "./tokenBlacklist";

export interface RefreshTokenRecord {
  tokenId: string;
  userId: string;
  familyId: string; // groups all tokens descended from one login, for rotation/theft detection
  createdAt: number;
  revoked: boolean;
}

export interface RefreshTokenStore {
  save(record: RefreshTokenRecord): Promise<void> | void;
  find(tokenId: string): Promise<RefreshTokenRecord | null> | RefreshTokenRecord | null;
  revoke(tokenId: string): Promise<void> | void;
  revokeFamily(familyId: string): Promise<void> | void;
}

export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private tokens = new Map<string, RefreshTokenRecord>();

  save(record: RefreshTokenRecord): void {
    this.tokens.set(record.tokenId, record);
  }
  find(tokenId: string): RefreshTokenRecord | null {
    return this.tokens.get(tokenId) ?? null;
  }
  revoke(tokenId: string): void {
    const rec = this.tokens.get(tokenId);
    if (rec) rec.revoked = true;
  }
  revokeFamily(familyId: string): void {
    for (const rec of this.tokens.values()) {
      if (rec.familyId === familyId) rec.revoked = true;
    }
  }
}

/**
 * Handles refresh-token rotation: every time a refresh token is used, it's
 * revoked and a brand-new one is issued in the same "family". If a revoked
 * token is ever reused (token theft signal), the whole family is revoked.
 */
export class TokenRefreshService {
  constructor(
    private jwtAuth: JWTAuth,
    private store: RefreshTokenStore = new InMemoryRefreshTokenStore(),
    private blacklist?: TokenBlacklist
  ) {}

  async issueInitialTokens(userId: string, payload: object = {}): Promise<TokenPair & { familyId: string }> {
    const familyId = uuidv4();
    const tokenId = uuidv4();

    await this.store.save({
      tokenId,
      userId,
      familyId,
      createdAt: Date.now(),
      revoked: false,
    });

    const tokens = this.jwtAuth.issueTokenPair({ ...payload, sub: userId, jti: tokenId, familyId });
    return { ...tokens, familyId };
  }

  async rotate(refreshToken: string): Promise<TokenPair> {
    const decoded = this.jwtAuth.verifyRefreshToken<any>(refreshToken);
    const { jti: tokenId, familyId, sub: userId } = decoded;

    if (this.blacklist && (await this.blacklist.isBlacklisted(tokenId))) {
      throw new Error("Refresh token has been revoked");
    }

    const record = await this.store.find(tokenId);
    if (!record) throw new Error("Unknown refresh token");

    if (record.revoked) {
      // Reuse of a revoked token => possible theft. Kill the entire family.
      await this.store.revokeFamily(familyId);
      throw new Error("Refresh token reuse detected; session family revoked");
    }

    // Rotate: revoke old, issue new token in same family
    await this.store.revoke(tokenId);
    this.blacklist && (await this.blacklist.add(tokenId));

    const newTokenId = uuidv4();
    await this.store.save({
      tokenId: newTokenId,
      userId,
      familyId,
      createdAt: Date.now(),
      revoked: false,
    });

    return this.jwtAuth.issueTokenPair({ sub: userId, jti: newTokenId, familyId });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.store.revokeFamily(familyId);
  }
}
