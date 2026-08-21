import { distanceKm } from "../map/geography.js"
import { eligiblePublicLocation } from "./navigation.js"
const SUPPORT_TERMS = { counselling: ["counselling", "counseling", "therapy"], "substance use support": ["substance use", "addiction"], "withdrawal management": ["withdrawal", "detox"], "harm reduction": ["harm reduction", "naloxone"] }
export function deterministicRelevance(resource, intent) {
  const searchable = [resource?.category, resource?.serviceType, resource?.description].filter(Boolean).join(" ").toLocaleLowerCase()
  const match = (intent?.explicit?.supportNeeds || []).find((need) => (SUPPORT_TERMS[need] || [need]).some((term) => searchable.includes(term)))
  return { categories: match ? [match] : [], reason: match ? `Matches ${match}` : null }
}
export function buildNavigationPacket({ resource, publicMapResources, intent, locationContext, relevance = null }) {
  const location = eligiblePublicLocation(resource, publicMapResources), origin = locationContext?.status === "resolved" ? locationContext.origin : null
  const kilometres = origin && location ? distanceKm(origin, location) : null
  const access = { mapped: Boolean(location), transitContextAvailable: Boolean(location), distance: Number.isFinite(kilometres) ? { method: "straight_line", kilometres } : null }
  const relevanceContext = { categories: [...(relevance?.categories || [])], reason: relevance?.reason || null }
  const explanation = [relevanceContext.reason, access.distance ? `${access.distance.kilometres.toFixed(1)} km straight-line` : null, intent?.explicit?.transport?.transitRelevant && access.transitContextAvailable ? "transit information available" : null].filter(Boolean).slice(0, 2).join(" · ")
  return { kind: "miller_navigation_context", version: "1.0", intent, origin, candidate: { id: resource?.id, name: resource?.name }, relevance: relevanceContext, location, access, provenance: { relevance: "miller_deterministic_search", location: location ? "approved_public_location_index" : null, distance: access.distance ? "haversine" : null }, explanation }
}
