import { createServerFn } from "@tanstack/react-start";
import { listAllListings } from "#/server/db/repository";

export const getListings = createServerFn({ method: "GET" }).handler(async () => {
  return listAllListings();
});
