import { getTransitRuntimeStatus } from "./transit/providers.js"
import { bcGeocoderConfiguration } from "./bcAddressGeocoder.js"

export function capabilityReport(env = process.env) {
  const present = (name) => Boolean(String(env[name] || "").trim())
  const realtime = getTransitRuntimeStatus(env)
  const bc = bcGeocoderConfiguration(env)
  return { generatedAt: new Date().toISOString(), capabilities: [
    { id: "miller_resources", name: "Miller resource directory", status: present("SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY") ? "configured" : "not_configured", provider: "Supabase" },
    { id: "miller_ai", name: "Miller AI guidance", status: present("OPENAI_API_KEY") ? "configured" : "not_configured", provider: "OpenAI" },
    { id: "web_research", name: "Web research", status: present("TAVILY_API_KEY") ? "configured" : "not_configured", provider: "Tavily" },
    { id: "bc_geocoder", name: "BC address validation", status: bc.usable ? "configured" : bc.enabled || bc.keyConfigured ? "degraded" : "unavailable", provider: "Official BC Address Geocoder", detail: bc.usable ? "Server-side validation enabled." : "Server-side configuration is incomplete or disabled." },
    { id: "bc_transit", name: "Nearby transit stops", status: "pilot", provider: "BC Transit", detail: "Central Fraser Valley static GTFS pilot; realtime feeds available." },
    { id: "translink_static", name: "Metro Vancouver transit stops", status: "configured", provider: "TransLink", detail: "Static GTFS." },
    { id: "translink_alerts", name: "Metro Vancouver realtime alerts", status: realtime.alerts, provider: "TransLink" },
    { id: "translink_trip_updates", name: "Metro Vancouver trip updates", status: realtime.tripUpdates, provider: "TransLink" },
    { id: "translink_vehicle_positions", name: "Metro Vancouver vehicle positions", status: realtime.vehiclePositions, provider: "TransLink" },
    { id: "bc211", name: "211 service data", status: "pending_access", provider: "211 British Columbia", detail: "Placeholder only; no scraping or inferred API." },
    { id: "pathways", name: "Pathways service data", status: "not_integrated", provider: "Pathways BC", detail: "Candidate future provider." },
  ] }
}
