export type MarketplaceServiceType =
  | "excursions"
  | "tickets"
  | "transfers"
  | "guides"
  | "activities"
  | "digital"
  | "connectivity"
  | "insurance"
  | "rental"
  | "services"
  | "taxi"
  | "visa"
  | "yachts"
  | "shopping"
  | "vip-transport"
  | "restaurants"
  | "spa"
  | "airline-tickets";

export type MarketplaceServiceStatus = "published";
export type MarketplaceCurrency = "RUB";
export type MarketplaceCatalogSection =
  | "Туры"
  | "Билеты в музеи и достопримечательности"
  | "Впечатления и экскурсии"
  | "Рестораны"
  | "Красота и wellness"
  | "eSIM"
  | "Трансферы"
  | "Проездные"
  | "Шопинг"
  | "VIP транспорт";
export type MarketplaceSubcategory = "fur" | "jewelry" | "helicopters" | "boats";
export type MarketplaceProvider = "Istanbul.com" | "Trasst" | "Turkishopping" | "Golden Eye Jewellery" | "Elit Homes";
export type MarketplaceSourceName = MarketplaceProvider;
export type MarketplaceSourceCurrency = "TRY" | "EUR" | "USD" | "RUB";
export type MarketplaceAvailability = "snapshot";
export type MarketplaceProviderStatus = "awaiting_provider";
export type MarketplaceDeliveryChannel = "email" | "whatsapp" | "phone";
export type MarketplaceOrderStatus = "paid" | "processing" | "delivered";
export type MarketplaceLanguage = "Русский" | "Английский" | "Турецкий";
export type MarketplaceDuration =
  | "up-to-2-hours"
  | "half-day"
  | "full-day"
  | "multi-day";
export type MarketplaceDemoDate = `${number}-${number}-${number}`;
export type MarketplaceRegion = "aegean";
export type MarketplaceScenario = "experience" | "transfer" | "self-service" | "support" | "shopping";
export type TransferServiceMode = "private" | "shared";
export type TransferVehicleClass = "standard" | "comfort" | "minivan";

export interface TransferSearchState {
  from: string;
  to: string;
  date: MarketplaceDemoDate | null;
  time: string | null;
  passengers: number | null;
  luggage: number | null;
  childSeat: boolean;
  flightNumber: string | null;
  returnTrip: boolean;
  serviceMode: TransferServiceMode;
  vehicleClass: TransferVehicleClass;
}

export interface BookingIntent {
  serviceId: string;
  variantId?: string;
  date: MarketplaceDemoDate | null;
  quantity: number;
  scenario: MarketplaceScenario;
  status: "draft" | "submitted" | "confirmed";
}

export interface MarketplaceDestination {
  id: string;
  name: string;
  slug: string;
  region: string;
  description: string;
  imagePath: string;
}

export interface MarketplaceCategory {
  id: MarketplaceServiceType;
  name: string;
  description: string;
}

export interface MarketplaceService {
  id: string;
  slug: string;
  title: string;
  catalogSection: MarketplaceCatalogSection;
  provider: MarketplaceProvider;
  sourceUrl: string;
  sourceName: MarketplaceSourceName;
  capturedAt: MarketplaceDemoDate;
  sourcePrice: number;
  sourceCurrency: MarketplaceSourceCurrency;
  imageSource: string;
  availability: MarketplaceAvailability;
  providerStatus: MarketplaceProviderStatus;
  categoryId: MarketplaceServiceType;
  subcategory?: MarketplaceSubcategory;
  destinationId: string | null;
  type: MarketplaceServiceType;
  description: string;
  imagePath: string;
  images: string[];
  price: number;
  priceLabel?: string;
  currency: MarketplaceCurrency;
  priceUnit: string;
  duration: MarketplaceDuration | null;
  durationMinutes: number | null;
  languages: MarketplaceLanguage[];
  hasTransfer: boolean;
  suitableForChildren: boolean;
  isDigital: boolean;
  orderToday: boolean;
  included: string[];
  excluded: string[];
  cancellation: string;
  meetingPoint: string | null;
  deliveryMethod: string;
  status: MarketplaceServiceStatus;
}

export interface MarketplaceCartItem {
  serviceId: string;
  quantity: number;
}

export interface MarketplaceBookingDetails {
  date: string;
  time: string;
  participants: number;
  language: MarketplaceLanguage | "";
  pickup: string;
  routeFrom: string;
  routeTo: string;
  activationDate: string;
}

export interface MarketplaceOrderItem {
  serviceId: string;
  title: string;
  price: number;
  currency: MarketplaceCurrency;
  priceUnit: string;
  quantity: number;
  bookingDetails: MarketplaceBookingDetails;
}

export interface MarketplaceOrder {
  id: string;
  createdAt: string;
  status: MarketplaceOrderStatus;
  customer: {
    name: string;
    email: string;
    phone: string;
    deliveryChannel: MarketplaceDeliveryChannel;
    deliveryAddress: string;
    comment: string;
  };
  items: MarketplaceOrderItem[];
  total: number;
  currency: MarketplaceCurrency;
}

export interface ServiceVariant {
  id: string;
  serviceId: string;
  title: string;
  price: number;
  currency: MarketplaceCurrency;
  priceUnit: string;
  durationMinutes: number | null;
  status: MarketplaceServiceStatus;
  catalogSection: MarketplaceCatalogSection;
  provider: MarketplaceProvider;
  sourceUrl: string;
  sourceName: MarketplaceSourceName;
  capturedAt: MarketplaceDemoDate;
  sourcePrice: number;
  sourceCurrency: MarketplaceSourceCurrency;
  availability: MarketplaceAvailability;
  providerStatus: MarketplaceProviderStatus;
}

export type CatalogFilterKey =
  | "text"
  | "category"
  | "section"
  | "destination"
  | "region"
  | "minPrice"
  | "maxPrice"
  | "duration"
  | "language"
  | "transfer"
  | "children"
  | "digital"
  | "orderToday";

export interface CatalogFilters {
  text?: string;
  category?: MarketplaceServiceType;
  subcategory?: MarketplaceSubcategory;
  section?: MarketplaceCatalogSection;
  destination?: string;
  region?: MarketplaceRegion;
  date?: MarketplaceDemoDate;
  minPrice?: number;
  maxPrice?: number;
  duration?: MarketplaceDuration;
  language?: MarketplaceLanguage;
  transfer?: boolean;
  children?: boolean;
  digital?: boolean;
  orderToday?: boolean;
  scenario?: MarketplaceScenario;
  from?: string;
  to?: string;
  time?: string;
  passengers?: number;
  luggage?: number;
  childSeat?: boolean;
  flightNumber?: string;
  returnTrip?: boolean;
  serviceMode?: TransferServiceMode;
  vehicleClass?: TransferVehicleClass;
  participants?: number;
  privateTour?: boolean;
}

export type CatalogSort =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "duration";

export interface CatalogResult {
  items: MarketplaceService[];
  total: number;
  hasNextPage: boolean;
}

export interface MarketplaceNavigationItem {
  label: string;
  href: string;
}
