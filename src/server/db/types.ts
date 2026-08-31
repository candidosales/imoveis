export type ImovelType = "casa" | "terreno";
export type ImovelStatus = "ativo" | "inativo";
export type PlaceType = "praia" | "mercado" | "farmacia" | "hospital" | "padaria";

/** Raw data a scraper extracts from a source site, before it's persisted. */
export interface ScrapedListing {
  source: string;
  externalId: string;
  url: string;
  type: ImovelType;
  title: string;
  priceCents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garageSpots: number | null;
  builtAreaM2: number | null;
  lotAreaM2: number | null;
  description: string | null;
  neighborhood: string | null;
  address: string | null;
  addressPrecise: boolean;
  lat: number | null;
  lng: number | null;
  photos: string[];
}

/** A persisted Imóvel row, as read back from SQLite. */
export interface Listing {
  id: string;
  source: string;
  externalId: string;
  url: string;
  type: ImovelType;
  title: string;
  priceCents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garageSpots: number | null;
  builtAreaM2: number | null;
  lotAreaM2: number | null;
  description: string | null;
  neighborhood: string | null;
  address: string | null;
  addressPrecise: boolean;
  lat: number | null;
  lng: number | null;
  photos: string[];
  favorite: boolean;
  dismissed: boolean;
  status: ImovelStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface ListingPlace {
  listingId: string;
  placeType: PlaceType;
  name: string;
  lat: number;
  lng: number;
  driveMinutes: number | null;
  walkMinutes: number | null;
  updatedAt: string;
}

export interface ListingWithPlaces extends Listing {
  places: Partial<Record<PlaceType, Omit<ListingPlace, "listingId" | "placeType">>>;
}
