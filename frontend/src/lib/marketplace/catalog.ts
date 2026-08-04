import { marketplaceCategories, marketplaceDestinations, marketplaceServices } from "../../data/marketplace";
import type {
  CatalogFilters,
  CatalogResult,
  CatalogSort,
  MarketplaceDemoDate,
  MarketplaceDuration,
  MarketplaceLanguage,
  MarketplaceService,
  MarketplaceServiceType,
  MarketplaceScenario,
} from "../../types/marketplace";

const PAGE_SIZE = 12;

const categoryIds = new Set<MarketplaceServiceType>(
  marketplaceCategories.map(({ id }) => id),
);
const retiredCategoryIds = new Set<MarketplaceServiceType>(["yachts"]);
const destinationIds = new Set(marketplaceDestinations.map(({ id }) => id));
const aegeanDestinationIds = new Set(
  marketplaceDestinations
    .filter(({ region }) => region.includes("Эгейское"))
    .map(({ id }) => id),
);
const durationValues = new Set<MarketplaceDuration>([
  "up-to-2-hours",
  "half-day",
  "full-day",
  "multi-day",
]);
const languageValues = new Set<MarketplaceLanguage>([
  "Русский",
  "Английский",
  "Турецкий",
]);
const sortValues = new Set<CatalogSort>([
  "relevance",
  "price-asc",
  "price-desc",
  "duration",
]);

const scenarioCategories: Record<MarketplaceScenario, MarketplaceServiceType[]> = {
  experience: ["excursions", "activities", "guides", "tickets", "spa"],
  transfer: ["transfers", "taxi"],
  "self-service": ["digital", "connectivity", "insurance", "rental"],
  support: ["services", "visa", "insurance", "airline-tickets"],
  shopping: ["shopping"],
};

const destinationNames = new Map(
  marketplaceDestinations.map(({ id, name }) => [id, name]),
);
const categoryNames = new Map(
  marketplaceCategories.map(({ id, name }) => [id, name]),
);

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function searchText(service: MarketplaceService): string {
  return normalized(
    [
      service.title,
      service.description,
      categoryNames.get(service.categoryId) ?? "",
      service.destinationId ? destinationNames.get(service.destinationId) ?? "" : "",
      ...service.included,
      service.subcategory ?? "",
    ].join(" "),
  );
}

function relevance(service: MarketplaceService, query: string): number {
  if (!query) return 0;

  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const title = normalized(service.title);
  const description = normalized(service.description);
  const category = normalized(categoryNames.get(service.categoryId) ?? "");
  const destination = normalized(
    service.destinationId ? destinationNames.get(service.destinationId) ?? "" : "",
  );

  return terms.reduce((score, term) => {
    return (
      score +
      (title.includes(term) ? 4 : 0) +
      (description.includes(term) ? 2 : 0) +
      (category.includes(term) ? 1 : 0) +
      (destination.includes(term) ? 1 : 0)
    );
  }, 0);
}

function isKnownCategory(value: unknown): value is MarketplaceServiceType {
  return typeof value === "string" && categoryIds.has(value as MarketplaceServiceType);
}

function isKnownDuration(value: unknown): value is MarketplaceDuration {
  return typeof value === "string" && durationValues.has(value as MarketplaceDuration);
}

function isKnownLanguage(value: unknown): value is MarketplaceLanguage {
  return typeof value === "string" && languageValues.has(value as MarketplaceLanguage);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDemoDate(value: unknown): value is MarketplaceDemoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function currentPageNumber(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function sortedMarketplaceServices(
  filters: CatalogFilters,
  sort: CatalogSort,
): MarketplaceService[] {
  if (
    typeof filters.category === "string" &&
    retiredCategoryIds.has(filters.category as MarketplaceServiceType)
  ) {
    return [];
  }
  const query = typeof filters.text === "string" ? normalized(filters.text) : "";
  const category = isKnownCategory(filters.category) ? filters.category : undefined;
  const subcategory = filters.subcategory;
  const section = filters.section;
  const destination =
    typeof filters.destination === "string" && destinationIds.has(filters.destination)
      ? filters.destination
      : undefined;
  const region = filters.region === "aegean" ? filters.region : undefined;
  const date = isDemoDate(filters.date) ? filters.date : undefined;
  const minPrice = isFiniteNumber(filters.minPrice) ? filters.minPrice : undefined;
  const maxPrice = isFiniteNumber(filters.maxPrice) ? filters.maxPrice : undefined;
  const duration = isKnownDuration(filters.duration) ? filters.duration : undefined;
  const language = isKnownLanguage(filters.language) ? filters.language : undefined;
  const selectedSort = sortValues.has(sort) ? sort : "relevance";
  const scenario = filters.scenario;
  const scenarioTypes = scenario ? scenarioCategories[scenario] : undefined;

  const filtered = marketplaceServices.filter((service) => {
    if (query && !searchText(service).includes(query)) return false;
    // A selected catalog category is more specific than the broad entry scenario.
    // This keeps category navigation useful even when the user arrived through
    // a scenario such as "experience" that does not include every section.
    if (!category && scenarioTypes && !scenarioTypes.includes(service.type)) return false;
    if (section && service.catalogSection !== section) return false;
    if (category && service.categoryId !== category) return false;
    if (subcategory && service.subcategory !== subcategory) return false;
    if (destination && service.destinationId !== destination) return false;
    if (region && (!service.destinationId || !aegeanDestinationIds.has(service.destinationId))) return false;
    if (date) return false;
    if (minPrice !== undefined && service.price < minPrice) return false;
    if (maxPrice !== undefined && service.price > maxPrice) return false;
    if (duration && service.duration !== duration) return false;
    if (language && !service.languages.includes(language)) return false;
    if (filters.transfer === true && !service.hasTransfer) return false;
    if (filters.children === true && !service.suitableForChildren) return false;
    if (filters.digital === true && !service.isDigital) return false;
    if (filters.orderToday === true && !service.orderToday) return false;
    return true;
  });

  const indexed = filtered.map((service, index) => ({ service, index }));
  indexed.sort((left, right) => {
    if (selectedSort === "price-asc") return left.service.price - right.service.price || left.index - right.index;
    if (selectedSort === "price-desc") return right.service.price - left.service.price || left.index - right.index;
    if (selectedSort === "duration") {
      return (
        (left.service.durationMinutes ?? Number.POSITIVE_INFINITY) -
          (right.service.durationMinutes ?? Number.POSITIVE_INFINITY) ||
        left.index - right.index
      );
    }
    return relevance(right.service, query) - relevance(left.service, query) || left.index - right.index;
  });

  return indexed.map(({ service }) => service);
}

export function getScenarioFilters(scenario: MarketplaceScenario) {
  return scenarioCategories[scenario].map((category) => ({
    category,
    label: categoryNames.get(category) ?? category,
  }));
}

export function filterMarketplaceServices(
  filters: CatalogFilters,
  sort: CatalogSort,
  page = 1,
): CatalogResult {
  const services = sortedMarketplaceServices(filters, sort);
  const currentPage = currentPageNumber(page);
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  return {
    items: services.slice(start, end),
    total: services.length,
    hasNextPage: services.length > end,
  };
}

export function getVisibleMarketplaceServices(
  filters: CatalogFilters,
  sort: CatalogSort,
  page = 1,
): CatalogResult {
  const services = sortedMarketplaceServices(filters, sort);
  const end = currentPageNumber(page) * PAGE_SIZE;

  return {
    items: services.slice(0, end),
    total: services.length,
    hasNextPage: services.length > end,
  };
}
