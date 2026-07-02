import {
  Body,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { ActionForbidden, Config } from '../../base';
import { Public } from '../../core/auth';
import { ExternalApiService } from './service';

interface CreateDatabaseRowBody {
  workspaceId: string;
  docId: string;
  title: string;
  status: string;
  direction: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

@Injectable()
export class ExternalApiTokenGuard {
  constructor(private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req);
    const expected = this.config.externalApi.token;
    if (!expected) {
      throw new ActionForbidden(
        'External API token is not configured on the server'
      );
    }
    if (!token || token !== expected) {
      throw new ActionForbidden('Invalid or missing external API bearer token');
    }
    return true;
  }
}

@Public()
@Controller('/api/external')
@UseGuards(ExternalApiTokenGuard)
export class ExternalApiController {
  constructor(private readonly service: ExternalApiService) {}

  @Post('/database-rows')
  @HttpCode(HttpStatus.CREATED)
  async createDatabaseRow(@Body() body: CreateDatabaseRowBody) {
    if (!body?.workspaceId || !body?.docId || !body?.title) {
      throw new ActionForbidden('workspaceId, docId and title are required');
    }

    const result = await this.service.addDatabaseRow({
      workspaceId: body.workspaceId,
      docId: body.docId,
      title: body.title,
      status: body.status ?? '',
      direction: body.direction ?? '',
      editorId: undefined,
    });

    return { ok: true, rowId: result.rowId };
  }
}
