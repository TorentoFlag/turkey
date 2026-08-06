"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  MarketplaceApiError,
  marketplaceApi,
  type ApiOrder,
} from "@/lib/marketplace/api";

import styles from "@/app/checkout/checkout.module.css";

type ReturnState =
  | "loading"
  | "missing"
  | "unauthenticated"
  | "not-found"
  | "error"
  | "ready";

export function CheckoutReturn() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const [state, setState] = useState<ReturnState>(
    orderId ? "loading" : "missing",
  );
  const [order, setOrder] = useState<ApiOrder | null>(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const response = await marketplaceApi.order(orderId);
      setOrder(response);
      setState("ready");
    } catch (error) {
      if (error instanceof MarketplaceApiError && error.status === 401)
        setState("unauthenticated");
      else if (error instanceof MarketplaceApiError && error.status === 404)
        setState("not-found");
      else setState("error");
    }
  }, [orderId]);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => void loadOrder(), 0);
    return () => globalThis.clearTimeout(timeout);
  }, [loadOrder]);

  useEffect(() => {
    if (state !== "ready" || order?.payment?.state !== "pending") return;
    const interval = globalThis.setInterval(() => void loadOrder(), 3_000);
    return () => globalThis.clearInterval(interval);
  }, [loadOrder, order?.payment?.state, state]);

  if (state === "loading")
    return <p role="status">Проверяем состояние оплаты…</p>;
  if (state === "missing")
    return (
      <ReturnPanel
        title="Заказ не указан"
        text="Откройте заказ из личного кабинета."
      />
    );
  if (state === "unauthenticated")
    return (
      <ReturnPanel
        title="Войдите в аккаунт"
        text="Чтобы увидеть состояние заказа, войдите в тот же аккаунт, из которого оформляли покупку."
      />
    );
  if (state === "not-found")
    return (
      <ReturnPanel
        title="Заказ не найден"
        text="Этот заказ недоступен в текущем аккаунте."
      />
    );
  if (state === "error")
    return (
      <ReturnPanel
        title="Не удалось проверить оплату"
        text="Попробуйте обновить страницу или проверьте историю заказов позже."
      />
    );

  if (order?.payment?.state === "succeeded") {
    return (
      <ReturnPanel
        eyebrow="Оплата подтверждена"
        title="Мы взяли ваш заказ в работу"
        text="Менеджер свяжется с вами по указанному телефону."
      />
    );
  }
  if (order?.payment?.state === "failed") {
    return (
      <ReturnPanel
        eyebrow="Оплата не подтверждена"
        title="Заказ пока не оплачен"
        text="Мы не получили подтверждение оплаты. Проверьте историю заказов или попробуйте оформить товар снова."
      />
    );
  }
  return (
    <ReturnPanel
      eyebrow="Проверяем оплату"
      title="Ожидаем подтверждения от платёжного сервиса"
      text="Это может занять несколько секунд. Не оплачивайте заказ повторно: страница обновится сама после подтверждения."
      refreshing
      onRefresh={() => void loadOrder()}
    />
  );
}

function ReturnPanel({
  eyebrow,
  title,
  text,
  refreshing,
  onRefresh,
}: {
  eyebrow?: string;
  title: string;
  text: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <section className={styles.confirmation}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h2>{title}</h2>
      <p>{text}</p>
      <div className={styles.confirmationActions}>
        {refreshing && (
          <button
            className={styles.backButton}
            onClick={onRefresh}
            type="button"
          >
            Обновить сейчас
          </button>
        )}
        <Link href="/account">Личный кабинет</Link>
        <Link href="/catalog">Каталог</Link>
      </div>
    </section>
  );
}
