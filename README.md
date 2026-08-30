# Caucaia Imóveis

Scraper + UI pra achar casa/terreno em Caucaia-CE, perto da praia (carro/a pé) e de mercado, farmácia, hospital, padaria.

## Stack

- **Bun** — runtime, `bun:sqlite`, `Bun.cron`, `Bun.WebView` (scrape de sites CSR)
- **TanStack Start** (React, file-based routing) + **TanStack CLI**
- **shadcn/ui** (Base UI, style `base-nova`) + Tailwind v4
- **Leaflet / react-leaflet** — mapa (UI, grátis)
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
DATABASE_PATH=./data/caucaia-imoveis.sqlite
```

## Comandos

```bash
bun run dev        # servidor local (porta 3000)
bun run scrape      # roda scrape + enriquecimento (Maps) uma vez, popula o SQLite
bun run build       # build produção
bun run check        # biome (lint + format)
```

Cron diário (`src/server/cron/schedule.ts`, `Bun.cron`, 06:00) ainda não está plugado no boot do servidor — rodar `bun run scrape` manualmente até isso ser ligado.

## Fontes (scrapers)

| Fonte | Método | Status |
|---|---|---|
| Ergue Imóveis | sitemap + fetch/parse (Vista CMS, JSON embutido) | ✅ |
| Habitat Imobiliária | `Bun.WebView` (Next.js, dados client-side) | ✅ |
| Tavares Imobiliária | paginação + fetch/parse (ISO-8859-1) | ✅ |
| imoveiscaucaia.com.br | — | ❌ robots.txt bloqueia crawlers não-nomeados |
| Imovelweb | — | ❌ Cloudflare managed challenge |
| ZAP/Viva Real/OLX | — | ❌ Cloudflare, excluídos desde o início |

Detalhes e decisões de design: [CONTEXT.md](CONTEXT.md).

## Dados

SQLite (`data/`, gitignored) com 3 tabelas: `listings` (imóvel, soft-delete via `status`), `price_history` (log de mudança de preço), `listing_places` (tempo de carro/a pé até praia/mercado/farmácia/hospital/padaria, por imóvel).

## UI

`/` — lista todos os imóveis ativos com filtros (tipo, faixa de preço, minutos até a praia, minutos até comodidades) e alternância tabela/mapa.
