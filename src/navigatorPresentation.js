const clean = value => String(value || "").trim()

function normalizedRole(location = {}) {
  return clean(location.accessRole || location.access_role || location.locationType || location.location_type)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
}

export function accessLocationHeading(locations = []) {
  const roles = locations.map(normalizedRole).filter(Boolean)
  return roles.length && roles.every(role => /application|drop_off/.test(role))
    ? "Application drop-off locations"
    : "Access locations for this program"
}

export function accessLocationPurpose(location = {}) {
  const role = normalizedRole(location)
  if (/application|drop_off/.test(role)) return "Application drop-off point"
  if (/primary_care|clinic|service_delivery|public_access/.test(role)) return "Service access point"
  if (/intake|navigation/.test(role)) return "Intake or navigation point"
  return "Program access point"
}

export function accessLocationAddress(location = {}) {
  const address = clean(location.address || location.streetAddress || location.street_address)
  const city = clean(location.city)
  return address && city && address.toLowerCase().includes(city.toLowerCase()) ? address : [address, city].filter(Boolean).join(" · ")
}

export function hasPublicMapCoordinates(location = {}) {
  return clean(location.mapStatus || location.map_status) === "map_ready"
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
}

export function publicAccessLocation(location = {}) {
  return {
    id: clean(location.id || location.location_id),
    name: clean(location.name || location.siteName || location.site_name),
    address: accessLocationAddress(location),
    purpose: accessLocationPurpose(location),
    mapEligible: hasPublicMapCoordinates(location),
  }
}
