import { LiveData, Service } from '@toeverything/infra';

import { CalendarIntegration } from '../entities/calendar';
import { NotionIntegration } from '../entities/notion-integration';
import { ReadwiseIntegration } from '../entities/readwise';
import { IntegrationWriter } from '../entities/writer';

export class IntegrationService extends Service {
  writer = this.framework.createEntity(IntegrationWriter);
  readwise = this.framework.createEntity(ReadwiseIntegration, {
    writer: this.writer,
  });
  notion = this.framework.createEntity(NotionIntegration, {
    writer: this.writer,
  });
  calendar = this.framework.createEntity(CalendarIntegration);

  constructor() {
    super();
  }

  importing$ = LiveData.computed(get => {
    return get(this.readwise.importing$) || get(this.notion.syncing$);
  });
}
