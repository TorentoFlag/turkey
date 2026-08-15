import { Controller, Get } from '@nestjs/common';
import { turkiyeCatalogCapability } from './catalog-protocol.service.js';

@Controller('.well-known/vv-admin')
export class IntegrationManifestController {
  @Get('manifest.json')
  getManifest() {
    return turkiyeIntegrationManifest;
  }
}

export const turkiyeIntegrationManifest = {
  protocolVersion: 1,
  site: {
    key: 'turkiye',
    displayName: 'turkeyplanners',
    publicOrigin: 'https://turkeyplanners.com',
    adminOrigin: 'https://turkeyplanners.com/api',
  },
  commerceEvents: {
    schemaVersion: 1,
    delivery: 'site_to_vv_admin_webhook',
  },
  healthChecks: [
    healthCheck('frontend_http', 'Frontend', 'https://turkeyplanners.com', 60),
    healthCheck(
      'backend_http',
      'Backend',
      'https://turkeyplanners.com/api/health',
      60,
    ),
    healthCheck(
      'visible_catalog',
      'Товары в каталоге',
      'https://turkeyplanners.com/api/v1/public/catalog-health',
      900,
    ),
  ],
  syntheticScenarios: [
    {
      key: 'checkout_payment_reached',
      label: 'Checkout reaches payment',
      kind: 'synthetic_transaction',
      productionSafe: true,
      effect: 'creates_synthetic_entities',
      requiresCleanup: true,
      timeoutMs: 60_000,
      intervalSeconds: 21_600,
      run: {
        method: 'POST',
        url: 'https://turkeyplanners.com/api/admin/integration/scenarios/checkout-payment-reached/run',
      },
    },
  ],
  actions: [],
  catalog: turkiyeCatalogCapability,
  storeOrders: {
    version: 1,
    baseUrl: 'https://turkeyplanners.com/api/admin/integration/store-orders/v1',
    auth: { scheme: 'vv_hmac_v1' },
    processing: { enabled: true },
    refund: { mode: 'full_only' },
  },
} as const;

function healthCheck(
  key: string,
  label: string,
  url: string,
  intervalSeconds: number,
) {
  return {
    key,
    label,
    kind: 'http_status',
    method: 'GET',
    url,
    timeoutMs: 10_000,
    intervalSeconds,
  } as const;
}
