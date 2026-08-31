import { existsSync, readFileSync } from "node:fs";
import { PlaywrightCrawler } from "crawlee";
import type { Cookie, Page } from "playwright";
import type { ImovelType, ScrapedListing } from "#/server/db/types";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.facebook.com";
export const AUTH_STATE_PATH = "data/facebook-auth.json";
const MAX_SCROLLS = 15;
const SCROLL_WAIT_MS = 1500;

/**
 * Facebook Marketplace has no public API and no location-scoped category URL
 * we can rely on without a Facebook-internal city ID, so this searches by
 * free-text query instead ("casa à venda caucaia ce" / "terreno à venda
 * caucaia ce") and, same as OLX/Imovelweb, discards anything whose page text
 * doesn't actually mention Caucaia — query relevance is not scoping.
 *
 * Search results and item detail pages both require a logged-in session and
 * Facebook flags Playwright-driven logins as automation (checkpoint/2FA/ban)
 * regardless of headless/headed — same failure mode documented in
 * imovelweb.ts for Cloudflare Turnstile. So auth here is never done via
 * Playwright: the user logs in manually in their normal browser and pastes
 * the full `Cookie` request header + `navigator.userAgent` via
 * `bun run facebook:auth` (src/scripts/facebook-auth.ts), saved to
 * `data/facebook-auth.json` (gitignored) and injected on every request here.
 * No published TTL for the session — logging out anywhere invalidates it, so
 * this source can go silently stale until someone re-runs the auth script
 * (cron only logs failures per-source, no external notification).
 *
 * Marketplace search results load via infinite scroll (no page-number URL),
 * so discovery scrolls the page instead of paginating a URL, capped at
 * MAX_SCROLLS. Item detail pages have no stable class names (Facebook ships
 * atomic, auto-generated CSS) — data is pulled from plain rendered text via
 * `document.body.innerText` and regexes, not selectors, mirroring how a
 * screen reader would read the page rather than how the DOM is structured.
 * This is inherently more fragile than the JSON-LD/RSC-payload sources and
 * expected to need re-tuning whenever Facebook changes copy/layout.
 */
const CASAS_QUERY = "casa à venda caucaia ce";
const TERRENOS_QUERY = "terreno à venda caucaia ce";

export const facebookScraper: SiteScraper = {
	source: "facebook",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const auth = loadAuthState();
		if (!auth) {
			throw new Error(
				`sem cookie de autenticação em ${AUTH_STATE_PATH} — rode "bun run facebook:auth" primeiro`,
			);
		}
		const { cookies, userAgent } = auth;

		const listings: ScrapedListing[] = [];
		const found = new Set<string>();

		const targets = [
			...(await discoverListingUrls(CASAS_QUERY, "casa", cookies, userAgent)),
			...(await discoverListingUrls(
				TERRENOS_QUERY,
				"terreno",
				cookies,
				userAgent,
			)),
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
				try {
					const listing = await scrapeDetailPage(page, request.url, type);
					if (listing && !found.has(listing.externalId)) {
						found.add(listing.externalId);
						listings.push(listing);
						onListing(listing);
						log.info(`[facebook] ok: ${request.url}`);
					}
				} catch (err) {
					console.error(`[facebook] falhou ao ler ${request.url}:`, err);
				}
			},
		});

		await crawler.run(targets);
		return listings;
	},
};

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

const ITEM_URL_RE = /\/marketplace\/item\/(\d+)/;

async function discoverListingUrls(
	query: string,
	type: ImovelType,
	cookies: Cookie[],
	userAgent: string,
): Promise<{ url: string; userData: { type: ImovelType } }[]> {
	const urls = new Map<string, string>();
	const searchUrl = `${BASE_URL}/marketplace/search/?query=${encodeURIComponent(query)}&exact=false`;

	const crawler = new PlaywrightCrawler({
		maxConcurrency: 1,
		requestHandlerTimeoutSecs: 90,
		launchContext: { userAgent },
		preNavigationHooks: [
			async ({ page }) => {
				await page.context().addCookies(cookies);
			},
		],
		async requestHandler({ page, log }) {
			let stagnantScrolls = 0;
			for (let i = 0; i < MAX_SCROLLS && stagnantScrolls < 3; i++) {
				const before = urls.size;
				const hrefs = await page
					.$$eval("a[href*='/marketplace/item/']", (els) =>
						els.map((e) => (e as HTMLAnchorElement).href),
					)
					.catch(() => [] as string[]);
				for (const href of hrefs) {
					const m = href.match(ITEM_URL_RE);
					if (!m) continue;
					const id = m[1]!;
					if (!urls.has(id))
						urls.set(id, `${BASE_URL}/marketplace/item/${id}/`);
				}
				stagnantScrolls = urls.size > before ? 0 : stagnantScrolls + 1;
				await page.mouse.wheel(0, 4000);
				await page.waitForTimeout(SCROLL_WAIT_MS);
			}
			log.info(`[facebook] busca "${query}" -> ${urls.size} urls`);
		},
	});

	await crawler.run([searchUrl]);
	return [...urls.values()].map((url) => ({ url, userData: { type } }));
}

async function scrapeDetailPage(
	page: Page,
	url: string,
	type: ImovelType,
): Promise<ScrapedListing | null> {
	const m = url.match(ITEM_URL_RE);
	if (!m) return null;
	const externalId = m[1]!;

	await page.waitForSelector("h1", { timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(1000);

	const data = await page.evaluate(() => {
		const h1 = document.querySelector("h1");
		return {
			title: h1?.textContent?.trim() ?? "",
			bodyText: (document.body as HTMLElement).innerText,
			photos: [...document.querySelectorAll("img")]
				.map((img) => (img as HTMLImageElement).src)
				.filter((src) => src.includes("scontent")),
		};
	});

	if (!data.title) return null;
	// Not scoped to Caucaia by the search itself (see module docstring) — the
	// page text is the only reliable signal that this result actually is one.
	if (!/caucaia/i.test(data.bodyText)) return null;
	if (
		/\balug/i.test(data.title) ||
		/\balug/i.test(data.bodyText.slice(0, 500))
	) {
		return null;
	}

	return {
		source: "facebook",
		externalId,
		url,
		type,
		title: data.title,
		priceCents: extractPriceCents(data.bodyText),
		bedrooms: extractFirstMatch(data.bodyText, /(\d+[.,]?\d*)\s*quartos?/i),
		bathrooms: extractFirstMatch(data.bodyText, /(\d+[.,]?\d*)\s*banheiros?/i),
		garageSpots: extractFirstMatch(data.bodyText, /(\d+[.,]?\d*)\s*vagas?/i),
		builtAreaM2:
			type === "terreno"
				? null
				: extractFirstMatch(data.bodyText, /(\d+[.,]?\d*)\s*m²/i),
		lotAreaM2:
			type === "terreno"
				? extractFirstMatch(data.bodyText, /(\d+[.,]?\d*)\s*m²/i)
				: null,
		description: extractDescription(data.bodyText),
		neighborhood: null,
		address: null,
		addressPrecise: false,
		lat: null,
		lng: null,
		photos: data.photos,
	};
}

function extractPriceCents(bodyText: string): number | null {
	const m = bodyText.match(/R\$\s?([\d.,]+)/);
	if (!m) return null;
	const cleaned = m[1]!.replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function extractFirstMatch(bodyText: string, re: RegExp): number | null {
	const m = bodyText.match(re);
	if (!m) return null;
	const n = Number.parseFloat(m[1]!.replace(",", "."));
	return Number.isFinite(n) && n > 0 ? n : null;
}

// Marketplace item pages render a "Descrição" heading followed by the
// seller's free text, then further sections ("Detalhes de envio",
// "Informações do vendedor", "Mais anúncios do vendedor" etc.) — grabbed as
// the text between those markers since there's no dedicated element to
// select against.
function extractDescription(bodyText: string): string | null {
	const start = bodyText.indexOf("Descrição");
	if (start === -1) return null;
	const rest = bodyText.slice(start + "Descrição".length);
	const endMarkers = [
		"Detalhes de envio",
		"Informações do vendedor",
		"Mais anúncios do vendedor",
		"Avaliações do vendedor",
	];
	let end = rest.length;
	for (const marker of endMarkers) {
		const idx = rest.indexOf(marker);
		if (idx !== -1 && idx < end) end = idx;
	}
	const desc = rest.slice(0, end).trim();
	return desc || null;
}
