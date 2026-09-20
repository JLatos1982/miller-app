import path from "node:path"
import { fileURLToPath } from "node:url"
import cors from "cors"
import express from "express"

import {
  MILLER_MOBILE_API_VERSION,
  buildMillerHybridSearchResponse,
  buildMillerMobileInventory,
  buildMillerMobileSearchResponse,
} from "./server/millerMobileApi.js"
import { millerMobileCatalog } from "./server/millerMobileCatalog.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 8787)
const bindHost = process.env.HOST || "0.0.0.0"
const rateLimits = new Map()

app.disable("x-powered-by")
app.set("trust proxy", 1)

function allowedCorsOrigins() {
  return new Set(String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean))
}

export function isAllowedCorsRequest(req) {
  const origin = String(req.headers.origin || "")
  if (!origin) return true
  const ownOrigin = `${req.protocol}://${req.get("host")}`
  return origin === ownOrigin || allowedCorsOrigins().has(origin)
    || (process.env.NODE_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin))
}

app.use((req, res, next) => {
  if (!isAllowedCorsRequest(req)) return res.status(403).json({ error: "Origin not allowed." })
  return cors({ origin: true, credentials: true, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] })(req, res, next)
})

export function setSecurityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", "object-src 'none'",
    "frame-src 'self' blob:", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org", "connect-src 'self'",
  ].join("; "))
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  next()
}

app.use(setSecurityHeaders)
app.use(express.json({ limit: "128kb", strict: true }))

export function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`
    const now = Date.now()
    const current = rateLimits.get(key)
    if (current && current.resetAt > now && current.count >= max) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000))
      return res.status(429).json({ error: "Too many requests. Please try again shortly." })
    }
    rateLimits.set(key, !current || current.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { ...current, count: current.count + 1 })
    return next()
  }
}

export function clearRateLimitsForTests() { rateLimits.clear() }

function invalidSearch(res, error) {
  return res.status(400).json({ error: "The search request was not valid.", code: String(error?.message || "invalid_request") })
}

const mobileSearchRateLimit = rateLimit({ windowMs: 60_000, max: 30 })

app.get("/api/health", (_req, res) => res.json({ status: "healthy", product: "miller-public", canonical_programs: 1361, physical_access_locations: 612 }))

app.get("/api/mobile/v1/about", (_req, res) => {
  const inventory = buildMillerMobileInventory(millerMobileCatalog)
  res.setHeader("Cache-Control", "public, max-age=300")
  return res.json({
    contract: MILLER_MOBILE_API_VERSION,
    authentication: "public_read_only_rate_limited",
    geography: Object.keys(inventory.by_province), coverage_maturity: inventory.coverage_maturity,
    workflow: { job: "understand_navigate_handoff", multi_need: true, explicit_broaden_nearby: true, location_semantics: ["located_here", "serves_community", "regional_intake", "province_navigation", "canada_wide"] },
    inventory, privacy: { query_stored: false, client_record_created: false },
  })
})

app.post("/api/miller/match-state", mobileSearchRateLimit, (req, res) => {
  try {
    const response = buildMillerMobileSearchResponse(req.body, millerMobileCatalog)
    res.setHeader("Cache-Control", "no-store")
    return res.json({ contract: MILLER_MOBILE_API_VERSION, match_state: response.match_state, interpreted: response.interpreted, workflow: response.workflow, search_scope: response.search_scope, coverage_maturity: response.coverage_maturity, broaden_nearby: response.broaden_nearby, direct_results: response.direct_results, broader_alternatives: response.broader_alternatives, source_policy: response.source_policy })
  } catch (error) { return invalidSearch(res, error) }
})

app.post("/api/mobile/v1/search", mobileSearchRateLimit, async (req, res) => {
  try {
    const response = await buildMillerHybridSearchResponse(req.body, millerMobileCatalog)
    res.setHeader("Cache-Control", "no-store")
    return res.json(response)
  } catch (error) { return invalidSearch(res, error) }
})

// The legacy web client already builds its local candidate pack. This compact
// deterministic adapter preserves its public response contract without model,
// database, admin, or operational dependencies.
app.post("/api/miller", mobileSearchRateLimit, (req, res) => {
  try {
    const response = buildMillerMobileSearchResponse({ query: req.body?.query, location: req.body?.city === "All Cities" ? "" : req.body?.city, limit: 20 }, millerMobileCatalog)
    return res.json({
      contractVersion: "1.0", mode: req.body?.interface || "main",
      message: response.guidance?.interpretation || "Here are verified Miller resources that may help.",
      results: response.results, searchIntent: response.interpreted?.primary_intent || null,
      locationContext: { status: response.interpreted?.location ? "community" : "none", label: response.interpreted?.location || "" },
      searchStrategy: { deterministic: true, externalSearchNotice: "" }, tavilyResults: [], searchHints: {},
    })
  } catch (error) { return invalidSearch(res, error) }
})

// Private and operational namespaces are intentionally absent from the public
// runtime. Return a non-disclosing 404 before the SPA fallback can handle them.
app.use(["/api/admin", "/api/integrations/samwise", "/api/internal", "/admin", "/owner"], (_req, res) => res.status(404).json({ error: "Not found." }))

app.use(express.static(path.join(__dirname, "dist")))
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, bindHost, () => console.log(`Miller public server running on http://${bindHost}:${port}`))
}

export { app }
