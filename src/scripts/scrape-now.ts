import { runScrapeAndEnrich } from "#/server/cron/run";

await runScrapeAndEnrich();
process.exit(0);
