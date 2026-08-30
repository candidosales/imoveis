import { db } from "#/server/db/client";
import { listingsMissingPlaces, upsertListingPlace } from "#/server/db/repository";
import type { PlaceType } from "#/server/db/types";
import { geocodeListing } from "#/server/maps/geocode";
import { travelTimes } from "#/server/maps/distance";
import { findNearestPlace } from "#/server/maps/places";

const PLACE_TYPES: PlaceType[] = ["praia", "mercado", "farmacia", "hospital", "padaria"];
const CITY = "Caucaia";
const STATE = "CE";

/**
 * Fills in lat/lng (geocoding, falling back to the neighborhood centroid when
 * the address is imprecise) and the Praia/Comodidades travel times for every
 * active listing that doesn't have them yet.
 */
export async function enrichListingsWithMaps(): Promise<void> {
  await geocodeMissingListings();

  const listings = listingsMissingPlaces(PLACE_TYPES);
  console.log(`[maps] ${listings.length} imóveis precisam de praia/comodidades`);

  for (const listing of listings) {
    if (listing.lat === null || listing.lng === null) continue;
    const origin = { lat: listing.lat, lng: listing.lng };

    for (const placeType of PLACE_TYPES) {
      try {
        const nearest = await findNearestPlace(origin.lat, origin.lng, placeType);
        if (!nearest) continue;
        const times = await travelTimes(origin, { lat: nearest.lat, lng: nearest.lng });
        upsertListingPlace({
          listingId: listing.id,
          placeType,
          name: nearest.name,
          lat: nearest.lat,
          lng: nearest.lng,
          driveMinutes: times.driveMinutes,
          walkMinutes: times.walkMinutes,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[maps] falhou ${placeType} para ${listing.id}:`, err);
      }
    }
  }
}

async function geocodeMissingListings(): Promise<void> {
  const rows = db
    .query<{ id: string; address: string | null; neighborhood: string | null }, []>(
      "SELECT id, address, neighborhood FROM listings WHERE status = 'ativo' AND (lat IS NULL OR lng IS NULL)",
    )
    .all();

  console.log(`[maps] ${rows.length} imóveis precisam de geocodificação`);

  for (const row of rows) {
    try {
      const result = await geocodeListing({
        address: row.address,
        neighborhood: row.neighborhood,
        city: CITY,
        state: STATE,
      });
      if (!result) continue;
      db.run("UPDATE listings SET lat = ?, lng = ?, address_precise = ?, updated_at = ? WHERE id = ?", [
        result.lat,
        result.lng,
        result.precise ? 1 : 0,
        new Date().toISOString(),
        row.id,
      ]);
    } catch (err) {
      console.error(`[maps] falhou geocode para ${row.id}:`, err);
    }
  }
}
