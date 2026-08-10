# Online Ruble Payment Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification after every task.

**Goal:** Show `Оплата онлайн рублями` for payable product cards without changing the actual checkout provider.

**Architecture:** Keep the existing service-page type conditional. Change only its payable display branch; booking remains non-payment copy.

**Tech Stack:** Next.js, TypeScript, existing Node verification scripts.

## Task 1: Add the regression check

**Files:**
- Create: `frontend/scripts/verify-service-payment-label.mjs`

1. Write a Node check that fails unless the service page retains the booking text and uses the approved online-ruble text for its payable branch.
2. Run the new check and observe its expected failure before changing the page.

## Task 2: Update the label and verify the frontend

**Files:**
- Modify: `frontend/src/app/services/[slug]/page.tsx`

1. Replace only the payable branch label.
2. Run the regression check, `npm run lint`, `npm run typecheck`, and `npm run build` from `frontend/`.
3. Inspect the diff to confirm no checkout, backend, legal, price, or product-type logic changed.

## Task 3: Release and prove runtime state

1. Commit and push the task-owned files to `main`; wait for the deployment workflow.
2. Check the deployed commit, public health endpoint, and a payable public product response.
