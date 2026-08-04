# Дизайн-референс и границы его применения

В `frontend/` находится визуальный прототип, подготовленный дизайнером. Из него можно переиспользовать визуальный язык: палитру, типографику, композицию, адаптивность, motion, accessibility-подход и лицензированные ассеты с их атрибуцией.

`frontend/DESIGN_DIRECTION.md` и Floema-документы из `frontend/docs/superpowers/` — референс внешнего вида, а не продуктовая спецификация. Бренд, тексты и изображения нельзя копировать из сторонних сайтов без разрешения.

Следующие части прототипа отменены для production-разработки: fixed taxonomy, mock catalogue, provider snapshots, localStorage, пользовательская корзина, форма ввода карты, local `paid` order, static export/GitHub Pages и утверждения «без backend/auth/payment». Их заменяют API, PostgreSQL, серверная авторизация, Arc Hosted Checkout и правила `docs/product/business-rules.md`.
