import { PlaywrightCrawler } from "crawlee";
import type { Page } from "playwright";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.zapimoveis.com.br";
// precoMaximo caps the search itself at R$700k (CONTEXT.md decision log):
// cuts both scrape volume and irrelevant browser page-loads at the source.
const SEARCH_URL = `${BASE_URL}/venda/imoveis/ce+caucaia/?precoMaximo=700000`;
const MAX_SEARCH_PAGES = 20;

/**
 * ZAP Imóveis (grupo OLX) serves a Cloudflare managed challenge to plain HTTP
 * requests — fetch/curl get a 403 "Just a moment" page — but a real headless
 * browser (Crawlee's PlaywrightCrawler, no extra stealth config) passes it on
 * both search-results and detail pages. There's no JSON API or __NEXT_DATA__
 * payload to read instead, so we scrape the rendered DOM: detail pages embed
 * a schema.org "Product" JSON-LD block (name, description, price, photos)
 * plus a breadcrumb JSON-LD whose last item is the neighborhood name.
 * ZAP only shows a single "m²" figure per listing (no separate built vs. lot
 * area), which we treat as builtAreaM2. Lat/lng aren't in the markup either
 * (the map is a Google Maps embed keyed by address string) — left null for
 * the downstream geocoding step, same as other sources without precise geo.
 * Search results across all of Caucaia total 2000+ (every property type);
 * capped at MAX_SEARCH_PAGES like the other scrapers.
 */
export const zapScraper: SiteScraper = {
	source: "zap",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const listings: ScrapedListing[] = [];
		const detailUrls = await discoverListingUrls();

		const crawler = new PlaywrightCrawler({
			maxConcurrency: 2,
			requestHandlerTimeoutSecs: 60,
			async requestHandler({ page, request, log }) {
				try {
					const listing = await scrapeDetailPage(page, request.url);
					if (listing) {
						listings.push(listing);
						onListing(listing);
					}
					log.info(`[zap] ok: ${request.url}`);
				} catch (err) {
					console.error(`[zap] falhou ao ler ${request.url}:`, err);
				}
			},
		});

		await crawler.run(detailUrls);
		return listings;
	},
};

/** Matches only casa/terreno listing slugs, excluding apartamento, sala, galpão, lançamentos etc. */
const LISTING_URL_RE = /\/imovel\/venda-(casa|terreno)[a-z0-9-]*-id-(\d+)\//;

function classifyUrl(
	url: string,
): { type: ImovelType; externalId: string } | null {
	const m = url.match(LISTING_URL_RE);
	if (!m) return null;
	return { type: m[1] === "terreno" ? "terreno" : "casa", externalId: m[2]! };
}

async function discoverListingUrls(): Promise<string[]> {
	const urls = new Map<string, ReturnType<typeof classifyUrl>>();

	const pageUrls = Array.from({ length: MAX_SEARCH_PAGES }, (_, i) =>
		i === 0 ? SEARCH_URL : `${SEARCH_URL}&pagina=${i + 1}`,
	);

	const crawler = new PlaywrightCrawler({
		maxConcurrency: 3,
		requestHandlerTimeoutSecs: 60,
		async requestHandler({ page, request, log }) {
			await page.waitForTimeout(2000);
			const hrefs = await page.$$eval("a[href*='/imovel/venda-']", (els) =>
				els.map((e) => (e as HTMLAnchorElement).href),
			);

			let added = 0;
			for (const href of hrefs) {
				const clean = href.split("?")[0]!;
				const classified = classifyUrl(clean);
				if (!classified) continue;
				if (!urls.has(clean)) added++;
				urls.set(clean, classified);
			}
			log.info(`[zap] ${request.url} -> +${added} urls (total ${urls.size})`);
		},
	});

	await crawler.run(pageUrls);
	return [...urls.keys()];
}

interface JsonLdProduct {
	description?: string;
	sku?: string;
	image?: string[];
	offers?: { price?: number };
}

async function scrapeDetailPage(
	page: Page,
	url: string,
): Promise<ScrapedListing | null> {
	const classified = classifyUrl(url);
	if (!classified) return null;
	const { type, externalId } = classified;

	await page.waitForTimeout(2000);

	const jsonLdBlocks = await page
		.locator('script[type="application/ld+json"]')
		.allTextContents();
	const product = jsonLdBlocks
		.map((raw) => {
			try {
				return JSON.parse(raw);
			} catch {
				return null;
			}
		})
		.find((v) => v?.["@type"] === "Product") as JsonLdProduct | undefined;

	// The Product JSON-LD "name" is a generic "Imóvel em <bairro>, Caucaia - CE"
	// for every listing; the <title> ("<tipo/destaques> em <bairro> - Caucaia, CE
	// | ZAP Imóveis") is the actually descriptive, listing-specific text.
	const rawTitle = await page.title();
	const title = rawTitle.replace(/\s*\|\s*ZAP Imóveis\s*$/, "").trim();
	if (!title) return null;

	const priceCents =
		typeof product?.offers?.price === "number"
			? Math.round(product.offers.price * 100)
			: null;

	const address = await page
		.locator('[data-testid="location-address"]')
		.textContent()
		.catch(() => null);
	const trimmedAddress = address?.trim() || null;

	const { bedrooms, bathrooms, garageSpots, areaM2 } =
		await extractFeatures(page);

	return {
		source: "zap",
		externalId,
		url,
		type,
		title,
		priceCents,
		bedrooms,
		bathrooms,
		garageSpots,
		builtAreaM2: areaM2,
		lotAreaM2: null,
		description: product?.description?.trim() || null,
		neighborhood: extractNeighborhood(trimmedAddress),
		address: trimmedAddress,
		addressPrecise:
			trimmedAddress !== null && trimmedAddress.split(",").length >= 3,
		lat: null,
		lng: null,
		photos: product?.image ?? [],
	};
}

async function extractFeatures(page: Page): Promise<{
	bedrooms: number | null;
	bathrooms: number | null;
	garageSpots: number | null;
	areaM2: number | null;
}> {
	const texts = await page.locator(".amenities-item-text").allTextContents();

	let bedrooms: number | null = null;
	let bathrooms: number | null = null;
	let garageSpots: number | null = null;
	let areaM2: number | null = null;

	for (const raw of texts) {
		const text = raw.trim();
		const m = text.match(/^([\d.,]+)\s*(.+)$/);
		if (!m) continue;
		const n = parseBrNumberToFloat(m[1]!);
		if (n === null) continue;
		const label = m[2]!.toLowerCase();

		if (label.startsWith("m²")) areaM2 = n;
		else if (label.startsWith("quarto")) bedrooms = n;
		else if (label.startsWith("banheiro")) bathrooms = n;
		else if (label.startsWith("vaga")) garageSpots = n;
	}

	return { bedrooms, bathrooms, garageSpots, areaM2 };
}

// Address renders as "<rua>[, <número>] - <bairro>, <cidade> - <uf>" or
// "<rua> - <bairro>, <cidade> - <uf>"; the neighborhood is always the tail
// end of the second-to-last comma-separated segment.
function extractNeighborhood(address: string | null): string | null {
	if (!address) return null;
	const parts = address.split(",").map((s) => s.trim());
	if (parts.length < 2) return null;
	const bairroSegment = parts[parts.length - 2]!;
	const dashParts = bairroSegment.split(" - ");
	return dashParts[dashParts.length - 1]!.trim() || null;
}

function parseBrNumberToFloat(raw: string): number | null {
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) && n > 0 ? n : null;
}
