"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { marketplaceCategories, marketplaceDestinations } from "@/data/marketplace";
import { getVisibleMarketplaceServices } from "@/lib/marketplace/catalog";
import { parseCatalogQuery, serializeCatalogQuery } from "@/lib/marketplace/query-state";
import type { CatalogFilters, CatalogSort, MarketplaceSubcategory, TransferSearchState } from "@/types/marketplace";

import { ExperienceSearchForm } from "./ExperienceSearchForm";
import { FilterPanel } from "./FilterPanel";
import { ScenarioPicker } from "./ScenarioPicker";
import { ServiceCard } from "./ServiceCard";
import { ServiceRequestForm } from "./ServiceRequestForm";
import { TransferSearchForm } from "./TransferSearchForm";
import styles from "./catalog.module.css";

type CatalogBrowserProps = {
  initialFilters: CatalogFilters;
  initialSort?: string | string[];
  initialPage?: number;
};

const sortOptions: { label: string; value: CatalogSort }[] = [
  { label: "По релевантности", value: "relevance" },
  { label: "Сначала дешевле", value: "price-asc" },
  { label: "Сначала дороже", value: "price-desc" },
  { label: "По длительности", value: "duration" },
];

const categoryQuickFilters: { label: string; value: CatalogFilters }[] = [
  { label: "Туры", value: { category: "excursions" } },
  { label: "Билеты", value: { category: "tickets" } },
  { label: "Впечатления", value: { category: "activities" } },
  { label: "Рестораны", value: { category: "restaurants" } },
  { label: "Wellness", value: { category: "spa" } },
  { label: "eSIM", value: { category: "connectivity" } },
  { label: "Трансферы", value: { category: "transfers" } },
  { label: "Проездные", value: { category: "digital" } },
  { label: "Шопинг", value: { category: "shopping" } },
  { label: "VIP транспорт", value: { category: "vip-transport" } },
];

function selectedSort(value: string | string[] | undefined): CatalogSort {
  const sort = Array.isArray(value) ? value[0] : value;
  return sortOptions.some((option) => option.value === sort)
    ? (sort as CatalogSort)
    : "relevance";
}

function selectedPage(value: string | null | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function numberFromInput(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

export function CatalogBrowser({ initialFilters, initialSort }: CatalogBrowserProps) {
  const searchParams = useSearchParams();
  const [urlState, setUrlState] = useState(() => ({
    filters: initialFilters,
    page: 1,
    sort: selectedSort(initialSort),
  }));

  useEffect(() => {
    const query = searchParams.toString();
    // URL state is external input; defer its first read until after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlState({
      filters: query ? parseCatalogQuery(Object.fromEntries(searchParams.entries())) : initialFilters,
      page: selectedPage(searchParams.get("page")),
      sort: selectedSort(searchParams.get("sort") ?? initialSort),
    });
  }, [initialFilters, initialSort, searchParams]);

  return (
    <CatalogBrowserContent
      filters={urlState.filters}
      page={urlState.page}
      sort={urlState.sort}
    />
  );
}

type CatalogBrowserContentProps = {
  filters: CatalogFilters;
  page: number;
  sort: CatalogSort;
};

function CatalogBrowserContent({ filters, page, sort }: CatalogBrowserContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [filterDisclosureOpen, setFilterDisclosureOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scenario = filters.scenario;

  const results = useMemo(
    () => getVisibleMarketplaceServices(filters, sort, page),
    [filters, page, sort],
  );

  const updateUrl = useCallback(
    (nextFilters: CatalogFilters, nextSort: CatalogSort, nextPage: number) => {
      const query = new URLSearchParams(serializeCatalogQuery(nextFilters));
      if (nextSort !== "relevance") query.set("sort", nextSort);
      if (nextPage > 1) query.set("page", String(nextPage));
      const href = query.size ? `${pathname}?${query.toString()}` : pathname;

      startTransition(() => router.replace(href, { scroll: false }));
    },
    [pathname, router],
  );

  function updateFilters(nextFilters: CatalogFilters) {
    updateUrl(nextFilters, sort, 1);
  }

  function updateScenario(nextScenario: CatalogFilters["scenario"]) {
    updateFilters({
      scenario: nextScenario,
      category: undefined,
      subcategory: undefined,
      text: undefined,
      destination: undefined,
    });
  }

  function resetFilters() {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  function toggleCategory(category: CatalogFilters) {
    const active = filters.category === category.category;
    updateFilters(active ? {} : { category: category.category, subcategory: undefined });
  }

  function updateSort(nextSort: CatalogSort) {
    updateUrl(filters, nextSort, 1);
  }

  function showMore() {
    const nextPage = page + 1;
    updateUrl(filters, sort, nextPage);
  }

  const subcategories = filters.category === "shopping"
    ? [
        { label: "Мех и кожа", value: "fur" as MarketplaceSubcategory },
        { label: "Украшения", value: "jewelry" as MarketplaceSubcategory },
      ]
    : filters.category === "vip-transport"
      ? [{ label: "Вертолёты", value: "helicopters" as MarketplaceSubcategory }]
      : [];
  const filterOptions = {
    categories: marketplaceCategories.map(({ id, name }) => ({ label: name, value: id })),
    subcategories,
    destinations: marketplaceDestinations.map(({ id, name }) => ({ label: name, value: id })),
    durations: [
      { label: "До 2 часов", value: "up-to-2-hours" as const },
      { label: "Полдня", value: "half-day" as const },
      { label: "Полный день", value: "full-day" as const },
      { label: "Несколько дней", value: "multi-day" as const },
    ],
    languages: [
      { label: "Русский", value: "Русский" as const },
      { label: "Английский", value: "Английский" as const },
      { label: "Турецкий", value: "Турецкий" as const },
    ],
  };
  const activeFilterCount = new URLSearchParams(serializeCatalogQuery(filters)).size;
  const transferValue: TransferSearchState = {
    from: filters.from ?? "",
    to: filters.to ?? "",
    date: filters.date ?? null,
    time: filters.time ?? null,
    passengers: filters.passengers ?? 1,
    luggage: filters.luggage ?? 0,
    childSeat: filters.childSeat ?? false,
    flightNumber: filters.flightNumber ?? null,
    returnTrip: filters.returnTrip ?? false,
    serviceMode: filters.serviceMode ?? "private",
    vehicleClass: filters.vehicleClass ?? "standard",
  };

  return (
    <section aria-label="Поиск и фильтры каталога" className={styles.catalog}>
      <ScenarioPicker onChange={updateScenario} value={scenario} />
      {scenario === "transfer" && (
        <TransferSearchForm
          onSubmit={(value) => updateFilters({
            ...filters,
            scenario,
            from: value.from || undefined,
            to: value.to || undefined,
            date: value.date ?? undefined,
            time: value.time ?? undefined,
            passengers: value.passengers ?? undefined,
            luggage: value.luggage ?? undefined,
            childSeat: value.childSeat || undefined,
            flightNumber: value.flightNumber ?? undefined,
            returnTrip: value.returnTrip || undefined,
            serviceMode: value.serviceMode,
            vehicleClass: value.vehicleClass,
          })}
          value={transferValue}
        />
      )}
      {scenario === "experience" && <ExperienceSearchForm onSubmit={updateFilters} value={filters} />}
      {(scenario === "self-service" || scenario === "support") && <ServiceRequestForm onSubmit={updateFilters} scenario={scenario} value={filters} />}
      <div className={styles.quickFilters} aria-label="Быстрые фильтры">
        <span className={styles.quickFiltersLabel}>Разделы</span>
        <div className={styles.quickFilterList}>
          {categoryQuickFilters.map((quickFilter) => (
            <button
              aria-pressed={filters.category === quickFilter.value.category}
              className={styles.quickFilter}
              key={quickFilter.label}
              onClick={() => toggleCategory(quickFilter.value)}
              type="button"
            >
              {quickFilter.label}
            </button>
          ))}
        </div>
        {subcategories.length > 0 && (
          <div className={styles.subcategoryFilters} aria-label="Подразделы">
            <span className={styles.quickFiltersLabel}>В разделе</span>
            <div className={styles.quickFilterList}>
              {subcategories.map((subcategory) => (
                <button
                  aria-pressed={filters.subcategory === subcategory.value}
                  className={styles.quickFilter}
                  key={subcategory.value}
                  onClick={() => updateFilters({
                    ...filters,
                    subcategory: filters.subcategory === subcategory.value ? undefined : subcategory.value,
                  })}
                  type="button"
                >
                  {subcategory.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <details
        className={styles.filterDisclosure}
        onToggle={(event) => setFilterDisclosureOpen(event.currentTarget.open)}
        open={filterDisclosureOpen}
      >
        <summary>
          <span className={styles.filterSummaryTitle}>Фильтры</span>
          <span className={styles.filterSummaryMeta}>
            {activeFilterCount > 0 && <span>{activeFilterCount} выбрано</span>}
            <button
              className={styles.clearButton}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resetFilters();
              }}
              type="button"
            >
              Сбросить фильтры
            </button>
            <span>{filterDisclosureOpen ? "Скрыть" : "Настроить"}</span>
          </span>
        </summary>
        <div className={styles.filterBody}>
          <FilterPanel onChange={updateFilters} options={filterOptions} value={filters} />
          <div className={styles.priceFilters}>
            <label>
              <span>Цена от, ₽</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => updateFilters({
                  ...filters,
                  minPrice: numberFromInput(event.currentTarget.valueAsNumber),
                })}
                type="number"
                value={filters.minPrice ?? ""}
              />
            </label>
            <label>
              <span>Цена до, ₽</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => updateFilters({
                  ...filters,
                  maxPrice: numberFromInput(event.currentTarget.valueAsNumber),
                })}
                type="number"
                value={filters.maxPrice ?? ""}
              />
            </label>
          </div>
        </div>
      </details>

      <div className={styles.resultsToolbar}>
        <p aria-live="polite" className={styles.resultCount} role="status">
          {isPending ? "Обновляем результаты…" : `Найдено: ${results.total}`}
        </p>
        <label className={styles.sortControl}>
          <span>Сортировка</span>
          <select onChange={(event) => updateSort(event.target.value as CatalogSort)} value={sort}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {results.total === 0 ? (
        <div className={styles.emptyState} role="status">
          <h2>Ничего не найдено</h2>
          <p>Попробуйте изменить запрос или убрать часть фильтров.</p>
          <button onClick={() => updateFilters({})} type="button">Показать весь каталог</button>
        </div>
      ) : (
        <>
          <div className={styles.serviceList}>
            {results.items.map((service) => <ServiceCard key={service.id} service={service} />)}
          </div>
          {results.hasNextPage && (
            <div className={styles.moreResults}>
              <button
                aria-describedby="catalog-pagination-note"
                onClick={showMore}
                type="button"
              >
                Показать ещё
              </button>
              <p id="catalog-pagination-note">
                Показано {results.items.length} из {results.total} вариантов (страницы 1–{page}).
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
