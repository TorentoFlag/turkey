"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { MarketplaceOrder } from "@/types/marketplace";
import { ORDERS_UPDATED_EVENT, readOrders } from "@/lib/marketplace/local-store";

import styles from "./account.module.css";

const money = new Intl.NumberFormat("ru-RU");
const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const channelLabels = { email: "Email", whatsapp: "WhatsApp", phone: "Телефон" } as const;
const statusLabels = { paid: "Оплачен", processing: "В обработке", delivered: "Доставлен" } as const;

export function AccountOrders() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);

  useEffect(() => {
    const sync = () => setOrders(readOrders());
    sync();
    window.addEventListener(ORDERS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(ORDERS_UPDATED_EVENT, sync);
  }, []);

  if (!orders.length) {
    return <section className={styles.empty}><p className={styles.eyebrow}>Пока пусто</p><h2>Заказов ещё нет</h2><p>После оплаты здесь появятся номер заказа, товары и инструкции по доставке.</p><Link href="/catalog">Перейти в каталог</Link></section>;
  }

  return <section className={styles.orders} aria-label="История заказов"><div className={styles.ordersIntro}><div><p className={styles.eyebrow}>История</p><h2>Ваши заказы</h2></div><Link href="/catalog">Добавить услугу</Link></div>{orders.map((order) => <details className={styles.order} key={order.id}><summary><span><strong>{order.id}</strong><small>{date.format(new Date(order.createdAt))}</small></span><span><b>{money.format(order.total)} ₽</b><em className={styles.status}>{statusLabels[order.status]}</em></span></summary><div className={styles.orderBody}><div className={styles.orderMeta}><span>Канал доставки<strong>{channelLabels[order.customer.deliveryChannel]}</strong></span><span>Получатель<strong>{order.customer.name}</strong></span><span>Контакт<strong>{order.customer.deliveryAddress}</strong></span></div><div className={styles.orderItems}>{order.items.map((item) => <div key={item.serviceId}><span>{item.title}<small>{item.quantity} × {money.format(item.price)} ₽</small><small>{item.bookingDetails.date ? `Дата: ${item.bookingDetails.date}` : "Цифровая доставка"}{item.bookingDetails.time ? ` · ${item.bookingDetails.time}` : ""}{item.bookingDetails.routeFrom ? ` · ${item.bookingDetails.routeFrom} → ${item.bookingDetails.routeTo}` : ""}</small></span><strong>{money.format(item.price * item.quantity)} ₽</strong></div>)}</div>{order.customer.comment && <p className={styles.comment}>Комментарий: {order.customer.comment}</p>}<Link href={`/checkout?order=${order.id}`}>Открыть подтверждение заказа</Link></div></details>)}</section>;
}
