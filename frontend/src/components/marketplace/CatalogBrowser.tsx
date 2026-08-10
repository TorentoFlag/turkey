"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { marketplaceApi, type ApiCategory, type ApiProduct } from "@/lib/marketplace/api";
import { displayProductPrice } from "@/lib/marketplace/product-price";

import cardStyles from "./marketplace.module.css";
import styles from "./catalog.module.css";

function flattenCategories(categories: ApiCategory[]): ApiCategory[] {
  return categories.flatMap((category) => [category, ...category.children]);
}

function productTypeLabel(type: ApiProduct["type"]) {
  if (type === "booking") return "Бронь";
  if (type === "physical") return "Доставка";
  return "Автовыдача";
}

function productPrice(product: ApiProduct) {
  return displayProductPrice(product);
}

function ProductCard({ product, categoryName }: { product: ApiProduct; categoryName?: string }) {
  return (
    <article className={cardStyles.serviceCard}>
      <Link aria-label={`Открыть ${product.title}`} className={cardStyles.serviceCardLink} href={`/services/${product.slug}`}>
        <div aria-label={product.title} className={cardStyles.serviceCardMedia} role="img" style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
          <span className={cardStyles.serviceType}>{categoryName ?? productTypeLabel(product.type)}</span>
        </div>
        <div className={cardStyles.serviceCardContent}>
          <div><h2>{product.title}</h2><p>{product.description}</p></div>
          <div className={cardStyles.serviceMeta}><span>{productTypeLabel(product.type)}</span><strong><span className={cardStyles.priceLabel}>Цена</span>{productPrice(product)}</strong></div>
          <span className={cardStyles.cardAction}>Подробнее</span>
        </div>
      </Link>
    </article>
  );
}

export function CatalogBrowser() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategorySlug = searchParams.get("category") ?? "";
  const [categories, setCategories] = useState<ApiCategory[] | null>(null);
  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    marketplaceApi.categories()
      .then((items) => active && setCategories(items))
      .catch((requestError: unknown) => active && setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить категории."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    marketplaceApi.products(selectedCategorySlug || undefined)
      .then((items) => active && setProducts(items))
      .catch((requestError: unknown) => active && setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить товары."));
    return () => { active = false; };
  }, [selectedCategorySlug]);

  const categoryById = useMemo(() => new Map(flattenCategories(categories ?? []).map((category) => [category.id, category.name])), [categories]);
  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
    if (!normalizedSearch) return products ?? [];
    return (products ?? []).filter((product) => `${product.title} ${product.description}`.toLocaleLowerCase("ru-RU").includes(normalizedSearch));
  }, [products, search]);

  function selectCategory(slug: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (slug) query.set("category", slug);
    else query.delete("category");
    router.replace(query.size ? `${pathname}?${query.toString()}` : pathname, { scroll: false });
  }

  if (error) return <section className={styles.emptyState}><h2>Каталог временно недоступен</h2><p>{error}</p><button onClick={() => globalThis.location.reload()} type="button">Попробовать ещё раз</button></section>;

  const allCategories = flattenCategories(categories ?? []);
  return (
    <section aria-label="Каталог" className={styles.catalog}>
      <div className={styles.quickFilters}>
        <span className={styles.quickFiltersLabel}>Разделы</span>
        <div className={styles.quickFilterList}>
          <button aria-pressed={!selectedCategorySlug} className={styles.quickFilter} onClick={() => selectCategory("")} type="button">Все товары</button>
          {allCategories.map((category) => <button aria-pressed={selectedCategorySlug === category.slug} className={styles.quickFilter} key={category.id} onClick={() => selectCategory(category.slug)} type="button">{category.name}</button>)}
        </div>
      </div>
      <div className={styles.resultsToolbar}>
        <p aria-live="polite" className={styles.resultCount} role="status">{products === null ? "Загружаем товары…" : `Найдено: ${visibleProducts.length}`}</p>
        <label className={styles.sortControl}><span>Поиск по каталогу</span><input onChange={(event) => setSearch(event.target.value)} placeholder="eSIM, яхта, SPA…" type="search" value={search} /></label>
      </div>
      {products !== null && visibleProducts.length === 0 ? <div className={styles.emptyState}><h2>Ничего не найдено</h2><p>Попробуйте выбрать другой раздел или изменить запрос.</p><button onClick={() => { setSearch(""); selectCategory(""); }} type="button">Показать весь каталог</button></div> : <div className={styles.serviceList}>{visibleProducts.map((product) => <ProductCard categoryName={categoryById.get(product.categoryId)} key={product.id} product={product} />)}</div>}
    </section>
  );
}
