import { runScrapeAndEnrich } from "#/server/cron/run";

/** Roda a coleta 1x/dia às 06:00 (horário local do processo). */
export function scheduleDailyScrape(): void {
  Bun.cron("0 6 * * *", async () => {
    await runScrapeAndEnrich();
  });
  console.log("[cron] agendado: coleta diária às 06:00");
}
