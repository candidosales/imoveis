import { db, runNamed } from "#/server/db/client";
import type {
	Listing,
	ListingPlace,
	ListingWithPlaces,
	PlaceType,
	ScrapedListing,
} from "#/server/db/types";

interface ListingRow {
	id: string;
	source: string;
	external_id: string;
	url: string;
	type: string;
	title: string;
	price_cents: number | null;
	bedrooms: number | null;
	bathrooms: number | null;
	garage_spots: number | null;
	built_area_m2: number | null;
	lot_area_m2: number | null;
	description: string | null;
	neighborhood: string | null;
	address: string | null;
	address_precise: number;
	lat: number | null;
	lng: number | null;
	photos: string;
	status: string;
	first_seen_at: string;
	last_seen_at: string;
	updated_at: string;
}

function rowToListing(row: ListingRow): Listing {
	return {
		id: row.id,
		source: row.source,
		externalId: row.external_id,
		url: row.url,
		type: row.type as Listing["type"],
		title: row.title,
		priceCents: row.price_cents,
		bedrooms: row.bedrooms,
		bathrooms: row.bathrooms,
		garageSpots: row.garage_spots,
		builtAreaM2: row.built_area_m2,
		lotAreaM2: row.lot_area_m2,
		description: row.description,
		neighborhood: row.neighborhood,
		address: row.address,
		addressPrecise: row.address_precise === 1,
		lat: row.lat,
		lng: row.lng,
		photos: JSON.parse(row.photos) as string[],
		status: row.status as Listing["status"],
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
		updatedAt: row.updated_at,
	};
}

function listingId(source: string, externalId: string): string {
	return `${source}:${externalId}`;
}

/**
 * Insert a freshly scraped listing, or update it if already known.
 * Reactivates a previously inactive listing, and appends to price_history
 * whenever the price actually changed.
 */
export interface UpsertResult {
	id: string;
	isNew: boolean;
	priceChanged: boolean;
}

export function upsertListing(scraped: ScrapedListing): UpsertResult {
	const id = listingId(scraped.source, scraped.externalId);
	const now = new Date().toISOString();

	const existing = db
		.query<{ price_cents: number | null }, [string]>(
			"SELECT price_cents FROM listings WHERE id = ?",
		)
		.get(id);

	runNamed(
		`INSERT INTO listings (
      id, source, external_id, url, type, title, price_cents, bedrooms, bathrooms,
      garage_spots, built_area_m2, lot_area_m2, description, neighborhood, address,
      address_precise, lat, lng, photos, status, first_seen_at, last_seen_at, updated_at
    ) VALUES (
      $id, $source, $externalId, $url, $type, $title, $priceCents, $bedrooms, $bathrooms,
      $garageSpots, $builtAreaM2, $lotAreaM2, $description, $neighborhood, $address,
      $addressPrecise, $lat, $lng, $photos, 'ativo', $now, $now, $now
    )
    ON CONFLICT (id) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      price_cents = excluded.price_cents,
      bedrooms = excluded.bedrooms,
      bathrooms = excluded.bathrooms,
      garage_spots = excluded.garage_spots,
      built_area_m2 = excluded.built_area_m2,
      lot_area_m2 = excluded.lot_area_m2,
      description = excluded.description,
      neighborhood = excluded.neighborhood,
      address = excluded.address,
      address_precise = excluded.address_precise,
      lat = excluded.lat,
      lng = excluded.lng,
      photos = excluded.photos,
      status = 'ativo',
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at`,
		{
			$id: id,
			$source: scraped.source,
			$externalId: scraped.externalId,
			$url: scraped.url,
			$type: scraped.type,
			$title: scraped.title,
			$priceCents: scraped.priceCents,
			$bedrooms: scraped.bedrooms,
			$bathrooms: scraped.bathrooms,
			$garageSpots: scraped.garageSpots,
			$builtAreaM2: scraped.builtAreaM2,
			$lotAreaM2: scraped.lotAreaM2,
			$description: scraped.description,
			$neighborhood: scraped.neighborhood,
			$address: scraped.address,
			$addressPrecise: scraped.addressPrecise ? 1 : 0,
			$lat: scraped.lat,
			$lng: scraped.lng,
			$photos: JSON.stringify(scraped.photos),
			$now: now,
		},
	);

	const priceChanged = !existing || existing.price_cents !== scraped.priceCents;
	if (priceChanged && scraped.priceCents !== null) {
		db.run(
			"INSERT INTO price_history (listing_id, price_cents, recorded_at) VALUES (?, ?, ?)",
			[id, scraped.priceCents, now],
		);
	}

	return { id, isNew: !existing, priceChanged };
}

/** Soft-deletes every currently-active listing from `source` not present in `seenExternalIds`. */
export function markGoneListingsInactive(
	source: string,
	seenExternalIds: Set<string>,
): number {
	const active = db
		.query<{ id: string; external_id: string }, [string]>(
			"SELECT id, external_id FROM listings WHERE source = ? AND status = 'ativo'",
		)
		.all(source);

	const now = new Date().toISOString();
	let count = 0;
	for (const row of active) {
		if (!seenExternalIds.has(row.external_id)) {
			db.run(
				"UPDATE listings SET status = 'inativo', updated_at = ? WHERE id = ?",
				[now, row.id],
			);
			count++;
		}
	}
	return count;
}

export function upsertListingPlace(place: ListingPlace): void {
	runNamed(
		`INSERT INTO listing_places (listing_id, place_type, name, lat, lng, drive_minutes, walk_minutes, updated_at)
     VALUES ($listingId, $placeType, $name, $lat, $lng, $driveMinutes, $walkMinutes, $updatedAt)
     ON CONFLICT (listing_id, place_type) DO UPDATE SET
       name = excluded.name,
       lat = excluded.lat,
       lng = excluded.lng,
       drive_minutes = excluded.drive_minutes,
       walk_minutes = excluded.walk_minutes,
       updated_at = excluded.updated_at`,
		{
			$listingId: place.listingId,
			$placeType: place.placeType,
			$name: place.name,
			$lat: place.lat,
			$lng: place.lng,
			$driveMinutes: place.driveMinutes,
			$walkMinutes: place.walkMinutes,
			$updatedAt: place.updatedAt,
		},
	);
}

/** Listings missing one or more Comodidade/Praia lookups (needs a Google Maps pass). */
export function listingsMissingPlaces(placeTypes: PlaceType[]): Listing[] {
	const rows = db
		.query<ListingRow, [number]>(
			`SELECT * FROM listings l
       WHERE l.status = 'ativo' AND l.lat IS NOT NULL AND l.lng IS NOT NULL
       AND (SELECT COUNT(*) FROM listing_places p WHERE p.listing_id = l.id) < ?`,
		)
		.all(placeTypes.length);
	return rows.map(rowToListing);
}

export function listAllListings(): ListingWithPlaces[] {
	const listingRows = db
		.query<ListingRow, []>("SELECT * FROM listings ORDER BY updated_at DESC")
		.all();
	const placeRows = db
		.query<
			{
				listing_id: string;
				place_type: PlaceType;
				name: string;
				lat: number;
				lng: number;
				drive_minutes: number | null;
				walk_minutes: number | null;
				updated_at: string;
			},
			[]
		>("SELECT * FROM listing_places")
		.all();

	const placesByListing = new Map<string, ListingWithPlaces["places"]>();
	for (const p of placeRows) {
		const bucket = placesByListing.get(p.listing_id) ?? {};
		bucket[p.place_type] = {
			name: p.name,
			lat: p.lat,
			lng: p.lng,
			driveMinutes: p.drive_minutes,
			walkMinutes: p.walk_minutes,
			updatedAt: p.updated_at,
		};
		placesByListing.set(p.listing_id, bucket);
	}

	return listingRows.map((row) => ({
		...rowToListing(row),
		places: placesByListing.get(row.id) ?? {},
	}));
}
