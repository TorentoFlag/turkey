# Документация проекта

Эта папка — единственный рабочий источник истины для продукта и реализации. Дизайн-прототип в `frontend/` полезен как визуальный материал, но не определяет данные, платежи, авторизацию или API.

| Документ | Для чего читать |
| --- | --- |
| [product/business-rules.md](product/business-rules.md) | Утверждённые правила каталога, регистрации, заказов, платежей и возвратов. |
| [architecture/overview.md](architecture/overview.md) | Целевая модульная архитектура, домены, данные и API. |
| [architecture/integrations.md](architecture/integrations.md) | Контракты Arc Pay, Resend, Slack и outbox. |
| [api/payments.md](api/payments.md) | Checkout оплачиваемых заказов через Arc Hosted Checkout. |
| [api/orders.md](api/orders.md) | Контракт пользовательского создания заказа и личной истории. |
| [superpowers/specs/2026-08-04-nest-fastify-backend-foundation-design.md](superpowers/specs/2026-08-04-nest-fastify-backend-foundation-design.md) | Утверждённый стек и граница первого backend-среза. |
| [development/agent-pipeline.md](development/agent-pipeline.md) | Роли, передача задач и порядок агентской разработки. |
| [development/quality-gates.md](development/quality-gates.md) | Обязательная проверка и условия приёмки. |
| [development/production-runbook.md](development/production-runbook.md) | Конфигурация, preflight и безопасный запуск runtime-ролей. |
| [research/agentic-development-practices.md](research/agentic-development-practices.md) | Обоснование выбранного агентского процесса и первичные источники. |
| [design-reference.md](design-reference.md) | Что можно брать из материалов дизайнера и что нельзя считать требованием. |

Исторические планы и спецификации в `frontend/docs/superpowers/` не удалены для сохранения контекста, но запрещены как источник новых решений. Их ограничения (static export, mock-данные, localStorage, фиктивные платежи) отменены этими документами.
