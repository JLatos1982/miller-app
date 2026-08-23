import "dotenv/config"

const args = new Set(process.argv.slice(2))
const endpoint = process.env.MILLER_AUTOMATION_SCHEDULER_URL || "http://127.0.0.1:8787"
const token = process.env.MILLER_AUTOMATION_SCHEDULER_TOKEN || ""
const localOnly = process.env.MILLER_AUTOMATION_SCHEDULER_LOCAL_ONLY === "true"
const host = new URL(endpoint).hostname

if (!args.has("--local-only") || !localOnly || process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost", "::1"].includes(host) || !token) {
  throw new Error("local_automation_scheduler_guard_denied")
}

const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/internal/automation-scheduler/tick`, {
  method: "POST",
  headers: { "x-miller-automation-token": token },
  signal: AbortSignal.timeout(45_000),
})
const result = await response.json().catch(() => ({ error: "invalid_scheduler_response" }))
if (!response.ok) throw new Error(result.code || result.error || "local_automation_scheduler_failed")
console.log(JSON.stringify({ status: result.status, children_started: result.children_started || 0, due: result.orientation?.due?.map((item) => item.id) || [], automation: result.orientation?.posture?.state || "unknown" }))
