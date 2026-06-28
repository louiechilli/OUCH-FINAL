import { pool } from "../db";

export interface ResolvedRate {
  hourlyRate: number;
  minHours: number;
  depositAmount: number;
}

interface ServiceRow {
  min_hours: string;
  default_hourly_rate: string;
  deposit_amount: string;
}

interface ArtistRateRow {
  hourly_rate: string;
  min_hours_override: string | null;
  deposit_amount_override: string | null;
  is_available: boolean;
}

/** artist_service_rates overrides services' defaults — see backend/PATTERNS
 * note in db.ts. Throws if the artist has explicitly marked this service
 * unavailable. */
export async function resolveRate(artistId: number, serviceId: number): Promise<ResolvedRate> {
  const { rows: serviceRows } = await pool.query<ServiceRow>(
    "SELECT min_hours, default_hourly_rate, deposit_amount FROM services WHERE id = $1",
    [serviceId]
  );
  const service = serviceRows[0];
  if (!service) throw new Error("Service not found");

  const { rows: rateRows } = await pool.query<ArtistRateRow>(
    `SELECT hourly_rate, min_hours_override, deposit_amount_override, is_available
     FROM artist_service_rates WHERE artist_id = $1 AND service_id = $2`,
    [artistId, serviceId]
  );
  const rate = rateRows[0];

  if (rate && !rate.is_available) {
    throw new Error("This artist does not offer this service");
  }

  return {
    hourlyRate: Number(rate?.hourly_rate ?? service.default_hourly_rate),
    minHours: Number(rate?.min_hours_override ?? service.min_hours),
    depositAmount: Number(rate?.deposit_amount_override ?? service.deposit_amount),
  };
}
