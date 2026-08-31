import {
	AdvancedMarker,
	APIProvider,
	Map as GoogleMap,
	InfoWindow,
} from "@vis.gl/react-google-maps";
import { EyeOff, Heart, PersonStanding } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	formatMinutes,
	formatPriceBRL,
	SOURCE_LABELS,
	streetViewUrl,
} from "#/lib/format";
import type { ListingWithPlaces } from "#/server/db/types";

const CAUCAIA_CENTER = { lat: -3.7361, lng: -38.6531 };

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
	| string
	| undefined;

/**
 * Default export so callers can `React.lazy(() => import(...))` this — the
 * Maps JS API loader touches `window`/`document` at load time, which crashes
 * SSR if imported statically (same reason the prior Leaflet map was default-
 * exported and lazy-loaded).
 */
export default function ListingsMap({
	listings,
	favoriteIds,
	onToggleFavorite,
	dismissedIds,
	onToggleDismiss,
}: {
	listings: ListingWithPlaces[];
	favoriteIds: Set<string>;
	onToggleFavorite: (id: string) => void;
	dismissedIds: Set<string>;
	onToggleDismiss: (id: string) => void;
}) {
	const [openId, setOpenId] = useState<string | null>(null);

	const withCoords = listings.filter(
		(l): l is ListingWithPlaces & { lat: number; lng: number } =>
			l.lat !== null && l.lng !== null,
	);

	if (!GOOGLE_MAPS_API_KEY) {
		return (
			<div className="flex h-150 items-center justify-center rounded-lg border text-sm text-muted-foreground">
				VITE_GOOGLE_MAPS_API_KEY não configurada.
			</div>
		);
	}

	const active = withCoords.find((l) => l.id === openId) ?? null;

	return (
		<div className="h-150 overflow-hidden rounded-lg border">
			<APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
				<GoogleMap
					// "DEMO_MAP_ID" is Google's documented placeholder for AdvancedMarker
					// when no real Map ID has been created in Cloud Console — renders
					// fine, just without custom vector map styling.
					mapId="DEMO_MAP_ID"
					defaultCenter={CAUCAIA_CENTER}
					defaultZoom={12}
					gestureHandling="greedy"
					disableDefaultUI={false}
					className="h-full w-full"
				>
					{withCoords.map((l) => (
						<AdvancedMarker
							key={l.id}
							position={{ lat: l.lat, lng: l.lng }}
							onClick={() => setOpenId(l.id)}
						>
							{/* Plain marker div instead of the library's <Pin>: Pin renders a
							google.maps.marker.PinElement custom element that throws on any
							unrecognized property, and TanStack Devtools' dev-mode JSX
							instrumentation injects a data-tsd-source prop onto every element. */}
							<div
								className="size-4 rounded-full border-2 border-white shadow"
								style={{
									backgroundColor: dismissedIds.has(l.id)
										? "#9ca3af"
										: l.type === "casa"
											? "#2563eb"
											: "#d97706",
									opacity: dismissedIds.has(l.id) ? 0.5 : 1,
								}}
							/>
						</AdvancedMarker>
					))}

					{active && (
						<InfoWindow
							position={{ lat: active.lat, lng: active.lng }}
							onCloseClick={() => setOpenId(null)}
						>
							<div className="flex w-56 flex-col gap-1">
								{active.photos.length > 0 && (
									<img
										src={active.photos[0]}
										alt={active.title}
										referrerPolicy="no-referrer"
										className="mb-1 h-28 w-full rounded object-cover"
									/>
								)}
								<div className="flex items-start justify-between gap-2">
									<a
										href={active.url}
										target="_blank"
										rel="noreferrer"
										className="font-medium hover:underline"
									>
										{active.title}
									</a>
									{active.addressPrecise && (
										<a
											href={streetViewUrl(active.lat, active.lng)}
											target="_blank"
											rel="noreferrer"
											title="Ver no Street View"
											className={buttonVariants({
												variant: "ghost",
												size: "icon",
												className: "size-7 shrink-0",
											})}
										>
											<PersonStanding className="size-4" />
										</a>
									)}
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7 shrink-0"
										onClick={() => onToggleFavorite(active.id)}
									>
										<Heart
											className={
												favoriteIds.has(active.id)
													? "size-4 fill-red-500 text-red-500"
													: "size-4"
											}
										/>
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7 shrink-0"
										onClick={() => onToggleDismiss(active.id)}
									>
										<EyeOff
											className={
												dismissedIds.has(active.id)
													? "size-4 text-destructive"
													: "size-4 text-muted-foreground"
											}
										/>
									</Button>
								</div>
								<span>{formatPriceBRL(active.priceCents)}</span>
								<span className="text-xs text-muted-foreground">
									Fonte: {SOURCE_LABELS[active.source] ?? active.source}
								</span>
								<span className="text-xs text-muted-foreground">
									Praia: {formatMinutes(active.places.praia?.driveMinutes)} de
									carro
								</span>
								{!active.addressPrecise && (
									<span className="text-xs text-muted-foreground">
										Localização aproximada (bairro)
									</span>
								)}
							</div>
						</InfoWindow>
					)}
				</GoogleMap>
			</APIProvider>
		</div>
	);
}
