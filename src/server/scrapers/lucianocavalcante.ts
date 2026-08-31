import { PlaywrightCrawler } from "crawlee";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import { fetchText } from "#/server/scrapers/http";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.lucianocavalcante.com.br";
const SITEMAP_INDEX_URL = `${BASE_URL}/sitemap.xml`;

/**
 * Luciano Cavalcante Imóveis runs on the Kenlo CMS, is server-rendered, and
 * embeds a full schema.org "RealEstateListing" JSON-LD block per detail page
 * (price, rooms, bathrooms, parking, floor size, photos) — no client-side
 * data fetch needed. We still route it through Crawlee's PlaywrightCrawler
 * (per project convention for third-party sites, see CONTEXT.md) rather than
 * plain fetch, since a real browser context is cheap insurance here.
 *
 * Detail URLs are discovered via the site's own sitemap index, filtered to
 * the `a-venda/casa/caucaia.xml` and `a-venda/terreno/caucaia.xml` sub-sitemaps
 * (Caucaia-scoped, matching this app's only two ImovelType values). Sitemap
 * entries under `/imoveis/` (plural) are category/neighborhood search pages,
 * not listings — only `/imovel/` (singular) entries are detail pages.
 *
 * Note: this site's robots.txt disallows `/` for unnamed user agents (only
 * allowlists named search-engine bots). Scraped anyway per explicit project
 * decision; keep an eye out if the site starts actively blocking this UA.
 */
export const lucianoCavalcanteScraper: SiteScraper = {
	source: "lucianocavalcante",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const targets = await discoverDetailUrls();
		const found: ScrapedListing[] = [];

		const crawler = new PlaywrightCrawler({
			maxConcurrency: 3,
			requestHandlerTimeoutSecs: 60,
			async requestHandler({ page, request, log }) {
				const { type } = request.userData as { type: ImovelType };
				const html = await page.content();
				const listing = parseListing(html, request.url, type);
				if (listing) {
					found.push(listing);
					onListing(listing);
					log.info(`[lucianocavalcante] ok: ${request.url}`);
				} else {
					log.warning(`[lucianocavalcante] sem JSON-LD: ${request.url}`);
				}
			},
		});

		await crawler.run(
			targets.map(({ url, type }) => ({ url, userData: { type } })),
		);

		return found;
	},
};

async function discoverDetailUrls(): Promise<
	{ url: string; type: ImovelType }[]
> {
	const indexXml = await fetchText(SITEMAP_INDEX_URL);
	const sitemapUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
		(m) => m[1]!,
	);

	const targets: { url: string; type: ImovelType }[] = [];

	for (const sitemapUrl of sitemapUrls) {
		const type = classifySitemap(sitemapUrl);
		if (!type) continue;

		const xml = await fetchText(sitemapUrl);
		for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
			const url = m[1]!;
			if (url.includes("/imovel/")) targets.push({ url, type });
		}
	}

	return targets;
}

function classifySitemap(url: string): ImovelType | null {
	if (/\/a-venda\/casa\/caucaia\.xml$/.test(url)) return "casa";
	if (/\/a-venda\/terreno\/caucaia\.xml$/.test(url)) return "terreno";
	return null;
}

interface JsonLdRealEstateListing {
	name?: string;
	description?: string;
	url?: string;
	image?: string[];
	address?: { addressLocality?: string };
	floorSize?: { value?: number };
	numberOfRooms?: number;
	numberOfBathroomsTotal?: number;
	numberOfParkingSpaces?: number;
	offers?: { price?: number };
}

function parseListing(
	html: string,
	url: string,
	type: ImovelType,
): ScrapedListing | null {
	const listing = extractRealEstateJsonLd(html);
	if (!listing || !listing.name) return null;

	const externalId = url.split("/").pop();
	if (!externalId) return null;

	const areaM2 = listing.floorSize?.value ?? null;

	return {
		source: "lucianocavalcante",
		externalId,
		url,
		type,
		title: listing.name,
		priceCents:
			listing.offers?.price != null ? Math.round(listing.offers.price * 100) : null,
		bedrooms: listing.numberOfRooms ?? null,
		bathrooms: listing.numberOfBathroomsTotal ?? null,
		garageSpots: listing.numberOfParkingSpaces ?? null,
		builtAreaM2: type === "casa" ? areaM2 : null,
		lotAreaM2: type === "terreno" ? areaM2 : null,
		description: listing.description ?? null,
		neighborhood: extractNeighborhood(listing.name),
		address: null,
		addressPrecise: false,
		lat: null,
		lng: null,
		photos: listing.image ?? [],
	};
}

function extractRealEstateJsonLd(html: string): JsonLdRealEstateListing | null {
	for (const m of html.matchAll(
		/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
	)) {
		try {
			const obj = JSON.parse(m[1]!.trim());
			if (obj && typeof obj === "object" && obj["@type"] === "RealEstateListing") {
				return obj as JsonLdRealEstateListing;
			}
		} catch {}
	}
	return null;
}

/**
 * Titles follow "<Empreendimento>, <Tipo>, <Área>m², <Bairro>/CE" — the
 * neighborhood segment right before the fixed "/CE" state suffix.
 */
function extractNeighborhood(title: string): string | null {
	const m = title.match(/,\s*([^,/]+)\/CE\s*$/);
	return m ? m[1]!.trim() : null;
}
