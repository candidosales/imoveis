import { googleMapsGet } from "#/server/maps/client";

interface DistanceMatrixResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      duration?: { value: number };
    }>;
  }>;
}

/** Travel time in minutes, driving and walking, between two points (Tempo até a Praia / Comodidade). */
export async function travelTimes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<{ driveMinutes: number | null; walkMinutes: number | null }> {
  const [driving, walking] = await Promise.all([
    travelTime(origin, destination, "driving"),
    travelTime(origin, destination, "walking"),
  ]);
  return { driveMinutes: driving, walkMinutes: walking };
}

async function travelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "driving" | "walking",
): Promise<number | null> {
  const data = await googleMapsGet<DistanceMatrixResponse>("distancematrix", {
    origins: `${origin.lat},${origin.lng}`,
    destinations: `${destination.lat},${destination.lng}`,
    mode,
  });
  const element = data.rows[0]?.elements[0];
  if (!element || element.status !== "OK" || !element.duration) return null;
  return Math.round(element.duration.value / 60);
}
