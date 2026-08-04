import { Suspense } from "react";
import { marketplaceServices } from "@/data/marketplace";
import { CheckoutForm } from "@/components/marketplace/CheckoutForm";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";

import styles from "./checkout.module.css";

export default function CheckoutPage() {
  return (
    <div className={styles.checkoutPage}>
      <MarketplaceHeader currentPath="/checkout" />
      <main className={styles.page}>
        <div className={styles.header}>
          <h1>Оформление поездки</h1>
          <p>Проверьте выбранные услуги и оставьте контакты — мы уточним детали перед подтверждением.</p>
        </div>
        <Suspense fallback={<p>Загрузка заказа…</p>}>
          <CheckoutForm services={marketplaceServices} />
        </Suspense>
      </main>
    </div>
  );
}
