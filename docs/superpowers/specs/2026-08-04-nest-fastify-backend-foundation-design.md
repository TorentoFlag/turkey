# NestJS backend foundation — design

**Статус:** утверждённая техническая основа; implementation plan ещё не написан.

## Решение

Создаём в корне новый `backend/` как TypeScript-проект на NestJS. HTTP API запускается через официальный Nest `FastifyAdapter`; Fastify не определяет модули приложения, бизнес-логику или data access. PostgreSQL — единственная авторитетная БД. Drizzle ORM отвечает за типизированный доступ и versioned SQL migrations. Отдельный Nest worker запускает фоновые outbox-задачи, используя те же доменные модули и БД.

```text
Next.js frontend → Nest API (FastifyAdapter) → PostgreSQL
                           ↑                    ↓
Arc signed webhook ────────┘              Nest worker → Resend / Slack
External admin backend ─── trusted Admin API
```

## Почему не standalone Fastify

Standalone Fastify хорошо подходит для небольшого API: его plugin encapsulation и JSON schema validation поддерживают компактное приложение. Но здесь есть независимые домены auth, catalog, orders, payments, refunds, notifications, audit и Admin API. Для них Nest даёт устойчивую структуру модулей, dependency injection, guards, validation pipe и testable use cases. Это снижает риск, что разные агенты создадут несовместимые способы валидации, доступа к БД или интеграций.

Fastify остаётся выбранным transport adapter: HTTP performance и raw-body control для Arc webhook доступны без перехода на Express. Nest официально поддерживает этот вариант через `FastifyAdapter`.

## Первое поставляемое вертикальное основание

Первый план должен создать только проверяемый backend foundation, не делать интерфейс и не переносить весь прототип:

1. package/tooling, строгий TypeScript, ESLint, unit/integration test runner;
2. Nest application factory с FastifyAdapter, config validation, health endpoint и correlation ID;
3. Drizzle schema/migration runner и проверка подключения PostgreSQL;
4. модули-заготовки `catalog`, `auth`, `orders`, `payments`, `notifications`, `audit`, без fake business success;
5. базовый outbox persistence contract и отдельный worker entrypoint, без реальных Arc/Resend/Slack ключей;
6. test harness: чистая test database, HTTP integration test и проверка, что API/worker не запускают внешние side effects в test mode.

Это vertical foundation, не feature launch. Регистрация, каталог, checkout и webhook будут следующими отдельными планами после того, как foundations реально проходят проверки.

## Структура кода

```text
backend/
  src/
    main.ts                         # Nest API bootstrap + FastifyAdapter
    worker.ts                       # Nest worker bootstrap
    app.module.ts
    config/                         # typed, validated server-only configuration
    database/                       # Drizzle client, schema, migrations bootstrap
    common/                         # error mapping, correlation, health
    modules/
      auth/
      catalog/
      orders/
      payments/
      notifications/
      audit/
  drizzle/                          # generated/handwritten SQL migrations
  test/                             # API and database integration tests
```

Контроллеры остаются тонкими; use case/service владеет правилами; repository не содержит HTTP-логики; provider clients лежат внутри соответствующих integrations. Worker вызывает application services, а не HTTP endpoints API.

## Обязательные ограничения

- Node/TypeScript только на backend; версии фиксируются в `backend/package.json` после проверки совместимости.
- Не хранить секреты в коде или `NEXT_PUBLIC_*`; config fail-closed при отсутствующем обязательном server secret.
- Доступ к деньгам — minor units; `float` запрещён.
- Для будущего Arc webhook raw body и проверка подписи идут до JSON parse; redirect никогда не подтверждает оплату.
- Будущие email/Slack возникают через transactional outbox, не прямо из controller.
- Нет Redis, брокера, файлового storage, microservices, supplier API, fake checkout или localStorage-authority.
- `is_processed` остаётся единственным ручным manager state; payment/refund — отдельные технические записи.

## Тестовая стратегия foundation

Сначала тесты должны показать отсутствие ожидаемых bootstrap/config/database контрактов, затем минимальная реализация их удовлетворяет. Минимально проверяем:

- app bootstrap возвращает `/health` только после readiness DB;
- production config отвергает неполную/невалидную конфигурацию до запуска;
- migration применима к пустой PostgreSQL test DB и создаёт ожидаемые таблицы;
- API integration test проходит через Fastify inject/HTTP без внешнего network call;
- worker читает только тестовую outbox запись и не пытается вызвать Arc/Resend/Slack.

## Вне scope этого плана

Нет endpoint регистрации, password flow, категории, товара, заказа, Arc session/webhook, Resend, Slack, refund endpoint, admin endpoint, frontend migration или deployment. Эти функции нельзя «добавить заодно» в foundation.

## Критерий готовности дизайна

Первый implementation plan обязан назвать точные файлы, команды, тесты, Postgres test strategy, interface между API/worker и порядок миграций. Он не должен требовать ещё одного выбора между Nest и Fastify: решение уже принято — NestJS + FastifyAdapter + Drizzle + PostgreSQL.
