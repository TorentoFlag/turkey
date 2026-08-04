import type { ReactNode } from "react";

import { MarketplaceFooter } from "./MarketplaceFooter";
import { MarketplaceHeader } from "./MarketplaceHeader";
import styles from "./marketplace.module.css";

type MarketplaceShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  currentPath?: string;
};

export function MarketplaceShell({
  children,
  currentPath,
  description,
  title,
}: MarketplaceShellProps) {
  return (
    <div className={styles.marketplaceShell}>
      <a className={styles.skipLink} href="#marketplace-content">
        Перейти к содержанию
      </a>
      <MarketplaceHeader currentPath={currentPath} />
      <main className={styles.marketplaceMain} id="marketplace-content">
        <header className={`${styles.pageIntro} ${currentPath === "/catalog" ? styles.catalogPageIntro : ""}`}>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
