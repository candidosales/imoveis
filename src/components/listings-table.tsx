import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { formatMinutes, formatPriceBRL } from "#/lib/format";
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
						<TableHead>Imóvel</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>Preço</TableHead>
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
								<Badge variant="outline">{l.type}</Badge>
							</TableCell>
							<TableCell>{formatPriceBRL(l.priceCents)}</TableCell>
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
