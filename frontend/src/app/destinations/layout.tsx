import type { ReactNode } from "react";

import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";

export default function DestinationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <MarketplaceShell
      currentPath="/destinations"
      description="Выберите город или регион, а затем соберите нужные услуги в одном каталоге."
      title="Направления по Турции"
    >
      {children}
    </MarketplaceShell>
  );
}
