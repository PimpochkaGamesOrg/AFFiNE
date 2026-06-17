import { Button, Input, Loading, Modal, notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  type DialogComponentProps,
  type WORKSPACE_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { IntegrationService } from '@affine/core/modules/integration';
import { NotionApiClient } from '@affine/core/modules/integration/notion/notion-api';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const NotionSyncDialog = ({
  close,
  databaseBlockId,
  pageDocId,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['notion-sync']>) => {
  const t = useI18n();
  const notion = useService(IntegrationService).notion;
  const serverService = useService(WorkspaceServerService);
  const settings = useLiveData(notion.settings$(databaseBlockId));
  const syncing = useLiveData(notion.syncing$);
  const progress = useLiveData(notion.progress$);

  const [token, setToken] = useState(settings?.token ?? '');
  const [databaseId, setDatabaseId] = useState(
    settings?.notionDatabaseId ?? ''
  );
  const [stage, setStage] = useState<'setup' | 'syncing'>('setup');
  const [verifying, setVerifying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (settings?.token) setToken(settings.token);
    if (settings?.notionDatabaseId) setDatabaseId(settings.notionDatabaseId);
  }, [settings?.notionDatabaseId, settings?.token]);

  const apiBaseUrl = useMemo(
    () => serverService.server?.baseUrl ?? window.location.origin,
    [serverService.server?.baseUrl]
  );

  const handleClose = useCallback(() => {
    if (syncing) {
      abortRef.current?.abort();
    }
    close();
  }, [close, syncing]);

  const verifyAndSave = useCallback(async () => {
    if (!token.trim() || !databaseId.trim()) {
      notify.error({
        title: t['com.affine.integration.notion.sync.missing-fields'](),
      });
      return;
    }

    setVerifying(true);
    try {
      const client = new NotionApiClient(apiBaseUrl, token.trim());
      await client.verifyToken();
      const parsedId = client.parseDatabaseId(databaseId);
      notion.connect(databaseBlockId, token.trim(), parsedId);
      setDatabaseId(parsedId);
      notify.success({
        title: t['com.affine.integration.notion.sync.connected'](),
      });
    } catch {
      notify.error({
        title: t['com.affine.integration.notion.sync.invalid-token'](),
      });
    } finally {
      setVerifying(false);
    }
  }, [apiBaseUrl, databaseBlockId, databaseId, notion, t, token]);

  const handleVerifyAndSave = useAsyncCallback(verifyAndSave, [verifyAndSave]);

  const handleStartSync = useAsyncCallback(async () => {
    if (!settings?.token || !settings.notionDatabaseId) {
      await verifyAndSave();
      if (!notion.settings$(databaseBlockId).value?.token) {
        return;
      }
    }

    setStage('syncing');
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      await notion.syncDatabase({
        databaseBlockId,
        pageDocId,
        signal: abortController.signal,
        onComplete: () => {
          notify.success({
            title: t['com.affine.integration.notion.sync.complete'](),
            message: t.t('com.affine.integration.notion.sync.complete-desc', {
              count: progress.done,
            }),
          });
          handleClose();
        },
        onAbort: finished => {
          notify({
            title: t['com.affine.integration.notion.sync.paused'](),
            message: t.t('com.affine.integration.notion.sync.paused-desc', {
              finished,
            }),
          });
        },
      });
    } catch (error) {
      notify.error({
        title: t['com.affine.integration.notion.sync.failed'](),
        message: error instanceof Error ? error.message : String(error),
      });
      setStage('setup');
    }
  }, [
    databaseBlockId,
    handleClose,
    verifyAndSave,
    notion,
    pageDocId,
    progress.done,
    settings?.notionDatabaseId,
    settings?.token,
    t,
  ]);

  const handlePause = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('setup');
  }, []);

  const syncedCount = settings?.syncedCount ?? progress.done;

  return (
    <Modal
      open
      onOpenChange={open => {
        if (!open) handleClose();
      }}
      width={480}
      title={t['com.affine.integration.notion.sync.title']()}
      contentOptions={{
        style: {
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        },
      }}
      withoutCloseButton={syncing}
    >
      <p
        style={{
          margin: 0,
          color: 'var(--affine-text-secondary-color)',
          fontSize: 13,
        }}
      >
        {t['com.affine.integration.notion.sync.desc']()}
      </p>

      <Input
        value={token}
        onChange={setToken}
        placeholder={t[
          'com.affine.integration.notion.sync.token-placeholder'
        ]()}
        disabled={syncing}
        type="password"
      />
      <Input
        value={databaseId}
        onChange={setDatabaseId}
        placeholder={t[
          'com.affine.integration.notion.sync.database-placeholder'
        ]()}
        disabled={syncing}
      />

      {stage === 'syncing' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Loading />
          <span>
            {t.t('com.affine.integration.notion.sync.progress', {
              count: syncedCount,
            })}
          </span>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {stage === 'syncing' ? (
          <Button onClick={handlePause}>
            {t['com.affine.integration.notion.sync.pause']()}
          </Button>
        ) : (
          <>
            <Button variant="plain" onClick={handleClose}>
              {t['Cancel']()}
            </Button>
            <Button
              variant="plain"
              loading={verifying}
              onClick={handleVerifyAndSave}
            >
              {t['com.affine.integration.notion.sync.save']()}
            </Button>
            <Button onClick={handleStartSync}>
              {settings?.syncedCount
                ? t['com.affine.integration.notion.sync.resume']()
                : t['com.affine.integration.notion.sync.start']()}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
};
