import type { ScrapedListing } from "#/server/db/types";
import { extractEscapedJsonObject, fetchText, sleep } from "#/server/scrapers/http";
import type { SiteScraper } from "#/server/scrapers/types";

const BASE_URL = "https://ergueimoveis.com.br";

/**
 * Ergue Imóveis runs on the "Vista" real-estate CMS (cdn.vistahost.com.br) and
 * server-renders full property data inside a React Server Components payload
 * on each detail page (`"property":{...}` embedded in an escaped JS string).
 * We discover URLs via the published sitemap (robots.txt disallows /busca/,
 * the on-site search, but allows crawling /imovel/* and publishes a sitemap
 * expressly for that purpose).
 */
export const ergueScraper: SiteScraper = {
  source: "ergue",
  async scrape(): Promise<ScrapedListing[]> {
    const detailUrls = await discoverCaucaiaListingUrls();
    const listings: ScrapedListing[] = [];

    for (const url of detailUrls) {
      try {
        const listing = await scrapeDetailPage(url);
        if (listing) listings.push(listing);
      } catch (err) {
        console.error(`[ergue] falhou ao ler ${url}:`, err);
      }
      await sleep(300);
    }

    return listings;
  },
};

async function discoverCaucaiaListingUrls(): Promise<string[]> {
  const indexXml = await fetchText(`${BASE_URL}/sitemap.xml`);
  const subSitemaps = [...indexXml.matchAll(/<loc>([^<]+\/sitemaps\/imoveis-\d+\.xml)<\/loc>/g)].map(
    (m) => m[1]!,
  );

  const urls = new Set<string>();
  for (const sitemapUrl of subSitemaps) {
    const xml = await fetchText(sitemapUrl);
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1]!;
      if (loc.includes("-caucaia-ce-") && loc.includes("/imovel/")) urls.add(loc);
    }
    await sleep(200);
  }
  return [...urls];
}

interface VistaProperty {
  Codigo: string;
  Categoria: string;
  TituloSite: string;
  AreaTotal: string;
  AreaPrivativa: string;
  Dormitorios: string;
  TotalBanheiros: string;
  Vagas: string;
  FotoDestaque: string;
  ValorVenda: string;
  TipoEndereco: string;
  Endereco: string;
  Numero: string;
  Bairro: string;
  Cidade: string;
  UF: string;
  DescricaoWeb: string;
}

async function scrapeDetailPage(url: string): Promise<ScrapedListing | null> {
  const html = await fetchText(url);
  const marker = '\\"property\\":{';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const property = extractEscapedJsonObject(html, markerIdx + marker.length - 1) as VistaProperty;

  const type = categoriaToType(property.Categoria);
  if (!type) return null;

  const priceReais = Number(property.ValorVenda);
  const addressParts = [property.TipoEndereco, property.Endereco, property.Numero].filter(Boolean);

  return {
    source: "ergue",
    externalId: property.Codigo,
    url,
    type,
    title: property.TituloSite,
    priceCents: Number.isFinite(priceReais) && priceReais > 0 ? Math.round(priceReais * 100) : null,
    bedrooms: toIntOrNull(property.Dormitorios),
    bathrooms: toIntOrNull(property.TotalBanheiros),
    garageSpots: toIntOrNull(property.Vagas),
    builtAreaM2: toFloatOrNull(property.AreaPrivativa),
    lotAreaM2: toFloatOrNull(property.AreaTotal),
    description: property.DescricaoWeb || null,
    neighborhood: property.Bairro || null,
    address: addressParts.length > 0 ? addressParts.join(" ") : null,
    addressPrecise: addressParts.length > 0,
    lat: null,
    lng: null,
    photos: property.FotoDestaque ? [property.FotoDestaque] : [],
  };
}

function categoriaToType(categoria: string | undefined): "casa" | "terreno" | null {
  const normalized = (categoria ?? "").trim().toLowerCase();
  if (normalized === "casa") return "casa";
  if (normalized === "terreno" || normalized === "lote") return "terreno";
  return null;
}

function toIntOrNull(value: string | undefined): number | null {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toFloatOrNull(value: string | undefined): number | null {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}
