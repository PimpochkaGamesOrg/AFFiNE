import {
  All,
  Controller,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

import { BadRequest, Throttle, UseNamedGuard } from '../../base';
import { Public } from '../../core/auth';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const FETCH_TIMEOUT_MS = 30_000;

@Public()
@UseNamedGuard('selfhost')
@Throttle('default', { limit: 120, ttl: 60_000 })
@Controller('/api/notion')
export class NotionController {
  private readonly logger = new Logger(NotionController.name);

  @All('*')
  async proxy(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
    const token = req.headers['x-notion-token'];
    if (typeof token !== 'string' || !token.trim()) {
      throw new BadRequest('Notion token is required');
    }

    const subPath = req.path.replace(/^\/api\/notion\/?/, '');
    if (!subPath) {
      throw new BadRequest('Notion API path is required');
    }

    const requestUrl = new URL(req.originalUrl, 'http://localhost');
    const targetUrl = `${NOTION_API_BASE}/${subPath}${requestUrl.search}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body:
          req.method !== 'GET' && req.method !== 'HEAD'
            ? JSON.stringify(req.body ?? {})
            : undefined,
        signal: controller.signal,
      });

      const body = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(body);
    } catch (error) {
      this.logger.error(`Notion proxy failed: ${subPath}`, error);
      throw new BadRequest('Failed to reach Notion API');
    } finally {
      clearTimeout(timeout);
    }
  }
}
