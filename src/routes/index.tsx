import { createFileRoute } from "@tanstack/react-router";
import { ListingsExplorer } from "#/components/listings-explorer";
import { getListings } from "#/server/functions/get-listings";

export const Route = createFileRoute("/")({
	loader: () => getListings(),
	component: Home,
});

function Home() {
	const listings = Route.useLoaderData();
	return (
		<div className="mx-auto max-w-7xl p-6">
			<header className="mb-6">
				<h1 className="text-2xl font-bold">Imóveis em Caucaia</h1>
				<p className="text-sm text-muted-foreground">
					Casas e terrenos perto da praia, mercado, farmácia, hospital e
					padaria.
				</p>
			</header>
			<ListingsExplorer listings={listings} />
		</div>
	);
}
