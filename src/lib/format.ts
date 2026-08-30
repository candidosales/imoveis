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
