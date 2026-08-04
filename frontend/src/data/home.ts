export type HeroFragment = {
  image: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  crop: [number, number];
};

export type ServiceKit = {
  id: "arrival" | "bosphorus";
  eyebrow: string;
  title: string;
  place: string;
  price: string;
  image: string;
  alt: string;
};

export type DirectionContextPanel = {
  eyebrow: string;
  title: string;
  detail: string;
};

export type DirectionScene = {
  number: string;
  label: string;
  title: string;
  titleLines?: string[];
  description: string;
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
  focalPoint: string;
  canvasImage: string;
  contextPanel: DirectionContextPanel | null;
};

const baseDirectionScenes = [
  {
    number: "01",
    label: "Города и история",
    title: "История, которую не пролистаешь",
    titleLines: ["История, которую", "не пролистаешь"],
    description:
      "Стамбул, Бурса, Сапанджа и исторические маршруты с профессиональными гидами.",
    cta: "История и культура",
    href: "/catalog?category=excursions",
    image: "/images/istanbul-waterfront-heritage.webp",
    imageAlt: "Живописная терраса у Босфора и исторический Стамбул на закате",
    focalPoint: "54% 54%",
  },
  {
    number: "02",
    label: "Море и побережье",
    title: "Море между делом и по плану",
    description:
      "Круизы по Босфору, вечерние программы и прогулки на воде.",
 cta: "Море и прогулки",
 href: "/catalog?category=activities",
    image: "/images/kas-coast.jpg",
    imageAlt: "Скалистая бухта и прозрачное море у побережья Каша",
    focalPoint: "51% 64%",
  },
  {
    number: "03",
    label: "Природа и приключения",
    title: "Поехать туда, куда обычно не доезжают",
    description:
      "Долины, рассветные маршруты и цифровые решения для поездки по Каппадокии.",
    cta: "Выбрать поездку",
    href: "/catalog?destination=cappadocia",
    image: "/images/cappadocia-dawn.jpg",
    imageAlt: "Воздушные шары над каменными долинами Каппадокии",
    focalPoint: "50% 54%",
  },
  {
    number: "04",
    label: "Транспорт и свобода",
    title: "С аэропорта — прямо к отдыху",
    description:
      "Шаттлы и приватные трансферы из аэропортов Стамбула до отеля и обратно.",
    cta: "Заказать трансфер",
    href: "/catalog?category=transfers",
    image: "/images/turkey-transfer-coast.png",
    imageAlt: "Премиальный трансфер по живописной дороге вдоль побережья Турции",
    focalPoint: "58% 58%",
  },
  {
    number: "05",
    label: "Помощь в путешествии",
    title: "Связь и городские сервисы — в одном месте",
    titleLines: ["Связь, документы", "и помощь — в одном", "месте"],
    description:
      "eSIM, проездные и цифровые продукты для самостоятельной поездки.",
    cta: "Связь и сервисы",
    href: "/catalog?category=connectivity",
    image: "/images/istanbul-support-neighborhood.webp",
    imageAlt: "Солнечная живая улица Стамбула с видом на Босфор",
    focalPoint: "58% 54%",
  },
] satisfies Omit<DirectionScene, "canvasImage" | "contextPanel">[];

const directionEnhancements = [
  {
    canvasImage: "/images/istanbul-waterfront-heritage.webp",
    contextPanel: {
      eyebrow: "Кураторский выбор",
      title: "48 исторических маршрутов",
      detail: "От античных городов до утреннего Стамбула",
    },
  },
  { canvasImage: "/images/home-canvas/kas-coast.webp", contextPanel: null },
  {
    canvasImage: "/images/home-canvas/cappadocia-dawn.webp",
    contextPanel: null,
  },
  {
    canvasImage: "/images/turkey-transfer-coast.webp",
    contextPanel: null,
  },
  {
    canvasImage: "/images/istanbul-support-neighborhood.webp",
    contextPanel: {
      eyebrow: "Уже на месте",
      title: "Поддержка путешественника",
      detail: "Связь, перевод и помощь в одном контакте",
    },
  },
] satisfies Pick<DirectionScene, "canvasImage" | "contextPanel">[];

export const directionScenes: DirectionScene[] = baseDirectionScenes.map(
  (scene, index) => ({ ...scene, ...directionEnhancements[index] }),
);

export const serviceKits: ServiceKit[] = [
  {
    id: "arrival",
    eyebrow: "Сразу после прилёта",
    title: "Спокойный старт",
    place: "Трансфер · eSIM · поддержка",
    price: "от 4 490 ₽",
    image: "/images/home-kits/arrival-kit.webp",
    alt: "Набор для прибытия: ключ, трансферная карта и упаковка eSIM",
  },
  {
    id: "bosphorus",
    eyebrow: "Один день в городе",
    title: "Босфор в своём ритме",
    place: "Маршрут · паром · аудиогид",
    price: "от 1 290 ₽",
    image: "/images/home-kits/bosphorus-kit.webp",
    alt: "Карта маршрута по Босфору, билет на паром и жетон",
  },
];

export const heroFragments: HeroFragment[] = [
  {
    image: "/images/home-kits/bosphorus-kit.webp",
    x: 0.04,
    y: 0.12,
    width: 0.09,
    depth: 0.25,
    crop: [0.48, 0.5],
  },
  {
    image: "/images/istanbul-waterfront-heritage.webp",
    x: 0.28,
    y: 0.06,
    width: 0.08,
    depth: 0.8,
    crop: [0.44, 0.52],
  },
  {
    image: "/images/home-canvas/kas-coast.webp",
    x: 0.48,
    y: 0.11,
    width: 0.09,
    depth: 0.62,
    crop: [0.56, 0.58],
  },
  {
    image: "/images/home-canvas/cappadocia-dawn.webp",
    x: 0.69,
    y: 0.17,
    width: 0.08,
    depth: 0.45,
    crop: [0.5, 0.46],
  },
  {
    image: "/images/turkey-transfer-coast.webp",
    x: 0.87,
    y: 0.1,
    width: 0.13,
    depth: 0.72,
    crop: [0.55, 0.5],
  },
  {
    image: "/images/istanbul-support-neighborhood.webp",
    x: 0.12,
    y: 0.39,
    width: 0.08,
    depth: 0.66,
    crop: [0.5, 0.58],
  },
  {
    image: "/images/home-canvas/spice-bazaar.webp",
    x: 0.34,
    y: 0.32,
    width: 0.07,
    depth: 0.36,
    crop: [0.49, 0.46],
  },
  {
    image: "/images/home-canvas/bosphorus-ferry.webp",
    x: 0.58,
    y: 0.36,
    width: 0.08,
    depth: 0.82,
    crop: [0.58, 0.52],
  },
  {
    image: "/images/home-canvas/aegean-bodrum.webp",
    x: 0.78,
    y: 0.35,
    width: 0.12,
    depth: 0.3,
    crop: [0.5, 0.55],
  },
  {
    image: "/images/home-canvas/travertine-texture.webp",
    x: 0.21,
    y: 0.61,
    width: 0.11,
    depth: 0.48,
    crop: [0.46, 0.5],
  },
  {
    image: "/images/home-canvas/cappadocia-dawn.webp",
    x: 0.44,
    y: 0.68,
    width: 0.06,
    depth: 0.9,
    crop: [0.62, 0.52],
  },
  {
    image: "/images/home-kits/arrival-kit.webp",
    x: 0.63,
    y: 0.59,
    width: 0.07,
    depth: 0.55,
    crop: [0.38, 0.5],
  },
  {
    image: "/images/home-canvas/kas-coast.webp",
    x: 0.88,
    y: 0.65,
    width: 0.1,
    depth: 0.76,
    crop: [0.4, 0.62],
  },
  {
    image: "/images/istanbul-waterfront-heritage.webp",
    x: 0.08,
    y: 0.79,
    width: 0.09,
    depth: 0.38,
    crop: [0.6, 0.48],
  },
  {
    image: "/images/home-canvas/spice-bazaar.webp",
    x: 0.38,
    y: 0.84,
    width: 0.1,
    depth: 0.7,
    crop: [0.54, 0.4],
  },
  {
    image: "/images/home-canvas/aegean-bodrum.webp",
    x: 0.72,
    y: 0.81,
    width: 0.09,
    depth: 0.5,
    crop: [0.6, 0.5],
  },
  {
    image: "/images/home-canvas/bodrum-amanruya.webp",
    x: 0.04,
    y: 0.48,
    width: 0.16,
    depth: 0.92,
    crop: [0.48, 0.56],
  },
  {
    image: "/images/home-canvas/cappadocia-cave-hotel.webp",
    x: 0.81,
    y: 0.52,
    width: 0.11,
    depth: 0.58,
    crop: [0.5, 0.52],
  },
  {
    image: "/images/home-canvas/istanbul-legacy-hotel.webp",
    x: 0.52,
    y: 0.92,
    width: 0.07,
    depth: 0.24,
    crop: [0.52, 0.5],
  },
  {
    image: "/images/home-kits/arrival-kit.webp",
    x: 0.91,
    y: 0.42,
    width: 0.17,
    depth: 0.96,
    crop: [0.5, 0.5],
  },
  {
    image: "/images/home-kits/bosphorus-kit.webp",
    x: 0.17,
    y: 0.73,
    width: 0.15,
    depth: 0.86,
    crop: [0.5, 0.5],
  },
];

export const collectionItems = [
  {
    name: "Туры",
    count: "5 товаров",
    href: "/catalog?category=excursions",
    images: [
      "/images/istanbul-waterfront-heritage.webp",
      "/images/bosphorus-ferry.jpg",
      "/images/basilica-cistern.png",
      "/images/kas-coast.jpg",
      "/images/turkey-transfer-coast.webp",
    ],
    alt: "Экскурсия по историческому Стамбулу",
  },
  {
    name: "Билеты",
    count: "5 товаров",
    href: "/catalog?category=tickets",
    images: [
      "/images/basilica-cistern-medusa.png",
      "/images/dolmabahce-palace.png",
      "/images/galata-night.jpg",
      "/images/istanbul-street.jpg",
      "/images/istanbul-contrast.jpg",
    ],
    alt: "Билет в музей или к достопримечательности Стамбула",
  },
  {
    name: "Впечатления",
    count: "10 товаров",
    href: "/catalog?category=activities",
    images: [
      "/images/turkish-coffee-sand.png",
      "/images/bosphorus-ferry.jpg",
      "/images/service-legends.jpg",
      "/images/spice-bazaar.jpg",
      "/images/istanbul-modern.jpg",
    ],
    alt: "Турецкое впечатление: кофе, круиз или городская прогулка",
  },
  {
    name: "Рестораны",
    count: "5 товаров",
    href: "/catalog?category=restaurants",
    images: [
      "/images/catalog-generated/nomads-rooftop-dinner.png",
      "/images/spice-bazaar.jpg",
      "/images/home-canvas/bosphorus-ferry.webp",
      "/images/istanbul-motion.jpg",
      "/images/home-canvas/istanbul-fog.webp",
    ],
    alt: "Ужин, завтрак или дегустация в Стамбуле",
  },
  {
    name: "eSIM",
    count: "9 товаров",
    href: "/catalog?category=connectivity",
    images: [
      "/images/esim-turkey-1gb.png",
      "/images/esim-turkey-3gb.png",
      "/images/esim-turkey-10gb.png",
      "/images/esim-turkey-20gb.png",
      "/images/esim-turkey-premium-unlimited.png",
    ],
    alt: "Пакеты eSIM для поездки по Турции",
  },
] as const;

export const affordableItems = [
  { name: "eSIM Турция: 1 ГБ", price: "от 104 ₽", slug: "trasst-esim-1gb" },
  { name: "eSIM Турция: 3 ГБ", price: "от 240 ₽", slug: "trasst-esim-3gb" },
  { name: "Шаттл IST — Аксарай", price: "от 1 045 ₽", slug: "istanbul-shuttle-aksaray" },
  { name: "Ужин на Босфоре с шоу", price: "от 3 675 ₽", slug: "bosphorus-dinner-cruise" },
  { name: "Цистерна Базилика: билет и аудиогид", price: "от 4 988 ₽", slug: "basilica-ticket" },
  { name: "Галатская башня с аудиогидом", price: "от 3 413 ₽", slug: "galata-tower-ticket" },
  { name: "Istanbul City Card", price: "от 5 355 ₽", slug: "istanbul-city-card" },
] as const;
