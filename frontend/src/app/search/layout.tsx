import type { ReactNode } from "react";

import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";

export default function SearchLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <MarketplaceShell
      currentPath="/search"
      description="Найдите подходящий маршрут, трансфер или цифровой материал по названию и направлению."
      title="Поиск по каталогу"
    >
      {children}
    </MarketplaceShell>
  );
}
