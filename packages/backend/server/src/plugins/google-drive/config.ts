import { defineModuleConfig } from '../../base';

export interface GoogleDriveConfig {
  seriesFolderId: string;
  requestTimeoutMs?: number;
}

declare global {
  interface AppConfigSchema {
    googleDrive: {
      seriesFolderId: ConfigItem<string>;
      requestTimeoutMs: ConfigItem<number>;
    };
  }
}

defineModuleConfig('googleDrive', {
  seriesFolderId: {
    desc: 'Root Google Drive folder ID for the series',
    default: '',
    schema: {
      type: 'string',
    },
  },
  requestTimeoutMs: {
    desc: 'Google Drive API request timeout in milliseconds',
    default: 15_000,
    schema: {
      type: 'number',
    },
  },
});
