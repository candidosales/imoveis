import { db } from "#/server/db/client";
import {
	listingsMissingPlaces,
	upsertListingPlace,
} from "#/server/db/repository";
import type { PlaceType } from "#/server/db/types";
import { travelTimes } from "#/server/maps/distance";
import { geocodeListing } from "#/server/maps/geocode";
import { findNearestPlace } from "#/server/maps/places";

const PLACE_TYPES: PlaceType[] = [
	"praia",
	"mercado",
	"farmacia",
	"hospital",
	"padaria",
];
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
	console.log(
		`[maps] ${listings.length} imóveis precisam de praia/comodidades`,
	);

	for (const listing of listings) {
		if (listing.lat === null || listing.lng === null) continue;
		const origin = { lat: listing.lat, lng: listing.lng };

		// Fixed, small set of independent lookups per listing (same shape as travelTimes' own Promise.all) — safe to run together.
		await Promise.all(
			PLACE_TYPES.map(async (placeType) => {
				try {
					const nearest = await findNearestPlace(
						origin.lat,
						origin.lng,
						placeType,
					);
					if (!nearest) return;
					const times = await travelTimes(origin, {
						lat: nearest.lat,
						lng: nearest.lng,
					});
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
			}),
		);
	}
}

// Geocoding is an external, rate-limited API — cap how many requests run at once
// instead of firing every missing listing concurrently (unbounded fan-out risks
// tripping Google's per-project QPS limit).
const GEOCODE_CONCURRENCY = 5;

async function geocodeMissingListings(): Promise<void> {
	const rows = db
		.query<
			{ id: string; address: string | null; neighborhood: string | null },
			[]
		>(
			"SELECT id, address, neighborhood FROM listings WHERE status = 'ativo' AND (lat IS NULL OR lng IS NULL)",
		)
		.all();

	console.log(`[maps] ${rows.length} imóveis precisam de geocodificação`);

	for (let i = 0; i < rows.length; i += GEOCODE_CONCURRENCY) {
		const batch = rows.slice(i, i + GEOCODE_CONCURRENCY);
		await Promise.all(
			batch.map(async (row) => {
				try {
					const result = await geocodeListing({
						address: row.address,
						neighborhood: row.neighborhood,
						city: CITY,
						state: STATE,
					});
					if (!result) return;
					db.run(
						"UPDATE listings SET lat = ?, lng = ?, address_precise = ?, updated_at = ? WHERE id = ?",
						[
							result.lat,
							result.lng,
							result.precise ? 1 : 0,
							new Date().toISOString(),
							row.id,
						],
					);
				} catch (err) {
					console.error(`[maps] falhou geocode para ${row.id}:`, err);
				}
			}),
		);
	}
}
