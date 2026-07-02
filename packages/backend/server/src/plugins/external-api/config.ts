import { defineModuleConfig } from '../../base';

export interface ExternalApiConfig {
  token: string;
}

declare global {
  interface AppConfigSchema {
    externalApi: {
      token: ConfigItem<string>;
    };
  }
}

defineModuleConfig('externalApi', {
  token: {
    desc: 'Bearer token required to call external /api/external/* endpoints',
    default: '',
    schema: {
      type: 'string',
    },
  },
});
