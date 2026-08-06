# Quality gates и Definition of Done

## Универсальный чеклист

Задача принята, только если одновременно выполнены:

- [ ] Product: сценарий и состояния совпадают с `docs/product/business-rules.md`.
- [ ] Architecture: ownership данных и API не обходят backend/модули.
- [ ] Security: нет секретов, PII в логах, клиентской авторитетной цены или незащищённого webhook.
- [ ] Tests: есть релевантные automated checks, они запущены с результатом.
- [ ] Runtime: пользовательский flow проверен в браузере/интеграционном окружении, когда применимо.
- [ ] Review: diff независимо просмотрен для medium/high-risk работы.
- [ ] Docs: контракт, конфигурация или runbook обновлены, если они изменились.
- [ ] Handoff: известные ограничения названы явно.

## Дополнительные гейты домена

### Auth и PII

- Сервер нормализует email, пароль хешируется Argon2id, сессия не доступна JavaScript.
- Проверены access control, logout/revocation, PostgreSQL rate limit регистрации/входа, CSRF для browser mutation и отсутствие пароля/токена в логах.
- История заказов выдаётся исключительно владельцу сессии.

### Каталог и Admin API

- Нельзя создать третий уровень категорий, родителя с невалидным типом или удалить категорию с товарами/детьми.
- Неактивные товар/категория не выдаются публично и не оформляются.
- Product type определяет server-side schema формы; клиент не может подменить адрес/даты/цену.
- Admin API проверяет доверенную server-to-server идентичность и пишет audit actor.

### Оплата, webhook и возврат

- Нет card input на нашем frontend; используется только Arc hosted URL.
- Payment success меняется исключительно валидным Arc webhook, не redirect и не данными клиента.
- HMAC, raw body, timestamp и webhook dedupe покрыты тестом.
- Повтор checkout/webhook безопасен; уведомления имеют idempotency key.
- Refund возможен только один, только после пригодного paid payment, только на исходную полную сумму; его outcome виден отдельно от `is_processed`.

### Notifications и worker

- Outbox event вставлен в одну транзакцию с domain change.
- Worker lock/retry/delivery дедуплицированы; временная ошибка не теряет событие.
- Проверены ровно разрешённые уведомления: registration success; paid order/booking accepted. Нет лишних lifecycle emails.
- Slack и Resend secrets server-only; в Slack не уходит лишний PII.

## Минимальная матрица проверок перед первым release

| Сценарий              | Доказательство                                                          |
| --------------------- | ----------------------------------------------------------------------- |
| регистрация           | запись пользователя + безопасная сессия + одно outbox email             |
| авто/физический товар | форма по типу + Arc checkout + webhook success + одно письмо/Slack      |
| бронь                 | заявка без payment record/URL + одно письмо/Slack                       |
| история               | другой пользователь не видит заказ; собственный видит `is_processed`    |
| полный refund         | один Arc вызов, след состояния, повтор безопасен, manager state прежний |
| Arc spoof/retry       | неверная подпись отвергнута; повтор valid webhook без дублей            |
| worker outage         | событие остаётся, доставляется после восстановления один раз            |

Команды конкретного frontend/backend будут добавлены вместе с их package manifests. Не писать «tests passed», если команда не была запущена в текущем состоянии.
