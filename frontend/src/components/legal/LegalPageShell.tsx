import type { ReactNode } from "react";

import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";

import styles from "./legal-document.module.css";

type LegalPageShellProps = {
  children: ReactNode;
};

export function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#legal-document-content">Перейти к документу</a>
      <MarketplaceHeader />
      <main className={styles.main} id="legal-document-content">{children}</main>
      <MarketplaceFooter />
    </div>
  );
}
