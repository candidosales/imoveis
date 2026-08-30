import { googleMapsGet } from "#/server/maps/client";
import type { PlaceType } from "#/server/db/types";

interface NearbySearchResponse {
  results: Array<{
    name: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

/** Google Places "type" (or free-text keyword, for "praia" which has no dedicated type) per Comodidade. */
const PLACE_QUERY: Record<PlaceType, { type?: string; keyword?: string }> = {
  praia: { keyword: "praia" },
  mercado: { type: "supermarket" },
  farmacia: { type: "pharmacy" },
  hospital: { type: "hospital" },
  padaria: { type: "bakery" },
};

export interface NearestPlace {
  name: string;
  lat: number;
  lng: number;
}

/** Finds the nearest place of a given Comodidade/Praia type via Places Nearby Search, ranked by distance. */
export async function findNearestPlace(
  lat: number,
  lng: number,
  placeType: PlaceType,
): Promise<NearestPlace | null> {
  const query = PLACE_QUERY[placeType];
  const data = await googleMapsGet<NearbySearchResponse>("place/nearbysearch", {
    location: `${lat},${lng}`,
    rankby: "distance",
    type: query.type,
    keyword: query.keyword,
  });
  const nearest = data.results[0];
  if (!nearest) return null;
  return {
    name: nearest.name,
    lat: nearest.geometry.location.lat,
    lng: nearest.geometry.location.lng,
  };
}
