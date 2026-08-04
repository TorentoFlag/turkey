import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

export function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('turkiye_test')
    .withUsername('turkiye_test')
    .withPassword('turkiye_test')
    .start();
}
