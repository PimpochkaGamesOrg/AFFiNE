import './config';

import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth';
import { GoogleDriveController } from './controller';
import { GoogleDriveOAuthService } from './oauth';
import { GoogleDriveService } from './service';

@Module({
  imports: [AuthModule],
  providers: [GoogleDriveService, GoogleDriveOAuthService],
  controllers: [GoogleDriveController],
})
export class GoogleDriveModule {}
