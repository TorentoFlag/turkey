import { ConfigService } from '@nestjs/config';
import { pathToFileURL } from 'node:url';
import { AppModule } from './app.module.js';
import { createApiApp } from './common/app-factory.js';
import type { AppEnv } from './config/env.js';

export async function bootstrap(): Promise<void> {
  const app = await createApiApp(AppModule);
  const config = app.get(ConfigService<AppEnv, true>);

  await app.listen({
    host: '0.0.0.0',
    port: config.get('PORT', { infer: true }),
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await bootstrap();
}
