import { AUTH_STATE_PATH } from "#/server/scrapers/facebook";

/**
 * Facebook Marketplace requires a logged-in session for search/detail pages
 * and aggressively flags automated logins (checkpoint/2FA/ban) — so, unlike
 * the scraper itself, authentication here is never done via Playwright. You
 * log in normally in your own browser and paste the session out of devtools
 * instead.
 *
 * The raw `Cookie` request header (not just `c_user`/`xs`) is asked for
 * because Facebook validates several cookies together (`datr`, `sb`, `fr`,
 * etc.) — pasting only the two "session" cookies works sometimes and silently
 * degrades to logged-out rendering other times.
 *
 * Run: `bun run facebook:auth`. Re-run whenever the facebook scraper starts
 * failing/redirecting to login again — Facebook doesn't publish a fixed
 * session TTL, and logging out anywhere invalidates it immediately.
 */
console.log("\n1. Abra facebook.com numa aba normal, logado na sua conta.");
console.log(
	"2. Devtools → Network → clique em qualquer request pra facebook.com → Headers.",
);
console.log(
	'3. Copie o valor completo do header "Cookie" (a linha inteira, com todos os pares nome=valor).',
);
console.log(
	"4. No console do devtools, rode `navigator.userAgent` e copie o resultado.\n",
);

const cookieHeader = prompt("Cookie header completo:")?.trim();
if (!cookieHeader) {
	console.error("Nada colado — abortando.");
	process.exit(1);
}

const userAgent = prompt("navigator.userAgent:")?.trim();
if (!userAgent) {
	console.error("Nada colado — abortando.");
	process.exit(1);
}

const cookies = cookieHeader
	.split(";")
	.map((pair) => pair.trim())
	.filter(Boolean)
	.map((pair) => {
		const idx = pair.indexOf("=");
		return {
			name: pair.slice(0, idx),
			value: pair.slice(idx + 1),
			domain: ".facebook.com",
			path: "/",
			expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
			httpOnly: false,
			secure: true,
			sameSite: "None" as const,
		};
	});

if (
	!cookies.some((c) => c.name === "c_user") ||
	!cookies.some((c) => c.name === "xs")
) {
	console.error(
		'Cookie header colado não tem "c_user" ou "xs" — confere se copiou o header certo (de um request pra facebook.com, não outro domínio).',
	);
	process.exit(1);
}

await Bun.write(
	AUTH_STATE_PATH,
	JSON.stringify({ cookies, userAgent }, null, 2),
);
console.log(`Salvo em ${AUTH_STATE_PATH}`);
