import { Suspense } from "react";
import Link from "next/link";

import { CatalogBrowser } from "@/components/marketplace/CatalogBrowser";

export const dynamic = "force-static";

export default function SearchPage() {
  return (
    <>
      <section aria-labelledby="search-results-heading">
        <h2 id="search-results-heading">Результаты поиска</h2>
        <p>Здесь можно искать по названию, городу или фильтрам.</p>
        <Link href="/catalog">Начать путешествие</Link>
      </section>
      <Suspense fallback={<p role="status">Загружаем каталог…</p>}>
        <CatalogBrowser initialFilters={{}} />
      </Suspense>
    </>
  );
}
