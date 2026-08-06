# Production runtime readiness

## Goal

Сделать репозиторий готовым к воспроизводимому запуску четырёх ролей:
Next.js storefront, Nest API, отдельного outbox worker и PostgreSQL — без
внесения реальных ключей или production-деплоя.

## Context

- `docs/architecture/overview.md` задаёт четыре развёртываемые роли;
- `docs/architecture/integrations.md` требует server-only secrets и отдельный
  worker для Resend/Slack;
- текущий `backend/README.md` ошибочно описывает worker как не имеющий
  интеграций, хотя `NotificationDeliveryService` уже доставляет Resend/Slack.

## Constraints

- Не создавать реальный Arc checkout/refund, не отправлять письма/Slack и не
  выполнять production-деплой.
- Не помещать ключи, URL Slack или PII в репозиторий, образы, логи или
  документацию.
- API и worker не выполняют миграции при старте; отдельная one-shot роль
  `migrate` должна успешно завершиться прежде API/worker.
- Worker должен обрабатывать outbox непрерывно в production и корректно
  завершаться по SIGTERM; test mode сохраняет one-pass запуск для integration
  проверки.

## Plan

1. [x] Добавить production Dockerfiles и `compose.prod.yml`: internal
   PostgreSQL, one-shot migration, api, worker и storefront с healthchecks.
2. [x] Сделать polling worker управляемым конфигурацией, не меняя доменную
   доставку и не вызывая providers в тестах.
3. [x] Убрать исторический production base path `/turkiye`: сделать base path
   явной необязательной public-конфигурацией, чтобы storefront мог жить на
   корневом HTTPS origin, который использует CORS/Arc return URL.
4. [x] Актуализировать backend runbook с реальными границами интеграций,
   конфигурацией окружения, миграциями, обратным proxy и checklist перед
   выдачей реальных секретов.
5. [x] Запустить targeted worker integration tests, backend/frontend quality
   gates, docker compose config и локальный container smoke без provider calls.

## Done when

- Один `docker compose -f compose.prod.yml up` имеет явный порядок
  PostgreSQL -> migrate -> api/worker/storefront и не публикует PostgreSQL.
- Реальные secrets существуют только как обязательные значения окружения
  оператора; `NEXT_PUBLIC_*` содержит только origin/API/base path.
- Worker не завершает обработку outbox после первого события в production,
  но остаётся детерминированно тестируемым.
- README описывает фактический код и точный pre-release checklist.
