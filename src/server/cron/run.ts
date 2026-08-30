import {
	markGoneListingsInactive,
	upsertListing,
} from "#/server/db/repository";
import { enrichListingsWithMaps } from "#/server/maps/enrich";
import { scrapers } from "#/server/scrapers";

// CONTEXT.md decision log: teto fixo de R$700k em todas as Fontes.
const MAX_PRICE_CENTS = 700_000 * 100;

export async function runScrapeAndEnrich(): Promise<void> {
	const startedAt = Date.now();
	console.log(`[cron] iniciando coleta às ${new Date().toISOString()}`);

	// Independent sources (different hosts, no shared state) — scrape them concurrently.
	// Each listing is upserted as soon as its scraper finds it (via onListing),
	// instead of being buffered until the whole source finishes.
	const scraped = await Promise.all(
		scrapers.map(async (scraper) => {
			const seenIds = new Set<string>();
			let newCount = 0;
			try {
				await scraper.scrape((listing) => {
					if (
						listing.priceCents !== null &&
						listing.priceCents > MAX_PRICE_CENTS
					) {
						return;
					}
					const result = upsertListing(listing);
					seenIds.add(listing.externalId);
					if (result.isNew) {
						newCount++;
						console.log(
							`[cron] novo imóvel: ${listing.title} — ${listing.url}`,
						);
					}
				});
				return { scraper, seenIds, newCount };
			} catch (err) {
				console.error(`[cron] fonte ${scraper.source} falhou:`, err);
				return null;
			}
		}),
	);

	for (const entry of scraped) {
		if (!entry) continue;
		const { scraper, seenIds, newCount } = entry;
		const inactivated = markGoneListingsInactive(scraper.source, seenIds);
		console.log(
			`[cron] ${scraper.source}: ${seenIds.size} coletados (≤R$700k), ${newCount} novos, ${inactivated} marcados inativos`,
		);
	}

	await enrichListingsWithMaps();

	console.log(
		`[cron] coleta concluída em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
	);
}
