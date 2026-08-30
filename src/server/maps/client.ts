function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY não configurada. Veja .env.example.");
  }
  return key;
}

export async function googleMapsGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`https://maps.googleapis.com/maps/api/${path}/json`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", apiKey());
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Maps API ${path} falhou: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { status: string; error_message?: string } & T;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps API ${path} retornou ${data.status}: ${data.error_message ?? ""}`);
  }
  return data;
}
