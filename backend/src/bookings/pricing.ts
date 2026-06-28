import { pool } from "../db";

export interface ResolvedRate {
  hourlyRate: number;
  minHours: number;
  maxHours: number | null;
  depositAmount: number;
}

interface ServiceRow {
  min_hours: string;
  max_hours: string | null;
  default_hourly_rate: string | null;
  deposit_amount: string;
  use_artist_default_rate: boolean;
  artist_default_hourly_rate: string | null;
}

interface ArtistRateRow {
  hourly_rate: string;
  min_hours_override: string | null;
  max_hours_override: string | null;
  deposit_amount_override: string | null;
  is_available: boolean;
}

/** artist_service_rates overrides services' defaults — see backend/PATTERNS
 * note in db.ts. When a service uses the artist default rate, pricing falls
 * back to artists.default_hourly_rate unless a per-artist override exists.
 * Throws if the artist has explicitly marked this service unavailable. */
export async function resolveRate(artistId: number, serviceId: number): Promise<ResolvedRate> {
  const { rows: serviceRows } = await pool.query<ServiceRow>(
    `SELECT s.min_hours, s.max_hours, s.default_hourly_rate, s.deposit_amount, s.use_artist_default_rate,
            a.default_hourly_rate AS artist_default_hourly_rate
     FROM services s
     JOIN artists a ON a.id = $2
     WHERE s.id = $1`,
    [serviceId, artistId]
  );
  const service = serviceRows[0];
  if (!service) throw new Error("Service not found");

  const { rows: rateRows } = await pool.query<ArtistRateRow>(
    `SELECT hourly_rate, min_hours_override, max_hours_override, deposit_amount_override, is_available
     FROM artist_service_rates WHERE artist_id = $1 AND service_id = $2`,
    [artistId, serviceId]
  );
  const rate = rateRows[0];

  if (rate && !rate.is_available) {
    throw new Error("This artist does not offer this service");
  }

  const maxHoursRaw = rate?.max_hours_override ?? service.max_hours;

  let hourlyRate: number;
  if (rate) {
    hourlyRate = Number(rate.hourly_rate);
  } else if (service.use_artist_default_rate) {
    if (service.artist_default_hourly_rate === null) {
      throw new Error("This artist has no default hourly rate set");
    }
    hourlyRate = Number(service.artist_default_hourly_rate);
  } else if (service.default_hourly_rate !== null) {
    hourlyRate = Number(service.default_hourly_rate);
  } else {
    throw new Error("Service has no hourly rate configured");
  }

  return {
    hourlyRate,
    minHours: Number(rate?.min_hours_override ?? service.min_hours),
    maxHours: maxHoursRaw === null || maxHoursRaw === undefined ? null : Number(maxHoursRaw),
    depositAmount: Number(rate?.deposit_amount_override ?? service.deposit_amount),
  };
}
