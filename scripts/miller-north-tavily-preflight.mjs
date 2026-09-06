import "dotenv/config"

const configured = Boolean(process.env.TAVILY_API_KEY?.trim())
const result = { tavily_configured: configured, tavily_preflight_success: false, method: "established_direct_fetch", query_count: 1 }
if (configured) {
  try {
    const response = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: "Indigenous patient racism hospital Alberta", max_results: 1, topic: "general", search_depth: "basic", include_answer: false }) })
    result.http_status = response.status
    result.tavily_preflight_success = response.ok
    if (response.ok) result.result_count = (await response.json()).results?.length || 0
  } catch { result.error = "network_or_provider_unavailable" }
}
console.log(JSON.stringify(result, null, 2))
process.exitCode = result.tavily_preflight_success ? 0 : 1
