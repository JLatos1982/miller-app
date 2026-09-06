const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const canonical = value => clean(value).toLowerCase().replace(/\b(street)\b/g, 'st').replace(/\b(avenue)\b/g, 'ave').replace(/\b(road)\b/g, 'rd').replace(/\b(drive)\b/g, 'dr').replace(/[^a-z0-9]+/g, ' ').trim()
const civicPart = value => clean(value).split(',').map(clean).find(part => /(?:\d{1,4}[-–—])?\d{1,6}[a-z]?\s+/i.test(part)) || clean(value)

export function reconcileSamePublicLocation({ existingAddress, existingGeocode, proposedAddress, proposedGeocode } = {}) {
  const existing = canonical(existingGeocode?.standardized_address || civicPart(existingAddress))
  const proposed = canonical(proposedGeocode?.standardized_address || proposedAddress)
  if (!existing || !proposed || existing !== proposed) return 'material_location_conflict'
  const a = existingGeocode?.coordinates, b = proposedGeocode?.coordinates
  if (!a || !b || Math.abs(Number(a.latitude) - Number(b.latitude)) > 0.0002 || Math.abs(Number(a.longitude) - Number(b.longitude)) > 0.0002) return 'cannot_reconcile'
  // Preserve the distinction for audit/readout: an organization-labelled
  // occupancy value can resolve to the exact same civic site, but is still a
  // normalization rather than a byte-for-byte confirmation.
  return clean(existingAddress) === clean(proposedAddress) ? 'same_location_confirmation' : 'same_location_normalization'
}
