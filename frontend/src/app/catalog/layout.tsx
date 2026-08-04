import type { ReactNode } from "react";

import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";

export default function CatalogLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <MarketplaceShell
      currentPath="/catalog"
      description="Экскурсии, трансферы, билеты и полезные сервисы — соберите маршрут по Турции в одном месте."
      title="Соберите поездку в Турцию"
    >
      {children}
    </MarketplaceShell>
  );
}
