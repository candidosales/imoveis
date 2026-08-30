const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 CaucaiaImoveisBot/1.0 (uso pessoal)";

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Politeness delay between requests to the same host, so scrapers don't hammer small sites. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a JSON object embedded inside an escaped JS string (e.g. React Server
 * Components streaming payloads: `self.__next_f.push([1,"...\"key\":\"value\"..."])`).
 * Scans from `startIndex` (which must point at the opening `{`) counting brace depth,
 * then un-escapes `\"` before JSON.parse.
 */
export function extractEscapedJsonObject(text: string, startIndex: number): unknown {
  let depth = 0;
  let end = -1;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Objeto JSON não fechado (brace incompleto)");
  const raw = text.slice(startIndex, end).replace(/\\"/g, '"');
  return JSON.parse(raw);
}
