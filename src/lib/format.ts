export const SOURCE_LABELS: Record<string, string> = {
	zap: "ZAP",
	vivareal: "Viva Real",
	olx: "OLX",
	ergue: "Ergue",
	habitat: "Habitat",
	tavares: "Tavares",
};

export const SOURCE_ICONS: Record<string, string> = {
	zap: "/icons/sources/zap.png",
	vivareal: "/icons/sources/vivareal.png",
	olx: "/icons/sources/olx.png",
	ergue: "/icons/sources/ergue.webp",
	habitat: "/icons/sources/habitat.webp",
	tavares: "/icons/sources/tavares.png",
};

export function formatPriceBRL(cents: number | null): string {
	if (cents === null) return "Sob consulta";
	return (cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

export function formatAreaM2(m2: number | null): string {
	if (m2 === null) return "—";
	return `${m2.toLocaleString("pt-BR")} m²`;
}

export function formatPricePerM2(
	priceCents: number | null,
	m2: number | null,
): string {
	if (priceCents === null || m2 === null || m2 === 0) return "—";
	return formatPriceBRL(priceCents / m2);
}

export function formatMinutes(min: number | null | undefined): string {
	if (min === null || min === undefined) return "—";
	return `${min} min`;
}
