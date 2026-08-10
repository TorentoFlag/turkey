# Legal documents and company details design

**Date:** 2026-08-10
**Scope:** Public Russian-language legal documents and company details in the Turkey Planners frontend.

## Goal

Publish the supplied User Agreement and Privacy Policy in full, make both documents reachable from the public site, and show the confirmed operator details where customers look for support and legal information.

## Confirmed source material

The supplied text is the legal-content authority. It must be reproduced without shortening, editorial rewriting, added legal claims, dates, or extra policies.

The shared company details are:

- Full name: `SMART DEVELOPMENT AND TOURISM COMPANY LIMITED / ООО «СМАРТ ДЕВЕЛОПМЕНТ ЭНД ТУРИЗМ»`.
- Registration number: `0205563015465`.
- Legal address: `518/70, Му 9, подрайон Нонг-Пру, район Банг-Ламунг, провинция Чонбури, Таиланд.`
- Support email: `supp@turkeyplanners.com`.

## Routes and navigation

- Canonical User Agreement: `/legal/terms`.
- Canonical Privacy Policy: `/legal/privacy`.
- `/privacy` aliases the canonical Privacy Policy page.
- Both existing footer surfaces link to the canonical routes and display all shared company facts.

## Content and presentation

Legal copy lives in one typed frontend content module. It reads repeated company details from `siteConfig`, so a later correction has one source of truth. Each document renders as a semantic `article`: H1, introduction paragraphs, numbered H2 sections, paragraphs and lists. Existing marketplace header, skip link and footer are reused; local styles use the current paper, ink and accent palette with readable line length and mobile wrapping.

## Boundaries

- No payment, account, checkout, API, backend, database or product-rule behavior changes.
- No consent checkbox or accepted-document record is added.
- No third privacy, refund, cookie or offer document is created.
- No deployment or external customer communication is performed.

## Verification

- Focused test asserts document IDs, canonical routes, operator facts, all supplied top-level section headings, support address and privacy alias.
- Marketplace static-route test covers canonical and alias legal pages.
- Lint, typecheck and production build run after focused checks.
- Browser inspection covers desktop and 390px mobile width, footer links, long-address wrapping and horizontal overflow.
