import { runScrapeAndEnrich } from "#/server/cron/run";
import { scrapers } from "#/server/scrapers";

const source = process.argv[2];
if (!source) {
	console.error(
		`uso: bun run scrape:one <source>\nfontes disponíveis: ${scrapers.map((s) => s.source).join(", ")}`,
	);
	process.exit(1);
}

await runScrapeAndEnrich(source);
process.exit(0);
