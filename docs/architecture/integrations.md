# Интеграции: Arc Pay, Resend, Slack и outbox

## Transactional outbox

Любое бизнес-событие, которое требует уведомления, создаётся в той же PostgreSQL-транзакции, что и его агрегат. Регистрация добавляет `user.registered`; создание `booking` и подтверждённая оплата добавляют `order.accepted`. Worker периодически берёт готовые события, блокирует их конкурентно, отправляет и отмечает доставленными. Ошибка освобождает claim и планирует повтор с ограниченным exponential backoff.

Идемпотентный key должен быть стабильным: например `order.accepted:<order-id>`. Он защищает от повторного webhook и повторного создания заявки. Email отправляется с производным стабильным ключом Resend `...:email`, поэтому повтор worker-а не рассылает второе письмо в окне дедупликации Resend. Slack получает минимальные операционные данные без контактов и адреса; его incoming webhook не предоставляет ключ дедупликации, поэтому worker сохраняет факт доставки только после ответа Slack и повторяет только недоставленное событие.

Основание: [AWS Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## Arc Pay

Для `auto_delivery` и `physical` backend создаёт checkout session через Arc Pay и отдаёт frontend только безопасный URL hosted checkout. Сайт не рисует поля карты, не принимает PAN/CVV и не пытается определять успешную оплату по redirect.

При создании checkout и возврата обязательно передавать/сохранять собственный idempotency key. Сохранить provider checkout/payment ID и исходные сумму/currency. Webhook endpoint:

1. получает raw body;
2. проверяет HMAC-SHA256, timestamp и защиту от replay по правилам Arc;
3. дедуплицирует `Webhook-Id` транзакционно;
4. только затем разбирает событие и применяет допустимый переход technical state;
5. при успехе оплаты создаёт outbox-event.

Full refund вызывает Arc только по исходной полной сумме. UI Admin API не принимает amount. Возможности Arc частично вернуть средства сознательно не используются.

Источники: [Arc checkout sessions](https://finext.gitbook.io/arc-pay/ru/api-reference/checkout-sessions), [Arc signing webhooks](https://finext.gitbook.io/arc-pay/ru/vebkhuki/signing.md), [Arc refunds](https://finext.gitbook.io/arc-pay/ru/api-reference/refunds).

## Resend

Backend/worker использует API Resend. Нужны:

- аккаунт и API key с наименьшими нужными правами;
- подтверждённый домен с DNS-записями SPF/DKIM;
- согласованный sender, например `noreply@<verified-domain>`; reply-to только если задан бизнесом;
- секрет ключа только в secret store окружения backend/worker.

Письма всего двух типов: registration success и order/booking accepted. Шаблоны версионируются в коде/конфигурации, payload outbox содержит только ID агрегата, а worker читает актуальные данные в закрытом контуре. Отправка Resend использует `Idempotency-Key`.

Источники: [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).

## Slack

Webhook URL — секрет worker-а. Slack получает минимально необходимую операционную информацию: ID заявки, тип, товар, время и безопасный контактный путь в админке; не отправляйте полный адрес, пароль, платёжные секреты или полный PII payload. Ошибка Slack не отменяет заказ; worker повторит отправку и поднимет алерт после лимита.

## Переменные окружения

Имена окончательно утвердить при выборе runtime, но все агенты должны ожидать отдельные server-only секреты: `DATABASE_URL`, session/auth secret, Arc API credentials и webhook secret, `RESEND_API_KEY`, `RESEND_FROM`, `SLACK_WEBHOOK_URL`. Никакой из них не имеет префикса публичной переменной frontend и не попадает в `NEXT_PUBLIC_*`.

`WEB_APP_ORIGIN` — не секрет, но обязательная серверная allowlist-настройка для
browser frontend: API принимает credentialed CORS-запросы только от этого exact
origin. `NEXT_PUBLIC_API_BASE_URL` — единственная публичная переменная витрины;
она содержит адрес API и не может содержать ключи, webhook URL или иные секреты.
