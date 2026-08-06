# Browser security hardening: CSRF и защита от перебора пароля

## Goal

Закрыть обязательные security gates перед release: cookie-mutating запросы
пользователя должны требовать trusted origin и CSRF token, регистрация и вход
должны быть ограничены общим PostgreSQL-счётчиком попыток.

## Context

- `docs/architecture/overview.md`, раздел «Безопасность и надёжность»;
- `docs/development/quality-gates.md`, раздел Auth и PII;
- server-side session cookie `turkiye_session` в `modules/auth`;
- продукт запрещает Redis и новые сервисы: PostgreSQL остаётся источником
  авторитетных security-фактов.

## Constraints

- Не менять Admin API, Arc webhook или бизнес-статусы заказов.
- Не хранить пароль, email или IP в открытом виде в rate-limit таблице.
- Не считать отсутствие `Origin` у server-to-server/test-клиента browser-origin
  обходом; browser с переданным `Origin` обязан совпасть с `WEB_APP_ORIGIN`.
- CSRF token не хранится в localStorage и привязан к текущему непрозрачному
  session token через HMAC; frontend получает его только после проверки сессии.
- Rate limit должен быть атомарным при нескольких API-инстансах.

## Plan

1. [x] Добавить PostgreSQL schema/migration для hashed identity counters, limits в
   конфигурации и atomic upsert-window в `AuthService`.
2. [x] Добавить guards: trusted origin на browser mutation endpoints и CSRF для
   authenticated mutation endpoints; исключить Admin API и Arc webhook.
3. [x] Добавить `GET /v1/auth/csrf` и центральную передачу `X-CSRF-Token` в
   frontend client для logout, создания заказа и checkout.
4. [x] Обновить контракты и проверить негативные случаи: missing/invalid token,
   чужой origin, login/register limit и отсутствие открытого PII в БД.
5. [x] Прогнать миграцию на чистой БД, полный backend/frontend quality gate и
   браузерный пользовательский сценарий без реальных оплат.

## Done when

- Cross-origin browser mutation не проходит; authenticated mutation без
  корректного CSRF token не проходит.
- Обычный frontend flow получает token после login/register и продолжает
  оформить заказ/checkout.
- После допустимого числа попыток один IP+email ключ получает `429`; в БД
  остаётся только SHA-256 identity key.
- Все релевантные unit/integration проверки зелёные; браузер отображает
  защищённую форму. Нативный date-ввод проверен вручную по DOM-ограничениям,
  потому что browser automation не передаёт React change event для этого поля.
