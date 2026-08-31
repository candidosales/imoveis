import { existsSync, readFileSync } from "node:fs";
import { PlaywrightCrawler } from "crawlee";
import type { Cookie, Page } from "playwright";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.imovelweb.com.br";
export const AUTH_TARGET_URL = `${BASE_URL}/imoveis-venda-caucaia-ce.html`;
export const AUTH_STATE_PATH = "data/imovelweb-auth.json";
const MAX_SEARCH_PAGES = 20;

/**
 * Imovelweb (Navent group) rejects Crawlee's PlaywrightCrawler outright — a
 * 403 in <500ms, before any Turnstile challenge even renders — regardless of
 * `useFingerprints`. Confirmed by direct probe: response carries
 * `cf-mitigated: challenge`, an interactive Turnstile tier, stricter than the
 * silently-passable "managed challenge" ZAP/Viva Real/OLX use.
 *
 * Worse: the challenge can't be solved by *any* Playwright-driven browser,
 * headed or not — it's CDP-automated (`navigator.webdriver` + other
 * automation markers), which Turnstile detects regardless of who clicks, so
 * it spins forever. So the `cf_clearance` cookie has to come from a genuinely
 * unautomated browser: the user solves it by hand in their normal browser and
 * pastes the cookie value + their `navigator.userAgent` into
 * `src/scripts/imovelweb-auth.ts` (`bun run imovelweb:auth`), which saves
 * both to `data/imovelweb-auth.json`. This scraper then injects that cookie
 * *and* forces the matching User-Agent on every request — Cloudflare ties
 * `cf_clearance` to the UA that solved it, so a mismatch gets it rejected
 * even though the cookie itself is still valid.
 *
 * Once `cf_clearance` is set and the UA matches, Cloudflare's edge validates
 * the cookie/IP/UA triple and skips the JS challenge entirely — it does not
 * re-run the automation check on every request, only on unchallenged ones —
 * which is why Crawlee (still CDP-automated) works fine for the actual
 * scraping despite being unable to solve the challenge itself.
 *
 * The cookie has no published TTL — when it expires, every request here
 * starts failing again until someone re-runs `bun run imovelweb:auth`. The
 * cron only logs failures per-source (CONTEXT.md: no external notification),
 * so this source going silently stale is an accepted tradeoff of choosing
 * Imovelweb over dropping it — check `data/imovelweb-auth.json`'s mtime or
 * the cron log if it goes quiet.
 *
 * Casas and terrenos are scraped from their own dedicated category URLs
 * (like OLX) rather than the mixed "imoveis-venda" search, which also
 * includes apartamentos (out of scope) with no reliable per-card type label
 * to filter on — the URL itself is the source of truth for `type` here.
 * Search-result cards (verified against live authenticated HTML) only carry
 * a thumbnail and truncated title, no full description — both left null/[]
 * same as OLX, which also skips per-listing detail-page visits.
 */
const CASAS_SEARCH_URL = `${BASE_URL}/casas-venda-caucaia-ce.html`;
const TERRENOS_SEARCH_URL = `${BASE_URL}/terrenos-venda-caucaia-ce.html`;

export const imovelwebScraper: SiteScraper = {
	source: "imovelweb",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const auth = loadAuthState();
		if (!auth) {
			throw new Error(
				`sem cookie de autenticação em ${AUTH_STATE_PATH} — rode "bun run imovelweb:auth" primeiro`,
			);
		}
		const { cookies, userAgent } = auth;

		const found = new Map<string, ScrapedListing>();
		const targets = [
			...buildPageUrls(CASAS_SEARCH_URL, "casa"),
			...buildPageUrls(TERRENOS_SEARCH_URL, "terreno"),
		];

		const crawler = new PlaywrightCrawler({
			maxConcurrency: 2,
			requestHandlerTimeoutSecs: 60,
			launchContext: { userAgent },
			preNavigationHooks: [
				async ({ page }) => {
					await page.context().addCookies(cookies);
				},
			],
			async requestHandler({ page, request, log }) {
				const { type } = request.userData as { type: ImovelType };
				await page
					.waitForSelector('div[data-qa="posting PROPERTY"]', {
						timeout: 15000,
					})
					.catch(() => {});
				const cards = await extractCards(page, type);

				let added = 0;
				for (const listing of cards) {
					if (found.has(listing.externalId)) continue;
					found.set(listing.externalId, listing);
					onListing(listing);
					added++;
				}
				log.info(
					`[imovelweb] ${request.url} -> +${added} (total ${found.size})`,
				);
			},
		});

		await crawler.run(targets);
		return [...found.values()];
	},
};

function buildPageUrls(
	searchUrl: string,
	type: ImovelType,
): { url: string; userData: { type: ImovelType } }[] {
	return Array.from({ length: MAX_SEARCH_PAGES }, (_, i) => ({
		url:
			i === 0
				? searchUrl
				: searchUrl.replace(/\.html$/, `-pagina-${i + 1}.html`),
		userData: { type },
	}));
}

function loadAuthState(): { cookies: Cookie[]; userAgent: string } | null {
	if (!existsSync(AUTH_STATE_PATH)) return null;
	try {
		const raw = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8"));
		if (!Array.isArray(raw?.cookies) || typeof raw?.userAgent !== "string") {
			return null;
		}
		return { cookies: raw.cookies, userAgent: raw.userAgent };
	} catch {
		return null;
	}
}

interface RawCard {
	id: string | null;
	path: string | null;
	price: string;
	address: string;
	location: string;
	features: string[];
	description: string;
	alt: string;
	photos: string[];
}

async function extractCards(
	page: Page,
	type: ImovelType,
): Promise<ScrapedListing[]> {
	const raw = (await page.$$eval('div[data-qa="posting PROPERTY"]', (els) =>
		els.map((el) => ({
			id: el.getAttribute("data-id"),
			path: el.getAttribute("data-to-posting"),
			price:
				el.querySelector('[data-qa="POSTING_CARD_PRICE"]')?.textContent ?? "",
			address:
				el.querySelector(".postingLocations-module__location-address")
					?.textContent ?? "",
			location:
				el.querySelector('[data-qa="POSTING_CARD_LOCATION"]')?.textContent ??
				"",
			features: [
				...el.querySelectorAll('[data-qa="POSTING_CARD_FEATURES"] span'),
			].map((s) => s.textContent ?? ""),
			// The card's only "title"-shaped text is the full ad body used as the
			// link's accessible text — genuinely a description, not a title.
			description:
				el.querySelector('[data-qa="POSTING_CARD_DESCRIPTION"]')?.textContent ??
				"",
			// First gallery image's alt renders as "<Tipo> de N quartos, Caucaia ·
			// <short title>" — the part after "·" is the actual listing title.
			alt:
				el
					.querySelector('[data-qa="POSTING_CARD_GALLERY"] img')
					?.getAttribute("alt") ?? "",
			// Gallery also embeds a decorative carousel-arrow SVG served from a
			// different CDN host (naventcdn.com) — real photos are all
			// imgbr.imovelwebcdn.com.
			photos: [...el.querySelectorAll('[data-qa="POSTING_CARD_GALLERY"] img')]
				.map((img) => (img as HTMLImageElement).src)
				.filter((src) => src.includes("imovelwebcdn.com")),
		})),
	)) as RawCard[];

	const listings: ScrapedListing[] = [];
	for (const card of raw) {
		if (!card.id || !card.path) continue;

		const { bedrooms, bathrooms, garageSpots, areaM2 } = parseFeatures(
			card.features,
		);
		const address = normalizeAddress(card.address);

		listings.push({
			source: "imovelweb",
			externalId: card.id,
			url: `${BASE_URL}${card.path.split("?")[0]}`,
			type,
			title: extractTitle(card.alt) || card.location.trim(),
			priceCents: parsePriceToCents(card.price),
			bedrooms,
			bathrooms,
			garageSpots,
			builtAreaM2: type === "terreno" ? null : areaM2,
			lotAreaM2: type === "terreno" ? areaM2 : null,
			description: card.description.trim() || null,
			neighborhood: extractNeighborhood(card.location),
			address,
			addressPrecise: address !== null,
			lat: null,
			lng: null,
			photos: card.photos,
		});
	}
	return listings;
}

function extractTitle(alt: string): string | null {
	const idx = alt.indexOf("·");
	const title = idx === -1 ? alt : alt.slice(idx + 1);
	return title.trim() || null;
}

function normalizeAddress(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed || trimmed === "Endereço não informado") return null;
	return trimmed;
}

// Feature spans render as "<n> <label>", e.g. "264 m² tot.", "4 quartos",
// "6 ban.", "2 vagas" — label text is abbreviated/pluralized inconsistently,
// matched by prefix.
function parseFeatures(spans: string[]): {
	bedrooms: number | null;
	bathrooms: number | null;
	garageSpots: number | null;
	areaM2: number | null;
} {
	let bedrooms: number | null = null;
	let bathrooms: number | null = null;
	let garageSpots: number | null = null;
	let areaM2: number | null = null;

	for (const raw of spans) {
		const t = raw.trim();
		const m = t.match(/^([\d.,]+)\s*(.+)$/);
		if (!m) continue;
		const n = parseBrNumberToFloat(m[1]!);
		if (n === null) continue;
		const label = m[2]!.toLowerCase();

		if (label.startsWith("m²")) areaM2 = n;
		else if (label.startsWith("quarto")) bedrooms = n;
		else if (label.startsWith("ban")) bathrooms = n;
		else if (label.startsWith("vaga")) garageSpots = n;
	}

	return { bedrooms, bathrooms, garageSpots, areaM2 };
}

// Location renders as "<bairro>, Caucaia" — the neighborhood is the segment
// right before the trailing city name.
function extractNeighborhood(location: string): string | null {
	const parts = location.split(",").map((s) => s.trim());
	if (parts.length < 2) return parts[0] || null;
	return parts[parts.length - 2] || null;
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
