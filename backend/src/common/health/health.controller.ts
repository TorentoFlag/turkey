import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service.js';

type HealthResponse = Readonly<{
  status: 'ok' | 'unavailable';
}>;

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService)
    private readonly health: HealthService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    try {
      await this.health.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
