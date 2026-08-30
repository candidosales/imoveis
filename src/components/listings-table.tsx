import { Badge } from "#/components/ui/badge";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	formatAreaM2,
	formatMinutes,
	formatPriceBRL,
	formatPricePerM2,
} from "#/lib/format";
import type { ListingWithPlaces } from "#/server/db/types";

export function ListingsTable({ listings }: { listings: ListingWithPlaces[] }) {
	if (listings.length === 0) {
		return (
			<p className="p-8 text-center text-sm text-muted-foreground">
				Nenhum imóvel encontrado com esses filtros.
			</p>
		);
	}

	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Foto</TableHead>
						<TableHead>Imóvel</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>Preço</TableHead>
						<TableHead>Área</TableHead>
						<TableHead>Valor/m²</TableHead>
						<TableHead>Quartos</TableHead>
						<TableHead>Bairro</TableHead>
						<TableHead>Praia (carro)</TableHead>
						<TableHead>Mercado</TableHead>
						<TableHead>Farmácia</TableHead>
						<TableHead>Hospital</TableHead>
						<TableHead>Padaria</TableHead>
						<TableHead>Fonte</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{listings.map((l) => (
						<TableRow key={l.id}>
							<TableCell>
								<ListingThumbnail listing={l} />
							</TableCell>
							<TableCell className="max-w-64 truncate font-medium">
								<a
									href={l.url}
									target="_blank"
									rel="noreferrer"
									className="hover:underline"
								>
									{l.title}
								</a>
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									className={
										l.type === "casa"
											? "border-blue-200 bg-blue-50 text-blue-700"
											: "border-amber-200 bg-amber-50 text-amber-700"
									}
								>
									{l.type}
								</Badge>
							</TableCell>
							<TableCell>{formatPriceBRL(l.priceCents)}</TableCell>
							<TableCell>
								{formatAreaM2(
									l.type === "terreno"
										? (l.lotAreaM2 ?? l.builtAreaM2)
										: (l.builtAreaM2 ?? l.lotAreaM2),
								)}
							</TableCell>
							<TableCell>
								{formatPricePerM2(
									l.priceCents,
									l.type === "terreno"
										? (l.lotAreaM2 ?? l.builtAreaM2)
										: (l.builtAreaM2 ?? l.lotAreaM2),
								)}
							</TableCell>
							<TableCell>{l.bedrooms ?? "—"}</TableCell>
							<TableCell>{l.neighborhood ?? "—"}</TableCell>
							<TableCell>
								{formatMinutes(l.places.praia?.driveMinutes)}
							</TableCell>
							<TableCell>
								{formatMinutes(l.places.mercado?.driveMinutes)}
							</TableCell>
							<TableCell>
								{formatMinutes(l.places.farmacia?.driveMinutes)}
							</TableCell>
							<TableCell>
								{formatMinutes(l.places.hospital?.driveMinutes)}
							</TableCell>
							<TableCell>
								{formatMinutes(l.places.padaria?.driveMinutes)}
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{l.source}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
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
