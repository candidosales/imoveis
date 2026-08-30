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
- Fontes finais: Habitat Imobiliária (webview), Ergue Imóveis (fetch+parse), Tavares Imobiliária (fetch+parse). ZAP/Viva Real/OLX excluídos (Cloudflare). Inov9 Imóveis excluído (domínio morto/errado). imoveiscaucaia.com.br excluído (robots.txt bloqueia todo crawler exceto bots de busca nomeados). Imovelweb excluído (Cloudflare managed challenge bloqueia fetch, webview e WebFetch).

- Distância = sempre tempo de deslocamento (carro + a pé), nunca linha reta.
- Google Maps API paga, chave fornecida pelo usuário via `.env`.
- Lista de Fontes definida por pesquisa automática, não fixa pelo usuário.
- Scraper roda recorrente (Bun cron) com persistência em SQLite (bun:sqlite), não é execução única.
- Sem faixa de preço/tamanho fixa no domínio — filtros ajustáveis na UI.
- Uso é local (sem deploy).
- UI usa shadcn com variante Base UI.
