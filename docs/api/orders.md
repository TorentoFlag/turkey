# API заказов

## Аутентификация пользователя

Оба endpoint используют server-side сессию из cookie `turkiye_session`. Без действующей сессии API отвечает `401`. Клиент не передаёт `userId`, тип товара, цену, валюту или `isProcessed`.

## Создать заказ или заявку

`POST /v1/orders`

Тело запроса:

```json
{
  "productId": "UUID",
  "email": "traveler@example.com",
  "phone": "+905551112233",
  "deliveryAddress": "Antalya, ...",
  "bookingStartDate": "2026-09-10",
  "bookingEndDate": "2026-09-12"
}
```

Обязательны всегда: `productId`, корректный `email`, `phone`. Дополнительно:

- для `physical` обязателен `deliveryAddress`;
- для `booking` обязательны обе даты в ISO-формате `YYYY-MM-DD`, при этом конец не может быть раньше начала;
- для `auto_delivery` не требуются ни адрес, ни даты.

`productId` должен ссылаться на активный товар в активной категории. Backend читает товар сам и фиксирует снимок `id`, названия, типа, цены и валюты. Поэтому последующее редактирование карточки не изменяет оформленный заказ.

Успех: `201` и объект заказа:

```json
{
  "id": "UUID",
  "product": {
    "id": "UUID",
    "title": "Аренда яхты в Анталье",
    "type": "booking",
    "priceMinor": null,
    "currency": null
  },
  "email": "traveler@example.com",
  "phone": "+905551112233",
  "deliveryAddress": null,
  "bookingStartDate": "2026-09-10",
  "bookingEndDate": "2026-09-12",
  "isProcessed": false,
  "createdAt": "2026-08-04T...Z"
}
```

Для оплачиваемых типов этот endpoint создаёт заказ до checkout. Затем frontend вызывает [`POST /v1/orders/:id/checkout`](payments.md); `booking` checkout не имеет.

## Личная история

`GET /v1/me/orders`

Возвращает только заказы текущего пользователя, от новых к старым. Формат каждого элемента такой же, как у ответа создания. История не раскрывает чужие заказы и не даёт менять `isProcessed`.

## Заказы для внешней админки

Оба endpoint требуют заголовки статического доступа:

```text
X-Admin-Api-Key: <ключ админки>
X-Admin-Actor-Id: <идентификатор сотрудника>
```

`GET /v1/admin/orders` возвращает все заявки, от новых к старым. В записи есть снимок товара (`productTitle`, `productType`, `priceMinor`, `currency`), контакты клиента, адрес или даты бронирования, `isProcessed` и `createdAt`.

`PATCH /v1/admin/orders/:id` принимает только:

```json
{ "isProcessed": true }
```

Это единственное операционное состояние заявки. Каждое фактическое изменение записывается в аудит с `X-Admin-Actor-Id`; повторная установка уже имеющегося значения не создаёт новый аудит.
