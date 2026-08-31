export const BEDROOMS_TODOS = "todos";
export const PRAIA_MAX_DEFAULT = 30;
export const COMODIDADE_MAX_DEFAULT = 15;

export type ListingsSearch = {
	view: "tabela" | "mapa";
	tipo: "todos" | "casa" | "terreno";
	quartos: string;
	praia: number;
	comodidade: number;
	fontes?: string[];
	favoritos: boolean;
	descartados: boolean;
	preco?: [number, number];
	pagina: number;
};

export function validateListingsSearch(
	search: Record<string, unknown>,
): ListingsSearch {
	return {
		view: search.view === "mapa" ? "mapa" : "tabela",
		tipo:
			search.tipo === "casa" || search.tipo === "terreno"
				? search.tipo
				: "todos",
		quartos: typeof search.quartos === "string" ? search.quartos : BEDROOMS_TODOS,
		praia: typeof search.praia === "number" ? search.praia : PRAIA_MAX_DEFAULT,
		comodidade:
			typeof search.comodidade === "number"
				? search.comodidade
				: COMODIDADE_MAX_DEFAULT,
		fontes: Array.isArray(search.fontes)
			? search.fontes.filter((s): s is string => typeof s === "string")
			: undefined,
		favoritos: search.favoritos === true,
		descartados: search.descartados === true,
		preco:
			Array.isArray(search.preco) &&
			search.preco.length === 2 &&
			typeof search.preco[0] === "number" &&
			typeof search.preco[1] === "number"
				? [search.preco[0], search.preco[1]]
				: undefined,
		pagina:
			typeof search.pagina === "number" && search.pagina > 0
				? search.pagina
				: 1,
	};
}
