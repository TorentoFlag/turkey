# Arc Hosted Checkout: возврат и подтверждённый статус

## Goal

После возврата из Arc Hosted Checkout пользователь видит состояние именно своего
заказа, подтверждённое API, а не фиктивный результат по URL редиректа.

## Context

- `docs/product/business-rules.md` — успешная оплата подтверждается только Arc;
- `docs/architecture/overview.md` — return URL является только UX-страницей;
- `docs/api/payments.md` и Arc Checkout Sessions — Arc принимает HTTPS
  `success_url`, `fail_url`, `cancel_url`;
- текущий frontend уже отправляет пользователя на server-returned hosted URL.

## Constraints

- Не создавать новый ручной статус заказа и не менять `is_processed`.
- Не принимать от браузера результат оплаты или provider ID.
- Return URL должен содержать только ID заказа и маркер UX-сценария; API всегда
  заново читает payment state для текущего владельца заказа.
- Для payment checkout обязателен HTTPS `WEB_APP_ORIGIN`; HTTP localhost не
  является допустимым return URL Arc.
- Не выполнять настоящие платежи или возвраты.

## Plan

1. [x] Передавать Arc отдельные HTTPS success/fail/cancel URLs, сформированные
   backend из `WEB_APP_ORIGIN` и ID заказа.
2. [x] Добавить owner-only `GET /v1/me/orders/:id` и безопасное поле technical
   `payment.state` в пользовательском представлении заказа.
3. [x] Создать `/checkout/return`: он периодически перечитывает заказ, показывает
   pending/succeeded/failed и никогда не считает redirect подтверждением оплаты.
4. [x] Обновить API-документацию и environment contract; покрыть backend
   integration-тестами URL, ownership и переход webhook -> succeeded.
5. [x] Прогнать узкие тесты, затем полный backend/frontend quality gate и browser
   runtime без реального Arc payment.

## Done when

- Arc request содержит три HTTPS return URL этого магазина и заказа.
- Нельзя прочитать состояние чужого заказа.
- После webhook `payment.captured` return API выдаёт `succeeded`; до него —
  `pending`, независимо от return URL.
- Frontend показывает эти состояния и не содержит card fields или client-side
  payment success logic.
