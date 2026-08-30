import { ergueScraper } from "#/server/scrapers/ergue";
import { habitatScraper } from "#/server/scrapers/habitat";
import { tavaresScraper } from "#/server/scrapers/tavares";
import type { SiteScraper } from "#/server/scrapers/types";

export const scrapers: SiteScraper[] = [
	ergueScraper,
	habitatScraper,
	tavaresScraper,
];
