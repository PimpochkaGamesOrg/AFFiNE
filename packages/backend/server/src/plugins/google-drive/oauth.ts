import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { SessionCache } from '../../base';

export interface GoogleDriveOAuthState {
  userId: string;
  redirectUri?: string;
  token?: string;
}

const GOOGLE_DRIVE_OAUTH_STATE_KEY = 'GOOGLE_DRIVE_OAUTH_STATE';

@Injectable()
export class GoogleDriveOAuthService {
  constructor(private readonly cache: SessionCache) {}

  isValidState(stateStr: string) {
    return stateStr.length === 36;
  }

  async saveOAuthState(state: GoogleDriveOAuthState) {
    const token = randomUUID();
    const payload: GoogleDriveOAuthState = { ...state, token };
    await this.cache.set(`${GOOGLE_DRIVE_OAUTH_STATE_KEY}:${token}`, payload, {
      ttl: 3600 * 3 * 1000,
    });
    return token;
  }

  async getOAuthState(token: string) {
    return this.cache.get<GoogleDriveOAuthState>(
      `${GOOGLE_DRIVE_OAUTH_STATE_KEY}:${token}`
    );
  }
}
