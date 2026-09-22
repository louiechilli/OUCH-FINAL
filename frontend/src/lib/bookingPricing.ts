export interface RateLike {
  hourlyRate: number;
  depositAmount: number;
}

export interface BookingTotals {
  subtotal: number;
  depositAmount: number;
  total: number;
}

export function computeBookingTotals(rate: RateLike, durationHours: number): BookingTotals {
  const hourlySubtotal = Math.round(rate.hourlyRate * durationHours * 100) / 100;
  let depositAmount = rate.depositAmount;
  let total = hourlySubtotal;
  let subtotal = hourlySubtotal;

  if (total <= 0 && depositAmount > 0) {
    total = depositAmount;
    subtotal = depositAmount;
  } else if (depositAmount > total) {
    depositAmount = total;
  }

  return { subtotal, depositAmount, total };
}

export function formatBookingPrice(rate: RateLike, durationHours: number): string {
  const { total, depositAmount } = computeBookingTotals(rate, durationHours);
  if (total > 0 && rate.hourlyRate > 0) {
    return `£${total.toFixed(2)} (£${rate.hourlyRate}/hr)`;
  }
  if (total > 0) {
    return `£${total.toFixed(2)}`;
  }
  if (depositAmount > 0) {
    return `£${depositAmount.toFixed(2)} deposit`;
  }
  return "No charge";
}
