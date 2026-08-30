import { ergueScraper } from "#/server/scrapers/ergue";
import { habitatScraper } from "#/server/scrapers/habitat";
import { olxScraper } from "#/server/scrapers/olx";
import { tavaresScraper } from "#/server/scrapers/tavares";
import type { SiteScraper } from "#/server/scrapers/types";
import { vivarealScraper } from "#/server/scrapers/vivareal";
import { zapScraper } from "#/server/scrapers/zap";

export const scrapers: SiteScraper[] = [
	ergueScraper,
	habitatScraper,
	tavaresScraper,
	zapScraper,
	vivarealScraper,
	olxScraper,
];
