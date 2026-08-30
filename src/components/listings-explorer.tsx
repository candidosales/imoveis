import { ClientOnly } from "@tanstack/react-router";
import { Home, LandPlot, LayoutGrid } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { ListingsTable } from "#/components/listings-table";
import { Badge } from "#/components/ui/badge";
import { Slider } from "#/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { formatPriceBRL } from "#/lib/format";
import type { ImovelType, ListingWithPlaces } from "#/server/db/types";

const ListingsMap = lazy(() => import("#/components/listings-map"));

type ViewMode = "tabela" | "mapa";
type TypeFilter = ImovelType | "todos";

const BEDROOMS_TODOS = "todos";

const PRAIA_MAX_DEFAULT = 30;
const COMODIDADE_MAX_DEFAULT = 15;
const PRICE_CAP_CENTS = 700_000_00;

export function ListingsExplorer({
	listings,
}: {
	listings: ListingWithPlaces[];
}) {
	const [view, setView] = useState<ViewMode>("tabela");
	const [type, setType] = useState<TypeFilter>("todos");
	const [bedrooms, setBedrooms] = useState<string>(BEDROOMS_TODOS);
	const [praiaMaxMin, setPraiaMaxMin] = useState(PRAIA_MAX_DEFAULT);
	const [comodidadeMaxMin, setComodidadeMaxMin] = useState(
		COMODIDADE_MAX_DEFAULT,
	);

	const bedroomsOptions = useMemo(() => {
		const values = listings
			.map((l) => l.bedrooms)
			.filter((b): b is number => b !== null && b > 0);
		return Array.from(new Set(values)).sort((a, b) => a - b);
	}, [listings]);

	const priceBounds = useMemo(() => {
		const prices = listings
			.map((l) => l.priceCents)
			.filter((p): p is number => p !== null);
		if (prices.length === 0) return { min: 0, max: PRICE_CAP_CENTS };
		return {
			min: Math.min(...prices),
			max: Math.min(Math.max(...prices), PRICE_CAP_CENTS),
		};
	}, [listings]);

	const [priceRange, setPriceRange] = useState<[number, number]>([
		priceBounds.min,
		priceBounds.max,
	]);

	const filtered = useMemo(() => {
		return listings.filter((l) => {
			if (l.status !== "ativo") return false;
			if (type !== "todos" && l.type !== type) return false;
			if (bedrooms !== BEDROOMS_TODOS && l.bedrooms !== Number(bedrooms))
				return false;
			if (
				l.priceCents !== null &&
				(l.priceCents < priceRange[0] || l.priceCents > priceRange[1])
			) {
				return false;
			}
			const praia = l.places.praia?.driveMinutes;
			if (praia !== undefined && praia !== null && praia > praiaMaxMin)
				return false;

			const comodidades = (
				["mercado", "farmacia", "hospital", "padaria"] as const
			)
				.map((k) => l.places[k]?.driveMinutes)
				.filter((m): m is number => m !== undefined && m !== null);
			if (comodidades.length > 0 && Math.max(...comodidades) > comodidadeMaxMin)
				return false;

			return true;
		});
	}, [listings, type, bedrooms, priceRange, praiaMaxMin, comodidadeMaxMin]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-6 rounded-lg border p-4">
				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Tipo
					</span>
					<ToggleGroup
						value={[type]}
						onValueChange={(v) => v[0] && setType(v[0] as TypeFilter)}
						variant="outline"
					>
						<ToggleGroupItem value="todos" className="gap-1.5">
							<LayoutGrid className="size-4" />
							Todos
						</ToggleGroupItem>
						<ToggleGroupItem value="casa" className="gap-1.5">
							<Home className="size-4" />
							Casa
						</ToggleGroupItem>
						<ToggleGroupItem value="terreno" className="gap-1.5">
							<LandPlot className="size-4" />
							Terreno
						</ToggleGroupItem>
					</ToggleGroup>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Quartos
					</span>
					<ToggleGroup
						value={[bedrooms]}
						onValueChange={(v) => v[0] && setBedrooms(v[0])}
						variant="outline"
					>
						<ToggleGroupItem value={BEDROOMS_TODOS}>Todos</ToggleGroupItem>
						{bedroomsOptions.map((n) => (
							<ToggleGroupItem key={n} value={String(n)}>
								{n} {n === 1 ? "quarto" : "quartos"}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				<div className="flex min-w-56 flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Preço: {formatPriceBRL(priceRange[0])} —{" "}
						{formatPriceBRL(priceRange[1])}
					</span>
					<Slider
						min={priceBounds.min}
						max={priceBounds.max}
						value={priceRange}
						onValueChange={(v) => setPriceRange(v as [number, number])}
					/>
				</div>

				<div className="flex min-w-40 flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Até {praiaMaxMin} min da praia
					</span>
					<Slider
						min={5}
						max={60}
						value={praiaMaxMin}
						onValueChange={(v) => setPraiaMaxMin(v as number)}
					/>
				</div>

				<div className="flex min-w-40 flex-col gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Até {comodidadeMaxMin} min de mercado/farmácia/hospital/padaria
					</span>
					<Slider
						min={5}
						max={30}
						value={comodidadeMaxMin}
						onValueChange={(v) => setComodidadeMaxMin(v as number)}
					/>
				</div>

				<div className="ml-auto flex items-center gap-3">
					<Badge variant="secondary">{filtered.length} imóveis</Badge>
					<ToggleGroup
						value={[view]}
						onValueChange={(v) => v[0] && setView(v[0] as ViewMode)}
						variant="outline"
					>
						<ToggleGroupItem value="tabela">Tabela</ToggleGroupItem>
						<ToggleGroupItem value="mapa">Mapa</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>

			{view === "tabela" ? (
				<ListingsTable listings={filtered} />
			) : (
				<ClientOnly fallback={<MapLoading />}>
					<Suspense fallback={<MapLoading />}>
						<ListingsMap listings={filtered} />
					</Suspense>
				</ClientOnly>
			)}
		</div>
	);
}

function MapLoading() {
	return (
		<div className="flex h-150 items-center justify-center rounded-lg border text-sm text-muted-foreground">
			Carregando mapa…
		</div>
	);
}
