import type { ScrapedListing } from "#/server/db/types";

export interface SiteScraper {
  source: string;
  scrape(): Promise<ScrapedListing[]>;
}
