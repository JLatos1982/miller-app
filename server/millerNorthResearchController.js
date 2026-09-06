import { queryId } from "./millerNorthDiscoveryCheckpoint.js"

export const MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION = "miller-north-autonomous-research-controller-v1"
export const MILLER_NORTH_WORK_TYPES = new Set(["source_family_scan", "recent_source_scan", "social_lead_scan", "lead_triage", "named_case_followup", "corroboration_search", "existing_incident_revisit", "source_change_revisit"])

const historical = {
  named_case_followup: { calls: 4, new_incidents: 3, useful_sources: 4, noise: 0 },
  indigenous_org_source_scan: { calls: 8, new_incidents: 2, useful_sources: 4, noise: 3 },
  local_journalism_case_scan: { calls: 8, new_incidents: 2, useful_sources: 4, noise: 3 },
  human_rights_complaint_scan: { calls: 6, new_incidents: 1, useful_sources: 2, noise: 3 },
  facility_first_recent: { calls: 51, new_incidents: 1, useful_sources: 2, noise: 46 },
  generic_topic_search: { calls: 60, new_incidents: 0, useful_sources: 0, noise: 58 },
  social_reddit: { calls: 5, new_incidents: 0, useful_sources: 0, noise: 5 },
}

const watchlist = [
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:aptnnews.ca Saskatchewan First Nations hospital patient 2026", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:fsin.com hospital patient complaint Saskatchewan 2026", source_family: "FSIN" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:ckom.com First Nations hospital patient Saskatoon 2026", source_family: "local journalism" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:globalnews.ca Saskatchewan Indigenous family hospital 2026", source_family: "local journalism" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "site:aptnnews.ca Edmonton Indigenous patient hospital 2025", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "Maskwacis Indigenous organization hospital patient complaint 2025", source_family: "Indigenous organization" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "alberta", treaty6: true, query: "site:globalnews.ca Edmonton Indigenous family hospital complaint 2025", source_family: "local journalism" },
  { strategy: "human_rights_complaint_scan", work_type: "source_family_scan", province: "alberta", treaty6: false, query: "site:albertahumanrights.ab.ca hospital Indigenous patient complaint 2025", source_family: "human rights" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "british_columbia", treaty6: false, query: "site:aptnnews.ca British Columbia Indigenous patient hospital 2026", source_family: "APTN News" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "british_columbia", treaty6: false, query: "site:cheknews.ca Indigenous family hospital Island Health 2025", source_family: "local journalism" },
  { strategy: "social_reddit", work_type: "social_lead_scan", province: "saskatchewan", treaty6: true, query: "site:reddit.com/r/saskatchewan First Nations patient hospital complaint 2026", source_family: "Reddit public posts" },
  { strategy: "facility_first_recent", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "Saskatoon Royal University Hospital First Nations patient complaint 2026", source_family: "facility follow-up" },
]

// A separate, versioned recent-source input set for Pilot 3. These are
// deliberately source-family and case-oriented, not a return to broad topic
// searching. They do not reuse the terminal Pilot 1/Pilot 2 query text.
const recentNamedCaseWatchlist = [
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:aptnnews.ca Saskatchewan Indigenous patient hospital complaint 2025 OR 2026", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:fsin.com hospital patient family complaint Saskatchewan 2025 OR 2026", source_family: "FSIN" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:ckom.com Saskatoon hospital Indigenous patient family 2025 OR 2026", source_family: "local journalism" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:panow.com Prince Albert hospital First Nations patient 2025 OR 2026", source_family: "local journalism" },
  { strategy: "human_rights_complaint_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:saskatchewanhumanrights.ca healthcare First Nations complaint 2025 OR 2026", source_family: "human rights" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:aptnnews.ca North Battleford hospital First Nations family 2025 OR 2026", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "site:aptnnews.ca Edmonton Indigenous patient hospital complaint 2026", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "Maskwacis hospital Indigenous patient family complaint 2025 OR 2026", source_family: "Indigenous organization" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "alberta", treaty6: true, query: "site:edmontonjournal.com Indigenous patient hospital Edmonton 2025 OR 2026", source_family: "local journalism" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "alberta", treaty6: true, query: "site:cbc.ca Wetaskiwin hospital First Nations patient 2025 OR 2026", source_family: "local journalism" },
  { strategy: "human_rights_complaint_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "site:albertahumanrights.ab.ca Indigenous healthcare complaint Edmonton 2025 OR 2026", source_family: "human rights" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "british_columbia", treaty6: false, query: "site:indiginews.com British Columbia Indigenous patient hospital 2025 OR 2026", source_family: "Indigenous journalism" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "british_columbia", treaty6: false, query: "site:aptnnews.ca British Columbia Indigenous patient hospital complaint 2025 OR 2026", source_family: "APTN News" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "saskatchewan", treaty6: true, query: "site:aptnnews.ca Saskatchewan Health Authority First Nations patient complaint 2025 OR 2026", source_family: "APTN News" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:globalnews.ca Saskatoon First Nations hospital complaint 2025 OR 2026", source_family: "local journalism" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "saskatchewan", treaty6: true, query: "site:thestarphoenix.com First Nations patient hospital Saskatchewan 2025 OR 2026", source_family: "local journalism" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "site:aptnnews.ca Royal Alexandra Hospital Indigenous patient 2025 OR 2026", source_family: "APTN News" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "alberta", treaty6: true, query: "site:edmontonjournal.com Indigenous patient family hospital complaint 2026", source_family: "local journalism" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "alberta", treaty6: true, query: "site:ammsa.com Indigenous hospital patient Alberta 2025 OR 2026", source_family: "Indigenous journalism" },
  { strategy: "indigenous_org_source_scan", work_type: "source_family_scan", province: "british_columbia", treaty6: false, query: "site:indiginews.com Indigenous patient hospital complaint British Columbia 2026", source_family: "Indigenous journalism" },
  { strategy: "local_journalism_case_scan", work_type: "recent_source_scan", province: "british_columbia", treaty6: false, query: "site:cbc.ca British Columbia Indigenous patient family hospital complaint 2025 OR 2026", source_family: "local journalism" },
]

const ratio = (value, total) => total ? value / total : 0
export function strategyScore(strategy, metrics = {}) {
  const row = { ...(historical[strategy] || { calls: 0, new_incidents: 0, useful_sources: 0, noise: 0 }), ...(metrics[strategy] || {}) }
  return Math.round((ratio(row.new_incidents, row.calls) * 100) + (ratio(row.useful_sources, row.calls) * 30) - (ratio(row.noise, row.calls) * 20))
}

export function buildMillerNorthAutonomousWork({ manifest = {}, knownQueries = new Set(), socialLeads = [], generation = "pilot1" } = {}) {
  const metrics = manifest.strategy_metrics || {}
  const pendingSocial = socialLeads.filter((lead) => ["new_social_lead", "high_value_social_lead", "possible_incident", "verification_needed"].includes(lead.lead_status) && ["unverified", "targeted_verification_needed"].includes(lead.verification_state) && lead.facility && /(?:family|patient|woman|man|elder|mother|father)/i.test(lead.public_excerpt || ""))
  const socialWork = pendingSocial.map((lead) => ({
    work_type: "social_lead_scan", strategy: "social_reddit", province: lead.province || "saskatchewan", treaty6: lead.province !== "british_columbia", source_family: lead.platform,
    query: `"${lead.facility}" Indigenous patient complaint`, reason: "public social lead includes a concrete person/family and facility", social_lead_id: lead.social_lead_id,
  }))
  const sourceInputs = generation === "pilot3_recent_named" ? recentNamedCaseWatchlist : watchlist
  const candidates = [...sourceInputs, ...socialWork].filter((item) => !knownQueries.has(item.query.trim().toLowerCase()))
  return candidates.map((item) => {
    const base = strategyScore(item.strategy, metrics)
    const expected_value = base + 15 + (item.treaty6 ? 6 : 0) + (/2026|2025/.test(item.query) ? 7 : 0)
    return {
      ...item,
      work_id: queryId(item.province, item.query, MILLER_NORTH_AUTONOMOUS_CONTROLLER_VERSION),
      expected_value,
      status: "pending",
      eligible_for_tavily: expected_value >= 12 && item.strategy !== "generic_topic_search",
    }
  }).sort((a, b) => b.expected_value - a.expected_value || a.query.localeCompare(b.query))
}

export function selectMillerNorthAutonomousWork({ candidates = [], budget = 30 } = {}) {
  return candidates.filter((item) => item.eligible_for_tavily).slice(0, Math.max(0, budget))
}

export function recordMillerNorthStrategyOutcome(manifest, strategy, outcome = {}) {
  const current = manifest.strategy_metrics?.[strategy] || { calls: 0, useful_sources: 0, named_cases: 0, new_incidents: 0, strengthened: 0, duplicates: 0, noise: 0 }
  manifest.strategy_metrics ||= {}
  manifest.strategy_metrics[strategy] = Object.fromEntries(Object.keys(current).map((key) => [key, Number(current[key] || 0) + Number(outcome[key] || 0)]))
  return manifest.strategy_metrics[strategy]
}
