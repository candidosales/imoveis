import { createServerFn } from "@tanstack/react-start";
import { setListingDismissed } from "#/server/db/repository";

export const setDismissed = createServerFn({ method: "POST" })
	.validator((data: { id: string; dismissed: boolean }) => data)
	.handler(async ({ data }) => {
		setListingDismissed(data.id, data.dismissed);
	});
