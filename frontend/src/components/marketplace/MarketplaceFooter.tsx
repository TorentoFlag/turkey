import Link from "next/link";

import { sitePath } from "@/lib/sitePath";

import styles from "./marketplace.module.css";

export function MarketplaceFooter() {
  return (
    <footer className={styles.marketplaceFooter}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <p className={styles.footerNote}>
            Выберите маршрут и оформите заказ в удобном формате.
          </p>
        </div>
        <nav aria-label="Навигация в подвале" className={styles.footerNav}>
          <Link href="/catalog">Каталог</Link>
          <Link href="/destinations">Направления</Link>
          <Link href="/search">Поиск</Link>
          <a href={sitePath("/account/")}>Личный кабинет</a>
        </nav>
      </div>
    </footer>
  );
}
