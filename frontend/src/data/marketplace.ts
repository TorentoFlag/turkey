import type {
  MarketplaceCategory,
  MarketplaceDestination,
  MarketplaceNavigationItem,
  MarketplaceService,
  ServiceVariant,
} from "../types/marketplace";
import { capturedAt, eurToRub, sourceProducts } from "./marketplace-sources";

export const marketplaceDestinations: MarketplaceDestination[] = [
  ["istanbul", "Стамбул", "Мраморноморский регион", "Город проливов, музеев и кварталов для долгих прогулок.", "/images/istanbul-waterfront-heritage.webp"],
  ["antalya", "Анталья", "Средиземноморье", "Побережье, старый город и удобные маршруты к природе.", "/images/antalya-ruins.jpg"],
  ["alanya", "Аланья", "Средиземноморье", "Крепость, бухты и неспешные морские дни.", "/images/kas-coast.jpg"],
  ["cappadocia", "Каппадокия", "Центральная Анатолия", "Долины, туфовые города и рассветные маршруты.", "/images/cappadocia-dawn.jpg"],
  ["marmaris", "Мармарис", "Эгейское побережье", "Бухты, сосны и выходы в море.", "/images/aegean-bodrum.jpg"],
  ["bodrum", "Бодрум", "Эгейское побережье", "Белые дома, набережные и островные горизонты.", "/images/home-canvas/aegean-bodrum.webp"],
  ["fethiye", "Фетхие", "Эгейское побережье", "Ликийские тропы и тихие лагуны.", "/images/kas-coast.jpg"],
  ["izmir", "Измир", "Эгейское побережье", "Городская набережная и выезды к античным местам.", "/images/modern-downtown.jpg"],
  ["kusadasi", "Кушадасы", "Эгейское побережье", "Приморская база для поездок к Эфесу.", "/images/istanbul-modern.jpg"],
  ["pamukkale", "Памуккале", "Эгейский регион", "Травертины и древний Иераполис.", "/images/pamukkale.jpg"],
  ["bursa", "Бурса", "Мраморноморский регион", "Османское наследие и горные маршруты.", "/images/home-canvas/istanbul-legacy-hotel.webp"],
  ["trabzon", "Трабзон", "Черноморский регион", "Зелёные плато и черноморское побережье.", "/images/turkey-transfer-coast.webp"],
  ["side", "Сиде", "Средиземноморье", "Античные руины рядом с морем.", "/images/perge-ruins.jpg"],
  ["belek", "Белек", "Средиземноморье", "Спокойный курорт и маршруты в окрестностях.", "/images/antalya-ruins.jpg"],
  ["kemer", "Кемер", "Средиземноморье", "Горы, сосны и небольшие пляжи.", "/images/kas-coast.jpg"],
].map(([id, name, region, description, imagePath]) => ({ id, name, slug: id, region, description, imagePath }));

export const marketplaceCategories: MarketplaceCategory[] = [
  { id: "excursions", name: "Туры", description: "Маршруты и поездки по Турции." },
  { id: "tickets", name: "Билеты в музеи и достопримечательности", description: "Мобильные билеты на главные места страны." },
  { id: "activities", name: "Впечатления и экскурсии", description: "Шоу, мастер-классы и необычные городские сценарии." },
  { id: "restaurants", name: "Рестораны", description: "Ужины, дегустации и гастрономические маршруты." },
  { id: "spa", name: "Красота и wellness", description: "Хамамы, массажи и восстановительные программы." },
  { id: "connectivity", name: "eSIM", description: "Цифровая связь для поездки по Турции." },
  { id: "transfers", name: "Трансферы", description: "Шаттлы и приватные поездки из аэропортов." },
  { id: "digital", name: "Проездные", description: "Городские карты и туристические пропуска." },
  { id: "shopping", name: "Шопинг", description: "Шубы, кожа и ювелирные изделия из Турции." },
  { id: "vip-transport", name: "VIP транспорт", description: "Вертолётные трансферы и панорамные полёты." },
];

const cityIds = new Map(marketplaceDestinations.map(({ id, name }) => [name, id]));

function durationFor(minutes: number | null | undefined): MarketplaceService["duration"] {
  if (!minutes) return null;
  if (minutes <= 120) return "up-to-2-hours";
  if (minutes <= 360) return "half-day";
  if (minutes <= 1440) return "full-day";
  return "multi-day";
}

function deliveryMethodFor(product: (typeof sourceProducts)[number]) {
  if (product.id === "bosphorus-dinner-cruise") return "Круиз";

  if (product.isDigital) {
    if (product.type === "tickets") return "Электронный билет";
    if (product.type === "digital") return "Цифровой пропуск";
    return "Цифровая доставка";
  }

  const labels: Partial<Record<MarketplaceService["type"], string>> = {
    excursions: "Экскурсия с гидом",
    activities: "Впечатление на месте",
    restaurants: "Бронирование столика",
    spa: "Сеанс ухода",
    transfers: "Трансфер",
    shopping: "Покупка в магазине",
    "vip-transport": "VIP-перелёт",
  };

  return labels[product.type] ?? "Услуга по выбранному формату";
}

export const marketplaceServices: MarketplaceService[] = sourceProducts.map((product) => {
  const provider = product.sourceUrl.includes("turkishopping.com")
    ? "Turkishopping"
    : product.sourceUrl.includes("goldeneyejewellery.net")
      ? "Golden Eye Jewellery"
      : product.sourceUrl.includes("elithomes.com")
        ? "Elit Homes"
        : product.sourceUrl.includes("trasst") ? "Trasst" : "Istanbul.com";
  const imageSource = "Нейтральная локальная обложка FARO; источник товара указан отдельно";
  const price = product.sourcePrice > 0 ? Math.round(product.sourcePrice * eurToRub) : 0;
  return {
    id: product.id,
    slug: product.id,
    title: product.title,
    catalogSection: product.section,
    provider,
    sourceUrl: product.sourceUrl,
    sourceName: provider,
    capturedAt,
    sourcePrice: product.sourcePrice,
    sourceCurrency: "EUR",
    imageSource,
    availability: "snapshot",
    providerStatus: "awaiting_provider",
    categoryId: product.type,
    subcategory: product.subcategory,
    destinationId: product.city ? cityIds.get(product.city) ?? null : null,
    type: product.type,
    description: product.description,
    imagePath: product.imagePath,
    images: [product.imagePath],
    price,
    priceLabel: product.priceLabel,
    currency: "RUB",
    priceUnit: product.priceUnit,
    duration: durationFor(product.durationMinutes),
    durationMinutes: product.durationMinutes ?? null,
    languages: ["Русский", "Английский", "Турецкий"],
    hasTransfer: product.hasTransfer ?? product.type === "transfers",
    suitableForChildren: product.suitableForChildren ?? true,
    isDigital: product.isDigital ?? false,
    orderToday: false,
    included: product.isDigital ? ["Цифровая доставка", "Инструкция по использованию"] : ["Услуга по выбранному формату"],
    excluded: ["Расходы, не указанные в описании", "Дополнительные услуги вне выбранной программы"],
    cancellation: "Условия отмены указаны перед оформлением заявки.",
    meetingPoint: product.isDigital ? null : product.city ?? "Точка встречи уточняется",
    deliveryMethod: deliveryMethodFor(product),
    status: "published",
  };
});

export const marketplaceServiceVariants: ServiceVariant[] = [
  { ...marketplaceServices[0], id: "hagia-sophia-tour-private", serviceId: "hagia-sophia-tour", title: "Индивидуальный маршрут", price: 7200, priceUnit: "за маршрут", durationMinutes: 180 },
  { ...marketplaceServices.find(({ id }) => id === "istanbul-shuttle-aksaray")!, id: "istanbul-shuttle-private", serviceId: "istanbul-shuttle-aksaray", title: "Приватная машина", price: 6300, priceUnit: "за автомобиль", durationMinutes: 90 },
  { ...marketplaceServices.find(({ id }) => id === "trasst-esim-20gb")!, id: "trasst-esim-20gb-variant", serviceId: "trasst-esim-20gb", title: "Пакет 20 ГБ", price: 1364, priceUnit: "за пакет", durationMinutes: 30240 },
  { ...marketplaceServices.find(({ id }) => id === "istanbul-tourist-pass")!, id: "istanbul-tourist-pass-3-days", serviceId: "istanbul-tourist-pass", title: "Пропуск на 3 дня", price: 10395, priceUnit: "за человека", durationMinutes: 4320 },
].map(({ catalogSection, provider, sourceUrl, sourceName, capturedAt: date, sourcePrice, sourceCurrency, imageSource, availability, providerStatus, ...variant }) => ({
  ...variant,
  catalogSection,
  provider,
  sourceUrl,
  sourceName,
  capturedAt: date,
  sourcePrice,
  sourceCurrency,
  imageSource,
  availability,
  providerStatus,
}));

export const marketplaceNavigation: MarketplaceNavigationItem[] = [
  { label: "Каталог", href: "/catalog" },
  { label: "Направления", href: "/destinations" },
  { label: "Туры и впечатления", href: "/catalog?scenario=experience" },
  { label: "Трансферы", href: "/catalog?scenario=transfer" },
  { label: "VIP транспорт", href: "/catalog?category=vip-transport" },
  { label: "Шопинг", href: "/catalog?category=shopping" },
];
