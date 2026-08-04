"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { readCart, writeCart } from "@/lib/marketplace/local-store";

import styles from "./product-actions.module.css";

export function ProductActions({ serviceId, serviceTitle }: { serviceId: string; serviceTitle: string }) {
  const [added, setAdded] = useState(false);
  const router = useRouter();

  function addToCart() {
    const current = readCart();
    const existing = current.find((item) => item.serviceId === serviceId);
    const next = existing ? current : [...current, { serviceId, quantity: 1 }];
    setAdded(true);
    writeCart(next);
  }

  return (
    <div className={styles.actions}>
      <button className={styles.primary} onClick={addToCart} type="button">
        {added ? "В корзине" : "Добавить в корзину"}
      </button>
      <button className={styles.secondary} onClick={() => { addToCart(); router.push("/checkout"); }} type="button">
        Купить сейчас
      </button>
      {added && (
        <div aria-live="polite" className={styles.toast} role="status">
          <div className={styles.toastCopy}>
            <strong>Добавлено в корзину</strong>
            <span>{serviceTitle}</span>
          </div>
          <Link className={styles.toastLink} href="/checkout">Перейти в корзину</Link>
          <button aria-label="Закрыть уведомление" className={styles.toastClose} onClick={() => setAdded(false)} type="button">×</button>
        </div>
      )}
    </div>
  );
}
