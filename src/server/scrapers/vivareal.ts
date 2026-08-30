import { PlaywrightCrawler } from "crawlee";
import type { Page } from "playwright";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.vivareal.com.br";
// precoMaximo caps the search itself at R$700k (CONTEXT.md decision log):
// cuts both scrape volume and irrelevant browser page-loads at the source.
const SEARCH_URL = `${BASE_URL}/venda/ceara/caucaia/?precoMaximo=700000`;
const MAX_SEARCH_PAGES = 20;

/**
 * Viva Real is the same underlying platform as ZAP Imóveis (grupo OLX/ZAP) —
 * identical Cloudflare managed-challenge behavior (bypassed by Crawlee's
 * PlaywrightCrawler, no stealth needed) and identical detail-page markup
 * (schema.org Product JSON-LD, data-testid="location-address",
 * .amenities-item-text feature list). Only the base URL, listing-slug
 * pattern, and <title> suffix differ from zap.ts. One VR-specific quirk:
 * its search-results cards render with inconsistent timing (~2-4s), so
 * discovery polls for card links instead of using a fixed delay.
 */
export const vivarealScraper: SiteScraper = {
	source: "vivareal",
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
					log.info(`[vivareal] ok: ${request.url}`);
				} catch (err) {
					console.error(`[vivareal] falhou ao ler ${request.url}:`, err);
				}
			},
		});

		await crawler.run(detailUrls);
		return listings;
	},
};

/** Matches only casa/casa-de-condominio/terreno listing slugs, excluding apartamento etc. */
const LISTING_URL_RE =
	/\/imovel\/(casa(?:-de-condominio)?|terreno)-[a-z0-9-]*-id-(\d+)\//i;

function classifyUrl(
	url: string,
): { type: ImovelType; externalId: string } | null {
	const m = url.match(LISTING_URL_RE);
	if (!m) return null;
	return { type: m[1] === "terreno" ? "terreno" : "casa", externalId: m[2]! };
}

// VR's listing cards render async after page load with inconsistent timing
// (seen anywhere from ~2s to ~4s) — poll instead of a single fixed delay.
async function pollForHrefs(page: Page): Promise<string[]> {
	const read = () =>
		page.$$eval("a[href*='/imovel/']", (els) =>
			els.map((e) => (e as HTMLAnchorElement).href),
		);

	let hrefs = await read();
	for (let i = 0; i < 6 && hrefs.length === 0; i++) {
		await page.waitForTimeout(1500);
		hrefs = await read();
	}
	return hrefs;
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
			const hrefs = await pollForHrefs(page);

			let added = 0;
			for (const href of hrefs) {
				const clean = href.split("?")[0]!;
				const classified = classifyUrl(clean);
				if (!classified) continue;
				if (!urls.has(clean)) added++;
				urls.set(clean, classified);
			}
			log.info(
				`[vivareal] ${request.url} -> +${added} urls (total ${urls.size})`,
			);
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

	// The <title> ("<tipo/destaques> em <bairro> - Caucaia, CE - Viva Real")
	// is the listing-specific text, same reasoning as zap.ts.
	const rawTitle = await page.title();
	const title = rawTitle.replace(/\s*-\s*Viva Real\s*$/, "").trim();
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
		source: "vivareal",
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
