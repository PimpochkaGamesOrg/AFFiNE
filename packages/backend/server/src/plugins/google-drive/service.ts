import { Injectable, Logger } from '@nestjs/common';

import { Config, GraphqlBadRequest, URLHelper } from '../../base';
import { Models } from '../../models';
import { GoogleDriveApiClient } from './google-api';

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const DRIVE_SCOPE_FRAGMENT = 'drive';

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  id: string;
  email?: string;
};

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private readonly models: Models,
    private readonly config: Config,
    private readonly url: URLHelper
  ) {}

  get oauthConfigured() {
    const oauth = this.config.oauth.providers.google;
    return Boolean(oauth?.clientId && oauth?.clientSecret);
  }

  get seriesFolderConfigured() {
    return Boolean(this.config.googleDrive.seriesFolderId?.trim());
  }

  isConfigured() {
    return this.oauthConfigured && this.seriesFolderConfigured;
  }

  getCallbackUrl() {
    return this.url.link('/api/google-drive/oauth/callback');
  }

  private getOAuthConfig(): { clientId: string; clientSecret: string } {
    const oauth = this.config.oauth.providers.google;
    if (!oauth?.clientId || !oauth?.clientSecret) {
      throw new GraphqlBadRequest({
        code: 'google_drive_not_configured',
        message:
          'Google OAuth client ID and secret must be configured in admin settings',
      });
    }
    return {
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
    };
  }

  hasDriveScope(scope?: string | null) {
    if (!scope) return false;
    return scope.includes(DRIVE_SCOPE_FRAGMENT);
  }

  async getAuthorizationStatus(userId: string) {
    const credential =
      await this.models.googleDriveCredential.getByUserId(userId);
    if (!credential) {
      return {
        authorized: false,
        oauthConfigured: this.oauthConfigured,
        seriesFolderConfigured: this.seriesFolderConfigured,
      };
    }

    const tokens = this.models.googleDriveCredential.decryptTokens(credential);
    const authorized = Boolean(
      tokens.refreshToken &&
      this.hasDriveScope(tokens.scope) &&
      credential.status === 'active'
    );

    return {
      authorized,
      oauthConfigured: this.oauthConfigured,
      seriesFolderConfigured: this.seriesFolderConfigured,
      email: credential.email ?? undefined,
    };
  }

  getAuthUrl(state: string, redirectUri: string) {
    const oauth = this.getOAuthConfig();
    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' '),
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private async postFormJson<T>(url: string, body: string): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new GraphqlBadRequest({
        code: 'google_drive_request_error',
        message: `Google OAuth token request failed (${response.status}): ${text.slice(0, 300)}`,
      });
    }
    return (await response.json()) as T;
  }

  private async exchangeCode(code: string, redirectUri: string) {
    const oauth = this.getOAuthConfig();
    const payload = new URLSearchParams({
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await this.postFormJson<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      payload.toString()
    );

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      scope: response.scope,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000)
        : undefined,
    };
  }

  private async refreshTokens(refreshToken: string) {
    const oauth = this.getOAuthConfig();
    const payload = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await this.postFormJson<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      payload.toString()
    );

    return {
      accessToken: response.access_token,
      refreshToken,
      scope: response.scope,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000)
        : undefined,
    };
  }

  private async fetchAccountProfile(accessToken: string) {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!response.ok) {
      throw new GraphqlBadRequest({
        code: 'google_drive_request_error',
        message: 'Failed to load Google account profile after authorization',
      });
    }
    return (await response.json()) as GoogleUserInfo;
  }

  async handleOAuthCallback(params: {
    code: string;
    redirectUri: string;
    userId: string;
  }) {
    const tokens = await this.exchangeCode(params.code, params.redirectUri);
    if (!tokens.refreshToken) {
      throw new GraphqlBadRequest({
        code: 'google_drive_missing_refresh_token',
        message:
          'Google did not return a refresh token. Revoke app access and try again.',
      });
    }

    const profile = await this.fetchAccountProfile(tokens.accessToken);
    await this.models.googleDriveCredential.upsert({
      userId: params.userId,
      providerAccountId: profile.id,
      email: profile.email ?? null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
      status: 'active',
      lastError: null,
    });
  }

  private async ensureAccessToken(userId: string) {
    const credential =
      await this.models.googleDriveCredential.getByUserId(userId);
    if (!credential) {
      throw new GraphqlBadRequest({
        code: 'google_drive_auth_required',
        message: 'Google Drive authorization is required',
      });
    }

    const decrypted =
      this.models.googleDriveCredential.decryptTokens(credential);
    if (!decrypted.refreshToken || !this.hasDriveScope(decrypted.scope)) {
      throw new GraphqlBadRequest({
        code: 'google_drive_auth_required',
        message: 'Google Drive authorization is required',
      });
    }

    if (
      decrypted.accessToken &&
      credential.expiresAt &&
      credential.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_SKEW_MS
    ) {
      return decrypted.accessToken;
    }

    try {
      const refreshed = await this.refreshTokens(decrypted.refreshToken);
      await this.models.googleDriveCredential.updateTokens(userId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt ?? null,
        scope: refreshed.scope ?? decrypted.scope ?? null,
        status: 'active',
        lastError: null,
      });
      return refreshed.accessToken;
    } catch (error) {
      await this.models.googleDriveCredential.updateTokens(userId, {
        status: 'invalid',
        lastError:
          error instanceof Error ? error.message : 'Token refresh failed',
      });
      throw new GraphqlBadRequest({
        code: 'google_drive_auth_required',
        message: 'Google Drive authorization is required',
      });
    }
  }

  async createEpisodeFolders(
    userId: string,
    input: {
      categoryName: string;
      episodeTitle: string;
      parentFolderId?: string;
    }
  ) {
    if (!this.isConfigured()) {
      throw new GraphqlBadRequest({
        code: 'google_drive_not_configured',
        message:
          'Google OAuth and series folder ID must be configured in admin settings',
      });
    }

    const rootFolderId =
      input.parentFolderId?.trim() ||
      this.config.googleDrive.seriesFolderId.trim();
    if (!rootFolderId) {
      throw new GraphqlBadRequest({
        code: 'google_drive_not_configured',
        message: 'Series folder ID is not configured',
      });
    }

    const accessToken = await this.ensureAccessToken(userId);
    const client = new GoogleDriveApiClient(
      accessToken,
      this.config.googleDrive.requestTimeoutMs ?? 15_000
    );

    try {
      const result = await client.createEpisodeFolders({
        rootFolderId,
        categoryName: input.categoryName.trim(),
        episodeTitle: input.episodeTitle.trim(),
      });
      return {
        status: 'success' as const,
        ...result,
      };
    } catch (error) {
      this.logger.error('createEpisodeFolders failed', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Google Drive folder creation failed';
      if (message.includes('401') || message.includes('invalid_grant')) {
        throw new GraphqlBadRequest({
          code: 'google_drive_auth_required',
          message: 'Google Drive authorization is required',
        });
      }
      throw new GraphqlBadRequest({
        code: 'google_drive_request_error',
        message,
      });
    }
  }
}
