import type {
  CatalogFilters,
  MarketplaceDemoDate,
  MarketplaceDuration,
  MarketplaceLanguage,
  MarketplaceRegion,
  MarketplaceServiceType,
  MarketplaceSubcategory,
  MarketplaceScenario,
  TransferServiceMode,
  TransferVehicleClass,
} from "@/types/marketplace";
import { marketplaceDestinations } from "../../data/marketplace";

type SearchParams = Record<string, string | string[] | undefined>;

const categories = new Set<MarketplaceServiceType>([
  "excursions",
  "tickets",
  "transfers",
  "taxi",
  "visa",
  "yachts",
  "shopping",
  "spa",
  "airline-tickets",
  "guides",
  "activities",
  "restaurants",
  "digital",
  "connectivity",
  "insurance",
  "rental",
  "services",
  "vip-transport",
]);
const subcategories = new Set<MarketplaceSubcategory>(["fur", "jewelry", "helicopters"]);
const durations = new Set<MarketplaceDuration>([
  "up-to-2-hours",
  "half-day",
  "full-day",
  "multi-day",
]);
const languages = new Set<MarketplaceLanguage>(["Русский", "Английский", "Турецкий"]);
const regions = new Set<MarketplaceRegion>(["aegean"]);
const destinationIds = new Set(marketplaceDestinations.map(({ id }) => id));
const scenarios = new Set<MarketplaceScenario>([
  "experience",
  "transfer",
  "self-service",
  "support",
  "shopping",
]);
const transferModes = new Set<TransferServiceMode>(["private", "shared"]);
const vehicleClasses = new Set<TransferVehicleClass>(["standard", "comfort", "minivan"]);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberValue(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1";
}

function isDemoDate(value: string | undefined): value is MarketplaceDemoDate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseCatalogQuery(searchParams: SearchParams): CatalogFilters {
  const text = firstValue(searchParams.q)?.trim();
  const category = firstValue(searchParams.category);
  const subcategory = firstValue(searchParams.subcategory);
  const scenarioValue = firstValue(searchParams.scenario);
  const destination = firstValue(searchParams.destination)?.trim();
  const region = firstValue(searchParams.region)?.trim();
  const date = firstValue(searchParams.date);
  const duration = firstValue(searchParams.duration);
  const language = firstValue(searchParams.language);
  const serviceMode = firstValue(searchParams.serviceMode);
  const vehicleClass = firstValue(searchParams.vehicleClass);

  const scenario =
    scenarioValue && scenarios.has(scenarioValue as MarketplaceScenario)
      ? (scenarioValue as MarketplaceScenario)
      : category === "transfers" || category === "taxi"
        ? "transfer"
        : undefined;

  return {
    ...(text ? { text } : {}),
    ...(category && categories.has(category as MarketplaceServiceType)
      ? { category: category as MarketplaceServiceType }
      : {}),
    ...(subcategory && subcategories.has(subcategory as MarketplaceSubcategory)
      ? { subcategory: subcategory as MarketplaceSubcategory }
      : {}),
    ...(scenario ? { scenario } : {}),
    ...(destination && destinationIds.has(destination) ? { destination } : {}),
    ...(region && regions.has(region as MarketplaceRegion) ? { region: region as MarketplaceRegion } : {}),
    ...(isDemoDate(date) ? { date } : {}),
    ...(numberValue(firstValue(searchParams.minPrice)) !== undefined
      ? { minPrice: numberValue(firstValue(searchParams.minPrice)) }
      : {}),
    ...(numberValue(firstValue(searchParams.maxPrice)) !== undefined
      ? { maxPrice: numberValue(firstValue(searchParams.maxPrice)) }
      : {}),
    ...(duration && durations.has(duration as MarketplaceDuration)
      ? { duration: duration as MarketplaceDuration }
      : {}),
    ...(language && languages.has(language as MarketplaceLanguage)
      ? { language: language as MarketplaceLanguage }
      : {}),
    ...(isEnabled(firstValue(searchParams.transfer)) ? { transfer: true } : {}),
    ...(isEnabled(firstValue(searchParams.kids)) ? { children: true } : {}),
    ...(isEnabled(firstValue(searchParams.digital)) ? { digital: true } : {}),
    ...(isEnabled(firstValue(searchParams.today)) ? { orderToday: true } : {}),
    ...(firstValue(searchParams.from)?.trim() ? { from: firstValue(searchParams.from)?.trim() } : {}),
    ...(firstValue(searchParams.to)?.trim() ? { to: firstValue(searchParams.to)?.trim() } : {}),
    ...(firstValue(searchParams.time)?.trim() ? { time: firstValue(searchParams.time)?.trim() } : {}),
    ...(numberValue(firstValue(searchParams.passengers)) !== undefined
      ? { passengers: numberValue(firstValue(searchParams.passengers)) }
      : {}),
    ...(numberValue(firstValue(searchParams.luggage)) !== undefined
      ? { luggage: numberValue(firstValue(searchParams.luggage)) }
      : {}),
    ...(isEnabled(firstValue(searchParams.childSeat)) ? { childSeat: true } : {}),
    ...(firstValue(searchParams.flightNumber)?.trim()
      ? { flightNumber: firstValue(searchParams.flightNumber)?.trim() }
      : {}),
    ...(isEnabled(firstValue(searchParams.returnTrip)) ? { returnTrip: true } : {}),
    ...(serviceMode && transferModes.has(serviceMode as TransferServiceMode) ? { serviceMode: serviceMode as TransferServiceMode } : {}),
    ...(vehicleClass && vehicleClasses.has(vehicleClass as TransferVehicleClass) ? { vehicleClass: vehicleClass as TransferVehicleClass } : {}),
    ...(numberValue(firstValue(searchParams.participants)) !== undefined ? { participants: numberValue(firstValue(searchParams.participants)) } : {}),
    ...(isEnabled(firstValue(searchParams.privateTour)) ? { privateTour: true } : {}),
  };
}

export function serializeCatalogQuery(filters: CatalogFilters): string {
  const query = new URLSearchParams();

  if (filters.text?.trim()) query.set("q", filters.text.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.subcategory) query.set("subcategory", filters.subcategory);
  if (filters.destination) query.set("destination", filters.destination);
  if (filters.region) query.set("region", filters.region);
  if (filters.date) query.set("date", filters.date);
  if (Number.isFinite(filters.minPrice)) query.set("minPrice", String(filters.minPrice));
  if (Number.isFinite(filters.maxPrice)) query.set("maxPrice", String(filters.maxPrice));
  if (filters.duration) query.set("duration", filters.duration);
  if (filters.language) query.set("language", filters.language);
  if (filters.transfer) query.set("transfer", "1");
  if (filters.children) query.set("kids", "1");
  if (filters.digital) query.set("digital", "1");
  if (filters.orderToday) query.set("today", "1");
  if (filters.scenario) query.set("scenario", filters.scenario);
  if (filters.from?.trim()) query.set("from", filters.from.trim());
  if (filters.to?.trim()) query.set("to", filters.to.trim());
  if (filters.time?.trim()) query.set("time", filters.time.trim());
  if (Number.isFinite(filters.passengers)) query.set("passengers", String(filters.passengers));
  if (Number.isFinite(filters.luggage)) query.set("luggage", String(filters.luggage));
  if (filters.childSeat) query.set("childSeat", "1");
  if (filters.flightNumber?.trim()) query.set("flightNumber", filters.flightNumber.trim());
  if (filters.returnTrip) query.set("returnTrip", "1");
  if (filters.serviceMode) query.set("serviceMode", filters.serviceMode);
  if (filters.vehicleClass) query.set("vehicleClass", filters.vehicleClass);
  if (Number.isFinite(filters.participants)) query.set("participants", String(filters.participants));
  if (filters.privateTour) query.set("privateTour", "1");

  return query.toString();
}
