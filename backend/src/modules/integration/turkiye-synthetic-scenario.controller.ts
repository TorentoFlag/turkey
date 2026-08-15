import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ScenarioAuthGuard } from './scenario-auth.guard.js';
import { TurkiyeSyntheticScenarioService } from './turkiye-synthetic-scenario.service.js';

@Controller('admin/integration/scenarios')
@UseGuards(ScenarioAuthGuard)
export class TurkiyeSyntheticScenarioController {
  constructor(private readonly scenarios: TurkiyeSyntheticScenarioService) {}

  @Post('checkout-payment-reached/run')
  @HttpCode(200)
  runCheckoutPaymentReached(@Body() body: unknown) {
    readRunId(body);
    return this.scenarios.runCheckoutPaymentReached();
  }
}

function readRunId(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Scenario run body is invalid.');
  }
  const runId = (body as { runId?: unknown }).runId;
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    throw new BadRequestException('Scenario run ID is required.');
  }
  return runId.trim();
}
