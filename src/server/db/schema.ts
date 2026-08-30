export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('casa', 'terreno')),
  title TEXT NOT NULL,
  price_cents INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  garage_spots INTEGER,
  built_area_m2 REAL,
  lot_area_m2 REAL,
  description TEXT,
  neighborhood TEXT,
  address TEXT,
  address_precise INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  photos TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings (type);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history (listing_id);

-- Praia de Referência and Comodidades (mercado/farmacia/hospital/padaria), one row per place type per listing.
CREATE TABLE IF NOT EXISTS listing_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  place_type TEXT NOT NULL CHECK (place_type IN ('praia', 'mercado', 'farmacia', 'hospital', 'padaria')),
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  drive_minutes REAL,
  walk_minutes REAL,
  updated_at TEXT NOT NULL,
  UNIQUE (listing_id, place_type)
);

CREATE INDEX IF NOT EXISTS idx_listing_places_listing ON listing_places (listing_id);
`;
