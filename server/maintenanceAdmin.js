const text = (value) => String(value || "").trim().toLowerCase()

export function routeMaintenanceIntent(question = "") {
  const value = text(question)
  if (!value || value.length > 500) return null
  if (/what (database problems|can you heal)|safe repairs|pins.*safely repair/.test(value)) return "safe_repairs"
  if (/map pins.*missing|almost ready.*map|nearly map.ready/.test(value)) return "map_readiness"
  if (/locations?.*(need|needs).*research|conflicting.*location/.test(value)) return "location_research"
  if (/resource information.*stale|needs? a fresh check|stale resource/.test(value)) return "resource_freshness"
  if (/what would you work on next|why did you choose/.test(value)) return "next_work"
  if (/what did you improve|did the repair.*work/.test(value)) return "verified_outcomes"
  return null
}

export function maintenanceAdminSummary({ cycles = [], outcomes = [], lessons = [], opportunities = [] } = {}) {
  const activeGrowth = opportunities.filter((item) => !["retired", "improved"].includes(item.state))
  const count = (pattern) => activeGrowth.filter((item) => pattern.test(item.gap_type)).length
  return {
    scheduling: "not_enabled",
    max_repairs_per_cycle: 1,
    last_cycle: cycles[0] || null,
    safe_repairs_available: 0,
    almost_map_ready: count(/missing_geocoder|human_qc_confirmation/),
    location_research: count(/mapping_missing|mapping_location_conflict/),
    stale_resource_information: count(/^stale_/),
    verified_outcomes: outcomes.filter((item) => item.verification === "passed").slice(0, 8),
    ineffective_outcomes: outcomes.filter((item) => ["failed", "inconclusive"].includes(item.verification)).slice(0, 8),
    lessons: lessons.slice(0, 8),
    opportunities: activeGrowth.slice(0, 12),
  }
}

export function explainMaintenanceIntent(intent, summary) {
  if (intent === "safe_repairs") return { text: `${summary.safe_repairs_available} persisted safe repair recommendation(s) are currently visible. A repair is eligible only when its registered action independently verifies complete trusted inputs.`, details: summary.verified_outcomes }
  if (intent === "map_readiness") return { text: `${summary.almost_map_ready} persisted opportunity record(s) are almost map-ready. Missing evidence never becomes a guessed pin.`, details: summary.opportunities }
  if (intent === "location_research") return { text: `${summary.location_research} location opportunity record(s) need controlled research or human review. Maintenance will not run external research automatically.`, details: summary.opportunities }
  if (intent === "resource_freshness") return { text: `${summary.stale_resource_information} resource fact(s) are old enough for a fresh check. Stale does not mean incorrect.`, details: summary.opportunities }
  if (intent === "verified_outcomes") return { text: `${summary.verified_outcomes.length} recent bounded outcome(s) independently verified. An attempted action is never reported as a repair without verification.`, details: summary.verified_outcomes }
  return { text: summary.last_cycle?.summary?.selected_action ? `The last cycle selected ${summary.last_cycle.summary.selected_action.action_id} using its bounded reason codes.` : "No persisted maintenance selection is available yet.", details: summary.last_cycle }
}
