export type OAuthProviderName = "google" | "github" | "facebook";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  [key: string]: any;
}

export interface OAuthUserProfile {
  provider: OAuthProviderName;
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  raw: any;
}

interface ProviderEndpoints {
  authUrl: string;
  tokenUrl: string;
  profileUrl: string;
  defaultScope: string[];
  mapProfile: (raw: any) => OAuthUserProfile;
}

const PROVIDERS: Record<OAuthProviderName, ProviderEndpoints> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    defaultScope: ["openid", "email", "profile"],
    mapProfile: (raw) => ({
      provider: "google",
      id: raw.sub,
      email: raw.email,
      name: raw.name,
      avatarUrl: raw.picture,
      raw,
    }),
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    profileUrl: "https://api.github.com/user",
    defaultScope: ["read:user", "user:email"],
    mapProfile: (raw) => ({
      provider: "github",
      id: String(raw.id),
      email: raw.email,
      name: raw.name || raw.login,
      avatarUrl: raw.avatar_url,
      raw,
    }),
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,email,picture",
    defaultScope: ["email", "public_profile"],
    mapProfile: (raw) => ({
      provider: "facebook",
      id: raw.id,
      email: raw.email,
      name: raw.name,
      avatarUrl: raw.picture?.data?.url,
      raw,
    }),
  },
};

/** Generic OAuth 2.0 client. Works with Google, GitHub, and Facebook out of the box. */
export class OAuthClient {
  private endpoints: ProviderEndpoints;

  constructor(private provider: OAuthProviderName, private config: OAuthProviderConfig) {
    this.endpoints = PROVIDERS[provider];
    if (!this.endpoints) throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  /** Build the URL to redirect the user to for consent */
  getAuthorizationUrl(state: string): string {
    const scope = (this.config.scope ?? this.endpoints.defaultScope).join(" ");
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope,
      state,
    });
    return `${this.endpoints.authUrl}?${params.toString()}`;
  }

  /** Exchange an authorization code for tokens */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
      grant_type: "authorization_code",
    });

    const res = await fetch(this.endpoints.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as OAuthTokenResponse;
  }

  /** Fetch the authenticated user's profile using the access token */
  async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    const res = await fetch(this.endpoints.profileUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "backend-toolkit-pro",
      },
    });
    if (!res.ok) {
      throw new Error(`OAuth profile fetch failed: ${res.status} ${await res.text()}`);
    }
    const raw = await res.json();
    return this.endpoints.mapProfile(raw);
  }

  /** Full flow: code -> tokens -> profile */
  async authenticate(code: string): Promise<{ tokens: OAuthTokenResponse; profile: OAuthUserProfile }> {
    const tokens = await this.exchangeCodeForToken(code);
    const profile = await this.getUserProfile(tokens.access_token);
    return { tokens, profile };
  }
}

/** Factory / registry so multiple providers can be wired up at once */
export class OAuthManager {
  private clients = new Map<OAuthProviderName, OAuthClient>();

  register(provider: OAuthProviderName, config: OAuthProviderConfig): this {
    this.clients.set(provider, new OAuthClient(provider, config));
    return this;
  }

  get(provider: OAuthProviderName): OAuthClient {
    const client = this.clients.get(provider);
    if (!client) throw new Error(`OAuth provider not registered: ${provider}`);
    return client;
  }
}
