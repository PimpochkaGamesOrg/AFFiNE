import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { GoogleDriveCredential, Prisma } from '@prisma/client';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

export interface GoogleDriveCredentialTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
}

export interface UpsertGoogleDriveCredentialInput extends GoogleDriveCredentialTokens {
  userId: string;
  providerAccountId: string;
  email?: string | null;
  status?: string | null;
  lastError?: string | null;
}

@Injectable()
export class GoogleDriveCredentialModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  private encryptToken(token?: string | null) {
    return token ? this.crypto.encrypt(token) : null;
  }

  decryptToken(token?: string | null) {
    return token ? this.crypto.decrypt(token) : null;
  }

  async getByUserId(userId: string) {
    return await this.db.googleDriveCredential.findUnique({
      where: { userId },
    });
  }

  decryptTokens(credential: GoogleDriveCredential) {
    return {
      accessToken: this.decryptToken(credential.accessToken),
      refreshToken: this.decryptToken(credential.refreshToken),
      expiresAt: credential.expiresAt,
      scope: credential.scope,
    };
  }

  @Transactional()
  async upsert(input: UpsertGoogleDriveCredentialInput) {
    const accessToken = this.encryptToken(input.accessToken);
    const refreshToken = this.encryptToken(input.refreshToken);
    const data: Prisma.GoogleDriveCredentialUncheckedCreateInput = {
      userId: input.userId,
      providerAccountId: input.providerAccountId,
      email: input.email ?? null,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      expiresAt: input.expiresAt ?? null,
      scope: input.scope ?? null,
      status: input.status ?? 'active',
      lastError: input.lastError ?? null,
    };

    return await this.db.googleDriveCredential.upsert({
      where: { userId: input.userId },
      create: data,
      update: {
        providerAccountId: data.providerAccountId,
        email: data.email,
        accessToken: data.accessToken,
        refreshToken: refreshToken ?? undefined,
        expiresAt: data.expiresAt,
        scope: data.scope,
        status: data.status,
        lastError: data.lastError,
      },
    });
  }

  @Transactional()
  async updateTokens(
    userId: string,
    input: GoogleDriveCredentialTokens & {
      status?: string | null;
      lastError?: string | null;
    }
  ) {
    const data: Prisma.GoogleDriveCredentialUpdateInput = {};
    if (input.accessToken !== undefined) {
      data.accessToken = this.encryptToken(input.accessToken);
    }
    if (input.refreshToken !== undefined) {
      data.refreshToken = this.encryptToken(input.refreshToken);
    }
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt;
    }
    if (input.scope !== undefined) {
      data.scope = input.scope;
    }
    if (input.status != null) {
      data.status = input.status;
    }
    if (input.lastError !== undefined) {
      data.lastError = input.lastError;
    }

    return await this.db.googleDriveCredential.update({
      where: { userId },
      data,
    });
  }

  @Transactional()
  async deleteByUserId(userId: string) {
    await this.db.googleDriveCredential.deleteMany({
      where: { userId },
    });
  }
}
