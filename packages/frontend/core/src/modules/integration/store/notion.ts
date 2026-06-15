import { LiveData, Store } from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

import { AuthService, type WorkspaceServerService } from '../../cloud';
import type { GlobalState } from '../../storage';
import type { WorkspaceService } from '../../workspace';
import type { NotionConfig } from '../type';

export class NotionStore extends Store {
  constructor(
    private readonly globalState: GlobalState,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  private _getKey(databaseBlockId: string, userId: string, workspaceId: string) {
    return `notion:${userId}:${workspaceId}:${databaseBlockId}`;
  }

  authService = this.workspaceServerService.server?.scope.get(AuthService);
  workspaceId = this.workspaceService.workspace.id;

  userId$ =
    this.workspaceService.workspace.meta.flavour === 'local' ||
    !this.authService
      ? new LiveData('__local__')
      : this.authService.session.account$.map(
          account => account?.id ?? '__local__'
        );

  getUserId() {
    return this.workspaceService.workspace.meta.flavour === 'local' ||
      !this.authService
      ? '__local__'
      : (this.authService.session.account$.value?.id ?? '__local__');
  }

  getStorageKey(databaseBlockId: string) {
    return this._getKey(
      databaseBlockId,
      this.getUserId(),
      this.workspaceService.workspace.id
    );
  }

  watchSetting(databaseBlockId: string) {
    const storageKey = this.getStorageKey(databaseBlockId);
    return this.userId$.pipe(
      exhaustMap(() => this.globalState.watch<NotionConfig>(storageKey))
    );
  }

  getSetting(databaseBlockId: string): NotionConfig | undefined;
  getSetting<Key extends keyof NotionConfig>(
    databaseBlockId: string,
    key: Key
  ): NotionConfig[Key] | undefined;
  getSetting(databaseBlockId: string, key?: keyof NotionConfig) {
    const config = this.globalState.get<NotionConfig>(
      this.getStorageKey(databaseBlockId)
    );
    if (!key) return config;
    return config?.[key];
  }

  setSetting<Key extends keyof NotionConfig>(
    databaseBlockId: string,
    key: Key,
    value: NotionConfig[Key]
  ) {
    this.globalState.set(this.getStorageKey(databaseBlockId), {
      ...this.getSetting(databaseBlockId),
      [key]: value,
    });
  }

  setSettings(databaseBlockId: string, settings: Partial<NotionConfig>) {
    this.globalState.set(this.getStorageKey(databaseBlockId), {
      ...this.getSetting(databaseBlockId),
      ...settings,
    });
  }

  clearSettings(databaseBlockId: string) {
    this.globalState.set(this.getStorageKey(databaseBlockId), undefined);
  }
}
