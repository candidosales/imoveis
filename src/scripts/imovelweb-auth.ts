import { AUTH_STATE_PATH, AUTH_TARGET_URL } from "#/server/scrapers/imovelweb";

/**
 * Manual Cloudflare Turnstile solve, one-off — NOT via Playwright. Imovelweb's
 * Turnstile fails even in a headed, human-clicked Playwright window: the
 * browser itself is CDP-automated (`navigator.webdriver` and other
 * automation markers Playwright sets regardless of headless/headed), so the
 * challenge spins forever no matter how many times you click it. Only a
 * genuinely unautomated browser passes.
 *
 * So this solves it in your normal browser instead, and asks you to copy two
 * values out of devtools afterward:
 *   1. the `cf_clearance` cookie's value (Application/Storage → Cookies)
 *   2. your browser's exact `navigator.userAgent`
 * Cloudflare ties `cf_clearance` to the User-Agent that solved it — Crawlee
 * has to present that exact same UA on every request or the cookie gets
 * rejected. Both get saved to `data/imovelweb-auth.json` (gitignored) and
 * used together by the scraper.
 *
 * Run: `bun run imovelweb:auth`. Re-run whenever the imovelweb scraper
 * starts failing again — Cloudflare doesn't publish a fixed clearance TTL.
 */
console.log(`\n1. Abra numa aba normal (não automatizada): ${AUTH_TARGET_URL}`);
console.log(
	"2. Resolva o desafio do Cloudflare até a página de listagens carregar.",
);
console.log(
	"3. Devtools → Application/Storage → Cookies → copie o valor de cf_clearance.",
);
console.log(
	"4. No console do devtools, rode `navigator.userAgent` e copie o resultado.\n",
);

const clearanceValue = prompt("Valor do cookie cf_clearance:")?.trim();
if (!clearanceValue) {
	console.error("Nada colado — abortando.");
	process.exit(1);
}

const userAgent = prompt("navigator.userAgent:")?.trim();
if (!userAgent) {
	console.error("Nada colado — abortando.");
	process.exit(1);
}

const cookie = {
	name: "cf_clearance",
	value: clearanceValue,
	domain: ".imovelweb.com.br",
	path: "/",
	expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
	httpOnly: true,
	secure: true,
	sameSite: "None" as const,
};

await Bun.write(
	AUTH_STATE_PATH,
	JSON.stringify({ cookies: [cookie], userAgent }, null, 2),
);
console.log(`Salvo em ${AUTH_STATE_PATH}`);
