import type { ScrapedListing } from "#/server/db/types";

export interface SiteScraper {
  source: string;
  scrape(onListing: (listing: ScrapedListing) => void): Promise<ScrapedListing[]>;
}
