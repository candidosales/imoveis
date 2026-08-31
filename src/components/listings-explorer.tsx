import { ClientOnly } from "@tanstack/react-router";
import { Heart, Home, LandPlot, LayoutGrid, Minus, Plus } from "lucide-react";
import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { lazy, Suspense, useMemo, useState } from "react";
import { ListingsTable } from "#/components/listings-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Slider } from "#/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { formatPriceBRL, SOURCE_LABELS } from "#/lib/format";
import type { ImovelType, ListingWithPlaces } from "#/server/db/types";
import { setFavorite } from "#/server/functions/set-favorite";

const PRICE_HISTOGRAM_BUCKETS = 24;

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
	const [view, setView] = useQueryState(
		"view",
		parseAsStringLiteral(["tabela", "mapa"] as const).withDefault("tabela"),
	);
	const [type, setType] = useQueryState(
		"tipo",
		parseAsStringLiteral(["todos", "casa", "terreno"] as const).withDefault(
			"todos",
		),
	);
	const [bedrooms, setBedrooms] = useQueryState(
		"quartos",
		parseAsString.withDefault(BEDROOMS_TODOS),
	);
	const [praiaMaxMin, setPraiaMaxMin] = useQueryState(
		"praia",
		parseAsInteger.withDefault(PRAIA_MAX_DEFAULT),
	);
	const [comodidadeMaxMin, setComodidadeMaxMin] = useQueryState(
		"comodidade",
		parseAsInteger.withDefault(COMODIDADE_MAX_DEFAULT),
	);

	const sourceOptions = useMemo(() => {
		return Array.from(new Set(listings.map((l) => l.source))).sort();
	}, [listings]);
	const [sources, setSources] = useQueryState(
		"fontes",
		parseAsArrayOf(parseAsString).withDefault(sourceOptions),
	);

	const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
		() => new Set(listings.filter((l) => l.favorite).map((l) => l.id)),
	);
	const [favoritesOnly, setFavoritesOnly] = useQueryState(
		"favoritos",
		parseAsBoolean.withDefault(false),
	);

	function toggleFavorite(id: string) {
		setFavoriteIds((prev) => {
			const next = new Set(prev);
			const favorite = !next.has(id);
			if (favorite) next.add(id);
			else next.delete(id);
			setFavorite({ data: { id, favorite } }).catch((err) => {
				console.error("falha ao salvar favorito", err);
			});
			return next;
		});
	}

	const bedroomsOptions = useMemo(() => {
		const values = listings
			.map((l) => l.bedrooms)
			.filter((b): b is number => b !== null && b > 0);
		return Array.from(new Set(values)).sort((a, b) => a - b);
	}, [listings]);

	const bedroomsSteps = useMemo(
		() => [BEDROOMS_TODOS, ...bedroomsOptions.map(String)],
		[bedroomsOptions],
	);
	const bedroomsIndex = Math.max(0, bedroomsSteps.indexOf(bedrooms));

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

	const defaultPriceRange = useMemo<[number, number]>(
		() => [priceBounds.min, priceBounds.max],
		[priceBounds],
	);
	const [priceRange, setPriceRange] = useQueryState(
		"preco",
		parseAsArrayOf(parseAsInteger).withDefault(defaultPriceRange),
	);

	const priceHistogram = useMemo(() => {
		const span = priceBounds.max - priceBounds.min;
		const buckets = new Array(PRICE_HISTOGRAM_BUCKETS).fill(0);
		if (span <= 0) return buckets;
		for (const l of listings) {
			if (l.priceCents === null) continue;
			if (type !== "todos" && l.type !== type) continue;
			const clamped = Math.min(l.priceCents, priceBounds.max);
			const bucket = Math.min(
				PRICE_HISTOGRAM_BUCKETS - 1,
				Math.floor(
					((clamped - priceBounds.min) / span) * PRICE_HISTOGRAM_BUCKETS,
				),
			);
			if (bucket >= 0) buckets[bucket]++;
		}
		return buckets;
	}, [listings, priceBounds, type]);
	const priceHistogramScaled = priceHistogram.map((c) => Math.sqrt(c));
	const priceHistogramMax = Math.max(1, ...priceHistogramScaled);

	const filtered = useMemo(() => {
		return listings.filter((l) => {
			if (l.status !== "ativo") return false;
			if (type !== "todos" && l.type !== type) return false;
			if (!sources.includes(l.source)) return false;
			if (favoritesOnly && !favoriteIds.has(l.id)) return false;
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
	}, [
		listings,
		type,
		sources,
		favoritesOnly,
		favoriteIds,
		bedrooms,
		priceRange,
		praiaMaxMin,
		comodidadeMaxMin,
	]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-5 rounded-lg border p-4">
				<div className="flex flex-wrap items-start justify-between gap-6">
					<div className="flex flex-wrap items-start gap-6">
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
							<div className="flex items-center gap-3">
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="size-8 rounded-full"
									disabled={bedroomsIndex === 0}
									onClick={() => setBedrooms(bedroomsSteps[bedroomsIndex - 1]!)}
								>
									<Minus className="size-4" />
								</Button>
								<span className="min-w-20 text-center text-sm">
									{bedrooms === BEDROOMS_TODOS
										? "Todos"
										: `${bedrooms} ${bedrooms === "1" ? "quarto" : "quartos"}`}
								</span>
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="size-8 rounded-full"
									disabled={bedroomsIndex === bedroomsSteps.length - 1}
									onClick={() => setBedrooms(bedroomsSteps[bedroomsIndex + 1]!)}
								>
									<Plus className="size-4" />
								</Button>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								Fonte
							</span>
							<ToggleGroup
								value={sources}
								onValueChange={(v) => setSources(v as string[])}
								variant="outline"
							>
								{sourceOptions.map((source) => (
									<ToggleGroupItem key={source} value={source}>
										{SOURCE_LABELS[source] ?? source}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								&nbsp;
							</span>
							<Button
								type="button"
								variant={favoritesOnly ? "default" : "outline"}
								className="gap-1.5"
								onClick={() => setFavoritesOnly((v) => !v)}
							>
								<Heart
									className={favoritesOnly ? "size-4 fill-current" : "size-4"}
								/>
								Favoritos
							</Button>
						</div>
					</div>

					<div className="flex items-center gap-3">
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

				<div className="grid grid-cols-1 gap-6 border-t pt-5 sm:grid-cols-3">
					<div className="flex flex-col gap-2 sm:col-span-1">
						<span className="text-xs font-medium text-muted-foreground">
							Preço
						</span>
						<div className="flex h-12 items-end gap-px">
							{priceHistogramScaled.map((count, i) => (
								<div
									key={i}
									className="flex-1 rounded-sm bg-primary/60"
									style={{
										height: `${Math.max(6, (count / priceHistogramMax) * 100)}%`,
									}}
								/>
							))}
						</div>
						<Slider
							min={priceBounds.min}
							max={priceBounds.max}
							value={priceRange}
							onValueChange={(v) => setPriceRange(v as [number, number])}
						/>
						<div className="flex items-center justify-between gap-3 pt-1">
							<div className="flex flex-col items-center gap-1">
								<span className="text-[11px] text-muted-foreground">
									Mínimo
								</span>
								<span className="rounded-full border px-3 py-1 text-sm">
									{formatPriceBRL(priceRange[0])}
								</span>
							</div>
							<div className="flex flex-col items-center gap-1">
								<span className="text-[11px] text-muted-foreground">
									Máximo
								</span>
								<span className="rounded-full border px-3 py-1 text-sm">
									{priceRange[1] >= priceBounds.max
										? `${formatPriceBRL(priceRange[1])}+`
										: formatPriceBRL(priceRange[1])}
								</span>
							</div>
						</div>
					</div>

					<div className="flex flex-col justify-center gap-2 sm:col-span-1">
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

					<div className="flex flex-col justify-center gap-2 sm:col-span-1">
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
				</div>
			</div>

			{view === "tabela" ? (
				<ListingsTable
					listings={filtered}
					favoriteIds={favoriteIds}
					onToggleFavorite={toggleFavorite}
				/>
			) : (
				<ClientOnly fallback={<MapLoading />}>
					<Suspense fallback={<MapLoading />}>
						<ListingsMap
							listings={filtered}
							favoriteIds={favoriteIds}
							onToggleFavorite={toggleFavorite}
						/>
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
