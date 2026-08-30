import type { ImovelType, ScrapedListing } from "#/server/db/types";
import { sleep } from "#/server/scrapers/http";
import type { SiteScraper } from "#/server/scrapers/types";
import { fetchRenderedHtml } from "#/server/scrapers/webview";

const BASE_URL = "https://habitatimobiliaria.com.br";
const LISTING_PAGES: Array<{ path: string; type: ImovelType }> = [
  { path: "/comprar/todos/casas", type: "casa" },
  { path: "/comprar/todos/terreno", type: "terreno" },
];

/**
 * Habitat Imobiliária is a Next.js app whose listing data is fetched
 * client-side (SSR only ships an empty `propertys: []`), so we render it
 * with Bun.WebView instead of plain fetch+parse (see CONTEXT.md: scraping
 * híbrido). Detail pages don't expose a stable structured address, so we
 * fall back to the URL's neighborhood slug and let geocoding resolve the
 * centroid (Status do Imóvel / endereco_preciso = false).
 */
export const habitatScraper: SiteScraper = {
  source: "habitat",
  async scrape(onListing): Promise<ScrapedListing[]> {
    const detailLinks = await discoverCaucaiaListingLinks();
    const listings: ScrapedListing[] = [];

    for (const link of detailLinks) {
      try {
        const listing = await scrapeDetailPage(link);
        if (listing) {
          listings.push(listing);
          onListing(listing);
        }
      } catch (err) {
        console.error(`[habitat] falhou ao ler ${link.url}:`, err);
      }
      await sleep(300);
    }

    return listings;
  },
};

interface DetailLink {
  url: string;
  externalId: string;
  type: ImovelType;
  neighborhoodSlug: string;
}

async function discoverCaucaiaListingLinks(): Promise<DetailLink[]> {
  const links = new Map<string, DetailLink>();

  for (const { path, type } of LISTING_PAGES) {
    const html = await fetchRenderedHtml(`${BASE_URL}${path}`);
    const pattern = /href="\/imovel\/venda\/(casas|terreno)\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d+)"/g;
    for (const m of html.matchAll(pattern)) {
      const [, , citySlug, neighborhoodSlug, externalId] = m;
      if (citySlug !== "caucaia") continue;
      const url = `${BASE_URL}/imovel/venda/${m[1]}/${citySlug}/${neighborhoodSlug}/${externalId}`;
      links.set(url, { url, externalId: externalId!, type, neighborhoodSlug: neighborhoodSlug! });
    }
    await sleep(300);
  }

  return [...links.values()];
}

async function scrapeDetailPage(link: DetailLink): Promise<ScrapedListing | null> {
  const html = await fetchRenderedHtml(link.url);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/- Habitat Imobiliária$/, "").trim();
  const priceMatch = html.match(/R\$\s*([\d.,]+)/);
  const bedrooms = intAfter(html, "Quartos");
  const bathrooms = intAfter(html, "Banheiros");
  const garageSpots = intAfter(html, "Garagens");
  const area = html.match(/Área<\/div>([\d.,]+)\s*m²/)?.[1];
  const description = html.match(
    /Descrição do imóvel<\/div><div class="ParagraphIcon__Content-sc-ivjngs-5[^"]*">([\s\S]*?)<\/div>/,
  )?.[1]?.trim();
  const gallery = extractPhotos(html);
  const photo = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

  return {
    source: "habitat",
    externalId: link.externalId,
    url: link.url,
    type: link.type,
    title: title ?? `Imóvel ${link.externalId} - Habitat`,
    priceCents: priceMatch ? parsePriceBRLToCents(priceMatch[1]!) : null,
    bedrooms,
    bathrooms,
    garageSpots,
    builtAreaM2: link.type === "casa" ? parseAreaM2(area) : null,
    lotAreaM2: link.type === "terreno" ? parseAreaM2(area) : null,
    description: description ?? null,
    neighborhood: prettifySlug(link.neighborhoodSlug),
    address: null,
    addressPrecise: false,
    lat: null,
    lng: null,
    photos: gallery.length > 0 ? gallery : photo ? [photo] : [],
  };
}

/**
 * The rendered detail page embeds a `"jsonPhotos":"[...]"` field: a JSON array,
 * itself JSON-string-escaped, of `{ urlPhoto, flgNotShowSite }` gallery entries.
 */
function extractPhotos(html: string): string[] {
  const key = '"jsonPhotos":"';
  const start = html.indexOf(key);
  if (start === -1) return [];

  let end = start + key.length;
  while (end < html.length) {
    if (html[end] === "\\") {
      end += 2;
      continue;
    }
    if (html[end] === '"') break;
    end++;
  }

  try {
    const raw = html.slice(start + key.length, end);
    const decoded = JSON.parse(`"${raw}"`) as string;
    const photos = JSON.parse(decoded) as Array<{
      urlPhoto: string;
      flgNotShowSite: number;
    }>;
    return photos.filter((p) => p.flgNotShowSite === 0).map((p) => p.urlPhoto);
  } catch {
    return [];
  }
}

function intAfter(html: string, label: string): number | null {
  const m = html.match(new RegExp(`${label}<\\/div>(\\d+)`));
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function parsePriceBRLToCents(text: string): number | null {
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function parseAreaM2(text: string | undefined): number | null {
  if (!text) return null;
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
