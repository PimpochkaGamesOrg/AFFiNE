import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  MissingOauthQueryParameter,
  OauthStateExpired,
  URLHelper,
} from '../../base';
import { CurrentUser, Public } from '../../core/auth';
import { GoogleDriveOAuthService } from './oauth';
import { GoogleDriveService } from './service';

@Controller('/api/google-drive')
export class GoogleDriveController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly oauth: GoogleDriveOAuthService,
    private readonly url: URLHelper
  ) {}

  @Get('/status')
  @HttpCode(HttpStatus.OK)
  async status(@CurrentUser() user: CurrentUser) {
    return await this.googleDrive.getAuthorizationStatus(user.id);
  }

  @Post('/oauth/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(
    @CurrentUser() user: CurrentUser,
    @Body('redirect_uri') redirectUri?: string
  ) {
    if (!this.googleDrive.oauthConfigured) {
      return {
        configured: false,
        url: null,
      };
    }

    const state = await this.oauth.saveOAuthState({
      userId: user.id,
      redirectUri,
    });

    const callbackUrl = this.googleDrive.getCallbackUrl();
    const authUrl = this.googleDrive.getAuthUrl(state, callbackUrl);

    return {
      configured: true,
      url: authUrl,
    };
  }

  @Public()
  @Get('/oauth/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') stateStr?: string
  ) {
    if (!code) {
      throw new MissingOauthQueryParameter({ name: 'code' });
    }
    if (!stateStr) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }
    if (!this.oauth.isValidState(stateStr)) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    const state = await this.oauth.getOAuthState(stateStr);
    if (!state) {
      throw new OauthStateExpired();
    }

    const callbackUrl = this.googleDrive.getCallbackUrl();
    try {
      await this.googleDrive.handleOAuthCallback({
        code,
        redirectUri: callbackUrl,
        userId: state.userId,
      });
    } catch (error) {
      if (state.redirectUri) {
        const redirectUrl = this.buildResultRedirect(
          state.redirectUri,
          'error',
          this.getCallbackErrorMessage(error)
        );
        return this.url.safeRedirect(res, redirectUrl);
      }
      throw error;
    }

    if (state.redirectUri) {
      const redirectUrl = this.buildResultRedirect(
        state.redirectUri,
        'success'
      );
      return this.url.safeRedirect(res, redirectUrl);
    }

    return res.status(200).send({ ok: true });
  }

  @Post('/create-folders')
  @HttpCode(HttpStatus.OK)
  async createFolders(
    @CurrentUser() user: CurrentUser,
    @Body('categoryName') categoryName?: string,
    @Body('episodeTitle') episodeTitle?: string,
    @Body('parentFolderId') parentFolderId?: string
  ) {
    if (!categoryName?.trim()) {
      return {
        status: 'error',
        message: 'categoryName is required',
      };
    }
    if (!episodeTitle?.trim()) {
      return {
        status: 'error',
        message: 'episodeTitle is required',
      };
    }

    return await this.googleDrive.createEpisodeFolders(user.id, {
      categoryName,
      episodeTitle,
      parentFolderId,
    });
  }

  private buildResultRedirect(
    redirectUri: string,
    result: 'success' | 'error',
    message?: string
  ) {
    const url = new URL(redirectUri, this.url.requestBaseUrl);
    url.searchParams.set('google_drive_auth', result);
    if (message) {
      url.searchParams.set('google_drive_auth_message', message);
    }
    return url.toString();
  }

  private getCallbackErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Google Drive authorization failed';
  }
}
