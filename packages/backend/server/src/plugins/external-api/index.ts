import './config';

import { Module } from '@nestjs/common';

import { DocStorageModule } from '../../core/doc';
import { ExternalApiController, ExternalApiTokenGuard } from './controller';
import { ExternalApiService } from './service';

@Module({
  imports: [DocStorageModule],
  providers: [ExternalApiService, ExternalApiTokenGuard],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
