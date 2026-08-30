import type { ScrapedListing } from "#/server/db/types";
import { sleep } from "#/server/scrapers/http";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://www.tavarescorretordeimoveis.com.br";
const MAX_PAGES = 20;

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 CaucaiaImoveisBot/1.0 (uso pessoal)";

const TIPOS = ["casa", "terreno"] as const;

/**
 * Tavares Imobiliária runs on the "ImobiBrasil" CMS, is server-rendered PHP,
 * and (unusually) serves its HTML as ISO-8859-1, not UTF-8 — `fetch().text()`
 * would mangle every accented character, so we decode the raw bytes ourselves.
 * robots.txt is fully open (`Allow: /`). There's no per-property sitemap, so we
 * paginate the site's own search pages (`/imovel/venda/<tipo>/caucaia/?pag=N`)
 * until a page returns no new listings. Each detail page embeds a schema.org
 * "Product" JSON-LD block with a clean numeric price; everything else (beds,
 * baths, area, neighborhood, description) is plain server-rendered HTML.
 */
export const tavaresScraper: SiteScraper = {
	source: "tavares",
	async scrape(onListing): Promise<ScrapedListing[]> {
		const listings: ScrapedListing[] = [];

		for (const tipo of TIPOS) {
			const urls = await discoverListingUrls(tipo);
			for (const url of urls) {
				try {
					const listing = await scrapeDetailPage(url, tipo);
					if (listing) {
						listings.push(listing);
						onListing(listing);
					}
					console.log(`[tavares] ok: ${url}`);
				} catch (err) {
					console.error(`[tavares] falhou ao ler ${url}:`, err);
				}
				await sleep(300);
			}
		}

		return listings;
	},
};

async function discoverListingUrls(
	tipo: (typeof TIPOS)[number],
): Promise<string[]> {
	const urls = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const html = await fetchLatin1(
			`${BASE_URL}/imovel/venda/${tipo}/caucaia/?pag=${page}`,
		);
		const found = [
			...html.matchAll(/href="(\/imovel\/\d+\/[a-z0-9-]+)"/gi),
		].map((m) => `${BASE_URL}${m[1]}`);

		const sizeBefore = urls.size;
		for (const u of found) urls.add(u);
		if (found.length === 0 || urls.size === sizeBefore) break;

		await sleep(300);
	}

	return [...urls];
}

interface JsonLdProduct {
	name?: string;
	offers?: { price?: string };
}

async function scrapeDetailPage(
	url: string,
	type: (typeof TIPOS)[number],
): Promise<ScrapedListing | null> {
	const idMatch = url.match(/\/imovel\/(\d+)\//);
	if (!idMatch) return null;
	const externalId = idMatch[1]!;

	const html = decodeEntities(await fetchLatin1(url));

	const product = extractProductJsonLd(html);
	const title = product?.name ?? extractMeta(html, "og:title");
	if (!title) return null;

	const { bedrooms, bathrooms, garageSpots } = extractFeatureCounts(html);
	const address = extractAddress(html);

	return {
		source: "tavares",
		externalId,
		url,
		type,
		title,
		priceCents: extractPriceCents(html, product),
		bedrooms,
		bathrooms,
		garageSpots,
		builtAreaM2: extractArea(
			html,
			/Área (?:Constru[ií]da|Privativa):<b>\s*([\d.,]+)\s*m/i,
		),
		lotAreaM2: extractArea(html, /Área Total:<b>\s*([\d.,]+)\s*m/i),
		description: extractDescription(html),
		neighborhood: extractNeighborhood(html),
		address,
		addressPrecise: address !== null,
		lat: null,
		lng: null,
		photos: extractPhotos(html),
	};
}

async function fetchLatin1(url: string): Promise<string> {
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
	const buf = await res.arrayBuffer();
	return new TextDecoder("iso-8859-1").decode(buf);
}

function extractProductJsonLd(html: string): JsonLdProduct | null {
	for (const m of html.matchAll(
		/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
	)) {
		try {
			const obj = JSON.parse(m[1]!.trim());
			if (obj && typeof obj === "object" && obj["@type"] === "Product") {
				return obj as JsonLdProduct;
			}
		} catch {}
	}
	return null;
}

function extractMeta(html: string, property: string): string | null {
	const m = html.match(
		new RegExp(`<meta property="${property}" content="([^"]*)"`),
	);
	return m ? m[1]! : null;
}

function extractPriceCents(
	html: string,
	product: JsonLdProduct | null,
): number | null {
	const raw = product?.offers?.price;
	if (raw) {
		const n = Number(raw);
		if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
	}
	const m = html.match(/id="info__valor"[^>]*>\s*R\$\s*([\d.,]+)/);
	if (m) {
		const n = parseBrNumberToFloat(m[1]!);
		if (n !== null) return Math.round(n * 100);
	}
	return null;
}

function extractFeatureCounts(html: string): {
	bedrooms: number | null;
	bathrooms: number | null;
	garageSpots: number | null;
} {
	const blocks = [
		...html.matchAll(/<div class="info__tag">([\s\S]*?)<\/div>/g),
	].map((m) => stripHtmlTags(m[1]!).replace(/\s+/g, " ").trim());

	let bedrooms: number | null = null;
	let bathrooms: number | null = null;
	let garageSpots: number | null = null;

	for (const text of blocks) {
		const m = text.match(/^(\d+)\s+(.+)$/);
		if (!m) continue;
		const count = Number.parseInt(m[1]!, 10);
		const label = m[2]!.toLowerCase();
		if (label.startsWith("dormit")) bedrooms = count;
		else if (label.startsWith("banheiro")) bathrooms = count;
		else if (label.startsWith("vaga")) garageSpots = count;
	}

	return { bedrooms, bathrooms, garageSpots };
}

function extractArea(html: string, re: RegExp): number | null {
	const m = html.match(re);
	return m ? parseBrNumberToFloat(m[1]!) : null;
}

function extractDescription(html: string): string | null {
	const startMarker = 'id="desc_descricao">';
	const startIdx = html.indexOf(startMarker);
	if (startIdx === -1) return null;

	const after = html.slice(startIdx + startMarker.length);
	const styleIdx = after.indexOf("<style>");
	const chunk =
		styleIdx !== -1 ? after.slice(0, styleIdx) : after.slice(0, 2000);

	const text = stripHtmlTags(chunk)
		.replace(/^Descrição do Imóvel/i, "")
		.trim();
	return text.length > 0 ? text : null;
}

function extractNeighborhood(html: string): string | null {
	const m = html.match(/title="Imóveis no bairro ([^"]+)"/);
	return m ? m[1]!.trim() : null;
}

function extractAddress(html: string): string | null {
	const m = html.match(/Endereço:<b>\s*([^<]+)<\/b>/);
	return m ? m[1]!.trim() : null;
}

function extractPhotos(html: string): string[] {
	const gallery = [
		...html.matchAll(/<img class="item-lista" src="([^"]+)"/g),
	].map((m) => m[1]!);
	if (gallery.length > 0) return [...new Set(gallery)];

	const og = extractMeta(html, "og:image");
	return og ? [og] : [];
}

function stripHtmlTags(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function parseBrNumberToFloat(raw: string): number | null {
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function decodeEntities(html: string): string {
	return html
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec: string) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		.replace(/&nbsp;/g, " ")
		.replace(/&aacute;/g, "á")
		.replace(/&Aacute;/g, "Á")
		.replace(/&agrave;/g, "à")
		.replace(/&Agrave;/g, "À")
		.replace(/&eacute;/g, "é")
		.replace(/&Eacute;/g, "É")
		.replace(/&egrave;/g, "è")
		.replace(/&Egrave;/g, "È")
		.replace(/&iacute;/g, "í")
		.replace(/&Iacute;/g, "Í")
		.replace(/&oacute;/g, "ó")
		.replace(/&Oacute;/g, "Ó")
		.replace(/&uacute;/g, "ú")
		.replace(/&Uacute;/g, "Ú")
		.replace(/&atilde;/g, "ã")
		.replace(/&Atilde;/g, "Ã")
		.replace(/&otilde;/g, "õ")
		.replace(/&Otilde;/g, "Õ")
		.replace(/&ccedil;/g, "ç")
		.replace(/&Ccedil;/g, "Ç")
		.replace(/&ecirc;/g, "ê")
		.replace(/&Ecirc;/g, "Ê")
		.replace(/&ocirc;/g, "ô")
		.replace(/&Ocirc;/g, "Ô")
		.replace(/&acirc;/g, "â")
		.replace(/&Acirc;/g, "Â")
		.replace(/&sup2;/g, "²")
		.replace(/&ordm;/g, "º")
		.replace(/&ordf;/g, "ª")
		.replace(/&ndash;/g, "–")
		.replace(/&mdash;/g, "—")
		.replace(/&harr;/g, "↔")
		.replace(/&hellip;/g, "…")
		.replace(/&bull;/g, "•")
		.replace(/&deg;/g, "°")
		.replace(/&rsquo;/g, "'")
		.replace(/&lsquo;/g, "'")
		.replace(/&ldquo;/g, "“")
		.replace(/&rdquo;/g, "”")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}
