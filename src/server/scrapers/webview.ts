/**
 * Renders a JS-heavy (client-side-rendered) listing page in a headless
 * WKWebView/Chromium instance and returns the fully rendered HTML.
 * Reserved for sources whose listing data isn't present in the raw HTTP
 * response (see CONTEXT.md: scraping híbrido).
 */
export async function fetchRenderedHtml(url: string, waitMs = 1500): Promise<string> {
  await using view = new Bun.WebView({ width: 1280, height: 2000 });
  await view.navigate(url);
  await Bun.sleep(waitMs);
  const html = await view.evaluate("document.documentElement.outerHTML");
  return html as string;
}
