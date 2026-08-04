import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module.js';
import type { AppEnv } from '../config/env.js';
import { DatabaseService } from './database.service.js';

@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: DatabaseService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new DatabaseService(config),
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
