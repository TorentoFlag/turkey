# Arc webhook: сопоставление по external_id и восстановление платежа

## Goal

Webhook `payment.captured`, содержащий Arc `payment_id`, находит payment через
Arc API, получает `external_id` заказа, переводит соответствующий локальный
payment в `succeeded` и создаёт одно уведомление через outbox.

## Context

- `docs/product/business-rules.md`: оплата подтверждается только валидным Arc
  webhook; `is_processed` не является платёжным статусом.
- `docs/architecture/overview.md`: Arc webhook идемпотентен, payment и ручной
  статус заказа разделены.
- Production evidence, 2026-08-09: webhook `payment.captured`
  `019fe6df-2653-7929-a958-3e7b6b8b4635` сохранён, а payment заказа
  `25956f89-9520-43eb-a084-0fbb541209da` остался `pending`.

## Constraints

- Не менять `orders.is_processed`.
- Принимать provider `payment_id` только как UUID; `external_id`, полученный
  read-only lookup из Arc, принимать только как UUID и сопоставлять только с
  `payments.order_id`.
- Не обходить проверку подписи, дедупликацию webhook или transactional outbox.
- Для уже принятого production webhook не удалять запись дедупликации: после
  кода выполнить целевое контролируемое восстановление одного подтверждённого
  платежа в той же логике данных.

## Plan

1. [ ] Добавить integration regression test: capture webhook без internal
   metadata, но с `data.payment_id`, получает order из Arc и возвращает payment
   `succeeded` с единственным outbox event.
2. [ ] Запустить тест и подтвердить RED на текущем коде.
3. [ ] Добавить минимальный provider lookup по Arc `payment_id`, затем
   fallback `payments.order_id` по UUID из Arc `external_id`.
4. [ ] Запустить узкий тест GREEN, затем backend quality gates.
5. [ ] Доставить код на production и проверить health/version.
6. [ ] Восстановить только payment заказа
   `25956f89-9520-43eb-a084-0fbb541209da` как successful: сохранить Arc payment
   ID, создать один outbox event с идемпотентным ключом, не трогать
   `is_processed`; проверить строки БД и историю через API.

## Done when

- Новый webhook flow не оставляет подтверждённую Arc оплату `pending`, если Arc
  прислал order UUID в `external_id`.
- Повтор webhook не создаёт повторного уведомления.
- Исторически подтверждённый заказ показывает technical payment `succeeded`,
  но остаётся «Необработана» до действия менеджера.
