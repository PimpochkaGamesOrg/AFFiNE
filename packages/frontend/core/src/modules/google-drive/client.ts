import type { FetchService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';

export type GoogleDriveAuthStatus = {
  authorized: boolean;
  oauthConfigured: boolean;
  seriesFolderConfigured: boolean;
  email?: string;
};

export type GoogleDriveCreateFoldersResponse = {
  status: 'success' | 'error';
  message?: string;
  episodeFolderUrl?: string;
  categoryFolderUrl?: string;
};

const AUTH_REQUIRED_CODE = 'google_drive_auth_required';

function isAuthRequiredError(error: unknown) {
  if (error instanceof UserFriendlyError) {
    return error.data?.code === AUTH_REQUIRED_CODE;
  }
  return false;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function pollUntilAuthorized(
  fetchService: FetchService,
  popup: Window | null,
  timeoutMs = 5 * 60 * 1000
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (popup?.closed) {
      break;
    }
    const statusResponse = await fetchService.fetch('/api/google-drive/status');
    const status = await readJson<GoogleDriveAuthStatus>(statusResponse);
    if (status.authorized) {
      popup?.close();
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const finalResponse = await fetchService.fetch('/api/google-drive/status');
  const finalStatus = await readJson<GoogleDriveAuthStatus>(finalResponse);
  return finalStatus.authorized;
}

export async function fetchGoogleDriveStatus(fetchService: FetchService) {
  const response = await fetchService.fetch('/api/google-drive/status');
  return await readJson<GoogleDriveAuthStatus>(response);
}

export async function ensureGoogleDriveAuthorized(
  fetchService: FetchService
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const status = await fetchGoogleDriveStatus(fetchService);
    if (!status.oauthConfigured) {
      return {
        ok: false,
        message:
          'Google OAuth is not configured. Add Client ID and Secret in admin OAuth settings.',
      };
    }
    if (!status.seriesFolderConfigured) {
      return {
        ok: false,
        message:
          'Series folder ID is not configured. Set googleDrive.seriesFolderId in admin settings.',
      };
    }
    if (status.authorized) {
      return { ok: true };
    }

    const preflightResponse = await fetchService.fetch(
      '/api/google-drive/oauth/preflight',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uri: window.location.href }),
      }
    );
    const preflight = await readJson<{
      configured: boolean;
      url: string | null;
    }>(preflightResponse);

    if (!preflight.configured || !preflight.url) {
      return {
        ok: false,
        message: 'Google Drive OAuth is not available on this server',
      };
    }

    const popup = window.open(
      preflight.url,
      'google-drive-auth',
      'width=520,height=720'
    );
    const authorized = await pollUntilAuthorized(fetchService, popup);
    if (authorized) {
      return { ok: true };
    }

    return {
      ok: false,
      message: 'Google Drive authorization was not completed',
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Google Drive authorization failed',
    };
  }
}

export async function createGoogleDriveFolders(
  fetchService: FetchService,
  request: {
    categoryName: string;
    episodeTitle: string;
    parentFolderId?: string;
  }
): Promise<
  | { ok: true; data: GoogleDriveCreateFoldersResponse }
  | { ok: false; message: string; authRequired?: boolean }
> {
  try {
    const response = await fetchService.fetch(
      '/api/google-drive/create-folders',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    const data = await readJson<GoogleDriveCreateFoldersResponse>(response);
    if (!response.ok || data.status === 'error') {
      return {
        ok: false,
        message: data.message?.trim() || 'Google Drive folder creation failed',
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Google Drive folder creation failed',
      authRequired: isAuthRequiredError(error),
    };
  }
}
