# Целевая архитектура

## Решение

Используем модульный монолит: Next.js frontend, NestJS backend с `FastifyAdapter`, отдельный Nest worker из того же кодового основания и PostgreSQL. Nest задаёт модульные границы, dependency injection, guards и тестируемые use cases; Fastify остаётся HTTP adapter, а не вторым архитектурным слоем. Это даёт простую эксплуатацию и транзакционную целостность без преждевременных микросервисов, Redis или брокера сообщений.

```text
Browser ── HTTPS ──> Next.js frontend ──> Backend API ──> PostgreSQL
                                          │       │
Existing admin backend ── trusted Admin API│       └── Arc Pay
                                          │
                                  Worker reads outbox ──> Resend / Slack
Arc Pay ── signed webhook ────────────────> Backend API
```

Развёртываемые роли: `frontend`, Nest `api`, Nest `worker`, `postgres`. `api` и `worker` используют общую доменную библиотеку/миграции, но масштабируются и перезапускаются независимо. Доступ к PostgreSQL реализуется через Drizzle ORM и SQL-миграции в репозитории backend. Конкретный reverse proxy и CI выбираются позднее, но не должны менять эти границы.

## Модули backend

| Модуль          | Владеет                                                     | Не делает                         |
| --------------- | ----------------------------------------------------------- | --------------------------------- |
| `auth`          | регистрация, вход, хеш пароля, сессии                       | данные каталога и заказов         |
| `catalog`       | категории, подкатегории, товары, публичная выдача           | supplier sync и изображения-файлы |
| `orders`        | создание заявок, контактные данные, `is_processed`, история | подтверждение платежа             |
| `payments`      | checkout Arc, платежные факты, webhook идемпотентность      | ручная обработка заказа           |
| `refunds`       | полный возврат, техническое состояние                       | изменение `is_processed`          |
| `notifications` | намерения уведомлений/outbox                                | прямую бизнес-логику HTTP         |
| `audit`         | неизменяемый след действий admin                            | авторизацию внешней админки       |
| `admin-api`     | контракт с общей админкой и её actor context                | собственный admin UI              |
| `integrations`  | Arc Pay, Resend, Slack clients                              | доменные решения                  |

Модуль обращается к другому через явный application service/порт, а не через прямую запись в чужую таблицу. Контроллеры тонкие: проверяют transport/input и вызывают use case. Провайдеры заменяемы через интерфейсы, но отдельные abstraction-слои не создаются без второго реального провайдера.

## Данные и инварианты

Минимальные таблицы:

| Таблица         | Существенные поля и инварианты                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `id`, unique normalized `email`, `password_hash`, timestamps                                                                                       |
| `sessions`      | `user_id`, hash токена, expiry/revocation; в cookie только непрозрачный токен                                                                      |
| `categories`    | `parent_id`, `name`, unique `slug`, `image_url`, `sort_order`, `is_active`; constraint глубины два проверяется сервисом и БД где возможно          |
| `products`      | `category_id`, `type`, title/description/image URL, `price_minor`, `currency`, `is_active`, `sort_order`; сумма обязательна для двух платных типов |
| `orders`        | `user_id`, product snapshot (название/цена/валюта), contact snapshot, `type`, booking dates/address по типу, `is_processed`, timestamps            |
| `payments`      | `order_id`, Arc checkout/payment ID, сумма minor units, currency, technical state, webhook metadata; уникальность provider ID                      |
| `refunds`       | `payment_id`, Arc refund ID, исходная полная сумма, state, requested/confirmed timestamps, safe error                                              |
| `outbox_events` | event type, aggregate ID, serialized безопасный payload, idempotency key, attempts, next attempt, delivered timestamp                              |
| `audit_log`     | trusted actor, action, aggregate, before/after redacted metadata, request/correlation ID, timestamp                                                |

`orders.is_processed` — единственное ручное состояние менеджера. Нельзя заменить его `payment_state`, `refund_state`, `delivery` или набором статусов. Деньги хранятся целым числом minor units (`price_minor`), с явной ISO-валютой; `float` запрещён.

При создании заказа нужно зафиксировать в order snapshot минимально название товара, тип, цену/валюту и пользовательские данные формы. Изменение товара после оформления не меняет историю заказа или возврат.

## Публичный API

Точные JSON-схемы будут закреплены до реализации, но границы следующие:

| Группа                                                      | Примеры                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /v1/public/categories`, `/products`, `/products/:slug` | публичный активный каталог                                                                           |
| `POST /v1/auth/register`, `/login`, `/logout`; `GET /v1/me` | учётная запись и сессия                                                                              |
| `POST /v1/orders`                                           | создаёт бронирование либо платный intent; только авторизованный пользователь                         |
| `POST /v1/orders/:id/checkout`                              | только владелец, только `auto_delivery`/`physical`; создаёт/возвращает Arc checkout URL идемпотентно |
| `GET /v1/me/orders`                                         | только собственная история                                                                           |
| `POST /v1/webhooks/arc`                                     | отдельный публичный endpoint с проверкой подписи                                                     |
| `/v1/admin/*`                                               | только сервер общей админки: каталог, обработка, полный возврат, аудит                               |

Клиент не передаёт цену, валюту, `is_processed`, refund state, actor или payment success. Все эти значения рассчитывает/принимает backend. Ошибки API — типизированные, без provider secret/error body для клиента.

## Ключевые последовательности

### Оплачиваемый товар

1. Авторизованный пользователь отправляет допустимую форму.
2. Backend читает актуальный активный товар, создаёт order и payment intent/snapshot, но не считает заказ оплаченным.
3. Frontend получает URL Arc Hosted Checkout и перенаправляет клиента туда.
4. Только валидный Arc webhook переводит технический payment state в успешный.
5. В той же транзакции записывается outbox event «order accepted».
6. Worker один раз доставляет Resend и Slack, повторяя временные сбои.

Return URL Arc — только UX-страница, а не доказательство оплаты: она читает состояние из API.

### Бронь

1. Авторизованный пользователь отправляет email, телефон и желаемые даты.
2. Backend создаёт order с типом `booking`, без payment/checkout.
3. В одной транзакции создаёт outbox event «booking accepted».
4. Worker отправляет то же письмо «Мы взяли ваш заказ в работу» и Slack.

### Полный возврат

1. Доверенная внешняя админка вызывает admin endpoint конкретного payment.
2. Backend проверяет: платёж успешно завершён, возврата ещё нет, сумма равна исходной полной сумме.
3. Создаёт refund record `processing`, вызывает Arc с идемпотентным ключом и сохраняет ID/результат.
4. Webhook/запрос статуса подтверждает `succeeded` или `failed`.
5. `orders.is_processed` не меняется; действие фиксируется в `audit_log`.

## Безопасность и надёжность

- Пароль: Argon2id, допустимая политика сложности/длины, rate-limit регистрации и входа в PostgreSQL по SHA-256 ключу action/IP/normalized email. Никаких паролей в логах и localStorage.
- Сессия: Secure, HttpOnly, SameSite cookie; browser mutation с `Origin` требует exact `WEB_APP_ORIGIN`, а authenticated mutation — дополнительный `X-CSRF-Token`, HMAC-привязанный к текущей сессии. CORS только разрешённым origin.
- Внешняя админка: server-to-server аутентификация, scopes и передача проверенного `actor_id`; её browser token не должен давать доступ к Admin API напрямую.
- Arc: raw request body, HMAC и timestamp проверяются до parse; `Webhook-Id` дедуплицируется в транзакции. Неверная подпись не меняет данные.
- Idempotency: order submit, checkout creation, webhook и refund выдерживают повтор запроса без двойной операции/уведомления.
- PII: шифрование диска/managed DB, минимальный доступ, редактирование PII в аудит-логах, политика хранения будет отдельным юридическим решением.
- Observability: correlation ID, структурированные логи без секретов/PII, health/readiness, alert на постоянно неотправленный outbox и failed refund.

## Явно вне scope

Нет supplier API, поиска/подтверждения доступности, корзины, оплаты брони на сайте, назначения менеджеров, доставочных статусов, SEO-полей, файлового хранилища, частичных возвратов, финансовой unit economics и аналитического контура. Их нельзя добавлять как «малое улучшение» без продуктового решения.
