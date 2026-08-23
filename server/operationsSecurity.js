const HOUR = 60 * 60 * 1000
const MAX_BUCKETS = 96
const buckets = new Map()

const routeClass = (path = "") => {
  if (path.startsWith("/api/admin/")) return "protected_admin"
  if (path.startsWith("/api/map/")) return "public_map"
  if (path.startsWith("/api/events")) return "analytics"
  if (path.startsWith("/api/resource-submissions")) return "resource_submission"
  if (path.startsWith("/api/")) return "public_api"
  return "public_page"
}
const statusClass = (status) => status >= 500 ? "server_error" : status === 429 ? "rate_limited" : status === 401 || status === 403 ? "access_rejected" : status >= 400 ? "validation_or_client_error" : "success"
const hourBucket = (now) => new Date(Math.floor(now / HOUR) * HOUR).toISOString()

export function recordOperation({ path, status, durationMs, now = Date.now() } = {}) {
  const route = routeClass(path), outcome = statusClass(Number(status || 0)), at = hourBucket(now), key = `${at}|${route}|${outcome}`
  const existing = buckets.get(key) || { at, route, outcome, count: 0, duration_total_ms: 0 }
  existing.count += 1
  existing.duration_total_ms += Math.max(0, Math.min(120_000, Number(durationMs) || 0))
  buckets.set(key, existing)
  if (buckets.size > MAX_BUCKETS) [...buckets.keys()].sort().slice(0, buckets.size - MAX_BUCKETS).forEach((old) => buckets.delete(old))
}

export function operationsSnapshot({ siteEvents = [], now = Date.now() } = {}) {
  const today = new Date(now).toISOString().slice(0, 10), week = new Date(now - 7 * 24 * HOUR).toISOString(), current = [...buckets.values()].filter((item) => item.at.slice(0, 10) === today)
  const eventCounts = (items) => items.reduce((all, item) => ({ ...all, [item.event_type]: Number(all[item.event_type] || 0) + 1 }), {})
  const todayEvents = siteEvents.filter((item) => String(item.created_at || "").slice(0, 10) === today), weekEvents = siteEvents.filter((item) => String(item.created_at || "") >= week)
  const requestCount = current.reduce((sum, item) => sum + item.count, 0), failures = current.filter((item) => item.outcome === "server_error").reduce((sum, item) => sum + item.count, 0), rejected = current.filter((item) => item.outcome === "access_rejected").reduce((sum, item) => sum + item.count, 0), rateLimited = current.filter((item) => item.outcome === "rate_limited").reduce((sum, item) => sum + item.count, 0)
  const findings = []
  if (failures >= 3) findings.push({ code: "repeated_server_errors", severity: "medium", confidence: .8, observation: `${failures} server errors were observed in the current local runtime day.`, protection: "Errors are normalized; request bodies are not retained.", recommendation: "Inspect the affected route class and server logs without collecting visitor content." })
  if (rejected >= 3) findings.push({ code: "protected_access_rejected", severity: "low", confidence: .9, observation: `${rejected} protected requests were rejected.`, protection: "Protected routes continued to require authorization.", recommendation: "No blocking action is recommended unless the pattern materially changes." })
  if (rateLimited >= 3) findings.push({ code: "rate_limit_active", severity: "low", confidence: .85, observation: `${rateLimited} requests were rate-limited.`, protection: "Existing rate limits rejected excess requests.", recommendation: "Review aggregate route-class pressure only if service availability is affected." })
  return { definition: "Visits are accepted page_view analytics events, not unique people.", activity: { visits_today: Number(eventCounts(todayEvents).page_view || 0), visits_last_7_days: Number(eventCounts(weekEvents).page_view || 0), searches_today: Number(eventCounts(todayEvents).search || 0), map_opens_today: Number(eventCounts(todayEvents).map_open || 0), list_opens_today: Number(eventCounts(todayEvents).list_open || 0), handout_uses_today: Number(eventCounts(todayEvents).handout_add || 0), recorded_events_today: todayEvents.length }, runtime: { request_count: requestCount, failed_requests: failures, rejected_protected_requests: rejected, rate_limited_requests: rateLimited, approximate_mean_latency_ms: requestCount ? Math.round(current.reduce((sum, item) => sum + item.duration_total_ms, 0) / requestCount) : null, retention: "in-memory aggregate route/status/hour buckets; no IP, session, body, token, or user-agent retained" }, findings, recent_buckets: current.sort((a, b) => b.count - a.count).slice(0, 12) }
}

export function securityPosture({ securityHeaders = true, corsAllowlist = true, jsonLimit = true, adminProtection = true, privateInsights = true, quarantine = true } = {}) {
  const checks = [
    ["security_headers", securityHeaders, "Expected defensive response headers are configured."],
    ["cors_allowlist", corsAllowlist, "Cross-origin requests are restricted by an allowlist."],
    ["request_size_limit", jsonLimit, "JSON requests have a bounded body limit."],
    ["admin_authentication", adminProtection, "Admin routes use server-side authorization."],
    ["private_insights", privateInsights, "Insights and directives are private service-role data."],
    ["attachment_quarantine", quarantine, "Attachments remain unavailable until a scan decision exists."],
  ].map(([id, passed, detail]) => ({ id, status: passed ? "pass" : "review_needed", detail }))
  return { status: checks.some((item) => item.status !== "pass") ? "review_needed" : "healthy", checks, threat_model: { assets: ["admin access", "canonical directory data", "private insights", "aggregate Human Needs", "attachments", "credentials"], threats: ["unauthorized admin access", "malformed requests", "rate abuse", "unsafe uploads", "secret/log leakage", "RLS or configuration regression"], controls: ["authorization", "RLS", "validated public writes", "request limits", "CSP and headers", "quarantine", "aggregate-only telemetry"] } }
}

export function clearOperationObservationsForTests() { buckets.clear() }
