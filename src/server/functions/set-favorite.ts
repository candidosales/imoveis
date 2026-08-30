import { createServerFn } from "@tanstack/react-start";
import { setListingFavorite } from "#/server/db/repository";

export const setFavorite = createServerFn({ method: "POST" })
	.validator((data: { id: string; favorite: boolean }) => data)
	.handler(async ({ data }) => {
		setListingFavorite(data.id, data.favorite);
	});
