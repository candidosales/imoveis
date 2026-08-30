import { markGoneListingsInactive, upsertListing } from "#/server/db/repository";
import { enrichListingsWithMaps } from "#/server/maps/enrich";
import { scrapers } from "#/server/scrapers";

export async function runScrapeAndEnrich(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[cron] iniciando coleta às ${new Date().toISOString()}`);

  for (const scraper of scrapers) {
    try {
      const listings = await scraper.scrape();
      const seenIds = new Set<string>();
      let newCount = 0;
      for (const listing of listings) {
        const result = upsertListing(listing);
        seenIds.add(listing.externalId);
        if (result.isNew) {
          newCount++;
          console.log(`[cron] novo imóvel: ${listing.title} — ${listing.url}`);
        }
      }
      const inactivated = markGoneListingsInactive(scraper.source, seenIds);
      console.log(
        `[cron] ${scraper.source}: ${listings.length} coletados, ${newCount} novos, ${inactivated} marcados inativos`,
      );
    } catch (err) {
      console.error(`[cron] fonte ${scraper.source} falhou:`, err);
    }
  }

  await enrichListingsWithMaps();

  console.log(`[cron] coleta concluída em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}
