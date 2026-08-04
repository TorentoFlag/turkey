"use client";

import Link from "next/link";

import styles from "@/components/marketplace/marketplace.module.css";

type MarketplaceErrorProps = {
  error?: Error & { digest?: string };
  reset: () => void;
};

export default function MarketplaceError({ reset }: MarketplaceErrorProps) {
  return (
    <section aria-labelledby="marketplace-error-title" className={styles.errorPanel}>
      <h2 id="marketplace-error-title">Не удалось открыть раздел</h2>
      <p>Попробуйте загрузить страницу ещё раз или вернитесь к каталогу.</p>
      <div className={styles.errorActions}>
        <button onClick={reset} type="button">Повторить</button>
        <Link href="/catalog">Вернуться в каталог</Link>
      </div>
    </section>
  );
}
