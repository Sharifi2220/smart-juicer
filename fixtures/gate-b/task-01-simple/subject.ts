/** Synthetic boundary fixture: independent from any real project data. */
export function shippingBand(totalCents:number):'free'|'paid' {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new RangeError('INVALID_AMOUNT');
  return totalCents >= 5000 ? 'free' : 'paid';
}
