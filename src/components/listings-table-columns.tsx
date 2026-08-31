import {
	type ColumnDef,
	columnVisibilityFeature,
	createPaginatedRowModel,
	createSortedRowModel,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from "@tanstack/react-table";
import { ArrowUpDown, Heart } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "#/components/ui/carousel";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	formatAreaM2,
	formatMinutes,
	formatPriceBRL,
	formatPricePerM2,
} from "#/lib/format";
import type { ListingWithPlaces } from "#/server/db/types";

export const listingsTableFeatures = tableFeatures({
	rowSortingFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	sortedRowModel: createSortedRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	columnMeta: {} as { label: string; cellClassName?: string },
});

export type ListingsTableFeatures = typeof listingsTableFeatures;

function areaOf(l: ListingWithPlaces) {
	return l.type === "terreno"
		? (l.lotAreaM2 ?? l.builtAreaM2)
		: (l.builtAreaM2 ?? l.lotAreaM2);
}

function pricePerM2Of(l: ListingWithPlaces) {
	const area = areaOf(l);
	if (l.priceCents === null || area === null || area === 0) return null;
	return l.priceCents / area;
}

function SortableHeader({
	label,
	column,
}: {
	label: string;
	column: {
		toggleSorting: (desc?: boolean) => void;
		getIsSorted: () => false | "asc" | "desc";
	};
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="-ml-2.5 h-7 gap-1 px-2.5"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{label}
			<ArrowUpDown className="size-3.5" />
		</Button>
	);
}

function ListingThumbnail({ listing }: { listing: ListingWithPlaces }) {
	if (listing.photos.length === 0) {
		return <div className="h-12 w-16 rounded bg-muted" />;
	}

	return (
		<Dialog>
			<DialogTrigger className="block h-12 w-16 overflow-hidden rounded">
				<img
					src={listing.photos[0]}
					alt={listing.title}
					className="h-full w-full object-cover"
					referrerPolicy="no-referrer"
				/>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogTitle className="sr-only">{listing.title}</DialogTitle>
				<Carousel>
					<CarouselContent>
						{listing.photos.map((photo, i) => (
							<CarouselItem key={photo}>
								<img
									src={photo}
									alt={`${listing.title} — foto ${i + 1}`}
									className="aspect-video w-full rounded-lg object-cover"
									referrerPolicy="no-referrer"
								/>
							</CarouselItem>
						))}
					</CarouselContent>
					{listing.photos.length > 1 && (
						<>
							<CarouselPrevious />
							<CarouselNext />
						</>
					)}
				</Carousel>
			</DialogContent>
		</Dialog>
	);
}

export function createListingColumns({
	favoriteIds,
	onToggleFavorite,
}: {
	favoriteIds: Set<string>;
	onToggleFavorite: (id: string) => void;
}): ColumnDef<ListingsTableFeatures, ListingWithPlaces>[] {
	return [
		{
			id: "favorite",
			header: "",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8"
					onClick={() => onToggleFavorite(row.original.id)}
				>
					<Heart
						className={
							favoriteIds.has(row.original.id)
								? "size-4 fill-red-500 text-red-500"
								: "size-4"
						}
					/>
				</Button>
			),
		},
		{
			id: "photo",
			header: "Foto",
			enableSorting: false,
			cell: ({ row }) => <ListingThumbnail listing={row.original} />,
			meta: { label: "Foto" },
		},
		{
			id: "title",
			accessorKey: "title",
			header: ({ column }) => (
				<SortableHeader label="Imóvel" column={column} />
			),
			cell: ({ row }) => (
				<a
					href={row.original.url}
					target="_blank"
					rel="noreferrer"
					className="hover:underline"
				>
					{row.original.title}
				</a>
			),
			meta: {
				label: "Imóvel",
				cellClassName: "max-w-64 truncate font-medium",
			},
		},
		{
			id: "type",
			accessorKey: "type",
			header: ({ column }) => <SortableHeader label="Tipo" column={column} />,
			meta: { label: "Tipo" },
			cell: ({ getValue }) => {
				const type = getValue<ListingWithPlaces["type"]>();
				return (
					<Badge
						variant="outline"
						className={
							type === "casa"
								? "border-blue-200 bg-blue-50 text-blue-700"
								: "border-amber-200 bg-amber-50 text-amber-700"
						}
					>
						{type}
					</Badge>
				);
			},
		},
		{
			id: "price",
			accessorFn: (l) => l.priceCents,
			header: ({ column }) => (
				<SortableHeader label="Preço" column={column} />
			),
			meta: { label: "Preço" },
			cell: ({ getValue }) => formatPriceBRL(getValue<number | null>()),
		},
		{
			id: "area",
			accessorFn: areaOf,
			header: ({ column }) => <SortableHeader label="Área" column={column} />,
			meta: { label: "Área" },
			cell: ({ getValue }) => formatAreaM2(getValue<number | null>()),
		},
		{
			id: "pricePerM2",
			accessorFn: pricePerM2Of,
			header: ({ column }) => (
				<SortableHeader label="Valor/m²" column={column} />
			),
			meta: { label: "Valor/m²" },
			cell: ({ row }) =>
				formatPricePerM2(row.original.priceCents, areaOf(row.original)),
		},
		{
			id: "bedrooms",
			accessorKey: "bedrooms",
			header: ({ column }) => (
				<SortableHeader label="Quartos" column={column} />
			),
			meta: { label: "Quartos" },
			cell: ({ getValue }) => getValue<number | null>() ?? "—",
		},
		{
			id: "neighborhood",
			accessorKey: "neighborhood",
			header: ({ column }) => (
				<SortableHeader label="Bairro" column={column} />
			),
			meta: { label: "Bairro" },
			cell: ({ getValue }) => getValue<string | null>() ?? "—",
		},
		{
			id: "praia",
			accessorFn: (l) => l.places.praia?.driveMinutes ?? null,
			header: ({ column }) => (
				<SortableHeader label="Praia (carro)" column={column} />
			),
			meta: { label: "Praia (carro)" },
			cell: ({ getValue }) => formatMinutes(getValue<number | null>()),
		},
		{
			id: "mercado",
			accessorFn: (l) => l.places.mercado?.driveMinutes ?? null,
			header: ({ column }) => (
				<SortableHeader label="Mercado" column={column} />
			),
			meta: { label: "Mercado" },
			cell: ({ getValue }) => formatMinutes(getValue<number | null>()),
		},
		{
			id: "farmacia",
			accessorFn: (l) => l.places.farmacia?.driveMinutes ?? null,
			header: ({ column }) => (
				<SortableHeader label="Farmácia" column={column} />
			),
			meta: { label: "Farmácia" },
			cell: ({ getValue }) => formatMinutes(getValue<number | null>()),
		},
		{
			id: "hospital",
			accessorFn: (l) => l.places.hospital?.driveMinutes ?? null,
			header: ({ column }) => (
				<SortableHeader label="Hospital" column={column} />
			),
			meta: { label: "Hospital" },
			cell: ({ getValue }) => formatMinutes(getValue<number | null>()),
		},
		{
			id: "padaria",
			accessorFn: (l) => l.places.padaria?.driveMinutes ?? null,
			header: ({ column }) => (
				<SortableHeader label="Padaria" column={column} />
			),
			meta: { label: "Padaria" },
			cell: ({ getValue }) => formatMinutes(getValue<number | null>()),
		},
		{
			id: "source",
			accessorKey: "source",
			header: ({ column }) => (
				<SortableHeader label="Fonte" column={column} />
			),
			meta: { label: "Fonte" },
			cell: ({ getValue }) => (
				<span className="text-xs text-muted-foreground">
					{getValue<string>()}
				</span>
			),
		},
	];
}
