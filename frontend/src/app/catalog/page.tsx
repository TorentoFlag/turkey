import { Suspense } from "react";

import { CatalogBrowser } from "@/components/marketplace/CatalogBrowser";

export default function CatalogPage() {
  return (
    <Suspense fallback={<p role="status">Загружаем каталог…</p>}>
      <CatalogBrowser initialFilters={{}} />
    </Suspense>
  );
}
