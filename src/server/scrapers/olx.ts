import { PlaywrightCrawler } from "crawlee";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.olx.com.br";
// OLX splits casas/apartamentos ("venda") and terrenos into separate category
// paths — each needs its own search. `pe` caps price (CONTEXT.md: R$700k).
const CASAS_SEARCH_URL = `${BASE_URL}/imoveis/venda/estado-ce/fortaleza-e-regiao-metropolitana/caucaia?pe=700000`;
const TERRENOS_SEARCH_URL = `${BASE_URL}/imoveis/terrenos/estado-ce/fortaleza-e-regiao-metropolitana/caucaia?pe=700000`;
const MAX_SEARCH_PAGES = 20;

/**
 * OLX (grupo OLX/ZAP) serves a Cloudflare managed challenge like ZAP/Viva
 * Real, bypassed the same way by Crawlee's PlaywrightCrawler. Unlike those
 * two, OLX's search-results page already embeds full ad data (title, price,
 * beds/baths/garage, area, photos, location) in its Next.js RSC streaming
 * payload — no per-listing detail-page visit needed at all, just parsing
 * the search pages themselves.
 *
 * The `caucaia` URL path segment does NOT reliably scope results to that
 * municipality — in practice only ~4% of ads returned for it are actually
 * in Caucaia (the rest are elsewhere in "Fortaleza e Região Metropolitana",
 * OLX's broader region grouping). We rely instead on each ad's own
 * `locationDetails.municipality` field and discard everything else. This
 * also means most pages yield very few usable ads, hence the same
 * MAX_SEARCH_PAGES cap as the other scrapers (applied per category).
 */
export const olxScraper: SiteScraper = {
	source: "olx",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const found = new Map<string, ScrapedListing>();

		const pageUrls = [
			...buildPageUrls(CASAS_SEARCH_URL),
			...buildPageUrls(TERRENOS_SEARCH_URL),
		];

		const crawler = new PlaywrightCrawler({
			maxConcurrency: 3,
			requestHandlerTimeoutSecs: 60,
			async requestHandler({ page, request, log }) {
				await page
					.waitForSelector("script:has-text('self.__next_f.push')", {
						timeout: 15000,
					})
					.catch(() => {});
				const html = await page.content();
				const ads = extractCaucaiaAds(html);

				let added = 0;
				for (const listing of ads) {
					if (found.has(listing.externalId)) continue;
					found.set(listing.externalId, listing);
					onListing(listing);
					added++;
				}
				log.info(`[olx] ${request.url} -> +${added} (total ${found.size})`);
			},
		});

		await crawler.run(pageUrls);
		return [...found.values()];
	},
};

function buildPageUrls(searchUrl: string): string[] {
	return Array.from({ length: MAX_SEARCH_PAGES }, (_, i) =>
		i === 0 ? searchUrl : `${searchUrl}&o=${i + 1}`,
	);
}

interface OlxAdProperty {
	name: string;
	value: string;
}

interface OlxAd {
	subject: string;
	priceValue: string;
	listId: number;
	categoryName: string;
	images: { original: string }[];
	location: string;
	properties: OlxAdProperty[];
	url: string;
	locationDetails: { municipality: string; neighbourhood: string };
}

function isOlxAd(v: unknown): v is OlxAd {
	if (!v || typeof v !== "object") return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.listId === "number" &&
		typeof o.subject === "string" &&
		typeof o.locationDetails === "object" &&
		o.locationDetails !== null &&
		typeof (o.locationDetails as Record<string, unknown>).municipality ===
			"string"
	);
}

/**
 * Finds the matching closing bracket for text[startIndex] (must be '['),
 * skipping over string-literal contents so brackets inside strings don't
 * throw off the depth count.
 */
function findMatchingBracket(text: string, startIndex: number): number {
	let depth = 0;
	let inString = false;
	for (let i = startIndex; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			if (c === "\\") {
				i++;
				continue;
			}
			if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === "[") depth++;
		else if (c === "]") {
			depth--;
			if (depth === 0) return i + 1;
		}
	}
	return -1;
}

/**
 * Each `self.__next_f.push([N,"..."])` call's argument is itself valid JSON
 * (Next.js writes it via JSON.stringify) — parsing it directly recovers the
 * exact original string with correct escaping, regardless of how many
 * backslashes appear in the raw HTML. This sidesteps the escaping-depth
 * inconsistency a naive `\"` -> `"` regex replace runs into (observed: some
 * page loads single-escape ad JSON, others double-escape it).
 */
function extractFlightChunkStrings(html: string): string[] {
	const marker = "self.__next_f.push(";
	const chunks: string[] = [];
	let idx = html.indexOf(marker);
	while (idx !== -1) {
		const arrStart = idx + marker.length;
		const arrEnd = findMatchingBracket(html, arrStart);
		if (arrEnd === -1) break;
		try {
			const parsed = JSON.parse(html.slice(arrStart, arrEnd)) as unknown[];
			if (typeof parsed[1] === "string") chunks.push(parsed[1]);
		} catch {
			// malformed chunk, skip
		}
		idx = html.indexOf(marker, arrEnd);
	}
	return chunks;
}

function collectOlxAds(value: unknown, out: OlxAd[]): void {
	if (Array.isArray(value)) {
		for (const item of value) collectOlxAds(item, out);
		return;
	}
	if (value && typeof value === "object") {
		if (isOlxAd(value)) out.push(value);
		for (const v of Object.values(value)) collectOlxAds(v, out);
	}
}

function extractCaucaiaAds(html: string): ScrapedListing[] {
	const ads: OlxAd[] = [];
	for (const chunk of extractFlightChunkStrings(html)) {
		const stripped = chunk.replace(/^[0-9a-f]+:/i, "");
		try {
			collectOlxAds(JSON.parse(stripped), ads);
		} catch {
			// not a JSON chunk (plain string/html fragment), skip
		}
	}

	const listings: ScrapedListing[] = [];
	for (const ad of ads) {
		if (ad.locationDetails.municipality !== "Caucaia") continue;

		const type = classifyCategory(ad.categoryName);
		if (!type) continue;

		const realEstateType = ad.properties.find(
			(p) => p.name === "real_estate_type",
		)?.value;
		// The terrenos category doesn't split venda/aluguel — its
		// real_estate_type is always just "Terrenos" even for rentals, so
		// rental ads are only caught by their own title wording.
		if (realEstateType && /aluguel/i.test(realEstateType)) continue;
		if (/\balug/i.test(ad.subject)) continue;

		listings.push(toScrapedListing(ad, type));
	}
	return listings;
}

function classifyCategory(categoryName: string): ImovelType | null {
	if (categoryName === "Casas") return "casa";
	if (/terreno/i.test(categoryName)) return "terreno";
	return null;
}

function toScrapedListing(ad: OlxAd, type: ImovelType): ScrapedListing {
	const sizeM2 = parseBrNumberToFloat(
		ad.properties.find((p) => p.name === "size")?.value.replace("m²", "") ?? "",
	);
	const neighborhood = ad.locationDetails.neighbourhood.trim() || null;

	return {
		source: "olx",
		externalId: String(ad.listId),
		url: ad.url,
		type,
		title: ad.subject,
		priceCents: parsePriceToCents(ad.priceValue),
		bedrooms: parseBrNumberToFloat(
			ad.properties.find((p) => p.name === "rooms")?.value ?? "",
		),
		bathrooms: parseBrNumberToFloat(
			ad.properties.find((p) => p.name === "bathrooms")?.value ?? "",
		),
		garageSpots: parseBrNumberToFloat(
			ad.properties.find((p) => p.name === "garage_spaces")?.value ?? "",
		),
		// OLX only reports one m² figure per listing (no separate built/lot).
		builtAreaM2: type === "terreno" ? null : sizeM2,
		lotAreaM2: type === "terreno" ? sizeM2 : null,
		description: null,
		neighborhood,
		address: ad.location.replace(/\s*-\s*DDD\s*\d+\s*$/i, "").trim() || null,
		addressPrecise: false,
		lat: null,
		lng: null,
		photos: ad.images.map((i) => i.original),
	};
}

function parsePriceToCents(raw: string): number | null {
	const cleaned = raw.replace(/[^\d,]/g, "").replace(",", ".");
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function parseBrNumberToFloat(raw: string): number | null {
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) && n > 0 ? n : null;
}
