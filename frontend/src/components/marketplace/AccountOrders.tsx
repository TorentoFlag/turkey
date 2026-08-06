"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { marketplaceApi, type ApiOrder } from "@/lib/marketplace/api";

import styles from "./account.module.css";

const date = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatMoney(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount === null || currency === null) return null;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    amount / 100,
  );
}

function refundLabel(state: NonNullable<ApiOrder["refund"]>["state"]) {
  if (state === "succeeded") return "Возврат выполнен";
  if (state === "failed") return "Возврат не выполнен";
  return "Возврат обрабатывается";
}

function paymentLabel(state: NonNullable<ApiOrder["payment"]>["state"]) {
  if (state === "succeeded") return "Оплата подтверждена";
  if (state === "failed") return "Оплата не подтверждена";
  return "Ожидаем подтверждения оплаты";
}

export function AccountOrders() {
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    marketplaceApi
      .orders()
      .then((items) => active && setOrders(items))
      .catch(
        (requestError: unknown) =>
          active &&
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось загрузить историю.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);

  if (error)
    return (
      <section className={styles.empty}>
        <p className={styles.loginError}>{error}</p>
        <Link href="/catalog">Перейти в каталог</Link>
      </section>
    );
  if (orders === null) return <p role="status">Загружаем историю заявок…</p>;
  if (!orders.length)
    return (
      <section className={styles.empty}>
        <p className={styles.eyebrow}>Пока пусто</p>
        <h2>Заказов ещё нет</h2>
        <p>
          После оформления здесь появятся ваши заявки и их статус обработки.
        </p>
        <Link href="/catalog">Перейти в каталог</Link>
      </section>
    );

  return (
    <section className={styles.orders} aria-label="История заказов">
      <div className={styles.ordersIntro}>
        <div>
          <p className={styles.eyebrow}>История</p>
          <h2>Ваши заявки</h2>
        </div>
        <Link href="/catalog">Выбрать товар</Link>
      </div>
      {orders.map((order) => {
        const amount = formatMoney(
          order.product.priceMinor,
          order.product.currency,
        );
        return (
          <details className={styles.order} key={order.id}>
            <summary>
              <span>
                <strong>{order.product.title}</strong>
                <small>{date.format(new Date(order.createdAt))}</small>
              </span>
              <span>
                {amount && <b>{amount}</b>}
                <em className={styles.status}>
                  {order.isProcessed ? "Обработана" : "Необработана"}
                </em>
              </span>
            </summary>
            <div className={styles.orderBody}>
              <div className={styles.orderMeta}>
                <span>
                  Тип
                  <strong>
                    {order.product.type === "booking"
                      ? "Бронь"
                      : order.product.type === "physical"
                        ? "Товар с доставкой"
                        : "Автовыдача"}
                  </strong>
                </span>
                {order.payment && (
                  <span>
                    Оплата<strong>{paymentLabel(order.payment.state)}</strong>
                  </span>
                )}
                <span>
                  Телефон<strong>{order.phone}</strong>
                </span>
                {order.deliveryAddress && (
                  <span>
                    Адрес<strong>{order.deliveryAddress}</strong>
                  </span>
                )}
                {order.bookingStartDate && (
                  <span>
                    Даты
                    <strong>
                      {order.bookingStartDate} — {order.bookingEndDate}
                    </strong>
                  </span>
                )}
                {order.refund && (
                  <span>
                    Возврат<strong>{refundLabel(order.refund.state)}</strong>
                  </span>
                )}
              </div>
              <p className={styles.comment}>
                Наш менеджер свяжется с вами по телефону, чтобы обсудить детали.
              </p>
            </div>
          </details>
        );
      })}
    </section>
  );
}
