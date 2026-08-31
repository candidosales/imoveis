# Caucaia Imóveis

Scraper + UI pra achar casa/terreno em Caucaia-CE, perto da praia (carro/a pé) e de mercado, farmácia, hospital, padaria.

## Stack

- **Bun** — runtime, `bun:sqlite`, `Bun.cron`, `Bun.WebView` (scrape de sites CSR)
- **TanStack Start** (React, file-based routing) + **TanStack CLI**
- **shadcn/ui** (Base UI, style `base-nova`) + Tailwind v4
- **@vis.gl/react-google-maps** — mapa (UI)
- **Crawlee + Playwright** — scrape dos portais atrás de Cloudflare (ZAP, Viva Real, OLX)
- **Google Maps Platform** — Geocoding, Places, Distance Matrix (tempos reais de carro/a pé)
- TypeScript em todo o projeto

## Setup

```bash
bun install
cp .env.example .env
```

Preencher `.env`:

```
GOOGLE_MAPS_API_KEY=sua_chave_aqui
VITE_GOOGLE_MAPS_API_KEY=sua_chave_aqui
DATABASE_PATH=./data/caucaia-imoveis.sqlite
```

`VITE_GOOGLE_MAPS_API_KEY` é a mesma chave, exposta pro browser (mapa no client) — restringir por HTTP referrer no Google Cloud Console.

## Comandos

```bash
bun run dev        # servidor local (porta 3000)
bun run scrape      # roda scrape + enriquecimento (Maps) uma vez, popula o SQLite
bun run build       # build produção
bun run lint        # biome lint
bun run format      # biome format
bun run check       # biome (lint + format)
```

Cron diário (`src/server/cron/schedule.ts`, `Bun.cron`, 06:00) ainda não está plugado no boot do servidor — rodar `bun run scrape` manualmente até isso ser ligado.

## Fontes (scrapers)

| Fonte | Método | Status |
|---|---|---|
| Ergue Imóveis | sitemap + fetch/parse (Vista CMS, JSON embutido) | ✅ |
| Habitat Imobiliária | `Bun.WebView` (Next.js, dados client-side) | ✅ |
| Tavares Imobiliária | paginação + fetch/parse (ISO-8859-1) | ✅ |
| ZAP Imóveis | Crawlee/Playwright (Cloudflare managed challenge) | ✅ |
| Viva Real | Crawlee/Playwright (Cloudflare managed challenge) | ✅ |
| OLX | Crawlee/Playwright (JSON via RSC/Next.js) | ✅ |
| imoveiscaucaia.com.br | — | ❌ robots.txt bloqueia crawlers não-nomeados |
| Imovelweb | — | ❌ Cloudflare managed challenge bloqueia fetch, webview e WebFetch |
| Inov9 Imóveis | — | ❌ domínio morto/errado |

Detalhes e decisões de design: [CONTEXT.md](CONTEXT.md).

## Dados

SQLite (`data/`, gitignored) com 3 tabelas: `listings` (imóvel, soft-delete via `status`), `price_history` (log de mudança de preço), `listing_places` (tempo de carro/a pé até praia/mercado/farmácia/hospital/padaria, por imóvel).

## UI

`/` — lista todos os imóveis ativos com filtros (tipo, faixa de preço, minutos até a praia, minutos até comodidades), alternância tabela/mapa, favoritar e dispensar (`dismiss`) imóvel, e ícone da Fonte por listing.
