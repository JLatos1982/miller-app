const HOUR = 60 * 60 * 1000
const safe = (value, fallback = "unknown") => String(value || fallback).replace(/[^a-z0-9 _.,:;()/-]/gi, "").slice(0, 260)
const age = (value, now) => value ? Math.max(0, now - new Date(value).getTime()) : null
const severity = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }

export function freshness({ lastSuccessAt = null, status = "unknown", maxAgeMs = 24 * HOUR, now = Date.now() } = {}) {
  if (["failed", "degraded"].includes(status)) return status
  if (["unavailable", "disabled", "fixture_validated_live_disabled"].includes(status)) return status
  if (!lastSuccessAt) return "never_checked"
  return age(lastSuccessAt, now) > maxAgeMs ? "stale" : "current"
}

export function routeOperationalIntent(question = "") {
  const text = String(question).trim().toLowerCase()
  if (!text || text.length > 500) return "unsupported"
  if (/\b(run|start)\b.*\b(pulse|security check)\b/.test(text)) return "run_security_pulse"
  if (/\b(how are you|how.?s it going|status|what.?s going on)\b/.test(text)) return "how_are_you"
  if (/\bwhat changed|what.?s new|recent changes\b/.test(text)) return "what_changed"
  if (/\b(what.*look at|needs attention|should i look)\b/.test(text)) return "what_needs_attention"
  if (/\b(security|did anyone get in|last pulse|recurring)\b/.test(text)) return "security_status"
  if (/\b(health|public.health|bccdc|health canada|alert)\b/.test(text)) return "public_health_status"
  if (/\b(stale|old|current)\b.*\b(source|feed|information|data)\b/.test(text)) return "stale_sources"
  return "unsupported"
}

export function buildOperationalGuidance({ pulse = null, securityFindings = [], sensors = [], healthUpdates = [], operations = {}, now = Date.now() } = {}) {
  const pulseState = freshness({ lastSuccessAt: pulse?.completed_at, status: pulse?.status === "completed" ? "healthy" : pulse?.status || "unknown", maxAgeMs: 6 * HOUR, now })
  const sensorStates = sensors.map((item) => ({ ...item, freshness: freshness({ lastSuccessAt: item.last_success_at, status: item.status || item.mode, maxAgeMs: item.cadence === "acute" ? 12 * HOUR : 48 * HOUR, now }) }))
  const staleSensors = sensorStates.filter((item) => ["stale", "failed", "degraded"].includes(item.freshness))
  const activeSecurity = securityFindings.filter((item) => !["resolved", "false_positive", "expected_behavior"].includes(item.lifecycle))
  const newHealth = healthUpdates.filter((item) => /new|updated|relevant_change/i.test(item.status || item.stop_reason || ""))
  const attention = [
    ...activeSecurity.map((item) => ({ domain: "security", id: item.finding_fingerprint, priority: severity[item.severity] ?? 4, title: `Security: ${safe(item.finding_type)}`, detail: `${safe(item.lifecycle)} finding; seen ${Number(item.recurrence_count || 1)} time(s).` })),
    ...staleSensors.map((item) => ({ domain: "public_health", id: item.id || item.sensor_id, priority: item.freshness === "failed" ? 1 : 3, title: `Health source: ${safe(item.label || item.id)}`, detail: item.freshness === "stale" ? "Information is older than its trusted window." : "This source is not currently trustworthy." })),
    ...newHealth.map((item) => ({ domain: "public_health", id: item.id || item.inspection_id, priority: 2, title: "Public-health update", detail: "A tracked source reported a meaningful update." })),
  ].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)).slice(0, 6)
  const securityState = activeSecurity.length ? "attention" : ["stale", "failed", "degraded", "never_checked"].includes(pulseState) ? pulseState : "current"
  const healthState = newHealth.length ? "alerts" : staleSensors.length ? "stale" : sensorStates.length ? "current" : "unknown"
  const systemState = attention.some((item) => item.priority <= 1) ? "degraded" : attention.length ? "attention" : pulseState === "never_checked" && !sensorStates.length ? "unknown" : "healthy"
  const changes = { security: { new: securityFindings.filter((item) => item.lifecycle === "new").length, recurring: securityFindings.filter((item) => item.lifecycle === "recurring").length, resolved: securityFindings.filter((item) => item.lifecycle === "resolved").length }, public_health: { updates: newHealth.length, stale_sources: staleSensors.length }, operations: { degraded: operations?.status === "degraded" ? 1 : 0 } }
  const summary = systemState === "healthy" ? "I'm doing okay. My latest security check is current and the health sources I'm tracking are up to date." : systemState === "unknown" ? "I do not have enough current information to give a confident overall status yet." : systemState === "degraded" ? "I need attention: a critical security or source condition is degraded." : `I'm okay overall, but ${attention.length} thing${attention.length === 1 ? " is" : "s are"} worth looking at.`
  return { system_state: systemState, domains: { security: securityState, public_health: healthState, resource_data: "unknown" }, pulse: { status: pulse?.status || "never_run", freshness: pulseState, completed_at: pulse?.completed_at || null }, sensors: sensorStates.slice(0, 12), changes, attention, summary, uncertainty: pulseState === "stale" || staleSensors.length ? "Some information is stale, so this is not a complete current picture." : null }
}

export function buildDailyReview(input = {}) { const guidance = buildOperationalGuidance(input); return { review_type: "daily", scheduling: "manual_preview", summary: guidance.summary, changes: guidance.changes, attention: guidance.attention, domains: guidance.domains } }

export function buildDeepReview({ pulseRuns = [], securityFindings = [], sensorHistory = [], now = Date.now() } = {}) {
  const observations = []
  for (const finding of securityFindings.slice(0, 80)) if (Number(finding.recurrence_count || 0) >= 3 && !["resolved", "false_positive"].includes(finding.lifecycle)) observations.push({ domain: "security", state: "persistent", id: finding.finding_fingerprint, detail: `A security finding has recurred ${finding.recurrence_count} times.` })
  for (const sensor of sensorHistory.slice(0, 40)) if (freshness({ lastSuccessAt: sensor.last_success_at, status: sensor.status || sensor.health_state, maxAgeMs: 48 * HOUR, now }) === "stale") observations.push({ domain: "public_health", state: "stale", id: sensor.sensor_id || sensor.id, detail: "A health source has not had a recent trustworthy update." })
  if (pulseRuns.slice(0, 6).filter((item) => item.status === "failed").length >= 2) observations.push({ domain: "security", state: "unstable", id: "security_pulse", detail: "Security Pulse has failed repeatedly in the bounded recent history." })
  return { review_type: "deep", scheduling: "manual_preview", observations: observations.slice(0, 8), summary: observations.length ? "I found longer-running conditions worth reviewing." : "I did not find a persistent concern in the bounded review window." }
}

export function explainOperationalIntent(intent, guidance) {
  if (intent === "what_changed") return { text: `Security: ${guidance.changes.security.recurring} recurring and ${guidance.changes.security.resolved} resolved. Public health: ${guidance.changes.public_health.updates} meaningful update(s).`, details: guidance.changes }
  if (intent === "what_needs_attention") return { text: guidance.attention.length ? guidance.attention.map((item) => item.detail).join(" ") : "Nothing currently stands out for attention.", details: guidance.attention }
  if (intent === "security_status") return { text: guidance.domains.security === "current" ? "Security information is current. Blocked requests do not by themselves show that anyone got in." : `Security information is ${guidance.domains.security}; I cannot make a stronger claim.`, details: guidance.pulse }
  if (intent === "public_health_status" || intent === "stale_sources") return { text: guidance.domains.public_health === "current" ? "Tracked public-health information is current." : "Some public-health information is not current enough to treat as complete.", details: guidance.sensors }
  return { text: guidance.summary, details: guidance }
}
