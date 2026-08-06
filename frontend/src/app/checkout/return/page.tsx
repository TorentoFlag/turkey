import { Suspense } from "react";

import { CheckoutReturn } from "@/components/marketplace/CheckoutReturn";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";

import styles from "../checkout.module.css";

export default function CheckoutReturnPage() {
  return (
    <div className={styles.checkoutPage}>
      <MarketplaceHeader />
      <main className={styles.page}>
        <div className={styles.header}>
          <h1>Статус оплаты</h1>
          <p>Оплата подтверждается только после ответа платёжного сервиса.</p>
        </div>
        <Suspense fallback={<p role="status">Проверяем состояние оплаты…</p>}>
          <CheckoutReturn />
        </Suspense>
      </main>
    </div>
  );
}
