import { Suspense } from "react";

import { CheckoutForm } from "@/components/marketplace/CheckoutForm";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";

import styles from "./checkout.module.css";

export default function CheckoutPage() {
  return (
    <div className={styles.checkoutPage}>
      <MarketplaceHeader currentPath="/checkout" />
      <main className={styles.page}>
        <div className={styles.header}>
          <h1>Оформление</h1>
          <p>Оформляется один товар или одна заявка. Менеджер свяжется с вами после оплаты или создания брони.</p>
        </div>
        <Suspense fallback={<p>Загрузка заказа…</p>}><CheckoutForm /></Suspense>
      </main>
    </div>
  );
}
