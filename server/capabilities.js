export function capabilityReport(env = process.env) {
  const present = (name) => Boolean(String(env[name] || "").trim())
  return { generatedAt: new Date().toISOString(), capabilities: [
    { id: "miller_resources", name: "Miller resource directory", status: present("SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY") ? "configured" : "not_configured", provider: "Supabase" },
    { id: "miller_ai", name: "Miller AI guidance", status: present("OPENAI_API_KEY") ? "configured" : "not_configured", provider: "OpenAI" },
    { id: "web_research", name: "Web research", status: present("TAVILY_API_KEY") ? "configured" : "not_configured", provider: "Tavily" },
    { id: "bc_geocoder", name: "BC address validation", status: present("BC_GEOCODER_API_KEY") ? "configured" : "not_configured", provider: "BC Address Geocoder" },
    { id: "bc_transit", name: "Nearby transit stops", status: "pilot", provider: "BC Transit", detail: "Central Fraser Valley static GTFS pilot; realtime feeds available." },
    { id: "translink_static", name: "Metro Vancouver transit stops", status: "configured", provider: "TransLink", detail: "Static GTFS." },
    { id: "translink_realtime", name: "Metro Vancouver live transit", status: present("TRANSLINK_GTFS_REALTIME_API_KEY") ? "configured" : "not_configured", provider: "TransLink" },
    { id: "bc211", name: "211 service data", status: "pending_access", provider: "211 British Columbia", detail: "Placeholder only; no scraping or inferred API." },
    { id: "pathways", name: "Pathways service data", status: "not_integrated", provider: "Pathways BC", detail: "Candidate future provider." },
  ] }
}
