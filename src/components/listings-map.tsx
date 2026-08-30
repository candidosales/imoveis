import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatMinutes, formatPriceBRL } from "#/lib/format";
import type { ListingWithPlaces } from "#/server/db/types";

const icon = L.icon({
	iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
	iconRetinaUrl:
		"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
	shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41],
});

const CAUCAIA_CENTER: [number, number] = [-3.7361, -38.6531];

/**
 * Default export so callers can `React.lazy(() => import(...))` this — leaflet
 * touches `window` at module load time, which crashes SSR if imported statically.
 */
export default function ListingsMap({
	listings,
}: {
	listings: ListingWithPlaces[];
}) {
	const withCoords = listings.filter(
		(l): l is ListingWithPlaces & { lat: number; lng: number } =>
			l.lat !== null && l.lng !== null,
	);

	return (
		<div className="h-[600px] overflow-hidden rounded-lg border">
			<MapContainer center={CAUCAIA_CENTER} zoom={12} className="h-full w-full">
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				{withCoords.map((l) => (
					<Marker key={l.id} position={[l.lat, l.lng]} icon={icon}>
						<Popup>
							<div className="flex flex-col gap-1">
								<a
									href={l.url}
									target="_blank"
									rel="noreferrer"
									className="font-medium hover:underline"
								>
									{l.title}
								</a>
								<span>{formatPriceBRL(l.priceCents)}</span>
								<span className="text-xs text-muted-foreground">
									Praia: {formatMinutes(l.places.praia?.driveMinutes)} de carro
								</span>
								{!l.addressPrecise && (
									<span className="text-xs text-muted-foreground">
										Localização aproximada (bairro)
									</span>
								)}
							</div>
						</Popup>
					</Marker>
				))}
			</MapContainer>
		</div>
	);
}
