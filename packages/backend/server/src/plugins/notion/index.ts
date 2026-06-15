import { Module } from '@nestjs/common';

import { NotionController } from './controller';

@Module({
  controllers: [NotionController],
})
export class NotionModule {}
