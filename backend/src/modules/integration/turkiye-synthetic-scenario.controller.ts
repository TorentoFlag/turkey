import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import { ScenarioAuthGuard } from './scenario-auth.guard.js';
import { TurkiyeSyntheticScenarioService } from './turkiye-synthetic-scenario.service.js';

@Controller('admin/integration/scenarios')
@UseGuards(ScenarioAuthGuard)
export class TurkiyeSyntheticScenarioController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly scenarios: TurkiyeSyntheticScenarioService,
  ) {}

  @Post('checkout-payment-reached/run')
  @HttpCode(200)
  runCheckoutPaymentReached(@Body() body: unknown) {
    return this.scenarios.runCheckoutPaymentReached(
      readScenarioInput(
        body,
        this.config.get('VV_SCENARIO_SITE_ID', { infer: true }),
      ),
    );
  }
}

const scenarioInputSchema = z
  .object({
    runId: z.uuid(),
    siteId: z.uuid(),
    scenarioKey: z.literal('checkout_payment_reached'),
    requestedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

function readScenarioInput(body: unknown, expectedSiteId: string) {
  const parsed = scenarioInputSchema.safeParse(body);
  if (!parsed.success || parsed.data.siteId !== expectedSiteId) {
    throw new BadRequestException('Scenario run body is invalid.');
  }
  const requestedAt = Date.parse(parsed.data.requestedAt);
  if (Math.abs(Date.now() - requestedAt) > 300_000) {
    throw new BadRequestException('Scenario request timestamp is stale.');
  }
  return parsed.data;
}
