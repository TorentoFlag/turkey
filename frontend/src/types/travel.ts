export interface Destination {
  id: string;
  name: string;
  slug: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

export interface TravelService {
  id: string;
  name: string;
  categoryId: string;
  destinationId?: string;
  priceFrom?: number;
  currency?: string;
}

export interface EditorialArticle {
  id: string;
  title: string;
  slug: string;
}

export interface TravelCollection {
  id: string;
  name: string;
  slug: string;
}

export interface TravelBundle {
  id: string;
  name: string;
  serviceIds: string[];
}
