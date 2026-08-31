# Caucaia Imóveis

Ferramenta pessoal pra buscar Imóveis (casa/terreno) à venda em Caucaia-CE, agregando dados de imobiliárias locais e avaliando proximidade a praia e comodidades.

## Language

**Imóvel (Listing)**:
Um anúncio de casa ou terreno à venda, coletado de um site de imobiliária. Apartamentos ficam fora do escopo.
_Avoid_: Property, anúncio (usar Imóvel como termo canônico no domínio; "anúncio" só ao falar do post original no site fonte)

**Fonte (Source)**:
Site de imobiliária de onde um Imóvel foi coletado. Grandes portais nacionais (ZAP, Viva Real, OLX) ficam fora por bloqueio Cloudflare; prioridade pra imobiliárias locais de Caucaia + Imovelweb.

**Tempo até a Praia**:
Duração de deslocamento (carro e a pé, via Google Maps Distance Matrix) de um Imóvel até o ponto de praia de referência. Não é distância em km — é tempo.
_Avoid_: Distância da praia

**Comodidade (Amenity)**:
Mercado, farmácia, hospital ou padaria mais próximo de um Imóvel, localizado via Google Places API e medido por tempo de deslocamento (carro/a pé), igual Tempo até a Praia.

**Praia de Referência**:
A praia mais próxima do Imóvel, resolvida via Google Places API nearest search — não é uma praia fixa escolhida manualmente.

**Status do Imóvel**:
Ativo ou Inativo. Um Imóvel vira Inativo (soft delete) quando some do site Fonte; nunca é apagado do banco, preservando histórico de preço.

## Decisions log (grilling session)

- Praia de Referência sempre via Places API nearest search (não fixa).
- Scraping híbrido: fetch+parse HTML nos sites server-rendered, bun webview só nos JS-pesados.
- Cron 1x/dia.
- App único (cron scheduler + servidor web no mesmo processo Bun, SQLite compartilhado).
- Mapa da UI usa Leaflet+OSM (display only); cálculos de distância continuam via Google Maps API no backend.
- Fotos: guarda só URL da Fonte, sem cache local.
- Sem score composto — UI mostra colunas ordenáveis/filtráveis (tempo praia, tempo comodidades) e usuário decide.
- Sem dedup automático entre Fontes diferentes (evita falso positivo); cada listing por Fonte é registro independente.
- Endereço sem rua (só bairro): geocodifica pelo centro do bairro e marca `endereco_preciso: false`.
- Sem notificação externa — log no terminal ao rodar o cron basta.
- Fontes finais: Habitat Imobiliária (webview), Ergue Imóveis (fetch+parse), Tavares Imobiliária (fetch+parse), ZAP e Viva Real (Crawlee/Playwright — passam pelo Cloudflare managed challenge sem stealth extra, ao contrário do Bun.WebView; scrape por página de busca + página de detalhe), OLX (Crawlee/Playwright — mesmo bypass; dados completos já vêm no JSON da página de busca (RSC/Next.js), sem precisar visitar página de detalhe; filtro obrigatório por `locationDetails.municipality === "Caucaia"` pois o path `/caucaia` da URL não restringe a busca de fato). Luciano Cavalcante Imóveis (Crawlee/Playwright; JSON-LD "RealEstateListing" completo já vem server-rendered em cada página de detalhe, sem precisar de RSC/JS parsing; URLs descobertas via sitemap.xml do site, filtrando os sub-sitemaps `a-venda/casa/caucaia.xml` e `a-venda/terreno/caucaia.xml`; **exceção deliberada**: robots.txt bloqueia `/` pra user-agents não nomeados igual imoveiscaucaia.com.br, mas essa fonte foi scrapeada mesmo assim por decisão explícita do usuário). Inov9 Imóveis excluído (domínio morto/errado). imoveiscaucaia.com.br excluído (robots.txt bloqueia todo crawler exceto bots de busca nomeados). Imovelweb excluído (Cloudflare managed challenge bloqueia fetch, webview e WebFetch).

- Distância = sempre tempo de deslocamento (carro + a pé), nunca linha reta.
- Google Maps API paga, chave fornecida pelo usuário via `.env`.
- Lista de Fontes definida por pesquisa automática, não fixa pelo usuário.
- Scraper roda recorrente (Bun cron) com persistência em SQLite (bun:sqlite), não é execução única.
- Teto fixo de R$700.000 aplicado em todas as Fontes (scraper descarta acima disso; imóveis já no banco que excedem o teto saem de "seenIds" e viram Inativo no próximo cron). Sem faixa de tamanho fixa — esse filtro fica na UI.
- Uso é local (sem deploy).
- UI usa shadcn com variante Base UI.
