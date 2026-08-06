# Frontend: миграция дизайн-прототипа на Backend API

## Goal

Заменить mock-каталог, localStorage-аккаунт/заказы, корзину и фиктивную оплату
в `frontend/` на утверждённые Backend API и Arc Hosted Checkout, сохранив
визуальный язык дизайн-прототипа.

## Context

- `AGENTS.md`, `frontend/AGENTS.md`;
- `docs/product/business-rules.md`;
- `docs/architecture/overview.md`, `docs/architecture/integrations.md`;
- `docs/api/orders.md`, `docs/api/payments.md`;
- backend-контракты в `backend/src/modules/{auth,catalog,orders,payments}`.

## Constraints

- Один товар → один заказ/заявка; корзины нет.
- Только API является источником каталога, сессии, заказов, денег и статусов.
- `booking` не открывает checkout; `auto_delivery`/`physical` после создания
  заказа переходят на server-returned Arc Hosted Checkout URL.
- Никаких секретов backend, данных карты, Admin UI и реальных платежей.
- Не удалять дизайнерские материалы; obsolete prototype code заменять только
  вместе с соответствующим пользовательским потоком.

## Plan

1. Создать typed browser API client с cookie credentials, общей обработкой
   ошибок и runtime-конфигурацией публичного backend base URL. Добавить
   frontend-тесты контрактов клиента.
2. Перевести каталог и product pages на `GET /v1/public/categories` и
   `GET /v1/public/products`; убрать fixed category unions из runtime flow,
   сохранив visual filters и query state на строковых IDs/slug.
3. Перевести регистрацию, вход, выход и current user на `/v1/auth/*`, `/v1/me`;
   удалить localStorage account gate и доказать session refresh/logout.
4. Заменить корзину и fake card form на one-product request form:
   auto delivery — email/phone; physical — плюс адрес; booking — плюс даты.
   После `POST /v1/orders` открыть checkout только для платных типов.
5. Перевести кабинет на `GET /v1/me/orders`, показывая только утверждённые
   пользовательские данные: товар, дата, `обработана`/`необработана`, сумма
   снимка и технический refund state при наличии API поля.
6. Удалить из активного frontend path local store/cart и обновить navigation,
   empty/error/loading states. Historical design code остаётся только если не
   участвует в runtime.
7. Запустить lint/typecheck/build и браузерную runtime-проверку локального
   сценария с Backend. Добавить/обновить docs API integration и перечислить
   требуемые публичные runtime env variables.

## Done when

- В активном marketplace-flow отсутствуют localStorage account/orders/cart и
  форма карты.
- Браузер использует реальный API, cookie session и redirect URL backend.
- Все три типа товара применяют только свои поля и допустимый следующий шаг.
- Проверки frontend и релевантный backend integration suite проходят.
