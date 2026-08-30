import { googleMapsGet } from "#/server/maps/client";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** false when we only had a neighborhood/city to go on (centroid, not the real address). */
  precise: boolean;
}

interface GeocodeResponse {
  results: Array<{
    geometry: { location: { lat: number; lng: number } };
    types: string[];
  }>;
}

/**
 * Geocodes a listing. Tries the precise street address first; if that's
 * missing or fails, falls back to the neighborhood centroid and flags the
 * result as imprecise (see "Status do Imóvel" / endereco_preciso in CONTEXT.md).
 */
export async function geocodeListing(input: {
  address: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
}): Promise<GeocodeResult | null> {
  if (input.address) {
    const precise = await geocode(`${input.address}, ${input.city}, ${input.state}, Brasil`);
    if (precise) return { ...precise, precise: true };
  }
  if (input.neighborhood) {
    const approx = await geocode(`${input.neighborhood}, ${input.city}, ${input.state}, Brasil`);
    if (approx) return { ...approx, precise: false };
  }
  const cityCentroid = await geocode(`${input.city}, ${input.state}, Brasil`);
  return cityCentroid ? { ...cityCentroid, precise: false } : null;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const data = await googleMapsGet<GeocodeResponse>("geocode", { address });
  const first = data.results[0];
  if (!first) return null;
  return { lat: first.geometry.location.lat, lng: first.geometry.location.lng };
}
