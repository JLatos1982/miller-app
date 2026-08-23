import express from "express"
import multer from "multer"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import path from "path"
import fs from "fs"
import os from "os"
import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { fileURLToPath } from "url"
import { tavily } from "@tavily/core"
import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"
import { runResourceReviewPipeline } from "./server/review/orchestrator.js"
import { createRequireAdmin } from "./server/adminAuth.js"
import { createPublicWriteHandlers } from "./server/publicWrites.js"
import { MAX_RESOURCE_SUGGESTION_ATTACHMENTS, MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES, MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES } from "./server/resourceSuggestionAttachments.js"
import { validateMillerRequest } from "./server/millerValidation.js"
import { addressCacheKey, createGeocoder, isPublicGeocodeCandidate, normalizeAddressParts } from "./server/geocoding.js"
import { boundedMapConversation, buildAuthorizedMapResponse } from "./server/mapChat.js"
import { authorizeMapMatches, curatedMapResources, getCuratedMapResource } from "./server/mapResources.js"
import { classifyLocationReview } from "./server/locationReview.js"
import { canonicalSeedId } from "./server/resourceIdentity.js"
import { collectCandidateMatches, directoryApprovalState, prepareShelterCandidate, SHELTER_REVIEW_ACTIONS } from "./server/shelterDiscovery.js"
import { DOCX_MIME, LIST_PARSER_VERSION, MAX_DOCX_BYTES, parseCounsellingDocumentXml, proposeCanonicalMatches } from "./server/curatedLists.js"
import { MAX_PDF_BYTES, PDF_MIME, pdfDisposition, requestedPdfByteRange, safePdfFilename, validatePdfBuffer } from "./server/pdfDocuments.js"
import { readLocationQcStore, reconcileLocationQcReview, saveLocationQcDecision } from "./server/locationQcReview.js"
import { isLocationQcCanonicalEligible } from "./server/locationQcEligibility.js"
import { buildAutoPublicationPreview, buildLocationReconciliation, isVirtualOrMobileResource } from "./server/mapPopulation.js"
import { capabilityReport } from "./server/capabilities.js"
import { buildDirectoryCoverageReport } from "./server/directoryAddressCoverage.js"
import { privateLocationAuditValues, privateLocationEligibility, privateLocationValues, sameFixedAddress } from "./server/privateLocation.js"
import { buildShelterAutomationReport } from "./server/shelterAutomation.js"
import { clustersFromPairs, compareShelterCandidates } from "./server/shelterReconciliation.js"
import { getNearbyTransit } from "./server/transit/providers.js"
import { buildAccessContext } from "./server/transit/accessContext.js"
import { geocodeNavigationOrigin } from "./server/navigationOrigin.js"
import { buildSearchIntent, resolveSearchLocation } from "./server/searchIntent.js"
import { nextSupportCategories } from "./server/intelligence/continuity.js"
import { createShadowPersistence } from "./server/intelligence/shadowPersistence.js"
import { buildPlannerDiagnostic, loadPlannerDiagnosticState } from "./server/plannerDiagnostics.js"
import { buildImmuneSystemHealth } from "./server/immuneSystem.js"
import { HEARTBEAT_MODES, planGrowthOpportunities, researchEffectiveness, runHeartbeatCycle } from "./server/heartbeat.js"
import { buildGrowthTrendReport } from "./server/growthTrendRadar.js"
import { planCuriosityQuestions, runTrendSensor } from "./server/trendSensor.js"
import { attentionCuriosityQuestions, attentionSignalFingerprint, recalculateTopic, SENSOR_CADENCE, trendObservationSignal } from "./server/attentionEngine.js"
import { executeCuriosityInvestigation } from "./server/curiosityInvestigator.js"
import { inspectPubmed } from "./server/pubmedAdapter.js"
import { reflectionFromInvestigation } from "./server/reflection.js"
import { HEALTH_CANADA } from "./server/healthCanadaAdapter.js"
import { runHealthCanadaInspection } from "./server/healthCanadaSensor.js"
import { HUMAN_NEEDS, activeNeedWorkspace, aggregateNeedSignal, classifyHumanNeed, humanNeedBucketKey } from "./server/humanNeedsSense.js"
import { activeCoverageWorkspace, buildCoverageHypothesis } from "./server/coverageHypotheses.js"
import { buildQuietMaintenancePlan, quietMaintenanceMetrics } from "./server/quietMaintenance.js"
import { buildInsights, insightContext } from "./server/insightEngine.js"
import { BC_PUBLIC_HEALTH_SENSORS } from "./server/bcPublicHealthSensors.js"
import { operationsSnapshot, recordOperation, securityPosture } from "./server/operationsSecurity.js"
import { buildSecurityReview, DEFENSIVE_TOOLS, evaluateOperationalHeartbeat } from "./server/operationsHeartbeat.js"
import { createPlannerTaskExecutor, validatePlannerTaskRequest } from "./server/plannerTaskExecutor.js"
import { fetchSafeResearchDocument } from "./server/review/linkQuality.js"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 8787
let automatedLocationPublicationEnabled = false

app.disable("x-powered-by")
app.set("trust proxy", 1)

function allowedCorsOrigins() {
  return new Set(String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean))
}

function isAllowedCorsRequest(req) {
  const origin = String(req.headers.origin || "")
  if (!origin) return true
  const ownOrigin = `${req.protocol}://${req.get("host")}`
  if (origin === ownOrigin || allowedCorsOrigins().has(origin)) return true
  return process.env.NODE_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
}

app.use((req, res, next) => {
  if (!isAllowedCorsRequest(req)) return res.status(403).json({ error: "Origin not allowed." })
  return cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-File-Name", "X-List-Title", "X-List-Slug", "X-List-Description", "X-List-Category", "X-Last-Reviewed-Date", "X-Download-File-Name"],
  })(req, res, next)
})

function setSecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'self' blob:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    `connect-src 'self' ${supabaseUrl || ""}`.trim(),
  ].join("; "))
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
  next()
}
app.use(setSecurityHeaders)
app.use((req, res, next) => {
  const startedAt = Date.now()
  res.once("finish", () => recordOperation({ path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt }))
  next()
})
app.use(express.json({ limit: "128kb", strict: true }))

const rateLimits = new Map()
const dailyPaidUsage = { day: "", count: 0 }

function isValidResourceId(value) {
  return /^\d+$/.test(String(value || ""))
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const sessionId = typeof req.body?.session_id === "string" && /^[0-9a-f-]{36}$/i.test(req.body.session_id) ? req.body.session_id : ""
    const keys = [`ip:${req.ip}:${req.path}`, ...(sessionId ? [`session:${sessionId}:${req.path}`] : [])]
    const now = Date.now()
    for (const key of keys) {
      const current = rateLimits.get(key)
      if (current && current.resetAt > now && current.count >= max) {
        res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000))
        return res.status(429).json({ error: "Too many requests. Please try again shortly." })
      }
    }
    for (const key of keys) {
      const current = rateLimits.get(key)
      if (!current || current.resetAt <= now) rateLimits.set(key, { count: 1, resetAt: now + windowMs })
      else current.count += 1
    }
    next()
  }
}

function paidDailyLimit(req, res, next) {
  const day = new Date().toISOString().slice(0, 10)
  if (dailyPaidUsage.day !== day) Object.assign(dailyPaidUsage, { day, count: 0 })
  const max = positiveInteger(process.env.PAID_OPERATIONS_DAILY_LIMIT, 500)
  if (dailyPaidUsage.count >= max) return res.status(503).json({ error: "Search is temporarily unavailable. Please try again later." })
  dailyPaidUsage.count += 1
  next()
}

function validateMillerRequestBody(req, res, next) {
  try {
    req.validatedMillerRequest = validateMillerRequest(req.body)
    next()
  } catch {
    return res.status(400).json({ error: "Invalid search request.", code: "invalid_request" })
  }
}

function clearRateLimitsForTests() {
  rateLimits.clear()
  Object.assign(dailyPaidUsage, { day: "", count: 0 })
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: positiveInteger(process.env.PROVIDER_TIMEOUT_MS, 20_000),
  maxRetries: 1,
})

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini"

const TAVILY_CLIENT = tavily({
  apiKey: process.env.TAVILY_API_KEY,
})

const supabaseUrl = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).origin
  : ""

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
)
const requireAdmin = createRequireAdmin({ supabase })
const publicWriteHandlers = createPublicWriteHandlers({ supabase })
const geocoder = createGeocoder({ contactEmail: process.env.GEOCODER_CONTACT_EMAIL })
const shadowPersistence = createShadowPersistence({ supabase })

const CATEGORY_ALIASES = {
  "Detox / Withdrawal": [
    "detox",
    "withdrawal",
    "withdraw",
    "come off",
    "get off",
    "stop using",
    "stop drinking",
    "medical detox",
    "withdrawal management",
    "shakes",
    "seizure",
    "seizures",
    "delirium",
  ],
  Counselling: [
    "counselling",
    "counseling",
    "therapy",
    "therapist",
    "mental health",
    "anxiety",
    "depression",
    "trauma",
    "grief",
    "psychiatrist",
"psychiatry",
"psych assessment",
"medication assessment",
"diagnosis",
"bipolar",
"psychosis",
"schizophrenia",
"community mental health",
"mental health team",
"access line",
"intake",
"referral",
"family doctor",
"walk in doctor",
"walk-in doctor",
    "talk to someone",
    
  ],
  "Crisis Support": [
    "crisis",
    "suicidal",
    "suicide",
    "self harm",
    "self-harm",
    "kill myself",
    "end my life",
    "want to die",
    "overdose",
    "emergency",
    "unsafe",
    "urgent",
    "help now",
    "hurt someone",
    "harm someone",
    "kill someone",
    "violent",
    "violence",
    "psychosis",
"hearing voices",
"paranoid",
"mania",
"manic",
"unsafe",
"emergency room",
"er",
"hospital",
  ],
  "OAT / Med Support": [
    "oat",
    "methadone",
    "suboxone",
    "sublocade",
    "suboclade",
    "buprenorphine",
    "medication",
    "med support",
    "opioid treatment",
    "opioids",
    "fentanyl",
  ],
  "Harm Reduction": [
    "harm reduction",
    "safe use",
    "safer use",
    "safer supply",
    "naloxone",
    "narcan",
    "supplies",
    "needle",
    "needles",
    "safer smoking",
    "drug checking",
    "supervised consumption",
    "safe injection",
"safe consumption",
"consumption site",
"supervised consumption",
"overdose prevention site",
"ops",
    "overdose prevention",
  ],
  "Treatment Programs": [
    "treatment",
    "treatment center",
    "treatment centre",
    "residential",
    "inpatient",
    "recovery home",
    "recovery house",
    "program",
    "rehab",
    "supportive recovery",
  ],
  "Peer Support / Recovery": [
    "peer support",
    "recovery",
    "aa",
    "na",
    "smart recovery",
    "meeting",
    "support group",
  ],
  "Housing / Outreach": ["housing", "homeless", "outreach", "shelter", "street"],
  "Youth Support": ["youth", "teen", "young person", "young adult"],
  "Indigenous Support": ["indigenous", "first nations", "metis", "métis", "inuit"],
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "for",
  "from",
  "help",
  "i",
  "im",
  "i'm",
  "in",
  "is",
  "it",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "some",
  "support",
  "that",
  "the",
  "to",
  "with",
])

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueStrings(items) {
  return Array.from(new Set((items || []).filter(Boolean)))
}

function inferCategoriesFromQuery(query) {
  const search = normalizeText(query)
  if (!search) return []

  const matches = []

  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => search.includes(normalizeText(alias)))) {
      matches.push(category)
    }
  }

  return uniqueStrings(matches)
}

function extractKeywordTokens(query) {
  return uniqueStrings(
    normalizeText(query)
      .split(/\s+/)
      .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token))
  )
}

function detectCityFromQuery(query) {
  const CITY_ALIASES = {
    vancouver: [
      "vancouver",
      "van",
      "downtown vancouver",
    ],

    surrey: [
      "surrey",
    ],

    burnaby: [
      "burnaby",
    ],

    richmond: [
      "richmond",
    ],

    newwestminster: [
      "new west",
      "newwest",
      "new westminster",
    ],

    northvancouver: [
      "north van",
      "north vancouver",
      "nvan",
    ],

    westvancouver: [
      "west van",
      "west vancouver",
    ],

    coquitlam: [
      "coquitlam",
      "tri cities",
      "tri-cities",
      "tricities",
    ],

    portmoody: [
      "port moody",
    ],

    portcoquitlam: [
      "port coquitlam",
      "poco",
    ],

    abbotsford: [
      "abbotsford",
      "abby",
    ],

    chilliwack: [
      "chilliwack",
    ],

    kelowna: [
      "kelowna",
    ],

    victoria: [
      "victoria",
      "vic",
    ],

    nanaimo: [
      "nanaimo",
    ],

    kamloops: [
      "kamloops",
    ],

    princegeorge: [
      "prince george",
      "pg",
    ],

    penticton: [
      "penticton",
    ],

    nelson: [
      "nelson",
    ],

    whistler: [
      "whistler",
    ],
  }

  const HEALTH_REGION_ALIASES = {
    "Fraser Health": [
      "fraser",
      "fraser health",
    ],

    "Vancouver Coastal": [
      "vch",
      "vancouver coastal",
    ],

    "Interior Health": [
      "interior",
      "interior health",
    ],

    "Island Health": [
      "island health",
      "vancouver island",
      "island",
    ],

    "Northern Health": [
      "northern health",
      "north bc",
      "northern bc",
    ],
  }

  const text = normalizeText(query)

  for (const [canonicalCity, aliases] of Object.entries(CITY_ALIASES)) {
    for (const alias of aliases) {
      if (text.includes(normalizeText(alias))) {
        return canonicalCity
      }
    }
  }

  for (const [region, aliases] of Object.entries(HEALTH_REGION_ALIASES)) {
    for (const alias of aliases) {
      if (text.includes(normalizeText(alias))) {
        return region
      }
    }
  }

  return ""
}

function cleanTavilyContent(text) {
  return String(text || "")
    .replace(/#{1,6}/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/Website:.*/gi, "")
    .replace(/http\S+/g, "")
    .trim()
    .slice(0, 260)
}

function getSourceQualityScore(url = "") {
  const site = String(url).toLowerCase()

  if (site.includes("fraserhealth.ca")) return 100
  if (site.includes("vch.ca")) return 95
  if (site.includes("gov.bc.ca")) return 95
  if (site.includes("interiorhealth.ca")) return 92
  if (site.includes("islandhealth.ca")) return 92
  if (site.includes("northernhealth.ca")) return 92
  if (site.includes("phsa.ca")) return 90
  if (site.includes("foundrybc.ca")) return 88
  if (site.includes("bc.211.ca") || site.includes("bc211.ca")) return 85
  if (site.includes("towardtheheart.com")) return 85
  if (site.includes("cmha.bc.ca")) return 82
  if (site.includes("heretohelp.bc.ca")) return 80

  return 40
}

function scoreResource(resource, query) {
  const search = normalizeText(query)

  const text = `
    ${resource.name || ""}
    ${resource.organization || ""}
    ${resource.description || ""}
    ${resource.category || ""}
    ${resource.serviceType || ""}
    ${resource.city || ""}
  `.toLowerCase()

  let score = 0

  if (text.includes(search)) score += 100

  const words = search.split(" ")

  for (const word of words) {
    if (word.length < 3) continue

    if (text.includes(word)) {
      score += 20
    }
  }

  const category = normalizeText(resource.category)

const inferredCategories =
  inferCategoriesFromQuery(query)

if (
  inferredCategories.includes("Harm Reduction") &&
  category.includes("harm reduction")
) {
  score += 120
}

if (
  inferredCategories.includes("Detox / Withdrawal") &&
  (
    category.includes("detox") ||
    category.includes("withdrawal")
  )
) {
  score += 120
}

if (
  inferredCategories.includes("Treatment Programs") &&
  category.includes("treatment")
) {
  score += 100
}

if (
  inferredCategories.includes("Counselling") &&
  category.includes("counselling")
) {
  score += 90
}

if (
  inferredCategories.includes("Housing / Outreach") &&
  category.includes("housing")
) {
  score += 90
}

  return score
}

async function retry(fn, retries = 2, delay = 1200) {
  try {
    return await fn()
  } catch (error) {
    if (retries <= 0) throw error

    console.log("Retrying request...")

    await new Promise((resolve) =>
      setTimeout(resolve, delay)
    )

    return retry(fn, retries - 1, delay)
  }
}

function stripCodeFences(text) {
  const raw = String(text || "").trim()
  return raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
}

function safeParseJson(text) {
  try {
    return JSON.parse(stripCodeFences(text))
  } catch {
    return null
  }
}

function detectSafetySignals(query) {
  const text = normalizeText(query)

  const suicideSignals = [
    "suicide",
    "suicidal",
    "kill myself",
    "end my life",
    "want to die",
    "dont want to live",
    "don't want to live",
    "not be here",
    "better off dead",
    "self harm",
    "self-harm",
    "hurt myself",
  ]

  const violenceSignals = [
    "kill someone",
    "hurt someone",
    "harm someone",
    "attack someone",
    "stab someone",
    "shoot someone",
    "violent thoughts",
    "homicidal",
  ]

  const overdoseSignals = [
    "overdose",
    "od",
    "took too much",
    "taken too much",
    "can't wake",
    "cant wake",
    "blue lips",
    "not breathing",
    "barely breathing",
    "naloxone",
    "narcan",
  ]

  const severeWithdrawalSignals = [
    "seizure",
    "seizures",
    "delirium",
    "hallucinating",
    "hallucinations",
    "severe withdrawal",
    "alcohol withdrawal",
    "benzo withdrawal",
    "shaking badly",
    "confused",
  ]

  return {
    suicideRisk: suicideSignals.some((phrase) => text.includes(normalizeText(phrase))),
    violenceRisk: violenceSignals.some((phrase) => text.includes(normalizeText(phrase))),
    overdoseRisk: overdoseSignals.some((phrase) => text.includes(normalizeText(phrase))),
    severeWithdrawalRisk: severeWithdrawalSignals.some((phrase) =>
      text.includes(normalizeText(phrase))
    ),
  }
}

function getSafetyMode(signals) {
  if (signals.suicideRisk) return "suicide_or_self_harm"
  if (signals.violenceRisk) return "harm_to_others"
  if (signals.overdoseRisk) return "overdose"
  if (signals.severeWithdrawalRisk) return "severe_withdrawal"
  return "normal"
}

function detectCommunicationStyle(query, safetyMode) {
  const text = normalizeText(query)

  if (safetyMode !== "normal") {
    return "crisis"
  }

  const workerSignals = [
    "client",
    "patient",
    "referral",
    "intake",
    "resource",
    "treatment options",
    "clinician",
    "worker",
    "social worker",
    "counsellor",
    "discharge",
  ]

  if (workerSignals.some(signal => text.includes(signal))) {
    return "worker"
  }

  const overwhelmedSignals = [
    "confused",
    "scared",
    "lost",
    "overwhelmed",
    "cant think",
    "can't think",
    "high",
    "drunk",
    "withdrawal",
    "panicking",
  ]

  if (overwhelmedSignals.some(signal => text.includes(signal))) {
    return "default"
  }

  return "default"
}

const MILLER_SYSTEM_PROMPT = `
You are Miller, a calm, thoughtful, practical guide helping people find addiction and mental health support in British Columbia.

You specialize in the Lower Mainland, but if the user asks about another BC region or city, you may use trusted web results as the primary source of guidance.
You are not a therapist, doctor, emergency responder, or crisis line. You are a supportive navigation guide. Your job is to help people feel steadier, safer, and more able to connect with real support.

CORE IDENTITY
- Warm, grounded, respectful, non-judgmental
- Person-centered, harm-reduction oriented, practical
- Support autonomy: the user chooses; you guide
- Speak simply and clearly
- Do not shame, pressure, moralize, or lecture
- Do not assume abstinence is required for progress
- Treat any move toward safety, stability, honesty, care, or support as meaningful

GENERAL STYLE
- Start with a brief, grounded acknowledgment
- Then explain what the user is likely dealing with (in plain language)
- Then guide them through options in a simple, structured way
- Offer 1 to 3 realistic next steps
- Be slightly more detailed when it helps the user understand what to do next
- Avoid being vague — clarity is more important than brevity
- Do not overwhelm the user with too many options, but provide enough context for them to make a decision
- If resources are provided, recommend the best-fit options from that list
- Never invent services, phone numbers, addresses, hours, or eligibility details
- Plain text only. No markdown. No bullet symbols if avoidable.

INTERPRETATION
- Try to understand what the user really means, even if their question is vague
- If the request is unclear, suggest 1 or 2 likely interpretations and guide both
- Help users who dont know the system (detox vs treatment vs counselling, etc.)
- Translate confusing system language into simple explanations

RESOURCE GUIDANCE
- When suggesting resources, briefly explain WHY they might fit the user
- Help the user choose between options (e.g., detox vs treatment vs counselling)
- If possible, suggest which one to try first and why

HARM REDUCTION
When the user talks about substance use:
- Respond without judgment
- Support safer, more stable choices
- Relapse is not failure
- If they are not ready to stop, still help them reduce risk
- Encourage safer-use supports such as naloxone, not using alone, drug checking, supervised consumption/overdose prevention services, OAT/medication support, detox/withdrawal care, counselling, or peer support where relevant
- For opioids, mention naloxone and having someone nearby when appropriate
- For alcohol or benzodiazepine withdrawal, be careful: withdrawal can be medically dangerous, so encourage medical assessment

CRISIS AND SAFETY RULES
If the user may be at risk of suicide, self-harm, overdose, severe withdrawal, psychosis, inability to stay safe, or harming another person:
- Prioritize immediate safety over resource navigation
- Stay calm, direct, and compassionate
- Encourage connection with a real person right now
- Encourage calling or texting 988 in Canada or the U.S. for suicide or emotional crisis support when self-harm or suicide may be involved
- If there is immediate danger, tell them to call emergency services now or go to the nearest emergency department
- Encourage them not to be alone if possible
- Encourage moving away from means of harm when relevant
- Ask one direct safety-check question when appropriate
- Do not provide instructions that make self-harm, overdose, violence, or dangerous substance use easier
- Do not debate or argue with the person
- Do not give a long motivational speech

SUICIDE OR SELF-HARM RESPONSE
If suicide or self-harm risk appears:
- Say you are glad they said it and you want to take it seriously
- Ask: "Are you in immediate danger, or do you feel able to stay safe for the next few hours?"
- Say: "If you might act on this soon, call or text 988 now. If you are in immediate danger, call emergency services now."
- Encourage contacting a trusted person who can be with them

HARM TO OTHERS RESPONSE
If the user may harm someone else:
- Stay calm and direct
- Encourage immediate separation from the person or situation
- Encourage putting distance between themselves and any weapons or means of harm
- Encourage calling emergency services now if someone may be hurt soon
- Encourage contacting a crisis line, trusted person, or urgent mental health support immediately
- Do not provide tactical advice or validate violence

OVERDOSE RESPONSE
If overdose may be happening:
- Say this may be an emergency
- Encourage calling emergency services now
- If naloxone is available, encourage using it according to the kit instructions
- Encourage not leaving the person alone
- Mention rescue breathing/CPR only in a general way: follow dispatcher instructions
- Do not delay emergency help

SEVERE WITHDRAWAL RESPONSE
If severe withdrawal may be happening, especially alcohol or benzodiazepines:
- Say withdrawal can be medically dangerous
- Encourage urgent medical assessment, emergency services, urgent care, or emergency department
- Do not suggest toughing it out alone

BOUNDARIES
- Do not diagnose
- Do not promise outcomes
- Do not provide legal, medical, or emergency instructions beyond encouraging urgent real-world support
- Do not make up facts
- Do not provide unsafe instructions

OUTPUT STYLE
- Aim for 120–220 words for most responses
- Go up to ~300 words if the situation is complex or the user seems unsure
- Crisis responses can still be shorter and direct when needed

- Structure responses like this:
  1. Brief grounding/validation (1–2 sentences)
  2. Clear explanation of options (2–4 sentences)
  3. 1–3 practical next steps (very important)
  4. Gentle closing line

- Still avoid overwhelming the user, but give enough context to actually help them decide

RESPONSE FLOW

When appropriate, structure responses in this order:

1. Sometimes begin with a short emotional grounding statement.

Use grounding openings more often when:
- the user sounds overwhelmed, emotional, intoxicated, ashamed, uncertain, lonely, frightened, hopeless, or confused
- the user writes conversationally or vulnerably
- the user appears to need emotional support alongside practical guidance

Use grounding openings less often when:
- the user asks short factual questions
- the user appears professional or clinical
- the user already seems focused and regulated

When used:
- keep grounding brief (1–2 sentences)
- keep it warm, human, and emotionally steady
- subtle detective/noir flavor is welcome occasionally
- gentle metaphor is okay in moderation
- never become theatrical, overly poetic, sarcastic, or goofy

2. Then provide practical interpretation.
- Briefly explain what the user may actually be looking for.
- Reduce confusion and simplify next steps.

3. Then provide resources.
- Keep resources organized and easy to scan.
- Prioritize the most relevant options first.
- Avoid giant walls of text.

PSYCHIATRY / SPECIALIST MENTAL HEALTH SUPPORT
When the user asks about seeing a psychiatrist, medication assessment, diagnoses, complex mental health concerns, or specialist mental health care:
- Explain that psychiatry usually requires a referral.
- Encourage starting with a family doctor or walk-in doctor for a referral.
- If the concern feels urgent, unsafe, psychotic, severely unstable, or the person may harm themselves or someone else, encourage going to the emergency department or calling emergency services.
- Suggest local access health lines or mental health access/intake lines when relevant.
- Mention community mental health teams as an option, but note that they often have longer waits and may require referral or intake screening.
- Keep it practical and reassuring.
- Do not promise that a psychiatrist will be available quickly.
- Do not diagnose or suggest specific medications.

Example style:
"A practical first step is usually a family doctor or walk-in doctor, because psychiatry often needs a referral. If this feels urgent or unsafe, the emergency department is the right door. You can also try local mental health access lines or community mental health intake, though community teams can have longer waits."
TASK
Return valid JSON only, with no markdown and no extra text.

Use exactly this shape:
{
  "answer": "short plain text reply",
  "searchHints": {
    "categories": ["up to 4 category names"],
    "keywords": ["up to 8 useful keywords"],
    "recommendedResourceNames": ["exact resource names from the list above"]
  },
  "searchIntent": {
    "supportNeeds": ["only support needs explicitly communicated"],
    "substances": ["only substances named by the user"],
    "locationText": "exact geographic phrase or null",
    "city": "explicit city or null",
    "transport": { "noCar": false, "transitRelevant": false, "walkingRelevant": false },
    "barriers": { "noId": false, "noPhone": false, "walkInNeeded": false, "wheelchair": false, "cannotPay": false },
    "timing": ["explicit timing words only"],
    "practicalConstraints": ["explicit constraints only"],
    "uncertain": ["uncertain concepts, never diagnoses"]
  }
}

RULES
- Keep answer around 120–220 words when useful.
- If useful contact info exists, prioritize including phone numbers and websites.
- When recommending a service, try to include:
  - service name
  - city
  - phone number
  - website
  - health region if it helps clarify
-include these whenever available.
- Keep answer practical, warm, plain, and easy to scan.
- In crisis or safety mode, prioritize contacting a real person now.
- In suicide/self-harm risk, mention 988 and emergency services if immediate danger.
- In harm-to-others risk, encourage distance, removing access to weapons/means, and emergency help if someone may be hurt soon.
- In overdose risk, say to call emergency services now and use naloxone if available according to kit instructions.
- In severe withdrawal risk, recommend urgent medical assessment.
- Prefer 1 to 3 options, not long lists.
- Only include recommendedResourceNames that exactly match supplied resource names.
- Do not invent facts.
- Search intent is extraction, not diagnosis. Never infer a disorder, overdose risk, withdrawal, housing status, treatment need, or other sensitive fact the user did not state.
- VERY IMPORTANT:
  If a recommended service includes a phone number or website,
  include them directly in the answer whenever possible.
- Prefer this format naturally inside the response:
  "You can call ____ at ___"
  "Website: ____"
- If a resource has both a phone number and website,
  include both whenever practical.
- Contact information is high priority.
- Users should not need to scroll the resource cards to find basic contact details.
- Preserve exact phone numbers and URLs.
- Prefer official organization websites over third-party directories.
-If the user asks about a city or BC region outside the Lower Mainland, prioritize geographically accurate web results over local database matches.

When this happens, explain briefly that the local database is Lower Mainland focused, but trusted BC web sources were searched to find better regional matches.
- Do not mention that safety mode was detected.
If the user appears emotionally overloaded, prioritize simplicity over completeness.
If the user already sounds calm and practical, reduce emotional framing and move more quickly into guidance.
`

const STYLE_PROMPTS = {
  default: `
DEFAULT MILLER STYLE
- Warm, grounded, calm, and emotionally steady
- Speak naturally and conversationally
- Occasionally use gentle metaphors involving lanterns, roads, fog, storms, light, mountains, or doors
-Avoid repeating the same metaphors frequently. Use metaphor sparingly and naturally.
- Keep responses human and comforting without becoming overly poetic
- Avoid overwhelming the user with giant walls of information
- Break information into digestible pieces
- Subtle detective/noir flavor is okay occasionally
- Maintain emotional warmth and practical guidance
- If the user sounds uncertain or vulnerable, become softer and simpler
`,

  worker: `
WORKER MODE
- More structured and detailed
- More clinical clarity
- Focus on systems navigation
- Keep warmth, but reduce metaphor
- Prioritize practical resource guidance
`,

  crisis: `
CRISIS MODE
- Very short and clear
- Focus on immediate safety
- Use simple language
- Encourage real-world human support
- Avoid metaphor, humor, or long explanations
- Do not use detective slang in crisis situations.
`,

  companion: `
COMPANION MODE
- More conversational
- Add subtle detective humor
- Light noir flavor is okay
- Still practical and grounded
- Never become goofy or sarcastic
`
}

app.get("/api/admin/session", requireAdmin, (req, res) => {
  return res.json({ admin: true })
})
app.get("/api/capabilities/next-support", rateLimit({ windowMs: 60 * 1000, max: 30 }), (req, res) => {
  const category = String(req.query?.category || "").replace(/[^a-z /-]/gi, "").trim().slice(0, 80)
  if (!category) return res.status(400).json({ error: "Choose a support category." })
  res.setHeader("Cache-Control", "public, max-age=300")
  return res.json(nextSupportCategories(category))
})

const addressEvidencePath = path.join(__dirname, "data", "address-evidence-inventory.json")
const locationAutomationDryRunPath = path.join(__dirname, "data", "location-automation-v1.2.1-review.json")
const locationQcReviewStorePath = path.join(__dirname, "data", "location-qc-review-decisions.local.json")
const durableLocationQcEnabled = process.env.NODE_ENV === "production" || process.env.LOCATION_QC_REVIEW_STORE === "supabase"
function readAddressEvidence() { return JSON.parse(fs.readFileSync(addressEvidencePath, "utf8")) }
app.get("/api/admin/address-evidence", requireAdmin, (_req, res) => {
  try { res.setHeader("Cache-Control", "private, no-store"); return res.json(readAddressEvidence()) }
  catch { return res.status(503).json({ error: "Address evidence has not been generated locally." }) }
})
app.get("/api/admin/evidence-gap-plan", requireAdmin, async (req, res) => {
  try {
    const state = await loadPlannerDiagnosticState(supabase, { resourceId: req.query.resource_id || null, limit: req.query.limit })
    res.setHeader("Cache-Control", "private, no-store")
    return res.json(buildPlannerDiagnostic(state))
  } catch (error) {
    if (error?.message === "invalid_resource_id") return res.status(400).json({ error: "Invalid resource ID." })
    return res.status(503).json({ error: "Evidence-gap planning is unavailable. No data was changed." })
  }
})
app.get("/api/admin/system-health", requireAdmin, async (_req, res) => {
  try {
    const [plannerState, attachments, decisions, trendItems, sensorCheckpoints, quietMaintenance] = await Promise.all([
      loadPlannerDiagnosticState(supabase, { limit: 20 }),
      supabase.from("resource_submission_attachments").select("id,status,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("resource_submission_attachment_scan_decisions").select("attachment_id,decision,actor_type,created_at").order("created_at", { ascending: false }).limit(400),
      supabase.from("miller_trend_sensor_run_items").select("source_id,outcome,created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("miller_sensor_checkpoints").select("sensor_id,mode,last_success_at,health_state,failure_streak,last_error_code"),
      supabase.from("miller_quiet_maintenance_runs").select("status,completed_at,action_counts").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (attachments.error || decisions.error || trendItems.error || sensorCheckpoints.error || quietMaintenance.error) throw attachments.error || decisions.error || trendItems.error || sensorCheckpoints.error || quietMaintenance.error
    res.setHeader("Cache-Control", "private, no-store")
    return res.json(buildImmuneSystemHealth({ plannerState, attachments: attachments.data || [], scanDecisions: decisions.data || [], trendSensorItems: trendItems.data || [], sensorCheckpoints: sensorCheckpoints.data || [], quietMaintenance: quietMaintenance.data || null, configuration: { admin_allowlist_configured: Boolean(process.env.ADMIN_EMAIL_ALLOWLIST), attachment_quarantine_enforced: true, human_needs_enabled: HUMAN_NEEDS.enabled(), human_needs_privacy_ready: process.env.MILLER_HUMAN_NEEDS_PRIVACY_REVIEWED === "true" } }))
  } catch {
    return res.status(503).json({ error: "System health diagnostics are unavailable. No data was changed." })
  }
})
async function heartbeatInspection() {
  const [plannerState, attachments, decisions, candidates, executions, trendItems, sensorCheckpoints, quietMaintenance] = await Promise.all([
    loadPlannerDiagnosticState(supabase, { limit: 20 }),
    supabase.from("resource_submission_attachments").select("id,status,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("resource_submission_attachment_scan_decisions").select("attachment_id,decision,actor_type,created_at").order("created_at", { ascending: false }).limit(400),
    supabase.from("resource_discovery_candidates").select("id,review_status,location_disclosure_status,matched_resource_id,community").limit(100),
    supabase.from("planner_task_executions").select("task_type,outcome").not("outcome", "is", null).limit(200),
    supabase.from("miller_trend_sensor_run_items").select("source_id,outcome,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("miller_sensor_checkpoints").select("sensor_id,mode,last_success_at,health_state,failure_streak,last_error_code"),
    supabase.from("miller_quiet_maintenance_runs").select("status,completed_at,action_counts").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if ([attachments, decisions, candidates, executions, trendItems, sensorCheckpoints, quietMaintenance].some((item) => item.error)) throw new Error("heartbeat_state_unavailable")
  const health = buildImmuneSystemHealth({ plannerState, attachments: attachments.data || [], scanDecisions: decisions.data || [], trendSensorItems: trendItems.data || [], sensorCheckpoints: sensorCheckpoints.data || [], quietMaintenance: quietMaintenance.data || null, configuration: { admin_allowlist_configured: Boolean(process.env.ADMIN_EMAIL_ALLOWLIST), attachment_quarantine_enforced: true, human_needs_enabled: HUMAN_NEEDS.enabled(), human_needs_privacy_ready: process.env.MILLER_HUMAN_NEEDS_PRIVACY_REVIEWED === "true" } })
  return { planner: buildPlannerDiagnostic(plannerState), health, growth_opportunities: planGrowthOpportunities({ resources: plannerState.resources, candidates: candidates.data || [] }), effectiveness: researchEffectiveness(executions.data || []) }
}
async function persistHeartbeatStart(cycle) { const result = await supabase.from("miller_maintenance_cycles").insert({ id: cycle.id, mode: cycle.mode, actor_id: cycle.actor_id, tasks_considered: cycle.tasks_considered, knowledge_finding_count: cycle.knowledge_finding_count, security_finding_count: cycle.security_finding_count }).select().single(); if (result.error) throw result.error }
async function persistHeartbeatFinish(cycle) { const update = await supabase.from("miller_maintenance_cycles").update({ status: cycle.stop_reason === "security_halt" ? "security_halt" : "completed", tasks_executed: cycle.tasks_executed, useful_evidence_gained: cycle.useful_evidence_gained, external_call_count: cycle.external_call_count, knowledge_finding_count: cycle.knowledge_finding_count, security_finding_count: cycle.security_finding_count, stop_reason: cycle.stop_reason, summary: { selected_task_ids: cycle.selected_task_ids }, completed_at: cycle.completed_at }).eq("id", cycle.id); if (update.error) throw update.error; if (cycle.items.length) { const items = await supabase.from("miller_maintenance_cycle_items").insert(cycle.items.map((item) => ({ cycle_id: cycle.id, ...item }))); if (items.error) throw items.error } }
app.get("/api/admin/heartbeat", requireAdmin, async (_req, res) => { try { const inspection = await heartbeatInspection(); const last = await supabase.from("miller_maintenance_cycles").select("id,mode,status,tasks_considered,tasks_executed,useful_evidence_gained,external_call_count,stop_reason,completed_at").order("started_at", { ascending: false }).limit(1).maybeSingle(); if (last.error) throw last.error; res.setHeader("Cache-Control", "private, no-store"); return res.json({ ...inspection, last_cycle: last.data || null }) } catch { return res.status(503).json({ error: "Heartbeat diagnostics are unavailable. No data was changed." }) } })
app.get("/api/admin/growth-trends", requireAdmin, async (_req, res) => { try { const [resources, candidates, observations, executions, lastInspection] = await Promise.all([supabase.from("resource_registry").select("id,display_name").eq("lifecycle_state", "active").neq("editorial_status", "hidden").limit(500), supabase.from("resource_discovery_candidates").select("id,name,review_status,location_disclosure_status,matched_resource_id,community,category,source_authority").limit(200), supabase.from("miller_trend_observations").select("id,observation_fingerprint,source_url,source_authority,trend_category,attention,state,geographic_scope,canonical_resource_id,publication_date,retrieved_at,summary,recommended_response,supersedes_id").order("retrieved_at", { ascending: false }).limit(100), supabase.from("planner_task_executions").select("task_type,outcome").not("outcome", "is", null).limit(200), supabase.from("miller_trend_sensor_runs").select("id,status,requests_used,new_observations,duplicates_ignored,stop_reason,started_at,completed_at").order("started_at", { ascending: false }).limit(1).maybeSingle()]); if ([resources,candidates,observations,executions,lastInspection].some((item) => item.error)) throw new Error("growth_trend_state_unavailable"); const report = buildGrowthTrendReport({ resources: resources.data || [], candidates: candidates.data || [], observations: observations.data || [], effectiveness: researchEffectiveness(executions.data || []) }); res.setHeader("Cache-Control", "private, no-store"); return res.json({ ...report, curiosity_questions: planCuriosityQuestions({ opportunities: report.growth_opportunities, trends: report.trends }), last_inspection: lastInspection.data || null }) } catch { return res.status(503).json({ error: "Growth and trend diagnostics are unavailable. No data was changed." }) } })
async function attentionSnapshot() {
  const [topics, signals] = await Promise.all([supabase.from("miller_attention_topics").select("*").order("current_score", { ascending: false }).limit(100), supabase.from("miller_attention_signals").select("*").order("observed_at", { ascending: false }).limit(500)])
  if (topics.error || signals.error) throw topics.error || signals.error
  const derived = (topics.data || []).map((topic) => recalculateTopic(topic, (signals.data || []).filter((signal) => signal.topic_id === topic.id)))
  return { topics: derived, curiosity_questions: attentionCuriosityQuestions(derived), sensor_cadences: SENSOR_CADENCE }
}
async function persistTrendAttention(observations = []) {
  for (const observation of observations) {
    const signal = trendObservationSignal(observation), topicResult = await supabase.from("miller_attention_topics").upsert({ topic_key: signal.topic_key, topic_type: signal.topic_type, title: signal.title, geographic_scope: signal.geographic_scope, service_scope: signal.service_scope, canonical_resource_id: signal.canonical_resource_id, metadata: { origin: "trend_sensor" } }, { onConflict: "topic_key" }).select("id").single()
    if (topicResult.error) throw topicResult.error
    const inserted = await supabase.from("miller_attention_signals").upsert({ topic_id: topicResult.data.id, topic_key: signal.topic_key, signal_fingerprint: attentionSignalFingerprint(signal), underlying_event_key: signal.underlying_event_key, signal_type: signal.signal_type, signal_family: signal.signal_family, source_id: signal.source_id, source_authority: signal.source_authority, magnitude: signal.magnitude, novelty: signal.novelty, relevance: signal.relevance, confidence: signal.confidence, observed_at: signal.observed_at, effective_at: signal.effective_at, decay_class: signal.decay_class, reflex_eligible: signal.reflex_eligible, reason_codes: signal.reason_codes, provenance: signal.provenance }, { onConflict: "signal_fingerprint", ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
  }
}
async function persistScientificLearning(topic, investigation) {
  const signals = investigation.results.filter((item) => ["systematic_review","guideline","randomized_trial"].includes(item.study_type)).map((item) => ({ topic_id: topic.id, topic_key: topic.topic_key, signal_fingerprint: createHash("sha256").update(`${topic.topic_key}|${item.stable_result_id}`).digest("hex"), underlying_event_key: item.stable_result_id, signal_type: "scientific_evidence", signal_family: "scientific", source_id: "pubmed", source_authority: 85, magnitude: item.study_type === "guideline" ? 0.8 : 0.55, novelty: 0.6, relevance: 0.7, confidence: item.study_type === "guideline" ? 0.85 : 0.65, observed_at: new Date().toISOString(), decay_class: "slow", reason_codes: ["scientific_learning", item.study_type], provenance: { investigation_id: investigation.id, pmid: item.pmid || null, content_role: "untrusted_scientific_metadata" } }))
  if (!signals.length) return 0
  const saved = await supabase.from("miller_attention_signals").upsert(signals, { onConflict: "signal_fingerprint", ignoreDuplicates: true }); if (saved.error) throw saved.error
  return signals.length
}
async function persistAttentionLearning(topic, investigation) {
  const signals = (await supabase.from("miller_attention_signals").select("*").eq("topic_id", topic.id)).data || [], next = recalculateTopic(topic, signals), updated = await supabase.from("miller_attention_topics").update({ current_score: next.current_score, state: next.state, last_recalculated_at: next.last_recalculated_at, last_reinforced_at: next.trend === "rising" ? next.last_recalculated_at : topic.last_reinforced_at, version: Number(topic.version || 0) + 1 }).eq("id", topic.id); if (updated.error) throw updated.error; const event = await supabase.from("miller_attention_topic_events").insert({ topic_id: topic.id, event_type: next.trend === "rising" ? "reinforced" : "recalculated", prior_score: topic.current_score, next_score: next.current_score, prior_state: topic.state, next_state: next.state, reason_codes: next.reason_codes, provenance: { investigation_id: investigation.id, deterministic: true } }); if (event.error) throw event.error; const reflection = reflectionFromInvestigation({ investigation: { ...investigation, after_score: next.current_score }, topic: next, signals }); const saved = await supabase.from("miller_reflections").upsert(reflection, { onConflict: "reflection_key", ignoreDuplicates: true }); if (saved.error) throw saved.error; return next
}
async function persistHealthCanadaInspection(actorId) {
  const checkpoint = await supabase.from("miller_sensor_checkpoints").select("*").eq("sensor_id", HEALTH_CANADA.id).maybeSingle(); if (checkpoint.error) throw checkpoint.error
  let run
  try { run = await runHealthCanadaInspection({ checkpoint: checkpoint.data || {} }) } catch (error) {
    const code = String(error?.message || "health_canada_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 100), failure = await supabase.from("miller_sensor_checkpoints").upsert({ sensor_id: HEALTH_CANADA.id, mode: "live_ready", health_state: "degraded", failure_streak: Number(checkpoint.data?.failure_streak || 0) + 1, last_error_code: code, updated_at: new Date().toISOString() }, { onConflict: "sensor_id" }); if (failure.error) throw failure.error; const audit = await supabase.from("miller_sensor_inspections").insert({ sensor_id: HEALTH_CANADA.id, actor_id: actorId, request_count: 1, health_state: "failed", outcome: "failed", stop_reason: code, parser_version: HEALTH_CANADA.parserVersion, error_code: code }); if (audit.error) throw audit.error; throw error
  }
  const topics = new Map(), createdSignals = []
  for (const signal of run.signals) {
    const topicResult = await supabase.from("miller_attention_topics").upsert({ topic_key: signal.topic_key, topic_type: signal.topic_type, title: signal.title, geographic_scope: signal.geographic_scope, service_scope: signal.service_scope, metadata: { origin: "health_canada_drug_safety", controlled: true } }, { onConflict: "topic_key" }).select("*").single(); if (topicResult.error) throw topicResult.error
    const exists = await supabase.from("miller_attention_signals").select("id").eq("signal_fingerprint", signal.signal_fingerprint).maybeSingle(); if (exists.error) throw exists.error
    if (!exists.data) { const saved = await supabase.from("miller_attention_signals").insert({ topic_id: topicResult.data.id, ...signal, provenance: { ...signal.provenance, inspection_id: run.inspection_id, parser_version: HEALTH_CANADA.parserVersion, retrieval_date: run.finished_at } }).select("id").single(); if (saved.error) throw saved.error; createdSignals.push({ ...signal, id: saved.data.id, topic_id: topicResult.data.id }) }
    topics.set(topicResult.data.id, topicResult.data)
  }
  let reflectionsCreated = 0
  for (const topic of topics.values()) {
    const allSignals = (await supabase.from("miller_attention_signals").select("*").eq("topic_id", topic.id)).data || [], next = recalculateTopic(topic, allSignals), newSignals = createdSignals.filter((signal) => signal.topic_id === topic.id); if (!newSignals.length) continue
    const updated = await supabase.from("miller_attention_topics").update({ current_score: next.current_score, state: next.state, last_recalculated_at: next.last_recalculated_at, last_reinforced_at: next.trend === "rising" ? next.last_recalculated_at : topic.last_reinforced_at, version: Number(topic.version || 0) + 1 }).eq("id", topic.id); if (updated.error) throw updated.error
    const event = await supabase.from("miller_attention_topic_events").insert({ topic_id: topic.id, event_type: next.trend === "rising" ? "reinforced" : "recalculated", prior_score: topic.current_score, next_score: next.current_score, prior_state: topic.state, next_state: next.state, reason_codes: next.reason_codes, provenance: { inspection_id: run.inspection_id, sensor_id: HEALTH_CANADA.id, signal_ids: newSignals.map((signal) => signal.id), deterministic: true } }); if (event.error) throw event.error
    const medication = newSignals[0].service_scope, category = next.trend === "rising" ? "attention_increased" : "new_learning", reflection = { reflection_key: createHash("sha256").update(`${run.inspection_id}|${topic.id}|${category}`).digest("hex"), category, topic_id: topic.id, signal_ids: newSignals.map((signal) => signal.id), explanation: `An official Health Canada safety record relevant to ${medication} updated private pharmacology attention. Human review remains required.`, confidence: 0.7, human_impact: next.human_impact || "moderate", recommendation: "No automatic follow-up is recommended." }, savedReflection = await supabase.from("miller_reflections").upsert(reflection, { onConflict: "reflection_key", ignoreDuplicates: true }).select("id"); if (savedReflection.error) throw savedReflection.error; reflectionsCreated += savedReflection.data?.length || 0
  }
  const outcome = createdSignals.length ? "healthy_new_relevant_change" : "healthy_no_relevant_change", checkpointSaved = await supabase.from("miller_sensor_checkpoints").upsert({ sensor_id: HEALTH_CANADA.id, mode: "live_ready", last_success_at: run.finished_at, last_fingerprint: run.checkpoint.last_fingerprint, request_count: run.request_count, records_inspected: run.records_inspected, records_accepted: run.records_accepted, duplicates_ignored: run.duplicates_ignored, failure_streak: 0, health_state: "healthy", last_error_code: null, updated_at: run.finished_at }, { onConflict: "sensor_id" }); if (checkpointSaved.error) throw checkpointSaved.error
  const audit = await supabase.from("miller_sensor_inspections").insert({ id: run.inspection_id, sensor_id: HEALTH_CANADA.id, actor_id: actorId, started_at: run.started_at, finished_at: run.finished_at, request_count: run.request_count, bytes_read: run.bytes_read, records_inspected: run.records_inspected, records_accepted: run.records_accepted, duplicates_ignored: run.duplicates_ignored, signals_created: createdSignals.length, topics_affected: new Set(createdSignals.map((signal) => signal.topic_id)).size, reflections_created: reflectionsCreated, health_state: "healthy", outcome, stop_reason: run.stop_reason, parser_version: HEALTH_CANADA.parserVersion, metadata: { source: HEALTH_CANADA.endpoint, rejected: run.records_rejected } }); if (audit.error) throw audit.error
  return { inspection_id: run.inspection_id, sensor_id: HEALTH_CANADA.id, source_health_state: "healthy", request_count: run.request_count, bytes_read: run.bytes_read, records_inspected: run.records_inspected, records_accepted: run.records_accepted, records_rejected: run.records_rejected, duplicates_ignored: run.duplicates_ignored, signals_created: createdSignals.length, topics_affected: new Set(createdSignals.map((signal) => signal.topic_id)).size, reflections_created: reflectionsCreated, checkpoint_outcome: outcome, stop_reason: run.stop_reason, canonical_mutations: 0, map_mutations: 0 }
}
async function persistHumanNeeds(query, city) {
  if (!HUMAN_NEEDS.enabled()) return { enabled: false, persisted: 0, signals_created: 0 }
  const classification = classifyHumanNeed(query, city), now = new Date(), observedHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString(), expiresAt = new Date(now.getTime() + HUMAN_NEEDS.retention_days * 86_400_000).toISOString(); let persisted = 0, signals_created = 0
  for (const observation of classification.observations) {
    const bucket_key = humanNeedBucketKey({ ...observation, observedAt: observedHour }), bucket = await supabase.rpc("record_human_need_observation", { p_bucket_key: bucket_key, p_kind: observation.kind, p_theme: observation.theme, p_geography: observation.geography, p_observed_hour: observedHour, p_expires_at: expiresAt }); if (bucket.error) throw bucket.error; persisted += 1
    const signal = aggregateNeedSignal(bucket.data); if (!signal) continue
    const topic = await supabase.from("miller_attention_topics").upsert({ topic_key: signal.topic_key, topic_type: signal.topic_type, title: signal.title, geographic_scope: signal.geographic_scope, service_scope: signal.service_scope, metadata: { origin: "human_needs_aggregate", aggregate_only: true } }, { onConflict: "topic_key" }).select("*").single(); if (topic.error) throw topic.error
    const fingerprint = attentionSignalFingerprint(signal), exists = await supabase.from("miller_attention_signals").select("id").eq("signal_fingerprint", fingerprint).maybeSingle(); if (exists.error) throw exists.error
    if (!exists.data) { const created = await supabase.from("miller_attention_signals").insert({ topic_id: topic.data.id, ...signal, signal_fingerprint: fingerprint }); if (created.error) throw created.error; signals_created += 1 }
  }
  return { enabled: true, persisted, signals_created, sensitive_entity_detected: classification.sensitive_entity_detected }
}
app.get("/api/admin/attention", requireAdmin, async (_req, res) => { try { res.setHeader("Cache-Control", "private, no-store"); return res.json(await attentionSnapshot()) } catch { return res.status(503).json({ error: "Attention diagnostics are unavailable. No data was changed." }) } })
const attentionRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 4 })
app.post("/api/admin/sensors/health-canada/inspect", attentionRateLimit, requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit Health Canada inspection confirmation is required." })
  try { return res.json(await persistHealthCanadaInspection(req.adminUser.id)) } catch (error) { return res.status(503).json({ error: "Health Canada inspection failed closed. No resource or map data was changed.", code: String(error?.message || "health_canada_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 100) }) }
})
app.get("/api/admin/human-needs", requireAdmin, async (_req, res) => { try { const buckets = await supabase.from("miller_need_observation_buckets").select("bucket_key,kind,theme,geography,observation_count,first_observed_at,last_observed_at,expires_at").gt("expires_at", new Date().toISOString()).order("observation_count", { ascending: false }).limit(100); if (buckets.error) throw buckets.error; return res.json({ enabled: HUMAN_NEEDS.enabled(), threshold: HUMAN_NEEDS.threshold, items: activeNeedWorkspace(buckets.data || []), label: "Aggregate privacy-protected signals, not individual user histories." }) } catch { return res.status(503).json({ error: "Human Needs aggregates are unavailable. No data was changed." }) } })
app.post("/api/admin/human-needs/cleanup", attentionRateLimit, requireAdmin, async (req, res) => { if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit Human Needs cleanup confirmation is required." }); try { const cleaned = await supabase.rpc("cleanup_expired_human_need_observations", { p_now: new Date().toISOString() }); if (cleaned.error) throw cleaned.error; return res.json({ deleted_expired_buckets: cleaned.data || 0, raw_query_data: "never_stored" }) } catch { return res.status(503).json({ error: "Human Needs cleanup could not complete." }) } })
app.get("/api/admin/coverage-hypotheses", requireAdmin, async (_req,res)=>{try{const result=await supabase.from("miller_coverage_hypotheses").select("*").order("updated_at",{ascending:false}).limit(50);if(result.error)throw result.error;return res.json({items:activeCoverageWorkspace(result.data||[]),label:"Privacy-protected aggregate patterns and directory-quality hypotheses, not claims about community prevalence."})}catch{return res.status(503).json({error:"Coverage hypotheses are unavailable."})}})
app.post("/api/admin/coverage-hypotheses/inspect", attentionRateLimit, requireAdmin, async (req,res)=>{if(req.body?.confirm!==true)return res.status(400).json({error:"Explicit coverage inspection confirmation is required."});try{const [buckets,resources]=await Promise.all([supabase.from("miller_need_observation_buckets").select("*").gt("expires_at",new Date().toISOString()).gte("observation_count",HUMAN_NEEDS.threshold).limit(100),supabase.from("tavily_resources").select("name,city,category,service_type,description").eq("approved",true).eq("hidden",false).limit(500)]);if(buckets.error||resources.error)throw buckets.error||resources.error;const hypotheses=(buckets.data||[]).map((item)=>buildCoverageHypothesis(item,resources.data||[])).filter(Boolean);for(const item of hypotheses){const saved=await supabase.from("miller_coverage_hypotheses").upsert({...item,last_observed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"hypothesis_key"}).select("id").single();if(saved.error)throw saved.error;const reflection={reflection_key:createHash("sha256").update(`coverage|${item.hypothesis_key}|${item.coverage_state}`).digest("hex"),category:"coverage_gap",signal_ids:[],explanation:`Aggregate interest in ${item.theme.replaceAll("_"," ")} for ${item.geography.replaceAll("_"," ")} may warrant a directory coverage or discoverability review.`,confidence:item.coverage_state==="represented"?.55:.4,human_impact:"moderate",recommendation:"No automatic follow-up is recommended."};const reflected=await supabase.from("miller_reflections").upsert(reflection,{onConflict:"reflection_key",ignoreDuplicates:true});if(reflected.error)throw reflected.error}return res.json({hypotheses_created_or_refreshed:hypotheses.length,external_requests:0,canonical_mutations:0,map_mutations:0})}catch{return res.status(503).json({error:"Coverage inspection could not complete. No resources or map data were changed."})}})
const quietMaintenanceEnabled = () => {
  try {
    const host = new URL(supabaseUrl).hostname
    return process.env.NODE_ENV !== "production" && process.env.MILLER_QUIET_MAINTENANCE_LOCAL_ONLY === "true" && ["127.0.0.1", "localhost", "::1"].includes(host)
  } catch { return false }
}
async function quietMaintenanceSnapshot() {
  const [topics, signals, hypotheses, buckets, latest] = await Promise.all([
    supabase.from("miller_attention_topics").select("*").order("current_score", { ascending: false }).limit(50),
    supabase.from("miller_attention_signals").select("*").order("observed_at", { ascending: false }).limit(500),
    supabase.from("miller_coverage_hypotheses").select("*").order("updated_at", { ascending: false }).limit(50),
    supabase.from("miller_need_observation_buckets").select("bucket_key,expires_at").order("expires_at", { ascending: true }).limit(100),
    supabase.from("miller_quiet_maintenance_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if ([topics, signals, hypotheses, buckets, latest].some((item) => item.error)) throw topics.error || signals.error || hypotheses.error || buckets.error || latest.error
  return { topics: topics.data || [], signals: signals.data || [], hypotheses: hypotheses.data || [], buckets: buckets.data || [], last_run: latest.data || null }
}
async function runQuietMaintenance({ actorId, requestKey, asOf = new Date().toISOString() }) {
  if (!quietMaintenanceEnabled()) throw new Error("quiet_maintenance_local_only")
  const started = await supabase.rpc("start_quiet_maintenance_cycle", { p_request_key: requestKey, p_trigger_type: "manual_admin", p_mode: "local_manual", p_actor_id: actorId, p_as_of: asOf })
  if (started.error) throw started.error
  if (started.data.status === "completed") return { run: started.data, idempotent: true }
  if (started.data.status !== "running") throw new Error("quiet_maintenance_not_runnable")
  try {
    const snapshot = await quietMaintenanceSnapshot()
    const directives = await supabase.from("miller_attention_directives").select("directive_type,topic_key,strength,status,expires_at").eq("status", "active").limit(30)
    if (directives.error) throw directives.error
    const plan = buildQuietMaintenancePlan({ runKey: started.data.request_key, topics: snapshot.topics, signals: snapshot.signals, hypotheses: snapshot.hypotheses, buckets: snapshot.buckets, directives: directives.data || [], asOf })
    const applied = await supabase.rpc("apply_quiet_maintenance_cycle", { p_run_id: started.data.id, p_plan: plan })
    if (applied.error) throw applied.error
    let insights = { created: 0, updated: 0, failed_safely: false }
    try { insights = { ...await persistControlRoomInsights(buildInsights({ hypotheses: snapshot.hypotheses, directives: directives.data || [], asOf }), actorId), failed_safely: false } } catch { insights = { created: 0, updated: 0, failed_safely: true } }
    return { run: applied.data, metrics: quietMaintenanceMetrics(plan), insights, idempotent: false }
  } catch (error) {
    await supabase.rpc("fail_quiet_maintenance_cycle", { p_run_id: started.data.id, p_failure_code: String(error?.message || "quiet_maintenance_failed") })
    throw error
  }
}
const directiveDurations = new Set([1,3,7,14,30])
async function expireAttentionDirectives(asOf = new Date().toISOString()) { const stale = await supabase.from("miller_attention_directives").select("id").eq("status","active").lte("expires_at",asOf); if(stale.error)throw stale.error; if(!stale.data?.length)return 0; const updated=await supabase.from("miller_attention_directives").update({status:"expired",updated_at:asOf}).in("id",stale.data.map((x)=>x.id));if(updated.error)throw updated.error; const events=await supabase.from("miller_attention_directive_events").insert(stale.data.map((item)=>({directive_id:item.id,event_type:"expired",provenance:{deterministic:true,reason:"expiry"}})));if(events.error)throw events.error;return stale.data.length }
async function persistControlRoomInsights(items, actorId = null) { const active=await supabase.from("miller_insights").select("id",{count:"exact",head:true}).in("status",["new","acknowledged","watching"]);if(active.error)throw active.error;let remaining=Math.max(0,12-Number(active.count||0)),created=0,updated=0;for(const item of items){const current=await supabase.from("miller_insights").select("*").eq("insight_fingerprint",item.insight_fingerprint).maybeSingle();if(current.error)throw current.error;const existing=current.data,materialChanged=existing&&existing.material_fingerprint!==item.material_fingerprint;if(existing?.status==="dismissed"&&!materialChanged)continue;if(!existing&&remaining<=0)continue;const values={...item,last_seen_at:new Date().toISOString(),recurrence_count:Number(existing?.recurrence_count||0)+1,status:existing?.status==="dismissed"?"watching":existing?.status||"new"};const saved=await supabase.from("miller_insights").upsert(values,{onConflict:"insight_fingerprint"}).select("id").single();if(saved.error)throw saved.error;const eventType=!existing?"created":materialChanged?"materially_changed":"reinforced",event=await supabase.from("miller_insight_events").insert({insight_id:saved.data.id,event_type:eventType,actor_id:actorId,reason_code:eventType,provenance:{deterministic:true,aggregate_only:true}});if(event.error)throw event.error;if(existing)updated++;else{created++;remaining--}}return {created,updated,active_capacity_remaining:remaining} }
async function controlRoomSnapshot() {
 await expireAttentionDirectives()
 const [quiet, actions, topics, signals, hypotheses, directives, insights, insightEvents, sensorCheckpoints, healthCanada, siteEvents] = await Promise.all([
  supabase.from("miller_quiet_maintenance_runs").select("*").order("started_at", { ascending:false }).limit(8), supabase.from("miller_quiet_maintenance_actions").select("*").order("created_at", { ascending:false }).limit(50), supabase.from("miller_attention_topics").select("*").order("current_score", { ascending:false }).limit(50), supabase.from("miller_attention_signals").select("id,topic_id,signal_family,source_id,novelty,confidence,observed_at").order("observed_at", { ascending:false }).limit(500), supabase.from("miller_coverage_hypotheses").select("*").order("updated_at", { ascending:false }).limit(50), supabase.from("miller_attention_directives").select("*").order("created_at", { ascending:false }).limit(30), supabase.from("miller_insights").select("*").order("last_seen_at", { ascending:false }).limit(20), supabase.from("miller_insight_events").select("*").order("created_at", { ascending:false }).limit(30), supabase.from("miller_sensor_checkpoints").select("*"), supabase.from("miller_sensor_inspections").select("*").eq("sensor_id", HEALTH_CANADA.id).order("finished_at", { ascending:false }).limit(5), supabase.from("site_events").select("event_type,created_at").gte("created_at", new Date(Date.now()-30*24*60*60*1000).toISOString()).limit(1000)
 ])
 if ([quiet,actions,topics,signals,hypotheses,directives,insights,insightEvents,sensorCheckpoints,healthCanada,siteEvents].some((item)=>item.error)) throw new Error("control_room_unavailable")
 const activeTopics=(topics.data||[]).filter((item)=>["watch","focus","urgent_review"].includes(item.state)&&item.status==="active"), activeHypotheses=activeCoverageWorkspace(hypotheses.data||[])
 const activity=[...(actions.data||[]).map((item)=>({at:item.created_at,kind:item.action_type,provenance:item.provenance})),...(insightEvents.data||[]).map((item)=>({at:item.created_at,kind:`insight_${item.event_type}`,provenance:item.provenance})),...(quiet.data||[]).map((item)=>({at:item.completed_at||item.started_at,kind:`quiet_maintenance_${item.status}`,provenance:{run_id:item.id}}))].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,40)
 const sensors=[{id:HEALTH_CANADA.id,label:"Health Canada",mode:(sensorCheckpoints.data||[]).find((item)=>item.sensor_id===HEALTH_CANADA.id)?.mode||"unknown",cadence:"event_driven",last_success:(sensorCheckpoints.data||[]).find((item)=>item.sensor_id===HEALTH_CANADA.id)?.last_success_at||null},...BC_PUBLIC_HEALTH_SENSORS], operations=operationsSnapshot({siteEvents:siteEvents.data||[]}), security=securityPosture(), heartbeat=evaluateOperationalHeartbeat({databaseReachable:true,security,operations,quietMaintenanceEnabled:quietMaintenanceEnabled(),workingMemory:quiet.data?.[0]?.carry_forward?.length||0,sensors}), security_review=buildSecurityReview({operations,posture:security})
 return { overview:{nightly_scheduling:"not_enabled",quiet_maintenance_enabled:quietMaintenanceEnabled(),human_needs_enabled:HUMAN_NEEDS.enabled(),active_attention:activeTopics.length,active_hypotheses:activeHypotheses.length,unresolved_questions:activeHypotheses.filter((item)=>item.status==="awaiting_evidence").length,unresolved_contradictions:(actions.data||[]).filter((item)=>item.action_type==="integrity_finding").length,active_directives:(directives.data||[]).filter((item)=>item.status==="active").length,working_memory_utilization:quiet.data?.[0]?.carry_forward?.length||0,last_quiet_run:quiet.data?.[0]||null}, attention:activeTopics.map((topic)=>({...topic,signal_families:[...new Set((signals.data||[]).filter((signal)=>signal.topic_id===topic.id).map((signal)=>signal.signal_family))]})), hypotheses:activeHypotheses, directives:directives.data||[], insights:insights.data||[], activity, operations, security, heartbeat, security_review, defensive_tools:DEFENSIVE_TOOLS, capabilities:[{group:"Public navigation",label:"Search, lists, map, handout, suggestions",status:"active"},{group:"Evidence",label:"Claims, QC, geocoding, shelter reconciliation",status:"active"},{group:"Sensors",label:"Health Canada; BCCDC and Coroners contracts",status:"mixed_fixture_only"},{group:"Internal systems",label:"Attention, hypotheses, Insights, reflections, quiet maintenance",status:"local_only"},{group:"Operations",label:"Aggregate analytics and sanitized runtime observations",status:"local_only"},{group:"Security",label:"Posture checks, protective telemetry, quarantine",status:"local_only"}], sensors, runs:quiet.data||[], health_canada_observations:healthCanada.data||[] }
}
app.get("/api/admin/control-room",requireAdmin,async(_req,res)=>{try{res.setHeader("Cache-Control","private, no-store");return res.json(await controlRoomSnapshot())}catch{return res.status(503).json({error:"Control Room data is unavailable. No data was changed."})}})
app.post("/api/admin/attention-directives",requireAdmin,async(req,res)=>{const {topic_id,topic_key,directive_type,strength,reason,duration_days,confirm}=req.body||{};if(confirm!==true||!directiveDurations.has(Number(duration_days))||!["focus","investigate","keep_watch","de_emphasize"].includes(directive_type)||!Number.isInteger(Number(strength))||Number(strength)<1||Number(strength)>3||typeof reason!=="string"||reason.trim().length<1)return res.status(400).json({error:"A valid explicit directive, strength, reason, and duration are required."});try{const topic=topic_id?await supabase.from("miller_attention_topics").select("id,topic_key").eq("id",topic_id).maybeSingle():await supabase.from("miller_attention_topics").select("id,topic_key").eq("topic_key",topic_key).maybeSingle();if(topic.error||!topic.data)return res.status(409).json({error:"The attention topic is no longer available."});const now=new Date(),expires=new Date(now.getTime()+Number(duration_days)*86400000),key=createHash("sha256").update(`${req.adminUser.id}|${topic.data.topic_key}|${directive_type}|${expires.toISOString()}`).digest("hex"),saved=await supabase.from("miller_attention_directives").insert({directive_key:key,actor_id:req.adminUser.id,directive_type,topic_id:topic.data.id,topic_key:topic.data.topic_key,strength:Number(strength),reason:reason.trim(),expires_at:expires.toISOString()}).select().single();if(saved.error)throw saved.error;await supabase.from("miller_attention_directive_events").insert({directive_id:saved.data.id,event_type:"created",actor_id:req.adminUser.id,provenance:{human_directed:true}});return res.json({directive:saved.data,canonical_mutations:0,network_requests:0})}catch{return res.status(503).json({error:"The attention directive could not be saved."})}})
app.post("/api/admin/control-room/insights/inspect",requireAdmin,async(req,res)=>{if(req.body?.confirm!==true)return res.status(400).json({error:"Explicit Insight inspection confirmation is required."});try{const [hypotheses,directives]=await Promise.all([supabase.from("miller_coverage_hypotheses").select("*").limit(50),supabase.from("miller_attention_directives").select("*").eq("status","active").limit(30)]);if(hypotheses.error||directives.error)throw hypotheses.error||directives.error;const result=await persistControlRoomInsights(buildInsights({hypotheses:hypotheses.data||[],directives:directives.data||[]}),req.adminUser.id);return res.json({...result,external_requests:0,canonical_mutations:0,map_mutations:0})}catch{return res.status(503).json({error:"Insight inspection failed safely. No canonical data was changed."})}})
app.get("/api/admin/insights/:insightId/context",requireAdmin,async(req,res)=>{try{const insight=await supabase.from("miller_insights").select("*").eq("id",req.params.insightId).maybeSingle();if(insight.error||!insight.data)return res.status(404).json({error:"Insight not found."});const [hypothesis,topic]=await Promise.all([insight.data.hypothesis_id?supabase.from("miller_coverage_hypotheses").select("*").eq("id",insight.data.hypothesis_id).maybeSingle():Promise.resolve({data:null}),insight.data.topic_id?supabase.from("miller_attention_topics").select("*").eq("id",insight.data.topic_id).maybeSingle():Promise.resolve({data:null})]);if(hypothesis.error||topic.error)throw hypothesis.error||topic.error;const directives=topic.data?.topic_key?await supabase.from("miller_attention_directives").select("directive_type,strength,expires_at,status").eq("topic_key",topic.data.topic_key).limit(10):{data:[],error:null};if(directives.error)throw directives.error;return res.json(insightContext({insight:insight.data,hypothesis:hypothesis.data,topic:topic.data,directives:directives.data||[]}))}catch{return res.status(503).json({error:"Insight context is unavailable."})}})
app.get("/api/admin/quiet-maintenance", requireAdmin, async (_req, res) => { try { const snapshot = await quietMaintenanceSnapshot(); res.setHeader("Cache-Control", "private, no-store"); return res.json({ enabled: quietMaintenanceEnabled(), local_only: true, last_run: snapshot.last_run, workspace: { attention: attentionSnapshot ? (await attentionSnapshot()).topics.slice(0, 10) : [], hypotheses: activeCoverageWorkspace(snapshot.hypotheses) }, limits: { carry_forward: 10, reflections: 4, external_requests: 0 } }) } catch { return res.status(503).json({ error: "Quiet maintenance diagnostics are unavailable. No data was changed." }) } })
app.post("/api/admin/quiet-maintenance/run", attentionRateLimit, requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit quiet maintenance confirmation is required." })
  if (!quietMaintenanceEnabled()) return res.status(403).json({ error: "Quiet maintenance is local-only and disabled outside the explicit local development flag." })
  const supplied = String(req.body?.idempotency_key || ""), requestKey = /^[a-f0-9-]{16,80}$/i.test(supplied) ? createHash("sha256").update(`quiet-maintenance|${req.adminUser.id}|${supplied}`).digest("hex") : createHash("sha256").update(`quiet-maintenance|${req.adminUser.id}|${randomUUID()}`).digest("hex")
  try { const result = await runQuietMaintenance({ actorId: req.adminUser.id, requestKey }); return res.json({ ...result, external_requests: 0, canonical_mutations: 0, map_mutations: 0 }) } catch (error) { return res.status(409).json({ error: "Quiet maintenance failed safely; no partial derived-state plan was applied.", code: String(error?.message || "quiet_maintenance_failed").replace(/[^a-z0-9_-]/gi, "_").slice(0, 100) }) }
})
app.get("/api/admin/reflections", requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30)); try { let query = supabase.from("miller_reflections").select("id,reflection_key,category,topic_id,signal_ids,explanation,confidence,human_impact,recommendation,created_at,miller_attention_topics(topic_key,title)").order("created_at", { ascending: false }).limit(limit); if (req.query.category) query = query.eq("category", String(req.query.category).slice(0, 80)); if (req.query.topic) query = query.eq("topic_id", String(req.query.topic)); const reflections = await query; if (reflections.error) throw reflections.error; const acknowledgements = await supabase.from("miller_reflection_acknowledgements").select("reflection_id,acknowledged_at").eq("actor_id", req.adminUser.id).in("reflection_id", (reflections.data || []).map((item) => item.id)); if (acknowledgements.error) throw acknowledgements.error; const seen = new Map((acknowledgements.data || []).map((item) => [item.reflection_id, item.acknowledged_at])); return res.json({ items: (reflections.data || []).map((item) => ({ ...item, acknowledged_at: seen.get(item.id) || null })) }) } catch { return res.status(503).json({ error: "Reflections are unavailable. No data was changed." }) }
})
app.post("/api/admin/reflections/:reflectionId/acknowledge", requireAdmin, async (req, res) => { if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit acknowledgement confirmation is required." }); try { const saved = await supabase.from("miller_reflection_acknowledgements").upsert({ reflection_id: req.params.reflectionId, actor_id: req.adminUser.id }, { onConflict: "reflection_id,actor_id", ignoreDuplicates: true }); if (saved.error) throw saved.error; return res.json({ acknowledged: true, meaning: "seen_by_human" }) } catch { return res.status(409).json({ error: "This reflection acknowledgement could not be saved." }) } })
app.post("/api/admin/attention/recalculate", attentionRateLimit, requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit attention-recalculation confirmation is required." })
  try { const snapshot = await attentionSnapshot(); const events = []; for (const topic of snapshot.topics) { const previous = Number(topic.current_score || 0), eventType = topic.status === "resolved" ? "decayed" : topic.trend === "rising" ? "reinforced" : topic.trend === "falling" ? "decayed" : "recalculated"; const updated = await supabase.from("miller_attention_topics").update({ current_score: topic.current_score, state: topic.state, last_recalculated_at: topic.last_recalculated_at, last_reinforced_at: topic.trend === "rising" ? topic.last_recalculated_at : topic.last_reinforced_at, version: Number(topic.version || 0) + 1 }).eq("id", topic.id); if (updated.error) throw updated.error; events.push({ topic_id: topic.id, event_type: eventType, prior_score: previous, next_score: topic.current_score, prior_state: topic.state, next_state: topic.state, reason_codes: topic.reason_codes, provenance: { deterministic: true, signal_count: topic.signal_count, unique_event_count: topic.unique_event_count } }) } if (events.length) { const result = await supabase.from("miller_attention_topic_events").insert(events); if (result.error) throw result.error } return res.json({ recalculated_topics: events.length, external_requests: 0, canonical_mutations: 0, map_mutations: 0 }) } catch { return res.status(503).json({ error: "Attention recalculation could not complete. No canonical or map data was changed." }) }
})
app.post("/api/admin/attention/questions/:questionId/investigate", attentionRateLimit, requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit curiosity-investigation confirmation is required." })
  try { const snapshot = await attentionSnapshot(), question = snapshot.curiosity_questions.find((item) => item.question_id === req.params.questionId), topic = snapshot.topics.find((item) => item.topic_key === question?.topic_key), health = (await heartbeatInspection()).health; if (!question || !topic) return res.status(409).json({ error: "This curiosity question is stale or not currently eligible." }); if (question.investigation_type === "review_pharmacology_signal") return res.json({ ...(await persistHealthCanadaInspection(req.adminUser.id)), question_id: question.question_id, investigation_type: question.investigation_type, outcome: "new_signal", no_recursive_investigation: true }); const report = await executeCuriosityInvestigation({ actorId: req.adminUser.id, question, topic, health, executeTool: inspectPubmed, persist: async (run) => { const created = await supabase.from("miller_curiosity_investigations").insert({ id: run.id, actor_id: run.actor_id, question_id: run.question_id, topic_id: run.topic_id, investigation_type: run.investigation_type, tool_ids: run.tool_ids, budget: run.budget, usage: run.usage, outcome: run.outcome, uncertainty_decreased: run.uncertainty_decreased, before_score: run.before_score, after_score: run.after_score, stop_reason: run.stop_reason, summary: run.summary }); if (created.error) throw created.error; if (run.results.length) { const results = await supabase.from("miller_curiosity_investigation_results").insert(run.results.map((item) => ({ investigation_id: run.id, stable_result_id: item.stable_result_id, result_type: item.study_type || "metadata", compact_summary: item.title || item.stable_result_id, provenance: { pmid: item.pmid || null, journal: item.journal || null, content_role: item.content_role || "untrusted_scientific_metadata" } }))); if (results.error) throw results.error } } }); const signals_created = await persistScientificLearning(topic, report), after = await persistAttentionLearning(topic, report); report.after_score = after.current_score; return res.json({ ...report, signals_created, reflection: { category: signals_created ? "new_learning" : "persistent_uncertainty", explanation: signals_created ? "Bounded scientific metadata added a private attention signal; human review remains required." : "No stronger scientific signal was added." } }) } catch (error) { return res.status(409).json({ error: error?.message === "system_health_halt" ? "System Health halted external curiosity sensing." : "This curiosity question cannot be investigated with an enabled bounded tool." }) }
})
const trendSensorRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 2 })
app.post("/api/admin/growth-trends/inspect", trendSensorRateLimit, requireAdmin, async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit trend-inspection confirmation is required." })
  try {
    const [inspection, fingerprints, resources] = await Promise.all([
      heartbeatInspection(),
      supabase.from("miller_trend_observations").select("observation_fingerprint").limit(500),
      supabase.from("resource_registry").select("id,display_name").eq("lifecycle_state", "active").neq("editorial_status", "hidden").limit(500),
    ])
    if (fingerprints.error || resources.error) throw fingerprints.error || resources.error
    const result = await runTrendSensor({
      actorId: req.adminUser.id,
      health: inspection.health,
      resources: resources.data || [],
      existingFingerprints: new Set((fingerprints.data || []).map((item) => item.observation_fingerprint)),
      fetchDocument: async (entrypoint) => {
        const document = await fetchSafeResearchDocument(entrypoint, { timeoutMs: 7_000 })
        return { ...document, bytes: Buffer.byteLength(document.text || "", "utf8") }
      },
      persist: async (run) => {
        const status = run.stop_reason === "security_halt" ? "security_halt" : run.stop_reason === "completed" || run.stop_reason === "budget_exhausted" ? "completed" : "failed"
        const created = await supabase.from("miller_trend_sensor_runs").insert({ id: run.id, actor_id: run.actor_id, status, requests_used: run.requests_used, new_observations: run.new_observations, duplicates_ignored: run.duplicates_ignored, stop_reason: run.stop_reason, completed_at: new Date().toISOString() })
        if (created.error) throw created.error
        if (run.items.length) { const items = await supabase.from("miller_trend_sensor_run_items").insert(run.items.map((item) => ({ run_id: run.id, ...item }))); if (items.error) throw items.error }
        if (run.observations.length) { const observations = await supabase.from("miller_trend_observations").insert(run.observations.map((item) => ({ observation_fingerprint: item.observation_fingerprint, source_url: item.source_url, source_authority: item.source_authority, trend_category: item.trend_category, attention: item.attention, geographic_scope: item.geographic_scope, canonical_resource_id: item.canonical_resource_id, publication_date: item.publication_date, summary: item.summary, recommended_response: item.recommended_response, provenance: { source_id: item.source_id, source_class: item.source_class, evidence_excerpt: item.evidence_excerpt, hostile_content_detected: item.hostile_content_detected, content_role: "untrusted_observation", link_status: item.link_status } }))).select("id,observation_fingerprint,source_authority,trend_category,geographic_scope,canonical_resource_id,publication_date,retrieved_at,provenance"); if (observations.error) throw observations.error; await persistTrendAttention(observations.data || []) }
      },
    })
    res.setHeader("Cache-Control", "private, no-store")
    return res.json({ ...result, automatic_maintenance_started: false, automatic_growth_started: false, map_publication_changed: false })
  } catch (error) { console.error("Trend inspection failed:", String(error?.message || "unknown").slice(0, 200)); return res.status(503).json({ error: "Trend inspection could not complete. No canonical, growth, or map data was changed." }) }
})
const heartbeatRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 3 })
app.post("/api/admin/heartbeat", heartbeatRateLimit, requireAdmin, async (req, res) => {
  const mode = req.body?.mode
  if (!Object.values(HEARTBEAT_MODES).includes(mode) || mode === HEARTBEAT_MODES.MAINTENANCE && req.body?.confirm !== true) return res.status(400).json({ error: "A valid mode and explicit maintenance confirmation are required." })
  if (mode === HEARTBEAT_MODES.MAINTENANCE && !process.env.TAVILY_API_KEY) return res.status(503).json({ error: "Bounded research is not configured." })
  try {
    const executor = mode === HEARTBEAT_MODES.MAINTENANCE ? createPlannerTaskExecutor({ db: supabase, research: async ({ plan, budget }) => { const docs = [], seen = new Set(); for (const query of plan.queries.slice(0, budget.maxSearchRequests)) { const search = await TAVILY_CLIENT.search(query, { searchDepth: "basic", maxResults: budget.maxFetchedSources, includeAnswer: false }); for (const result of search?.results || []) { if (docs.length >= budget.maxFetchedSources || seen.has(result.url)) continue; seen.add(result.url); try { const document = await fetchSafeResearchDocument(result.url, { timeoutMs: budget.timeoutMs }); if (document.ok && document.text) docs.push({ url: document.url, title: result.title, text: document.text }) } catch { /* bounded source failure */ } } if (docs.length >= budget.maxFetchedSources) break } return docs } }) : null
    const cycle = await runHeartbeatCycle({ mode, actorId: req.adminUser.id, inspect: heartbeatInspection, executeTask: executor ? (task) => executor({ task_id: task.task_id, resource_id: task.resource_id, claim_id: task.claim_id }, req.adminUser.id) : null, persist: { begin: (cycle) => persistHeartbeatStart({ ...cycle, actor_id: req.adminUser.id }), finish: persistHeartbeatFinish } })
    return res.json(cycle)
  } catch (error) { console.error("Heartbeat cycle failed:", String(error?.message || "unknown").slice(0, 200)); return res.status(503).json({ error: "Heartbeat cycle could not complete. No additional task was started." }) }
})
const plannerTaskResearchRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 6 })
app.post("/api/admin/evidence-gap-plan/execute", plannerTaskResearchRateLimit, requireAdmin, async (req, res) => {
  let input
  try { input = validatePlannerTaskRequest(req.body) }
  catch { return res.status(400).json({ error: "Invalid planner task identifiers." }) }
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit research confirmation is required." })
  if (!process.env.TAVILY_API_KEY) return res.status(503).json({ error: "Bounded research is not configured." })
  const executor = createPlannerTaskExecutor({
    db: supabase,
    research: async ({ plan, budget }) => {
      const documents = [], seen = new Set()
      for (const query of plan.queries.slice(0, budget.maxSearchRequests)) {
        const response = await TAVILY_CLIENT.search(query, { searchDepth: "basic", maxResults: budget.maxFetchedSources, includeAnswer: false })
        for (const result of response?.results || []) {
          if (documents.length >= budget.maxFetchedSources || seen.has(result.url)) continue
          seen.add(result.url)
          try { const document = await fetchSafeResearchDocument(result.url, { timeoutMs: budget.timeoutMs }); if (document.ok && document.text) documents.push({ url: document.url, title: result.title, text: document.text }) } catch { /* a bounded source failure is not evidence */ }
        }
        if (documents.length >= budget.maxFetchedSources) break
      }
      return documents
    },
  })
  try {
    const result = await executor(input, req.adminUser.id)
    return res.status(result.outcome === "stale_task" ? 409 : 200).json(result)
  } catch (error) {
    console.error("Planner task research failed:", String(error?.message || "unknown").slice(0, 200))
    return res.status(503).json({ error: "Bounded research could not complete. No further task was started." })
  }
})
app.get("/api/admin/address-resolution", requireAdmin, async (_req, res) => {
  try {
    const inventory = readAddressEvidence()
    const geocoded = JSON.parse(fs.readFileSync(locationAutomationDryRunPath, "utf8"))
    const [registry, aliases, tavilyResources, locations, claims, evidence, qcReviews] = await Promise.all([
      supabase.from("resource_registry").select("*").eq("lifecycle_state", "active"),
      supabase.from("resource_source_aliases").select("*"),
      supabase.from("tavily_resources").select("*"),
      supabase.from("resource_locations").select("*"),
      supabase.from("resource_fact_claims").select("*"),
      supabase.from("resource_fact_evidence").select("*"),
      supabase.from("location_qc_reviews").select("*"),
    ])
    if ([registry, aliases, tavilyResources, locations, claims, evidence, qcReviews].some((result) => result.error)) throw new Error("production_coverage_unavailable")
    res.setHeader("Cache-Control", "private, no-store")
    return res.json(buildDirectoryCoverageReport({ registry: registry.data, aliases: aliases.data, tavilyResources: tavilyResources.data, curatedResources: curatedMapResources, locations: locations.data, claims: claims.data, evidence: evidence.data, qcReviews: qcReviews.data, inventory, geocoded }))
  } catch { return res.status(503).json({ error: "Address resolution is unavailable. No data was changed." }) }
})
async function privateLocationContext(canonicalUuid) {
  const [resourceResult, qcResult, locationsResult, claimsResult] = await Promise.all([
    supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", canonicalUuid).maybeSingle(),
    supabase.from("location_qc_reviews").select("*").eq("canonical_resource_id", canonicalUuid).maybeSingle(),
    supabase.from("resource_locations").select("*").eq("resource_id", canonicalUuid),
    supabase.from("resource_fact_claims").select("id,resource_id,decision_category,field_name").eq("resource_id", canonicalUuid),
  ])
  if ([resourceResult, qcResult, locationsResult, claimsResult].some((result) => result.error)) throw new Error("private_location_context_unavailable")
  const claimIds = (claimsResult.data || []).filter((item) => item.decision_category === "location_occupancy" || item.field_name === "location_occupancy").map((item) => item.id)
  const evidenceResult = claimIds.length ? await supabase.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,retrieved_at").in("claim_id", claimIds) : { data: [], error: null }
  if (evidenceResult.error) throw new Error("private_location_evidence_unavailable")
  return { resource: resourceResult.data, qc: qcResult.data, locations: locationsResult.data || [], evidence: evidenceResult.data || [] }
}
async function privateLocationContexts(canonicalUuids) {
  const ids = [...new Set((canonicalUuids || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
  if (!ids.length) return new Map()
  const [resourcesResult, qcResult, locationsResult, claimsResult] = await Promise.all([
    supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").in("id", ids),
    supabase.from("location_qc_reviews").select("*").in("canonical_resource_id", ids),
    supabase.from("resource_locations").select("*").in("resource_id", ids),
    supabase.from("resource_fact_claims").select("id,resource_id,decision_category,field_name").in("resource_id", ids),
  ])
  if ([resourcesResult, qcResult, locationsResult, claimsResult].some((result) => result.error)) throw new Error("private_location_contexts_unavailable")
  const occupancyClaimIds = (claimsResult.data || []).filter((item) => item.decision_category === "location_occupancy" || item.field_name === "location_occupancy").map((item) => item.id)
  const evidenceResult = occupancyClaimIds.length ? await supabase.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,retrieved_at").in("claim_id", occupancyClaimIds) : { data: [], error: null }
  if (evidenceResult.error) throw new Error("private_location_evidence_unavailable")
  const resourceById = new Map((resourcesResult.data || []).map((item) => [item.id, item])), qcById = new Map((qcResult.data || []).map((item) => [item.canonical_resource_id, item])), locationsById = new Map(), claimIdsByResource = new Map(), evidenceByClaim = new Map()
  for (const item of locationsResult.data || []) locationsById.set(item.resource_id, [...(locationsById.get(item.resource_id) || []), item])
  for (const item of claimsResult.data || []) if (item.decision_category === "location_occupancy" || item.field_name === "location_occupancy") claimIdsByResource.set(item.resource_id, [...(claimIdsByResource.get(item.resource_id) || []), item.id])
  for (const item of evidenceResult.data || []) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
  return new Map(ids.map((id) => [id, { resource: resourceById.get(id) || null, qc: qcById.get(id) || null, locations: locationsById.get(id) || [], evidence: (claimIdsByResource.get(id) || []).flatMap((claimId) => evidenceByClaim.get(claimId) || []) }]))
}
app.get("/api/admin/private-location-candidates", requireAdmin, async (_req, res) => {
  try {
    const [resourcesResult, qcResult, locationsResult, claimsResult] = await Promise.all([
      supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("lifecycle_state", "active"),
      supabase.from("location_qc_reviews").select("*"),
      supabase.from("resource_locations").select("id,resource_id,location_type,street_address,original_address_text,city,latitude,longitude,public_map,review_status,geocode_status"),
      supabase.from("resource_fact_claims").select("id,resource_id,decision_category,field_name"),
    ])
    if ([resourcesResult, qcResult, locationsResult, claimsResult].some((result) => result.error)) throw new Error("private_location_candidates_unavailable")
    const occupancyClaimIds = (claimsResult.data || []).filter((item) => item.decision_category === "location_occupancy" || item.field_name === "location_occupancy").map((item) => item.id)
    const evidenceResult = occupancyClaimIds.length ? await supabase.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,retrieved_at").in("claim_id", occupancyClaimIds) : { data: [], error: null }
    if (evidenceResult.error) throw new Error("private_location_evidence_unavailable")
    const resourceById = new Map((resourcesResult.data || []).map((item) => [item.id, item]))
    const claimsByResource = new Map()
    for (const claim of claimsResult.data || []) claimsByResource.set(claim.resource_id, [...(claimsByResource.get(claim.resource_id) || []), claim.id])
    const evidenceByClaim = new Map()
    for (const item of evidenceResult.data || []) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
    const locations = locationsResult.data || []
    const items = (qcResult.data || []).map((qc) => {
      const resource = resourceById.get(qc.canonical_resource_id)
      const resourceLocations = locations.filter((item) => item.resource_id === qc.canonical_resource_id)
      const evidence = (claimsByResource.get(qc.canonical_resource_id) || []).flatMap((id) => evidenceByClaim.get(id) || [])
      const eligibility = privateLocationEligibility({ resource, qc, evidence, existingLocations: resourceLocations })
      const coordinates = eligibility.snapshot.coordinates || {}
      const nearby = Number.isFinite(Number(coordinates.latitude)) && Number.isFinite(Number(coordinates.longitude)) ? locations.filter((item) => item.resource_id !== qc.canonical_resource_id && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Math.abs(Number(item.latitude) - Number(coordinates.latitude)) < 0.002 && Math.abs(Number(item.longitude) - Number(coordinates.longitude)) < 0.002).map((item) => ({ ...item, resource_name: resourceById.get(item.resource_id)?.display_name || "Existing Miller resource" })) : []
      return { canonical_uuid: qc.canonical_resource_id, resource_name: resource?.display_name || "Unavailable resource", qc: { decision: qc.decision, version: qc.version, policy_version: qc.policy_version, reviewed_at: qc.reviewed_at }, proposed: { submitted_address: eligibility.snapshot.submitted_address, standardized_address: eligibility.snapshot.returned_address, city: eligibility.snapshot.locality, precision: eligibility.snapshot.precision, descriptor: eligibility.snapshot.location_descriptor, score: eligibility.snapshot.score, coordinates, source_url: eligibility.snapshot.source_url, source_evidence_tier: eligibility.snapshot.source_evidence_tier, occupancy_confidence: eligibility.snapshot.program_occupancy_confidence, warnings: eligibility.snapshot.warnings || [], sensitivity_flags: eligibility.snapshot.sensitivity_flags || [], conflicts: eligibility.snapshot.conflicts || [] }, eligible: eligibility.eligible, reason_codes: eligibility.reasons, existing_locations: resourceLocations.map((item) => ({ id: item.id, street_address: item.street_address, city: item.city, public_map: item.public_map, review_status: item.review_status })), nearby_locations: nearby }
    }).filter((item) => item.qc.decision === "pilot_eligible" || item.eligible).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.resource_name.localeCompare(b.resource_name))
    res.setHeader("Cache-Control", "private, no-store")
    return res.json({ mode: "human_confirmed_private_location_only", publication_enabled: false, items, eligible_count: items.filter((item) => item.eligible).length })
  } catch { return res.status(503).json({ error: "Private location candidates are unavailable. No location was created." }) }
})
app.get("/api/admin/refreshed-location-reviews", requireAdmin, async (_req, res) => {
  try {
    const history = await supabase.from("location_qc_review_snapshots").select("canonical_resource_id,qc_version,origin,refresh_reason,created_at").in("origin", ["evidence_refresh", "machine_initial"]).order("created_at", { ascending: false })
    if (history.error) throw history.error
    const ids = [...new Set((history.data || []).map((item) => item.canonical_resource_id))]
    const contextById = await privateLocationContexts(ids)
    const contexts = ids.map((id) => ({ id, context: contextById.get(id) }))
    const classified = contexts.map(({ id, context }) => { const prior = (history.data || []).filter((item) => item.canonical_resource_id === id).sort((a, b) => b.qc_version - a.qc_version)[0]; const eligibility = privateLocationEligibility(context); const confirmationEligibility = context.qc?.decision === "manual_review" ? privateLocationEligibility({ ...context, qc: { ...context.qc, decision: "pilot_eligible" } }) : eligibility; const snapshot = eligibility.snapshot; const alreadyPublished = context.locations.some((location) => location.location_type === "fixed" && location.public_map === true); const queue_state = alreadyPublished ? "already_published" : eligibility.eligible ? "ready_to_publish" : context.qc?.decision === "manual_review" && confirmationEligibility.eligible ? "one_confirmation_away" : "blocked"; return { canonical_uuid: id, resource_name: context.resource?.display_name || "Unavailable resource", qc: { decision: context.qc?.decision, version: context.qc?.version, prior_version: prior?.qc_version ? prior.qc_version - 1 : null, refreshed_at: prior?.created_at || null }, address: snapshot.submitted_address || null, community: snapshot.locality || null, standardized_address: snapshot.returned_address || null, geocoder: { score: snapshot.score || null, precision: snapshot.precision || null, descriptor: snapshot.location_descriptor || null, coordinates_present: Boolean(snapshot.coordinates?.latitude && snapshot.coordinates?.longitude) }, occupancy: snapshot.program_occupancy_confidence || "unverified", evidence_sources: context.evidence.filter((item) => item.source_url && item.stale !== true).length, blockers: alreadyPublished ? [] : eligibility.reasons, queue_state, eligible_after_human_qc: queue_state === "ready_to_publish", next_action: queue_state === "one_confirmation_away" ? "Confirm location evidence" : queue_state === "ready_to_publish" ? "Publish verified map pin" : queue_state === "already_published" ? "Already published" : "Complete evidence package" } })
    const items = classified.filter((item) => item.queue_state !== "already_published")
    const queue_counts = { ready_to_publish: items.filter((item) => item.queue_state === "ready_to_publish").length, one_confirmation_away: items.filter((item) => item.queue_state === "one_confirmation_away").length, blocked: items.filter((item) => item.queue_state === "blocked").length, already_published: classified.length - items.length }
    return res.json({ items, count: items.length, queue_counts, publication_enabled: false })
  } catch { return res.status(503).json({ error: "Refreshed location reviews are unavailable." }) }
})
app.post("/api/admin/refreshed-location-reviews/:canonicalUuid/confirm", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.canonicalUuid) || !Number.isInteger(req.body?.expected_version)) return res.status(400).json({ error: "A current QC version is required." })
  try {
    const context = await privateLocationContext(req.params.canonicalUuid)
    if (!context.resource || !context.qc || context.qc.decision !== "manual_review") return res.status(409).json({ error: "This refreshed record is not awaiting human QC confirmation." })
    if (context.qc.version !== req.body.expected_version) return res.status(409).json({ error: "This review changed. Reload before confirming." })
    const saved = await supabase.rpc("save_location_qc_review_decision", { p_canonical_resource_id: context.resource.id, p_policy_version: context.qc.policy_version, p_classification_fingerprint: context.qc.classification_fingerprint, p_decision: "pilot_eligible", p_decision_note: "Human confirmation of refreshed evidence package.", p_review_snapshot: context.qc.review_snapshot, p_expected_version: context.qc.version, p_actor_id: req.adminUser.id })
    if (saved.error?.code === "40001") return res.status(409).json({ error: "This review changed. Reload before confirming." })
    if (saved.error) return res.status(503).json({ error: "Refreshed evidence could not be confirmed." })
    return res.json({ qc: saved.data, location_created: false, public_map_changed: false, message: "Refreshed evidence confirmed. No location was created or published." })
  } catch { return res.status(503).json({ error: "Refreshed evidence confirmation is unavailable." }) }
})
app.post("/api/admin/verified-map-pins/:canonicalUuid/publish", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.canonicalUuid) || !Number.isInteger(req.body?.expected_qc_version) || req.body?.confirmed_publication !== true) return res.status(400).json({ error: "Current QC version and explicit publication confirmation are required." })
  const result = await supabase.rpc("publish_verified_map_pin", { p_resource_id: req.params.canonicalUuid, p_expected_qc_version: req.body.expected_qc_version, p_actor_id: req.adminUser.id })
  if (result.error?.code === "40001") return res.status(409).json({ error: "QC changed. Reload before publishing." })
  if (result.error) return res.status(409).json({ error: result.error.message || "This location is not ready to publish." })
  return res.json({ location: result.data, public_map: true, message: "Published on Miller's public map." })
})
app.post("/api/admin/private-location-candidates/:canonicalUuid/confirm", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.canonicalUuid) || req.body?.confirmed_private_location !== true || !Number.isInteger(req.body?.expected_qc_version)) return res.status(400).json({ error: "An administrator confirmation and current QC version are required.", code: "private_location_confirmation_required" })
  try {
    const context = await privateLocationContext(req.params.canonicalUuid)
    if (!context.resource || !context.qc) return res.status(404).json({ error: "The reviewed candidate is unavailable.", code: "private_location_candidate_missing" })
    if (Number(context.qc.version) !== Number(req.body.expected_qc_version)) return res.status(409).json({ error: "The QC decision changed. Reload and review it again.", code: "private_location_qc_stale" })
    const eligibility = privateLocationEligibility(context)
    if (!eligibility.eligible) return res.status(409).json({ error: "This candidate no longer meets private-location eligibility.", code: "private_location_ineligible", reason_codes: eligibility.reasons })
    const values = privateLocationValues({ resourceId: context.resource.id, qc: context.qc, actorId: req.adminUser.id })
    const existing = context.locations.find((item) => item.location_type === "fixed" && sameFixedAddress(item, values))
    if (existing) return res.json({ code: "private_location_already_exists", idempotent: true, location: existing, public_map: false, publication_created: false })
    const inserted = await supabase.from("resource_locations").insert(values).select().single()
    if (inserted.error) return res.status(500).json({ error: "The private location could not be created.", code: "private_location_insert_failed" })
    const audit = await supabase.from("resource_location_audit").insert({ location_id: inserted.data.id, action: "created", previous_values: null, new_values: privateLocationAuditValues({ location: inserted.data, qc: context.qc }), actor_id: req.adminUser.id, reason: "Human-confirmed private location creation. This operation does not publish the location." }).select("id").single()
    if (audit.error) {
      await supabase.from("resource_locations").delete().eq("id", inserted.data.id).eq("public_map", false).eq("review_status", "pending")
      return res.status(500).json({ error: "The location audit could not be saved; the private location was rolled back.", code: "private_location_audit_failed" })
    }
    return res.status(201).json({ code: "private_location_created", idempotent: false, location: inserted.data, audit_id: audit.data.id, public_map: false, publication_created: false })
  } catch { return res.status(503).json({ error: "Private location creation is unavailable. No location was created." }) }
})
app.post("/api/admin/address-evidence/bounded-approve", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.canonical_uuids) ? req.body.canonical_uuids.map(String) : []
  if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length) return res.status(400).json({ error: "Select between one and fifty distinct E1 records." })
  if (req.body?.confirmed_geocoding_only !== true) return res.status(400).json({ error: "Confirm that this approves address evidence only for future geocoding." })
  try {
    const inventory = readAddressEvidence()
    if (req.body?.evidence_version !== inventory.version) return res.status(409).json({ error: "The evidence inventory changed. Reload and review again." })
    const chosen = inventory.records.filter((item) => ids.includes(item.canonical_uuid))
    if (chosen.length !== ids.length || chosen.some((item) => item.tier !== "E1" || item.coordinates !== null || item.public_map !== false)) return res.status(409).json({ error: "Every selection must still be E1 evidence with no coordinate or public location." })
    const reviewedAt = new Date().toISOString()
    inventory.records = inventory.records.map((item) => ids.includes(item.canonical_uuid) ? { ...item, evidence_review_status: "approved_for_future_geocoding", evidence_reviewed_at: reviewedAt, evidence_reviewed_by: req.adminUser.id } : item)
    const temporary = `${addressEvidencePath}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, addressEvidencePath)
    return res.json({ code: "address_evidence_approved_for_future_geocoding", approved_count: ids.length, canonical_uuids: ids, coordinates_created: 0, public_locations_created: 0 })
  } catch { return res.status(500).json({ error: "Address evidence approval could not be saved." }) }
})

app.get("/api/admin/location-automation", requireAdmin, (_req, res) => res.json({ enabled: automatedLocationPublicationEnabled, note: "Disabled by default. Batch execution additionally requires an explicit server-side apply command." }))
app.get("/api/admin/location-automation/dry-run", requireAdmin, (_req, res) => {
  try { res.setHeader("Cache-Control", "private, no-store"); return res.json(JSON.parse(fs.readFileSync(locationAutomationDryRunPath, "utf8"))) }
  catch { return res.status(503).json({ error: "The local v1.2.1 review inventory has not been generated." }) }
})
app.get("/api/admin/intelligence-shadow", requireAdmin, async (_req, res) => {
  try {
    const stored = await shadowPersistence.listQueue()
    const resources = [...new Set(stored.claims.map((item) => item.resource_id).filter(Boolean))]
    const registryResult = resources.length ? await supabase.from("resource_registry").select("id,display_name").in("id", resources) : { data: [], error: null }
    if (registryResult.error) throw registryResult.error
    const names = new Map((registryResult.data || []).map((item) => [item.id, item.display_name]))
    const items = stored.claims.map((claim) => {
      const sourceUrls = [...new Set(claim.evidence.map((item) => item.source_url).filter(Boolean))]
      const resolved = claim.status !== "needs_review"
      return { id: claim.id, type: claim.decision_category, status: resolved ? "handled" : "needs_review", question: `Verify ${claim.field_name.replaceAll("_", " ")} for ${names.get(claim.resource_id) || "an unresolved resource"}`, finding: claim.research_summary || "Miller stored a bounded evidence-backed shadow recommendation.", currentValue: claim.existing_value, proposedValue: claim.proposed_value, reasonCodes: claim.reason_codes || [], sourceUrls, evidence: claim.evidence.map((item) => ({ sourceType: item.source_type, sourceUrl: item.source_url, authority: item.source_authority, retrievedAt: item.retrieved_at, value: item.extracted_value })), recommendation: claim.recommendation, confidence: claim.confidence, risk: claim.risk, version: claim.version, decisionCategory: claim.decision_category, observedAt: claim.last_observed_at }
    })
    const needsReview = items.filter((item) => item.status === "needs_review"), handledByMiller = items.filter((item) => item.status === "handled")
    const reviewed = stored.claims.filter((item) => !["observed", "needs_review"].includes(item.status))
    const agreements = reviewed.filter((item) => (item.status === "accepted" && ["auto_accept", "accept_with_monitoring"].includes(item.recommendation)) || (item.status === "superseded" && item.recommendation === "human_review") || (item.status === "rejected" && item.recommendation === "reject") || (item.status === "unknown" && item.recommendation === "unknown")).length
    res.setHeader("Cache-Control", "private, no-store")
    return res.json({ mode: "durable_shadow_observe_only", needsReview, handledByMiller, summary: `${needsReview.length} exceptions need judgment; ${handledByMiller.length} cases were handled in shadow.`, controls: stored.controls, persistence: "supabase", persistenceNote: "Shadow decisions record agreement and audit history only. Trusted resources and publication remain unchanged.", metrics: { handled_by_miller: handledByMiller.length, human_judgment_required: needsReview.length, administrator_external_research_required: needsReview.filter((item) => !item.sourceUrls.length).length, reviewed: reviewed.length, agreements, disagreements: reviewed.length - agreements } })
  } catch { return res.status(503).json({ error: "Durable shadow evidence is unavailable." }) }
})

app.post("/api/admin/intelligence-shadow/:claimId/decision", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.claimId) || !Number.isInteger(req.body?.expected_version) || req.body.expected_version < 0) return res.status(400).json({ error: "Invalid shadow decision." })
  try {
    const item = await shadowPersistence.decide({ claimId: req.params.claimId, expectedVersion: req.body.expected_version, action: req.body?.action, actorId: req.adminUser.id })
    return res.json({ item, trusted_record_changed: false, publication_changed: false })
  } catch (error) {
    if (error?.code === "40001" || /version conflict/i.test(String(error?.message))) return res.status(409).json({ error: "This recommendation changed. Reload before deciding.", code: "shadow_version_conflict" })
    if (/invalid_shadow_action/.test(String(error?.message))) return res.status(400).json({ error: "Invalid shadow action." })
    return res.status(503).json({ error: "The shadow decision could not be saved." })
  }
})
app.get("/api/admin/location-qc-review", requireAdmin, async (_req, res) => {
  try {
    const report = JSON.parse(fs.readFileSync(locationAutomationDryRunPath, "utf8"))
    let store = readLocationQcStore(locationQcReviewStorePath), persistence = "local_development_file"
    if (durableLocationQcEnabled) {
      const [decisions, audit] = await Promise.all([
        supabase.from("location_qc_reviews").select("*"),
        supabase.from("location_qc_review_audit").select("*").order("created_at"),
      ])
      if (decisions.error || audit.error) return res.status(503).json({ error: "Durable QC persistence is unavailable. No decision can be saved until the production migration is verified.", code: "durable_qc_unavailable" })
      store = {
        version: 1,
        decisions: Object.fromEntries((decisions.data || []).map((item) => [item.canonical_resource_id, { ...item, canonical_uuid: item.canonical_resource_id, note: item.decision_note }])),
        audit: (audit.data || []).map((item) => ({ ...item, canonical_uuid: item.canonical_resource_id, note: item.decision_note })),
      }
      persistence = "supabase"
    }
    const ids = report.quality_control_sample.map((item) => item.canonical_uuid)
    const registry = await supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").in("id", ids)
    if (registry.error) return res.status(503).json({ error: "Canonical identity validation is unavailable." })
    const canonical = new Map((registry.data || []).map((item) => [item.id, item]))
    const reconciled = reconcileLocationQcReview(report, store)
    const validate = (item) => ({ ...item, canonical_validation: { resolved: canonical.has(item.canonical_uuid), active: canonical.get(item.canonical_uuid)?.lifecycle_state === "active", qc_eligible: isLocationQcCanonicalEligible(canonical.get(item.canonical_uuid)), editorial_status: canonical.get(item.canonical_uuid)?.editorial_status, display_name_matches: canonical.get(item.canonical_uuid)?.display_name === item.resource_name } })
    return res.json({ ...reconciled, active: reconciled.active.map(validate), completed: reconciled.completed.map(validate), eligible_for_later_pilot: reconciled.eligible_for_later_pilot.map(validate), persistence, publication_enabled: false })
  } catch { return res.status(503).json({ error: "The local QC review workflow is unavailable." }) }
})
app.post("/api/admin/location-qc-review/:canonicalUuid/decision", requireAdmin, async (req, res) => {
  try {
    const report = JSON.parse(fs.readFileSync(locationAutomationDryRunPath, "utf8")), item = report.quality_control_sample.find((candidate) => candidate.canonical_uuid === req.params.canonicalUuid)
    if (!item) return res.status(404).json({ error: "QC record not found." })
    const registry = await supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("id", item.canonical_uuid).maybeSingle()
    if (registry.error || !registry.data || registry.data.display_name !== item.resource_name || !isLocationQcCanonicalEligible(registry.data)) return res.status(409).json({ error: "Canonical identity changed; review was not saved.", code: "canonical_identity_conflict" })
    if (item.policy_version !== report.policy_version || item.score !== 100 || item.location_descriptor !== "parcelpoint" || item.sensitivity_flags.length || item.conflicts.length || item.program_occupancy_confidence !== "supported") return res.status(409).json({ error: "The Phase 1P eligibility evidence changed; review was not saved.", code: "eligibility_revalidation_failed" })
    let result
    if (durableLocationQcEnabled) {
      const decision = String(req.body?.decision || "")
      if (!new Set(["pilot_eligible", "manual_review", "correct_address", "exclude_exact_location", "policy_problem", "defer"]).has(decision)) return res.status(400).json({ error: "Choose a valid location-review decision.", code: "invalid_decision" })
      const saved = await supabase.rpc("save_location_qc_review_decision", {
        p_canonical_resource_id: item.canonical_uuid,
        p_policy_version: report.policy_version,
        p_classification_fingerprint: report.classification_fingerprint,
        p_decision: decision,
        p_decision_note: String(req.body?.note || "").slice(0, 1000),
        p_review_snapshot: item,
        p_expected_version: Number(req.body?.expected_version || 0),
        p_actor_id: req.adminUser.id,
      })
      if (saved.error?.code === "40001" || /review version conflict/i.test(String(saved.error?.message))) return res.status(409).json({ error: "This review changed in another session. Reload and try again.", code: "review_version_conflict" })
      if (saved.error) return res.status(503).json({ error: "The durable review decision was not saved.", code: "durable_qc_save_failed" })
      result = { ok: true, status: Number(req.body?.expected_version || 0) ? 200 : 201, decision: saved.data, publication_created: false, location_created: false, public_map_changed: false }
    } else result = saveLocationQcDecision({ report, storeFile: locationQcReviewStorePath, canonicalUuid: item.canonical_uuid, decision: req.body?.decision, expectedVersion: req.body?.expected_version, actor: req.adminUser, note: req.body?.note })
    if (!result.ok) return res.status(result.status).json({ error: result.code === "review_version_conflict" ? "This review changed in another session. Reload and try again." : "Review decision was not saved.", code: result.code, current: result.current })
    return res.status(result.status).json({ code: "qc_review_saved_non_public", ...result })
  } catch { return res.status(500).json({ error: "Review decision could not be saved." }) }
})
app.post("/api/admin/location-automation/pause", requireAdmin, (req, res) => {
  automatedLocationPublicationEnabled = false
  return res.json({ enabled: false, paused_by: req.adminUser.id })
})

app.get("/api/admin/map-diagnostics", requireAdmin, async (_req, res) => {
  const [authorized, aliases, locations, pending, publicLocations] = await Promise.all([
    supabase.from("tavily_resources").select("id", { count: "exact", head: true }).eq("approved", true).eq("hidden", false),
    supabase.from("resource_source_aliases").select("resource_id,source_native_id").eq("source_type", "tavily_resource"),
    supabase.from("resource_locations").select("id", { count: "exact", head: true }),
    supabase.from("resource_locations").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("resource_locations").select("id,latitude,longitude").eq("location_type", "fixed").eq("public_map", true).eq("geocode_status", "verified").eq("review_status", "approved"),
  ])
  if ([authorized, aliases, locations, pending, publicLocations].some((result) => result.error)) return res.status(503).json({ error: "Map diagnostics are unavailable until the registry schema is ready." })
  const validPublic = (publicLocations.data || []).filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) && Number(item.latitude) !== 0 && Number(item.longitude) !== 0 && Math.abs(Number(item.latitude)) <= 90 && Math.abs(Number(item.longitude)) <= 180)
  const markerGroups = new Set(validPublic.map((item) => `${Number(item.latitude).toFixed(4)},${Number(item.longitude).toFixed(4)}`))
  return res.json({
    authorized_resources: authorized.count || 0,
    canonical_ids_resolved: new Set((aliases.data || []).map((item) => item.resource_id)).size,
    authorized_source_aliases: (aliases.data || []).length,
    location_records_found: locations.count || 0,
    pending_locations: pending.count || 0,
    approved_public_locations: (publicLocations.data || []).length,
    valid_coordinates_returnable: validPublic.length,
    expected_marker_groups: markerGroups.size,
    note: "Marker groups may be fewer than locations when distinct services share reviewed coordinates.",
  })
})

async function loadMapPopulationContext() {
  const [locations, registry, aliases, tavilyResources, audits] = await Promise.all([
    supabase.from("resource_locations").select("*"),
    supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status"),
    supabase.from("resource_source_aliases").select("resource_id,source_type,source_native_id,source_url,provenance"),
    supabase.from("tavily_resources").select("id,name,description,category,service_type,approved,hidden"),
    supabase.from("resource_location_audit").select("id,location_id,action,previous_values,new_values,actor_id,reason,created_at").order("created_at", { ascending: false }),
  ])
  const failed = [locations, registry, aliases, tavilyResources, audits].find((result) => result.error)
  if (failed) throw failed.error
  const curatedIds = new Set((aliases.data || []).filter((item) => item.source_type === "curated_bundle" && getCuratedMapResource(item.source_native_id)).map((item) => String(item.source_native_id)))
  const report = JSON.parse(fs.readFileSync(locationAutomationDryRunPath, "utf8"))
  const input = { locations: locations.data || [], registry: registry.data || [], aliases: aliases.data || [], tavilyResources: tavilyResources.data || [], audits: audits.data || [], curatedIds }
  return {
    reconciliation: buildLocationReconciliation(input),
    preview: buildAutoPublicationPreview({ automationRecords: report.records || [], locations: input.locations, registry: input.registry, audits: input.audits }),
    publicResourceCount: (tavilyResources.data || []).filter((item) => item.approved === true && item.hidden !== true).length,
    virtualMobileCount: (tavilyResources.data || []).filter((item) => item.approved === true && item.hidden !== true && isVirtualOrMobileResource(item)).length,
  }
}

app.get("/api/admin/map-population", requireAdmin, async (_req, res) => {
  try {
    const context = await loadMapPopulationContext()
    const published = context.reconciliation.filter((item) => item.appears_in_public_map_query)
    const groups = new Set(published.map((item) => item.shared_address_group).filter(Boolean))
    res.setHeader("Cache-Control", "private, no-store")
    return res.json({
      counts: {
        public_services: published.length,
        public_pins: groups.size,
        shared_address_groups: [...groups].filter((group) => published.filter((item) => item.shared_address_group === group).length > 1).length,
        eligible_for_automatic_publication: context.preview.counts.eligible,
        needs_human_review: context.preview.counts.needs_human_review,
        excluded_for_safety_privacy_or_manual_decision: context.preview.counts.excluded,
        failed_validation: context.preview.counts.failed,
        virtual_mobile_services: context.virtualMobileCount,
        approved_directory_resources: context.publicResourceCount,
      },
      reconciliation: context.reconciliation,
      preview_summary: { ...context.preview.counts, policy_version: context.preview.policy_version, dry_run: true, writes_performed: false },
      publication_execution_enabled: false,
    })
  } catch (error) {
    console.error("map_population_context_failed", { code: error?.code || "context_unavailable" })
    return res.status(503).json({ error: "Map population diagnostics are unavailable.", code: "map_population_unavailable" })
  }
})

app.post("/api/admin/map-population/preview", requireAdmin, async (_req, res) => {
  try {
    const context = await loadMapPopulationContext()
    res.setHeader("Cache-Control", "private, no-store")
    return res.json(context.preview)
  } catch (error) {
    console.error("map_population_preview_failed", { code: error?.code || "preview_unavailable" })
    return res.status(503).json({ error: "The safe publication preview could not be generated. No records were changed.", code: "preview_unavailable", writes_performed: false })
  }
})

app.get("/api/admin/pending-locations", requireAdmin, async (_req, res) => {
  const { data: locations, error } = await supabase.from("resource_locations").select("id,resource_id,location_type,original_address_text,street_address,city,province,postal_code,latitude,longitude,geocode_source,geocode_confidence,geocode_status,review_status,public_map,created_at,updated_at").not("latitude", "is", null).not("longitude", "is", null).order("created_at")
  if (error) return res.status(503).json({ error: "Pending locations are unavailable." })
  const resourceIds = [...new Set((locations || []).map((item) => item.resource_id))]
  const locationIds = (locations || []).map((item) => item.id)
  const [registry, aliases, audits] = await Promise.all([
    resourceIds.length ? supabase.from("resource_registry").select("id,display_name").in("id", resourceIds) : { data: [] },
    resourceIds.length ? supabase.from("resource_source_aliases").select("resource_id,source_type,source_native_id,source_url").in("resource_id", resourceIds) : { data: [] },
    locationIds.length ? supabase.from("resource_location_audit").select("location_id,new_values,created_at").in("location_id", locationIds).eq("action", "geocoded").order("created_at", { ascending: false }) : { data: [] },
  ])
  if (registry.error || aliases.error || audits.error) return res.status(503).json({ error: "Pending-location context is unavailable." })
  const names = new Map((registry.data || []).map((item) => [item.id, item.display_name]))
  const aliasesByResource = new Map()
  for (const alias of aliases.data || []) aliasesByResource.set(alias.resource_id, [...(aliasesByResource.get(alias.resource_id) || []), alias])
  const auditByLocation = new Map()
  for (const audit of audits.data || []) if (!auditByLocation.has(audit.location_id)) auditByLocation.set(audit.location_id, audit.new_values || {})
  const items = (locations || []).map((item) => {
    const audit = auditByLocation.get(item.id) || {}
    const resource_name = names.get(item.resource_id) || "Resource"
    const classification = item.review_status === "approved" && item.public_map === true ? { tier: 4, label: "Approved", selectable: false, warnings: [] } : classifyLocationReview({ location: item, evidence: audit, resource: { display_name: resource_name }, addressPeerCount: Number(audit.address_peer_count || 1) })
    const queue_membership = item.review_status === "approved" && item.public_map ? "public" : ["rejected", "excluded", "confidential"].includes(item.review_status) ? "history" : classification.tier === 3 ? "could_not_map" : "needs_decision"
    return { ...item, resource_name, aliases: aliasesByResource.get(item.resource_id) || [], normalized_query: audit.normalized_query || "", returned_address: audit.returned_address || "", provider_place_id: audit.provider_place_id || null, provider_type: audit.provider_type || "", provider_class: audit.provider_class || "", source_url: audit.source_url || "", tier: classification.tier, tier_label: classification.label, selectable: classification.selectable, warnings: classification.warnings, queue_membership }
  })
  const counts = Object.fromEntries(["needs_decision", "could_not_map", "public", "history"].map((key) => [key, items.filter((item) => item.queue_membership === key).length]))
  return res.json({ count: items.length, counts, label: "Location review and history", items })
})

app.patch("/api/admin/pending-locations/:locationId", requireAdmin, async (req, res) => {
  const locationId = String(req.params.locationId || "")
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(locationId)) return res.status(400).json({ error: "Invalid location ID." })
  const action = String(req.body?.action || "")
  if (!["approve", "correct", "reject", "exclude", "defer"].includes(action)) return res.status(400).json({ error: "Invalid review action." })
  const { data: current, error: readError } = await supabase.from("resource_locations").select("*").eq("id", locationId).single()
  if (readError || !current) return res.status(404).json({ error: "Pending location not found." })
  if (req.body?.resource_id && String(req.body.resource_id) !== current.resource_id) return res.status(409).json({ error: "The resource identity changed. Reconcile the queue and retry.", code: "identity_mismatch" })
  if (current.location_type !== "fixed" && ["approve", "correct"].includes(action)) return res.status(409).json({ error: "This resource has no fixed public point to approve or correct.", code: "not_fixed" })
  const isPublished = current.review_status === "approved" && current.public_map === true
  const alreadyApplied = (action === "approve" && isPublished && current.geocode_status === "verified") ||
    (action === "reject" && current.review_status === "rejected" && current.public_map === false) ||
    (action === "exclude" && current.review_status === "excluded" && current.public_map === false)
  if (alreadyApplied) return res.json({ code: "review_already_applied", idempotent: true, canonical_resource_uuid: current.resource_id, location_uuid: current.id, resulting_status: action, resulting_review_state: current.review_status, public_map: current.public_map, record_version: current.updated_at, next_eligible_queue_membership: isPublished ? "public" : "history", item: current })
  if (req.body?.expected_updated_at && String(req.body.expected_updated_at) !== String(current.updated_at)) return res.status(409).json({ error: "This item changed after it was loaded. Reconcile the queue and review it again.", code: "stale_record" })
  if (current.review_status !== "pending" && !isPublished) return res.status(409).json({ error: "This location is not reviewable." })
  if (action === "approve" && req.body?.confirmed !== true) return res.status(400).json({ error: "Explicit approval confirmation is required." })
  const changes = { reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  if (action === "approve") Object.assign(changes, { review_status: "approved", geocode_status: "verified", public_map: true, location_last_verified: new Date().toISOString() })
  if (action === "reject") Object.assign(changes, { review_status: "rejected", geocode_status: "rejected", public_map: false })
  if (action === "exclude") Object.assign(changes, { review_status: "excluded", public_map: false })
  if (action === "defer") Object.assign(changes, { review_status: "pending", public_map: false, geocode_status: "matched" })
  if (action === "correct") {
    const latitude = Number(req.body?.latitude), longitude = Number(req.body?.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !latitude || !longitude || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return res.status(400).json({ error: "Valid non-zero coordinates are required." })
    Object.assign(changes, { latitude, longitude, street_address: String(req.body?.street_address || current.street_address).slice(0, 500), review_status: "pending", geocode_status: "matched", public_map: false })
  }
  const { data, error } = await supabase.from("resource_locations").update(changes).eq("id", locationId).eq("resource_id", current.resource_id).eq("updated_at", current.updated_at).select().single()
  if (error?.code === "PGRST116") return res.status(409).json({ error: "This item changed while the decision was being saved. Reconcile and retry.", code: "stale_record" })
  if (error) return res.status(500).json({ error: "Could not record the location decision.", code: "database_error" })
  const auditAction = { approve: "approved", correct: "corrected", reject: "rejected", exclude: "excluded", defer: "corrected" }[action]
  const { data: audit, error: auditError } = await supabase.from("resource_location_audit").insert({ location_id: locationId, action: auditAction, previous_values: current, new_values: { ...data, actor_type: "human_administrator", permanent_manual_review: req.body?.permanent_manual_review === true }, actor_id: req.adminUser.id, reason: action === "defer" ? "Human review deferred; location remains pending and non-public; automated reapproval is prohibited." : `Human review action: ${action}; automated reapproval is prohibited.` }).select("id").single()
  if (auditError) {
    await supabase.from("resource_locations").update(current).eq("id", current.id).eq("updated_at", data.updated_at)
    return res.status(500).json({ error: "The audit record could not be saved; the location change was rolled back.", code: "audit_failed" })
  }
  const next_eligible_queue_membership = data.review_status === "approved" && data.public_map ? "public" : ["rejected", "excluded", "confidential"].includes(data.review_status) ? "history" : "needs_decision"
  return res.json({ code: "review_saved", canonical_resource_uuid: data.resource_id, location_uuid: data.id, resulting_status: action, resulting_review_state: data.review_status, public_map: data.public_map, record_version: data.updated_at, audit_action_id: audit.id, next_eligible_queue_membership, item: data })
})

const analyticsRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 120 })
const submissionRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
const resourceSubmissionUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_RESOURCE_SUGGESTION_ATTACHMENTS,
    fileSize: MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES,
    fields: 4,
    fieldSize: 128 * 1024,
    parts: 6,
  },
})

function parseResourceSubmissionMultipart(req, res, next) {
  if (!req.is("multipart/form-data")) return next()
  const contentLength = Number(req.headers["content-length"])
  const maximumRequestBytes = MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES + (128 * 1024)
  if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
    return res.status(413).json({ error: "Attachments must not exceed 10 MB in total.", code: "attachments_too_large" })
  }
  return resourceSubmissionUpload.array("attachments", MAX_RESOURCE_SUGGESTION_ATTACHMENTS)(req, res, (error) => {
    if (!error) return next()
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Each attachment must be 5 MB or smaller.", code: "attachment_too_large" })
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "A submission can include at most 2 attachments.", code: "too_many_attachments" })
    }
    return res.status(400).json({ error: "Invalid attachment upload.", code: "invalid_attachment" })
  })
}

app.post("/api/events", analyticsRateLimit, publicWriteHandlers.createEvent)

app.post("/api/resource-submissions", submissionRateLimit, parseResourceSubmissionMultipart, publicWriteHandlers.createResourceSubmission)

app.get("/api/admin/resource-submission-attachments/quarantine", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("resource_submission_attachments")
    .select("id,submission_id,display_filename,byte_size,detected_mime_type,status,created_at")
    .eq("status", "pending_scan")
    .order("created_at", { ascending: true })
    .limit(100)
  if (error) return res.status(503).json({ error: "The attachment quarantine queue is unavailable.", code: "attachment_quarantine_unavailable" })
  return res.json({ items: data || [], count: (data || []).length, delivery: "disabled_until_scanned" })
})

app.post("/api/miller", rateLimit({ windowMs: 60 * 1000, max: positiveInteger(process.env.MILLER_RATE_LIMIT_PER_MINUTE, 8) }), validateMillerRequestBody, paidDailyLimit, async (req, res) => {
  const requestId = crypto.randomUUID()
  try {
    const validated = req.validatedMillerRequest
    const {
  query,
  city,
  matches,
  conversationMemory = [],
  conversationSummary = "",
  inferredCategories,
  communicationMode
} = validated
    const isMapInterface = validated.interface === "map"

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "Search is temporarily unavailable.", code: "provider_unavailable", requestId })
    }

    const safeQuery = String(query).trim()
    // Raw input is used only for this request. Aggregate learning is disabled by
    // default and receives no identifier, session, or raw-text field.
    try { await persistHumanNeeds(safeQuery, city) } catch { /* learning is fail-closed; search continues */ }
    const safetySignals = detectSafetySignals(safeQuery)
    const safetyMode = getSafetyMode(safetySignals)

    const autoDetectedMode = detectCommunicationStyle(
  safeQuery,
  safetyMode
)

const finalCommunicationMode =
  communicationMode || autoDetectedMode

    const safeMatches = isMapInterface
      ? await authorizeMapMatches(matches.map((resource) => resource.id), supabase)
      : (Array.isArray(matches) ? matches.slice(0, 20) : [])

    let tavilyResults = []

const inferredQueryCategories =
  inferCategoriesFromQuery(safeQuery)

const topLocalScore =
  safeMatches.length > 0
    ? scoreResource(
        safeMatches[0],
        safeQuery
      )
    : 0

const noCategoryMatch =
  inferredQueryCategories.length > 0 &&
  !safeMatches.some((resource) =>
    inferredQueryCategories.some(
      (cat) =>
        normalizeText(resource.category).includes(
          normalizeText(cat)
        )
    )
  )

const shouldUseAdvancedTavily =
  safeMatches.length < 5 ||
  topLocalScore < 160 ||
  noCategoryMatch ||
  safeQuery.length > 10

  let tavilyMode = "basic"

if (shouldUseAdvancedTavily) {
  tavilyMode = "advanced"
}

if (tavilyMode !== "none" && !isMapInterface) {
  try {
    const tavilyResponse = await retry(() =>
  fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        signal: AbortSignal.timeout(positiveInteger(process.env.PROVIDER_TIMEOUT_MS, 20_000)),
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query:
  tavilyMode === "advanced"
    ? `${safeQuery} British Columbia addiction detox counselling treatment harm reduction mental health official services`
    : `${safeQuery} BC addiction mental health services`,

          max_results:
            tavilyMode === "advanced"
              ? 12
              : 5,

          topic: "general",
          search_depth:
  tavilyMode === "advanced"
    ? "advanced"
    : "basic",

          include_answer: false,

         include_domains:
  tavilyMode === "advanced"
    ? []
    : [
        "fraserhealth.ca",
        "vch.ca",
        "bc211.ca",
        "foundrybc.ca",
        "towardtheheart.com",
        "gov.bc.ca",
        "interiorhealth.ca",
        "islandhealth.ca",
        "northernhealth.ca",
        "phsa.ca",
        "cmha.bc.ca",
        "heretohelp.bc.ca"
      ]
        })
      }
    ))

    const tavilyData = await tavilyResponse.json()

    tavilyResults = tavilyData.results || []
    tavilyResults = tavilyResults.filter(result => {
  const url = result.url || ""

  return !(
    url.includes("rehabcenter") ||
    url.includes("addictionrehab") ||
    url.includes("luxury") ||
    url.includes("private")
  )
})

  } catch (error) {
    console.error("Tavily search failed:", String(error?.message || "Unknown error").slice(0, 200))
  }
}

    const mergedCategories = uniqueStrings([
      ...(Array.isArray(inferredCategories) ? inferredCategories : []),
      ...inferCategoriesFromQuery(safeQuery),
      safetyMode !== "normal" ? "Crisis Support" : "",
    ]).slice(0, 4)

    const queryKeywords = extractKeywordTokens(safeQuery).slice(0, 8)

    const formattedMatches = safeMatches.length
      ? safeMatches
          .map((resource, index) => {
            return [
              `${index + 1}. ${resource.name}`,
              resource.organization ? `Organization: ${resource.organization}` : null,
              resource.city ? `City: ${resource.city}` : null,
              resource.serviceType ? `Type: ${resource.serviceType}` : null,
              resource.category ? `Category: ${resource.category}` : null,
              resource.description ? `Description: ${resource.description}` : null,
              resource.accessType ? `Access: ${resource.accessType}` : null,
              resource.phone ? `Phone: ${resource.phone}` : null,
              resource.website ? `Website: ${resource.website}` : null,
            ]
              .filter(Boolean)
              .join("\n")
          })
          .join("\n\n")
      : "No local matches were found."

    const safeConversationMemory = isMapInterface ? boundedMapConversation(conversationMemory, 8) : conversationMemory
    const formattedMemory = safeConversationMemory
  .map(
    (item) =>
      `${item.role === "user" ? "User" : "Miller"}: ${item.content}`
  )
  .join("\n\n")

      const response = await retry(() =>
  client.responses.create({
      model: OPENAI_MODEL,
      input: `
${MILLER_SYSTEM_PROMPT}

${STYLE_PROMPTS[finalCommunicationMode] || STYLE_PROMPTS.default}

USER CONTEXT
User city filter: ${city || "All Cities"}
User question: ${safeQuery}
Safety mode detected by server: ${safetyMode}
Safety signals: ${JSON.stringify(safetySignals)}
Inferred categories: ${mergedCategories.join(", ") || "None"}
Query keywords: ${queryKeywords.join(", ") || "None"}

Conversation summary:
${conversationSummary || "None yet"}

RECENT CONVERSATION
${formattedMemory}

RESOURCE MATCHES
${formattedMatches}

${isMapInterface ? "MAP INTERFACE: Keep the answer concise. Recommend only resources from RESOURCE MATCHES. Distances, if discussed, are approximate straight-line distances from the current map centre; you do not know the visitor's location." : ""}

WEB SEARCH RESULTS
${tavilyResults
  .map(
    (result, index) => `
${index + 1}. ${result.title}

Website:
${result.url}

Summary:
${result.content}
`
  )
  .join("\n")}


      `.trim() + `
TASK
Follow all instructions above carefully.`,
    }))

const parsed = safeParseJson(response.output_text)
    const searchIntent = buildSearchIntent(safeQuery, parsed?.searchIntent, city)
    const locationContext = isMapInterface
      ? { status: "none" }
      : await resolveSearchLocation(searchIntent, { geocode: (phrase) => geocodeNavigationOrigin(phrase) })

    const validRecommendedNames = uniqueStrings(
      (parsed?.searchHints?.recommendedResourceNames || []).filter((name) =>
        safeMatches.some((resource) => normalizeText(resource.name) === normalizeText(name))
      )
    ).slice(0, 6)

    const finalSearchHints = {
      categories: uniqueStrings([
        ...(parsed?.searchHints?.categories || []),
        ...mergedCategories,
      ]).slice(0, 4),
      keywords: uniqueStrings([
        ...(parsed?.searchHints?.keywords || []),
        ...queryKeywords,
      ]).slice(0, 8),
      recommendedResourceNames: validRecommendedNames,
    }

    const answer =
      parsed?.answer ||
      "The trail went a little foggy for a moment, but I still pulled together the closest matches below."

    const formattedTavilyResults = tavilyResults.map((result) => ({
  name: result.title || "Web Result",
  organization: "",
  description: cleanTavilyContent(
  result.content || ""
),
  website: result.url || "",
  city:
  detectCityFromQuery(safeQuery) ||
  city ||
  "All Cities",
 category:
  inferCategoriesFromQuery(safeQuery)[0] ||
  "Web Result",

serviceType:
  inferCategoriesFromQuery(safeQuery)[0] ||
  "External Resource",

  source: "tavily",
  qualityScore: getSourceQualityScore(result.url),
  approved: false,
}))

// Public searches are read-only. An authenticated, allowlisted administrator must
// explicitly save evidence through /api/admin/discovery-candidates. This prevents
// filtered candidates and duplicate URLs from silently disappearing.

const mapContract = isMapInterface ? buildAuthorizedMapResponse({ parsed, authorizedResources: safeMatches }) : null
res.json({
  contractVersion: "1.0",
  requestId,
  mode: isMapInterface ? "map" : "main",
  message: isMapInterface ? mapContract.message : answer,
  results: isMapInterface ? { resourceIds: mapContract.resourceIds, external: [], noResults: mapContract.noResults } : { resourceIds: validRecommendedNames, external: formattedTavilyResults, noResults: !safeMatches.length && !formattedTavilyResults.length },
  clarification: parsed?.clarification || null,
  answer,
  searchHints: finalSearchHints,
  safetyMode,
  communicationMode: finalCommunicationMode,
  tavilyResults: formattedTavilyResults,
  searchIntent,
  locationContext,
  ...(isMapInterface ? { map: mapContract } : {}),
})

} catch (error) {
  console.error("Miller API error:", String(error?.message || "Unknown error").slice(0, 200))

  res.status(500).json({
    error: "Failed to generate Miller response.",
    code: "provider_failure",
    requestId,
  })
}

})

app.get("/api/lists", async (_req, res) => {
  const { data: lists, error } = await supabase.from("curated_lists").select("id,slug,title,short_description,category,last_reviewed_at,published_at,display_order,content_type,pdf_file_size_bytes,pdf_page_count,public_download_filename").eq("status", "published").order("display_order").order("title")
  if (error) return res.status(503).json({ error: "Pre-made lists are temporarily unavailable." })
  const ids = (lists || []).filter((item) => item.content_type !== "pdf_document").map((item) => item.id)
  const placements = ids.length ? await supabase.from("curated_list_items").select("id,list_id").in("list_id", ids).eq("visible", true).in("verification_status", ["verified","externally_verified","imported_from_trusted_source"]) : { data: [], error: null }
  if (placements.error) return res.status(503).json({ error: "Pre-made list counts are temporarily unavailable." })
  const counts = new Map(); for (const item of placements.data || []) counts.set(item.list_id, (counts.get(item.list_id) || 0) + 1)
  res.setHeader("Cache-Control", "public, max-age=300")
  return res.json({ items: (lists || []).map((item) => ({ ...item, visible_entry_count: counts.get(item.id) || 0 })) })
})

app.get("/api/lists/:slug", async (req, res) => {
  const slug = String(req.params.slug || "")
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid list slug." })
  const listResult = await supabase.from("curated_lists").select("id,slug,title,short_description,introduction,disclaimer,category,last_reviewed_at,published_at,content_type,pdf_file_size_bytes,pdf_page_count,public_download_filename").eq("slug", slug).eq("status", "published").maybeSingle()
  if (listResult.error || !listResult.data) return res.status(404).json({ error: "Published list not found." })
  if (listResult.data.content_type === "pdf_document") {
    res.setHeader("Cache-Control", "public, max-age=300")
    return res.json({ list: listResult.data, format: "pdf_document", view_url: `/api/lists/${encodeURIComponent(slug)}/pdf`, download_url: `/api/lists/${encodeURIComponent(slug)}/pdf?disposition=attachment` })
  }
  const [sections, items, placements] = await Promise.all([
    supabase.from("curated_list_sections").select("id,title,description,display_order").eq("list_id", listResult.data.id).eq("visible", true).order("display_order"),
    supabase.from("curated_list_items").select("id,canonical_resource_id,item_type,resource_name,description,cost_information,eligibility,geographic_restriction,address,phone,email,website,contact_notes,curator_note,verification_status,last_verified_at").eq("list_id", listResult.data.id).eq("visible", true).in("verification_status", ["verified","externally_verified","imported_from_trusted_source"]),
    supabase.from("curated_list_item_sections").select("item_id,section_id,display_order").eq("visible", true).order("display_order"),
  ])
  if (sections.error || items.error || placements.error) return res.status(503).json({ error: "This list is temporarily unavailable." })
  const itemById = new Map((items.data || []).map((item) => [item.id, item]))
  const visibleSections = (sections.data || []).map((section) => ({ ...section, items: (placements.data || []).filter((placement) => placement.section_id === section.id && itemById.has(placement.item_id)).map((placement) => itemById.get(placement.item_id)) }))
  res.setHeader("Cache-Control", "public, max-age=300")
  return res.json({ list: listResult.data, sections: visibleSections })
})

async function sendStoredListPdf(req, res, list, disposition = "inline") {
  const stored = await supabase.storage.from("curated-list-documents").download(list.pdf_storage_path)
  if (stored.error || !stored.data) return res.status(503).json({ error: "The PDF is temporarily unavailable." })
  const bytes = Buffer.from(await stored.data.arrayBuffer())
  const range = requestedPdfByteRange(req.get("Range"), bytes.length)
  if (range === null) { res.setHeader("Content-Range", `bytes */${bytes.length}`); return res.status(416).end() }
  const responseBytes = range ? bytes.subarray(range.start, range.end + 1) : bytes
  res.setHeader("Content-Type", PDF_MIME)
  res.setHeader("Content-Length", String(responseBytes.length))
  res.setHeader("Content-Disposition", pdfDisposition(disposition, list.public_download_filename))
  res.setHeader("Cache-Control", "private, no-store, max-age=0")
  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "SAMEORIGIN")
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin")
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'; sandbox")
  if (range) { res.status(206); res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`) }
  return res.send(responseBytes)
}

app.get("/api/lists/:slug/pdf", async (req, res) => {
  const slug = String(req.params.slug || "")
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Invalid list slug." })
  const list = await supabase.from("curated_lists").select("pdf_storage_path,public_download_filename").eq("slug", slug).eq("content_type", "pdf_document").eq("status", "published").maybeSingle()
  if (list.error || !list.data) return res.status(404).json({ error: "Published PDF not found." })
  return sendStoredListPdf(req, res, list.data, req.query.disposition)
})

app.get("/api/admin/curated-lists", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from("curated_lists").select("*").order("updated_at", { ascending: false })
  if (error) return res.status(503).json({ error: "Curated lists could not be loaded.", code: "curated_lists_unavailable" })
  return res.json({ items: data || [] })
})

app.get("/api/admin/curated-lists/:id", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid list ID." })
  const [list, sections, batches] = await Promise.all([
    supabase.from("curated_lists").select("*").eq("id", req.params.id).single(),
    supabase.from("curated_list_sections").select("*").eq("list_id", req.params.id).order("display_order"),
    supabase.from("list_import_batches").select("*").eq("list_id", req.params.id).order("uploaded_at", { ascending: false }),
  ])
  if (list.error) return res.status(404).json({ error: "Curated list not found." })
  if (list.data.content_type === "pdf_document") {
    const revisions = await supabase.from("curated_list_document_revisions").select("id,original_filename,public_download_filename,file_size_bytes,sha256,page_count,uploaded_by,uploaded_at,replaced_at").eq("list_id", req.params.id).order("uploaded_at", { ascending: false })
    if (revisions.error) return res.status(503).json({ error: "PDF document history could not be loaded." })
    return res.json({ list: list.data, revisions: revisions.data || [] })
  }
  const batchIds = (batches.data || []).map((item) => item.id)
  const [importItems, structuredItems, placements] = await Promise.all([
    batchIds.length ? supabase.from("list_import_items").select("*").in("batch_id", batchIds).order("display_order") : { data: [], error: null },
    supabase.from("curated_list_items").select("*").eq("list_id", req.params.id),
    supabase.from("curated_list_item_sections").select("item_id,section_id,display_order,visible").order("display_order"),
  ])
  if (sections.error || batches.error || importItems.error || structuredItems.error || placements.error) return res.status(503).json({ error: "Draft list details could not be loaded." })
  const structuredIds = new Set((structuredItems.data || []).map((item) => item.id))
  return res.json({ list: list.data, sections: sections.data || [], batches: batches.data || [], import_items: importItems.data || [], structured_items: structuredItems.data || [], placements: (placements.data || []).filter((item) => structuredIds.has(item.item_id)) })
})

function decodedHeader(req, name) {
  try { return decodeURIComponent(String(req.get(name) || "")) } catch { return "" }
}

function pdfDocumentMetadata(req) {
  const title = decodedHeader(req, "X-List-Title").trim(), slug = decodedHeader(req, "X-List-Slug").trim()
  const originalFilename = safePdfFilename(decodedHeader(req, "X-File-Name")), downloadFilename = safePdfFilename(decodedHeader(req, "X-Download-File-Name") || title)
  const shortDescription = decodedHeader(req, "X-List-Description").trim(), category = decodedHeader(req, "X-List-Category").trim()
  const lastReviewed = decodedHeader(req, "X-Last-Reviewed-Date").trim()
  if (title.length < 3 || title.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { error: "A valid PDF title and slug are required." }
  if (!shortDescription || shortDescription.length > 500 || category.length > 120) return { error: "A description is required and metadata must fit the allowed limits." }
  if (lastReviewed && !/^\d{4}-\d{2}-\d{2}$/.test(lastReviewed)) return { error: "Last reviewed must be a YYYY-MM-DD date." }
  return { title, slug, originalFilename, downloadFilename, shortDescription, category: category || null, lastReviewed: lastReviewed || null }
}

app.post("/api/admin/curated-list-documents", express.raw({ type: PDF_MIME, limit: MAX_PDF_BYTES }), requireAdmin, async (req, res) => {
  const metadata = pdfDocumentMetadata(req); if (metadata.error) return res.status(400).json({ error: metadata.error, code: "invalid_pdf_metadata" })
  const validation = validatePdfBuffer(req.body); if (!validation.ok) return res.status(400).json(validation)
  const duplicate = await supabase.from("curated_lists").select("id,slug,title,status").eq("content_type", "pdf_document").eq("pdf_sha256", validation.sha256).maybeSingle()
  if (duplicate.error) return res.status(503).json({ error: "Duplicate PDFs could not be checked." })
  if (duplicate.data) return res.status(409).json({ error: "This exact PDF is already stored as a Pre-made List.", code: "duplicate_pdf", existing: duplicate.data })
  const storagePath = `${req.adminUser.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.pdf`
  const upload = await supabase.storage.from("curated-list-documents").upload(storagePath, req.body, { contentType: PDF_MIME, upsert: false })
  if (upload.error) return res.status(503).json({ error: "The private PDF could not be stored. No draft was created.", code: "pdf_storage_failed" })
  const row = { content_type: "pdf_document", title: metadata.title, slug: metadata.slug, short_description: metadata.shortDescription, category: metadata.category, status: "draft", pdf_storage_path: storagePath, pdf_original_filename: metadata.originalFilename, public_download_filename: metadata.downloadFilename, pdf_file_size_bytes: validation.fileSizeBytes, pdf_sha256: validation.sha256, pdf_page_count: validation.pageCount, last_reviewed_at: metadata.lastReviewed, source_filename: metadata.originalFilename, source_storage_path: null, created_by: req.adminUser.id, updated_by: req.adminUser.id }
  const inserted = await supabase.from("curated_lists").insert(row).select().single()
  if (inserted.error) { await supabase.storage.from("curated-list-documents").remove([storagePath]); return res.status(409).json({ error: "The PDF draft could not be created. The private upload was removed.", code: inserted.error.code || "pdf_draft_failed" }) }
  const revision = await supabase.from("curated_list_document_revisions").insert({ list_id: inserted.data.id, storage_path: storagePath, original_filename: metadata.originalFilename, public_download_filename: metadata.downloadFilename, file_size_bytes: validation.fileSizeBytes, sha256: validation.sha256, page_count: validation.pageCount, uploaded_by: req.adminUser.id })
  if (revision.error) { await supabase.from("curated_lists").delete().eq("id", inserted.data.id); await supabase.storage.from("curated-list-documents").remove([storagePath]); return res.status(500).json({ error: "PDF audit history could not be created; the draft was rolled back.", code: "pdf_revision_failed" }) }
  return res.status(201).json({ outcome: "pdf_draft_created", list: inserted.data, message: "PDF saved privately as a draft. Nothing was published." })
})

app.put("/api/admin/curated-list-documents/:id/pdf", express.raw({ type: PDF_MIME, limit: MAX_PDF_BYTES }), requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid list ID." })
  const validation = validatePdfBuffer(req.body); if (!validation.ok) return res.status(400).json(validation)
  const current = await supabase.from("curated_lists").select("id,content_type,pdf_storage_path,pdf_sha256,public_download_filename").eq("id", req.params.id).single()
  if (current.error || current.data.content_type !== "pdf_document") return res.status(404).json({ error: "PDF document not found." })
  if (current.data.pdf_sha256 === validation.sha256) return res.status(409).json({ error: "This is already the current PDF version.", code: "duplicate_pdf" })
  const duplicate = await supabase.from("curated_lists").select("id,slug,title").eq("content_type", "pdf_document").eq("pdf_sha256", validation.sha256).neq("id", req.params.id).maybeSingle()
  if (duplicate.error) return res.status(503).json({ error: "Duplicate PDFs could not be checked." })
  if (duplicate.data) return res.status(409).json({ error: "This exact PDF belongs to another Pre-made List.", code: "duplicate_pdf", existing: duplicate.data })
  const originalFilename = safePdfFilename(decodedHeader(req, "X-File-Name")), downloadFilename = safePdfFilename(decodedHeader(req, "X-Download-File-Name") || current.data.public_download_filename)
  const storagePath = `${req.adminUser.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.pdf`
  const upload = await supabase.storage.from("curated-list-documents").upload(storagePath, req.body, { contentType: PDF_MIME, upsert: false })
  if (upload.error) return res.status(503).json({ error: "The replacement PDF could not be stored." })
  const now = new Date().toISOString()
  const revision = await supabase.from("curated_list_document_revisions").insert({ list_id: req.params.id, storage_path: storagePath, original_filename: originalFilename, public_download_filename: downloadFilename, file_size_bytes: validation.fileSizeBytes, sha256: validation.sha256, page_count: validation.pageCount, uploaded_by: req.adminUser.id }).select("id").single()
  if (revision.error) { await supabase.storage.from("curated-list-documents").remove([storagePath]); return res.status(500).json({ error: "The replacement audit record could not be created; the new upload was removed.", code: "pdf_revision_failed" }) }
  const updated = await supabase.from("curated_lists").update({ pdf_storage_path: storagePath, pdf_original_filename: originalFilename, public_download_filename: downloadFilename, pdf_file_size_bytes: validation.fileSizeBytes, pdf_sha256: validation.sha256, pdf_page_count: validation.pageCount, updated_by: req.adminUser.id, updated_at: now }).eq("id", req.params.id).eq("content_type", "pdf_document").select().single()
  if (updated.error) { await supabase.from("curated_list_document_revisions").delete().eq("id", revision.data.id); await supabase.storage.from("curated-list-documents").remove([storagePath]); return res.status(500).json({ error: "The replacement could not be activated; the new upload and audit row were removed." }) }
  await supabase.from("curated_list_document_revisions").update({ replaced_at: now }).eq("list_id", req.params.id).neq("id", revision.data.id).is("replaced_at", null)
  return res.json({ outcome: "pdf_replaced", list: updated.data, previous_storage_retained: true })
})

app.get("/api/admin/curated-list-documents/:id/pdf", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid list ID." })
  const list = await supabase.from("curated_lists").select("pdf_storage_path,public_download_filename").eq("id", req.params.id).eq("content_type", "pdf_document").single()
  if (list.error) return res.status(404).json({ error: "PDF document not found." })
  return sendStoredListPdf(req, res, list.data, req.query.disposition)
})

app.post("/api/admin/list-imports", express.raw({ type: DOCX_MIME, limit: MAX_DOCX_BYTES }), requireAdmin, async (req, res) => {
  const filename = decodeURIComponent(String(req.get("X-File-Name") || "")); const title = decodeURIComponent(String(req.get("X-List-Title") || "Low-Cost Community Counselling Options")); const slug = decodeURIComponent(String(req.get("X-List-Slug") || "low-cost-community-counselling-options"))
  if (!filename.toLowerCase().endsWith(".docx") || !Buffer.isBuffer(req.body) || req.body.length < 4 || req.body.length > MAX_DOCX_BYTES || req.body[0] !== 0x50 || req.body[1] !== 0x4b) return res.status(400).json({ error: "Upload a valid DOCX file no larger than 8 MB.", code: "invalid_docx" })
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || title.trim().length < 3) return res.status(400).json({ error: "A valid list title and slug are required.", code: "invalid_list_identity" })
  const sourceSha = createHash("sha256").update(req.body).digest("hex")
  const duplicate = await supabase.from("list_import_batches").select("id,list_id,parsing_status").eq("source_sha256", sourceSha).eq("parser_version", LIST_PARSER_VERSION).maybeSingle()
  if (duplicate.error) return res.status(503).json({ error: "Existing imports could not be checked.", code: "import_lookup_failed" })
  if (duplicate.data) return res.status(409).json({ error: "This document version was already imported.", code: "duplicate_import", existing: duplicate.data })
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "miller-list-import-")); const tempFile = path.join(tempDirectory, "source.docx")
  let parsed
  try { fs.writeFileSync(tempFile, req.body, { flag: "wx" }); const xml = execFileSync("unzip", ["-p", tempFile, "word/document.xml"], { encoding: "utf8", maxBuffer: MAX_DOCX_BYTES }); parsed = parseCounsellingDocumentXml(xml, { filename }) }
  catch { return res.status(400).json({ error: "The DOCX could not be parsed. No list was created.", code: "docx_parse_failed" }) }
  finally { fs.rmSync(tempDirectory, { recursive: true, force: true }) }
  const storagePath = `${req.adminUser.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.docx`
  const upload = await supabase.storage.from("curated-list-sources").upload(storagePath, req.body, { contentType: DOCX_MIME, upsert: false })
  if (upload.error) return res.status(503).json({ error: "The private source document could not be stored. No list was created.", code: "private_upload_failed" })
  const listInsert = await supabase.from("curated_lists").insert({ slug, title: title.trim(), short_description: "A curated collection of low-cost counselling and related supports.", introduction: parsed.introduction, disclaimer: "Information may change. Contact each service to confirm current cost, eligibility, availability, and fit. Crisis contacts are presented separately.", category: "Counselling", status: "draft", source_filename: filename, source_storage_path: storagePath, created_by: req.adminUser.id, updated_by: req.adminUser.id }).select().single()
  if (listInsert.error) { await supabase.storage.from("curated-list-sources").remove([storagePath]); return res.status(409).json({ error: "The draft list could not be created. The private upload was removed.", code: listInsert.error.code || "list_create_failed" }) }
  const batchInsert = await supabase.from("list_import_batches").insert({ list_id: listInsert.data.id, original_filename: filename, source_storage_path: storagePath, source_sha256: sourceSha, parser_version: LIST_PARSER_VERSION, parsing_status: "parsed", heading_count: parsed.summary.section_count, entry_count: parsed.summary.entry_count, parse_summary: parsed.summary, uploaded_by: req.adminUser.id }).select().single()
  if (batchInsert.error) { await supabase.from("curated_lists").delete().eq("id", listInsert.data.id); await supabase.storage.from("curated-list-sources").remove([storagePath]); return res.status(500).json({ error: "Import tracking failed and the new draft was rolled back.", code: "batch_create_failed" }) }
  const sectionRows = parsed.sections.map((section) => ({ list_id: listInsert.data.id, title: section.title, display_order: section.display_order, visible: true }))
  const sectionInsert = await supabase.from("curated_list_sections").insert(sectionRows).select("id,title")
  if (sectionInsert.error) return res.status(500).json({ error: "Sections could not be stored. The incomplete draft remains private for administrator recovery.", code: "section_create_failed" })
  const [resourcesResult, aliasesResult] = await Promise.all([supabase.from("tavily_resources").select("id,name,website,city,organization"), supabase.from("resource_source_aliases").select("resource_id,source_native_id").eq("source_type", "tavily_resource")])
  const canonicalBySource = new Map((aliasesResult.data || []).map((alias) => [String(alias.source_native_id), alias.resource_id]))
  const resources = (resourcesResult.data || []).map((resource) => ({ ...resource, canonical_resource_id: canonicalBySource.get(String(resource.id)) || null })).filter((resource) => resource.canonical_resource_id)
  const importRows = parsed.sections.flatMap((section) => section.items.map((item) => { const proposed = proposeCanonicalMatches(item, resources); const kinds = new Set(proposed.map((match) => match.classification)); return { batch_id: batchInsert.data.id, detected_section: section.title, source_paragraph_start: item.raw_paragraphs?.[0]?.paragraph_number || null, raw_source_text: item.raw_source_text, parsed_name: item.name, parsed_description: item.description, parsed_contact: { phones: item.phones, emails: item.emails, websites: item.websites }, proposed_matches: proposed, match_confidence: kinds.has("confident") ? "confident" : proposed.length > 1 ? "ambiguous" : proposed.length ? "possible" : "no_match", validation_warnings: item.warnings, display_order: item.display_order } }))
  const itemInsert = await supabase.from("list_import_items").insert(importRows)
  if (itemInsert.error) return res.status(500).json({ error: "Parsed entries could not be stored. The incomplete draft remains private for administrator recovery.", code: "import_items_failed" })
  return res.status(201).json({ outcome: "draft_created", list: listInsert.data, batch: batchInsert.data, summary: parsed.summary, message: "DOCX parsed into a private draft review queue. Nothing was published." })
})

app.post("/api/admin/curated-lists/:id/trusted-bulk-import", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !/^[0-9a-f-]{36}$/i.test(String(req.body?.batch_id || ""))) return res.status(400).json({ error: "Valid list and import batch IDs are required." })
  if (req.body?.confirmed !== true || req.body?.import_trust_level !== "trusted_curator") return res.status(400).json({ error: "Explicit trusted-curator confirmation is required.", code: "trusted_confirmation_required" })
  const batch = await supabase.from("list_import_batches").select("id,list_id,entry_count,heading_count,parse_summary,parsing_status,import_source_type").eq("id", req.body.batch_id).eq("list_id", req.params.id).single()
  if (batch.error) return res.status(404).json({ error: "Import batch not found." })
  if (batch.data.import_source_type !== "admin_docx") return res.status(403).json({ error: "Trusted bulk import is limited to administrator-uploaded DOCX batches.", code: "untrusted_source_type" })
  const result = await supabase.rpc("trusted_bulk_import_curated_list", { p_list_id: req.params.id, p_batch_id: batch.data.id, p_admin_id: req.adminUser.id })
  if (result.error) return res.status(409).json({ error: "Trusted bulk import could not be completed atomically. No partial result was committed.", code: result.error.code || "trusted_bulk_failed" })
  return res.json({ ...result.data, message: result.data?.idempotent ? "This trusted batch was already imported; the existing structured draft is unchanged." : "All included entries were imported as list-only entries. The list remains a draft and was not published." })
})

app.patch("/api/admin/curated-lists/:id", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid list ID." })
  const action = String(req.body?.action || "update")
  const current = await supabase.from("curated_lists").select("id,content_type,pdf_storage_path,status").eq("id", req.params.id).single()
  if (current.error) return res.status(404).json({ error: "Curated list not found." })
  if (action === "publish") {
    if (req.body?.confirmed_publication !== true) return res.status(400).json({ error: "Explicit publication confirmation is required.", code: "publication_confirmation_required" })
    if (current.data.content_type === "pdf_document") {
      if (!current.data.pdf_storage_path) return res.status(409).json({ error: "A privately stored PDF is required before publication.", code: "publish_gate_failed" })
    } else {
      const { count, error } = await supabase.from("curated_list_items").select("id", { count: "exact", head: true }).eq("list_id", req.params.id).eq("visible", true).in("verification_status", ["verified","externally_verified","imported_from_trusted_source"])
      if (error || !count) return res.status(409).json({ error: "At least one visible item accepted from a trusted source or externally verified is required before publication.", code: "publish_gate_failed" })
    }
    const updated = await supabase.from("curated_lists").update({ status: "published", published_at: new Date().toISOString(), updated_by: req.adminUser.id, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single()
    if (updated.error) return res.status(500).json({ error: "The list could not be published." }); return res.json({ outcome: "published", list: updated.data })
  }
  if (action === "unpublish") { const status = current.data.content_type === "pdf_document" ? "unpublished" : "draft"; const updated = await supabase.from("curated_lists").update({ status, published_at: null, updated_by: req.adminUser.id, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single(); if (updated.error) return res.status(500).json({ error: "The list could not be unpublished." }); return res.json({ outcome: status, list: updated.data }) }
  if (action === "archive" && current.data.content_type === "pdf_document") { const updated = await supabase.from("curated_lists").update({ status: "archived", published_at: null, updated_by: req.adminUser.id, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single(); if (updated.error) return res.status(500).json({ error: "The PDF document could not be archived." }); return res.json({ outcome: "archived", list: updated.data }) }
  const allowed = {}; for (const field of ["title","slug","short_description","introduction","disclaimer","category","display_order","last_reviewed_at"]) if (req.body?.list?.[field] !== undefined) allowed[field] = req.body.list[field]
  const updated = await supabase.from("curated_lists").update({ ...allowed, updated_by: req.adminUser.id, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single()
  if (updated.error) return res.status(500).json({ error: "List changes could not be saved.", code: updated.error.code || "list_update_failed" }); return res.json({ outcome: "updated", list: updated.data })
})

app.post("/api/admin/curated-lists/:id/commit-import", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid list ID." })
  const [sections, batches, existing] = await Promise.all([
    supabase.from("curated_list_sections").select("id,title").eq("list_id", req.params.id),
    supabase.from("list_import_batches").select("id").eq("list_id", req.params.id).eq("parsing_status", "parsed"),
    supabase.from("curated_list_items").select("id", { count: "exact", head: true }).eq("list_id", req.params.id),
  ])
  if (sections.error || batches.error || existing.error) return res.status(503).json({ error: "The draft commit gate could not be checked." })
  if (existing.count) return res.status(409).json({ error: "This draft already has structured items. Edit those items instead of recommitting the import.", code: "already_committed" })
  const batchIds = (batches.data || []).map((item) => item.id); if (!batchIds.length) return res.status(409).json({ error: "No parsed import batch is ready to commit." })
  const reviewed = await supabase.from("list_import_items").select("*").in("batch_id", batchIds).order("display_order")
  if (reviewed.error) return res.status(503).json({ error: "Reviewed import entries could not be loaded." })
  const undecided = (reviewed.data || []).filter((item) => item.final_disposition === "undecided")
  if (undecided.length) return res.status(409).json({ error: `${undecided.length} imported entries still require a keep, attach, or skip decision.`, code: "review_incomplete", remaining: undecided.length })
  const sectionByTitle = new Map((sections.data || []).map((item) => [item.title, item.id])), createdByIdentity = new Map(), createdIds = [], placements = []
  for (const item of (reviewed.data || []).filter((row) => row.final_disposition !== "skip")) {
    const corrections = item.administrator_corrections || {}, contact = item.parsed_contact || {}
    const identity = item.final_disposition === "canonical_resource" ? `canonical:${item.selected_canonical_resource_id}` : `list:${createHash("sha256").update(JSON.stringify([corrections.resource_name || item.parsed_name, corrections.description || item.parsed_description, contact.phones?.[0] || "", contact.websites?.[0] || ""])).digest("hex")}`
    let structuredId = createdByIdentity.get(identity)
    if (!structuredId) {
      const insert = await supabase.from("curated_list_items").insert({ list_id: req.params.id, canonical_resource_id: item.final_disposition === "canonical_resource" ? item.selected_canonical_resource_id : null, item_type: item.final_disposition === "canonical_resource" ? "canonical_resource" : "list_only_entry", resource_name: corrections.resource_name || item.parsed_name || "Needs correction", description: corrections.description || item.parsed_description || "", cost_information: corrections.cost_information || "", eligibility: corrections.eligibility || "", geographic_restriction: corrections.geographic_restriction || "", address: corrections.address || "", phone: corrections.phone || contact.phones?.[0] || "", email: corrections.email || contact.emails?.[0] || "", website: corrections.website || contact.websites?.[0] || "", contact_notes: corrections.contact_notes || "", curator_note: corrections.curator_note || "", visible: false, verification_status: "needs_review", source_import_item_id: item.id }).select("id").single()
      if (insert.error) { if (createdIds.length) await supabase.from("curated_list_items").delete().in("id", createdIds); return res.status(500).json({ error: "Structured draft creation failed and newly-created items were rolled back.", code: "draft_commit_failed" }) }
      structuredId = insert.data.id; createdByIdentity.set(identity, structuredId); createdIds.push(structuredId)
    }
    const sectionId = sectionByTitle.get(item.detected_section); if (sectionId) placements.push({ item_id: structuredId, section_id: sectionId, display_order: item.display_order, visible: true })
  }
  const uniquePlacements = [...new Map(placements.map((item) => [`${item.item_id}:${item.section_id}`, item])).values()]
  const placementInsert = uniquePlacements.length ? await supabase.from("curated_list_item_sections").insert(uniquePlacements) : { error: null }
  if (placementInsert.error) { if (createdIds.length) await supabase.from("curated_list_items").delete().in("id", createdIds); return res.status(500).json({ error: "Section placement failed and newly-created items were rolled back.", code: "placement_commit_failed" }) }
  await supabase.from("list_import_batches").update({ parsing_status: "committed", committed_at: new Date().toISOString() }).in("id", batchIds)
  return res.json({ outcome: "structured_draft_committed", structured_items: createdIds.length, section_placements: uniquePlacements.length, published: false })
})

app.patch("/api/admin/list-import-items/:id", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid import item ID." })
  const disposition = String(req.body?.final_disposition || "undecided"); if (!["undecided","canonical_resource","list_only_entry","skip"].includes(disposition)) return res.status(400).json({ error: "Invalid final disposition." })
  const canonical = req.body?.selected_canonical_resource_id || null; if (disposition === "canonical_resource" && !/^[0-9a-f-]{36}$/i.test(String(canonical))) return res.status(400).json({ error: "Select a canonical resource for this disposition." })
  const changes = { final_disposition: disposition, selected_canonical_resource_id: disposition === "canonical_resource" ? canonical : null, administrator_corrections: req.body?.administrator_corrections || {}, review_status: disposition === "undecided" ? "pending" : "reviewed", reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const updated = await supabase.from("list_import_items").update(changes).eq("id", req.params.id).select().single(); if (updated.error) return res.status(500).json({ error: "The review decision could not be saved." }); return res.json({ outcome: "reviewed", item: updated.data })
})

app.get("/api/admin/list-imports/:id/source-link", requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid import batch ID." })
  const batch = await supabase.from("list_import_batches").select("source_storage_path").eq("id", req.params.id).single(); if (batch.error) return res.status(404).json({ error: "Import batch not found." })
  const signed = await supabase.storage.from("curated-list-sources").createSignedUrl(batch.data.source_storage_path, 300); if (signed.error) return res.status(503).json({ error: "A temporary source link could not be created." }); return res.json({ url: signed.data.signedUrl, expires_in: 300 })
})

app.get("/api/admin/tavily-resources", requireAdmin, async (req, res) => {
  const { count, error: countError } = await supabase
    .from("tavily_resources")
    .select("id", { count: "exact", head: true })
    .eq("approved", false)
    .eq("hidden", false)

  const { data, error } = await supabase
    .from("tavily_resources")
    .select("*")
    .eq("approved", false)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(40)

  if (error || countError) return res.status(500).json({ error: "Could not load review queue." })

  const resourceIds = (data || []).map((item) => item.id)
  let latestReviews = {}
  if (resourceIds.length) {
    const { data: reviews } = await supabase
      .from("ai_resource_reviews")
      .select("*")
      .in("resource_id", resourceIds)
      .order("created_at", { ascending: false })
      .limit(200)

    latestReviews = Object.fromEntries((reviews || [])
      .filter((review, index, all) => all.findIndex((item) => String(item.resource_id) === String(review.resource_id)) === index)
      .map((review) => [review.resource_id, review]))
  }

  return res.json({ items: data || [], count: count || 0, latestReviews })
})

app.get("/api/admin/capabilities", requireAdmin, (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store")
  return res.json(capabilityReport())
})

app.get("/api/admin/discovery-candidates", requireAdmin, async (req, res) => {
  let query = supabase.from("resource_discovery_candidates").select("*").order("created_at", { ascending: false }).limit(500)
  for (const [field, parameter] of [["review_status", "status"], ["shelter_type", "type"], ["community", "community"], ["region", "region"], ["source_name", "source"], ["confidence", "confidence"]]) {
    const value = String(req.query?.[parameter] || "").trim(); if (value) query = query.eq(field, value)
  }
  const { data, error } = await query
  if (error) return res.status(503).json({ error: "Shelter candidates could not be loaded.", code: "candidate_queue_unavailable" })
  res.setHeader("Cache-Control", "private, no-store")
  return res.json({ items: data || [], count: data?.length || 0 })
})
app.get("/api/admin/discovery-candidates/automation-dry-run", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from("resource_discovery_candidates").select("id,name,operator,shelter_type,population_served,community,source_name,source_url,retrieved_title,source_excerpt,additional_sources,checked_at,evidence_notes,confidence,review_status,location_disclosure_status,possible_matches,reviewed_by,reviewed_at").order("id")
  if (error) return res.status(503).json({ error: "Shelter automation assessment is unavailable. No candidate was changed.", code: "shelter_automation_unavailable" })
  const report = buildShelterAutomationReport(data || [])
  res.setHeader("Cache-Control", "private, no-store")
  return res.json({ ...report, pending_backlog: (data || []).filter((item) => item.review_status === "pending").length, production_changes: 0, map_locations_created: 0, map_locations_published: 0 })
})
app.get("/api/admin/shelter-throughput", requireAdmin, async (_req, res) => {
  const [{ data, error }, { data: research, error: researchError }] = await Promise.all([
    supabase.from("resource_discovery_candidates").select("id,name,operator,shelter_type,population_served,community,source_name,source_url,retrieved_title,source_excerpt,additional_sources,checked_at,evidence_notes,confidence,review_status,location_disclosure_status,possible_matches,reviewed_by,reviewed_at").eq("review_status", "pending").order("id"),
    supabase.from("shelter_candidate_research_claims").select("candidate_id,recommendation,confidence,reason_codes,research_summary,last_retrieved_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
  ])
  if (error) return res.status(503).json({ error: "Shelter throughput queue is unavailable." })
  if (researchError) return res.status(503).json({ error: "Shelter research queue is unavailable." })
  const latestResearch = new Map(); for (const item of research || []) if (!latestResearch.has(item.candidate_id)) latestResearch.set(item.candidate_id, item)
  const enriched = (data || []).map((item) => ({ ...item, machine_research: latestResearch.get(item.id) || null }))
  const report = buildShelterAutomationReport(enriched)
  const researchedCategory = (item) => ({ ready_to_approve: "strong_administrator_review", brief_review: "strong_administrator_review", possible_duplicate: "duplicate_already_represented", safety_sensitive_ready: "safety_sensitive", reject_obsolete: "strong_administrator_review" }[item.machine_research?.recommendation] || item.category)
  const queued = report.items.map((item) => ({ ...item, queue_category: researchedCategory(item) }))
  const tiers = { tier_a_bulk_confirmable: queued.filter((item) => item.queue_category === "auto_approval_eligible"), tier_b_one_click_review: queued.filter((item) => item.queue_category === "strong_administrator_review"), tier_c_reconciliation: queued.filter((item) => item.queue_category === "duplicate_already_represented"), tier_d_research: queued.filter((item) => item.queue_category === "needs_more_research"), tier_e_safety_sensitive: queued.filter((item) => item.queue_category === "safety_sensitive") }
  return res.json({ ...tiers, counts: Object.fromEntries(Object.entries(tiers).map(([key, value]) => [key, value.length])), bulk_execution_enabled: false, automatic_approval_enabled: false, map_publication_enabled: false, note: "Tier A is a preview-only, administrator-confirmed bulk set. No candidate was changed." })
})
app.get("/api/admin/shelter-reconciliations", requireAdmin, async (_req, res) => {
  const { data: candidates, error } = await supabase.from("resource_discovery_candidates").select("id,name,operator,shelter_type,population_served,community,region,website,source_url,phone,public_address,location_disclosure_status,source_name,possible_matches,review_status").eq("review_status", "pending").order("id")
  if (error) return res.status(503).json({ error: "Shelter reconciliation queue is unavailable." })
  const byId = new Map((candidates || []).map((item) => [item.id, item]))
  const seen = new Set(), pairs = []
  for (const left of candidates || []) for (const match of left.possible_matches || []) {
    const raw = String(match.discovery_candidate_id || "").replace(/^candidate:/, "")
    const right = byId.get(Number(raw)); if (!right || right.id === left.id) continue
    const ids = [left.id, right.id].sort((a, b) => a - b), key = ids.join(":"); if (seen.has(key)) continue; seen.add(key)
    const comparison = compareShelterCandidates(left, right)
    if (comparison.classification !== "insufficient_identity_evidence") pairs.push({ left, right, comparison })
  }
  const { data: decisions, error: decisionError } = await supabase.from("shelter_candidate_reconciliations").select("left_candidate_id,right_candidate_id,decision,decision_note,version,updated_at")
  if (decisionError) return res.status(503).json({ error: "Shelter reconciliation ledger is unavailable." })
  const decisionByPair = new Map((decisions || []).map((item) => [`${item.left_candidate_id}:${item.right_candidate_id}`, item]))
  const safe = (item) => ({ ...item, public_address: item.location_disclosure_status === "public" ? item.public_address : null })
  return res.json({ pairs: pairs.map((pair) => ({ ...pair, left: safe(pair.left), right: safe(pair.right), ledger: decisionByPair.get([pair.left.id, pair.right.id].sort((a, b) => a - b).join(":")) || null })), clusters: clustersFromPairs(pairs), automatic_action_enabled: false })
})
app.post("/api/admin/shelter-reconciliations/:leftCandidateId/:rightCandidateId", requireAdmin, async (req, res) => {
  const left = Number(req.params.leftCandidateId), right = Number(req.params.rightCandidateId), expected = Number(req.body?.expected_version)
  const decision = String(req.body?.decision || ""), note = String(req.body?.decision_note || "")
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left === right || !Number.isInteger(expected) || !["same_program_duplicate", "different_program", "needs_more_research"].includes(decision)) return res.status(400).json({ error: "Invalid reconciliation decision." })
  const { data: candidates, error } = await supabase.from("resource_discovery_candidates").select("id,name,operator,website,source_url,phone,community,public_address").in("id", [left, right])
  if (error || candidates?.length !== 2) return res.status(404).json({ error: "Candidate pair was not found." })
  const fingerprint = compareShelterCandidates(candidates[0], candidates[1]).fingerprint
  const saved = await supabase.rpc("save_shelter_candidate_reconciliation", { p_left_candidate_id: left, p_right_candidate_id: right, p_classification_fingerprint: fingerprint, p_decision: decision, p_decision_note: note, p_expected_version: expected, p_actor_id: req.adminUser.id })
  if (saved.error) return res.status(saved.error.code === "40001" ? 409 : 503).json({ error: saved.error.code === "40001" ? "This pair changed. Reload before saving." : "Reconciliation could not be saved." })
  return res.json({ reconciliation: saved.data, automatic_action_enabled: false, candidate_status_changed: false, directory_resource_created: false, location_created: false, map_pin_created: false })
})

app.post("/api/admin/discovery-candidates", requireAdmin, async (req, res) => {
  let candidate
  try { candidate = prepareShelterCandidate(req.body) }
  catch (error) { return res.status(400).json({ error: error.message, code: "invalid_candidate" }) }
  const existingCandidate = await supabase.from("resource_discovery_candidates").select("*").eq("source_fingerprint", candidate.source_fingerprint).maybeSingle()
  if (existingCandidate.error) return res.status(503).json({ error: "The candidate registry could not be checked.", code: "candidate_lookup_failed" })
  if (existingCandidate.data) return res.status(200).json({ outcome: "existing_candidate", candidate: existingCandidate.data, message: "This candidate was already saved. Its existing review record is shown." })
  const { data: resources, error: resourceError } = await supabase.from("tavily_resources").select("id,name,organization,website,city,approved,hidden").limit(1000)
  if (resourceError) return res.status(503).json({ error: "Existing resources could not be checked for duplicates.", code: "duplicate_check_failed" })
  const { data: aliases, error: aliasError } = await supabase.from("resource_source_aliases").select("resource_id,source_type,source_native_id,source_url,source_fingerprint")
  if (aliasError) return res.status(503).json({ error: "Canonical aliases could not be checked for duplicates.", code: "alias_check_failed" })
  const canonicalIds = [...new Set((aliases || []).map((item) => item.resource_id))]
  const registryResult = canonicalIds.length ? await supabase.from("resource_registry").select("id,display_name").in("id", canonicalIds) : { data: [], error: null }
  if (registryResult.error) return res.status(503).json({ error: "Canonical resources could not be checked for duplicates.", code: "canonical_check_failed" })
  const canonicalBySource = new Map((aliases || []).filter((item) => item.source_type === "tavily_resource").map((item) => [String(item.source_native_id), item.resource_id]))
  const resourcesWithCanonical = (resources || []).map((item) => ({ ...item, canonical_resource_id: canonicalBySource.get(String(item.id)) || null }))
  const pendingResult = await supabase.from("resource_discovery_candidates").select("id,name,operator,website,phone,community,public_address,review_status").neq("source_fingerprint", candidate.source_fingerprint).limit(1000)
  if (pendingResult.error) return res.status(503).json({ error: "Other review candidates could not be checked for duplicates.", code: "candidate_duplicate_check_failed" })
  const pendingResources = (pendingResult.data || []).map((item) => ({ id: `candidate:${item.id}`, discovery_candidate_id: item.id, name: item.name, organization: item.operator, website: item.website, phone: item.phone, city: item.community, address: item.public_address }))
  const matches = collectCandidateMatches(candidate, { resources: [...resourcesWithCanonical, ...pendingResources], aliases: aliases || [], registry: registryResult.data || [] })
  const { data, error } = await supabase.from("resource_discovery_candidates").insert({ ...candidate, possible_matches: matches }).select().single()
  if (error) return res.status(500).json({ error: "The candidate could not be saved. No resource was approved.", code: error.code || "candidate_insert_failed" })
  return res.status(201).json({ outcome: matches.length ? "possible_duplicate" : "created", candidate: data, possible_matches: matches, message: matches.length ? "Candidate saved with possible matches requiring review." : "Candidate saved to the administrator review queue." })
})

app.patch("/api/admin/discovery-candidates/:id", requireAdmin, async (req, res) => {
  if (!isValidResourceId(req.params.id)) return res.status(400).json({ error: "Invalid candidate ID.", code: "invalid_candidate_id" })
  const action = String(req.body?.action || "")
  if (action === "edit") {
    let replacement
    try { replacement = prepareShelterCandidate(req.body?.candidate || {}) }
    catch (error) { return res.status(400).json({ error: error.message, code: "invalid_candidate" }) }
    const { data, error } = await supabase.from("resource_discovery_candidates").update({ ...replacement, review_status: "pending", updated_at: new Date().toISOString(), last_error: null }).eq("id", req.params.id).select().single()
    if (error) return res.status(500).json({ error: "Candidate edits could not be saved.", code: error.code || "candidate_edit_failed" })
    return res.json({ outcome: "updated", candidate: data })
  }
  if (!SHELTER_REVIEW_ACTIONS.has(action)) return res.status(400).json({ error: "Choose approve, reject, exclude, defer, merge, or edit.", code: "invalid_review_action" })
  const { data: candidate, error: candidateError } = await supabase.from("resource_discovery_candidates").select("*").eq("id", req.params.id).single()
  if (candidateError || !candidate) return res.status(404).json({ error: "Candidate not found.", code: "candidate_not_found" })
  const existingOutcome = { approve: "approved", reject: "rejected", exclude: "excluded", defer: "deferred", merge: "merged" }[action]
  if (candidate.review_status === existingOutcome) return res.json({ outcome: action === "approve" ? "approved_for_directory" : action === "merge" ? "matched_existing_canonical" : existingOutcome, idempotent: true, candidate, canonical_resource_id: candidate.matched_resource_id, resource_id: candidate.imported_tavily_resource_id, directory_created: false, directory_available: action === "approve", location_created: false, map_pin_created: false })
  if (action === "merge") {
    const target = String(req.body?.canonical_resource_id || "")
    if (!/^[0-9a-f-]{36}$/i.test(target)) return res.status(400).json({ error: "Select a valid canonical resource before merging.", code: "merge_target_required" })
    const aliasCheck = await supabase.from("resource_registry").select("id,display_name").eq("id", target).maybeSingle()
    if (aliasCheck.error || !aliasCheck.data) return res.status(409).json({ error: "The selected canonical resource no longer exists.", code: "merge_target_missing" })
    const { data, error } = await supabase.from("resource_discovery_candidates").update({ review_status: "merged", matched_resource_id: target, reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", candidate.id).eq("review_status", "pending").select().single()
    if (error) return res.status(409).json({ error: "The candidate changed before it could be merged. Reload and retry.", code: "stale_candidate" })
    return res.json({ outcome: "matched_existing_canonical", candidate: data, canonical_resource: aliasCheck.data })
  }
  if (action !== "approve") {
    const status = { reject: "rejected", exclude: "excluded", defer: "deferred" }[action]
    const { data, error } = await supabase.from("resource_discovery_candidates").update({ review_status: status, reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", candidate.id).eq("review_status", "pending").select().single()
    if (error) return res.status(409).json({ error: "The review decision was not saved. Reload and retry.", code: "stale_candidate" })
    return res.json({ outcome: status, candidate: data })
  }
  if (candidate.possible_matches?.length && req.body?.confirmed_duplicate_review !== true) return res.status(409).json({ error: "Review the possible matches and explicitly confirm this is a separate resource, or merge it.", code: "duplicate_review_required", possible_matches: candidate.possible_matches })
  const insert = await supabase.from("tavily_resources").insert({ name: candidate.name, organization: candidate.operator || "", description: candidate.evidence_notes || candidate.source_excerpt || `${candidate.shelter_type} in ${candidate.community}`, website: candidate.website || candidate.source_url, city: candidate.community, category: "Housing / Shelter", service_type: candidate.shelter_type, source: "shelter_discovery", quality_score: candidate.confidence === "high" ? 90 : candidate.confidence === "medium" ? 75 : 60, approved: true, hidden: false, original_query: "province-wide shelter discovery" }).select().single()
  if (insert.error) return res.status(500).json({ error: "Directory approval failed before canonical registration. The candidate remains pending and can be retried.", code: insert.error.code || "directory_insert_failed" })
  const canonicalId = canonicalSeedId("tavily_resource", String(insert.data.id))
  const registry = await supabase.from("resource_registry").upsert({ id: canonicalId, display_name: candidate.name, lifecycle_state: "active", editorial_status: "approved" }, { onConflict: "id" })
  const alias = registry.error ? { error: registry.error } : await supabase.from("resource_source_aliases").upsert({ resource_id: canonicalId, source_type: "tavily_resource", source_native_id: String(insert.data.id), source_url: candidate.source_url, source_fingerprint: candidate.source_fingerprint, provenance: { workflow: "shelter_discovery", candidate_id: candidate.id, source_name: candidate.source_name, checked_at: candidate.checked_at, retrieved_title: candidate.retrieved_title, source_excerpt: candidate.source_excerpt } }, { onConflict: "source_type,source_native_id" })
  if (registry.error || alias.error) {
    await supabase.from("tavily_resources").delete().eq("id", insert.data.id)
    return res.status(500).json({ error: "Canonical registration failed; the newly-created directory row was rolled back. Retry is safe.", code: "canonical_registration_failed" })
  }
  const approved = await supabase.from("resource_discovery_candidates").update({ review_status: "approved", matched_resource_id: canonicalId, imported_tavily_resource_id: insert.data.id, reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", candidate.id).eq("review_status", "pending").select().single()
  if (approved.error) return res.status(500).json({ error: "The directory resource was created but final candidate reconciliation failed. Do not retry until an administrator reconciles the returned resource ID.", code: "candidate_reconciliation_failed", resource_id: insert.data.id, canonical_resource_id: canonicalId })
  return res.json({ outcome: "approved_for_directory", candidate: approved.data, resource: insert.data, canonical_resource_id: canonicalId, ...directoryApprovalState(candidate) })
})

app.patch("/api/admin/tavily-resources/:id", requireAdmin, async (req, res) => {
  if (!isValidResourceId(req.params.id)) return res.status(400).json({ error: "Invalid resource ID." })
  const action = req.body?.action
  if (!['approve', 'hide'].includes(action)) {
    return res.status(400).json({ error: "Invalid review action." })
  }

  const changes = action === "approve"
    ? { approved: true, hidden: false }
    : { approved: false, hidden: true }

  const { data, error } = await supabase
    .from("tavily_resources")
    .update(changes)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: "Could not update review item." })

  await supabase
    .from("ai_resource_reviews")
    .update({ reviewed_by_human_at: new Date().toISOString(), human_decision: action === "approve" ? "approved" : "hidden" })
    .eq("resource_id", req.params.id)
    .is("reviewed_by_human_at", null)

  return res.json({ item: data })
})

app.get("/api/map/resources", async (_req, res) => {
  const { data: resources, error } = await supabase
    .from("tavily_resources")
    .select("id,name,organization,description,website,city,category,service_type,approved,source")
    .eq("approved", true)
    .eq("hidden", false)
    .limit(1000)
  if (error) return res.status(503).json({ error: "Map resources are temporarily unavailable." })
  const ids = (resources || []).map((item) => item.id)
  let aliases = []
  let locations = []
  if (ids.length) {
    const aliasResult = await supabase.from("resource_source_aliases").select("resource_id,source_native_id").eq("source_type", "tavily_resource").in("source_native_id", ids.map(String))
    if (!aliasResult.error) aliases = aliasResult.data || []
    const canonicalIds = aliases.map((item) => item.resource_id)
    if (canonicalIds.length) {
      const locationResult = await supabase.from("resource_locations").select("id,resource_id,original_address_text,street_address,city,province,postal_code,latitude,longitude,service_area,location_type,public_map,geocode_status,review_status,location_last_verified").in("resource_id", canonicalIds).eq("location_type", "fixed").eq("public_map", true).eq("geocode_status", "verified").eq("review_status", "approved")
      if (!locationResult.error) locations = locationResult.data || []
    }
  }
  const canonicalBySource = new Map(aliases.map((item) => [String(item.source_native_id), item.resource_id]))
  const locationsByCanonical = new Map()
  for (const location of locations) locationsByCanonical.set(String(location.resource_id), [...(locationsByCanonical.get(String(location.resource_id)) || []), location])
  const items = (resources || []).flatMap((resource) => {
    const canonicalId = canonicalBySource.get(String(resource.id))
    const publicLocations = locationsByCanonical.get(String(canonicalId)) || []
    if (!publicLocations.length) return [{ ...resource, canonical_id: canonicalId || null, serviceType: resource.service_type }]
    return publicLocations.map((location) => ({ ...resource, canonical_id: canonicalId, location_id: location.id, serviceType: resource.service_type, address: location.street_address || location.original_address_text || "", ...location, verification_status: location.geocode_status }))
  })
  const { data: allPublicLocations, error: publicLocationError } = await supabase.from("resource_locations").select("id,resource_id,original_address_text,street_address,city,province,postal_code,latitude,longitude,service_area,location_type,public_map,geocode_status,review_status,location_last_verified").eq("location_type", "fixed").eq("public_map", true).eq("geocode_status", "verified").eq("review_status", "approved")
  if (publicLocationError) return res.status(503).json({ error: "Map locations are temporarily unavailable." })
  const publicCanonicalIds = [...new Set((allPublicLocations || []).map((item) => item.resource_id))]
  const [publicAliases, publicRegistry] = await Promise.all([
    publicCanonicalIds.length ? supabase.from("resource_source_aliases").select("resource_id,source_type,source_native_id").in("resource_id", publicCanonicalIds) : { data: [] },
    publicCanonicalIds.length ? supabase.from("resource_registry").select("id,lifecycle_state,editorial_status").in("id", publicCanonicalIds) : { data: [] },
  ])
  if (publicAliases.error || publicRegistry.error) return res.status(503).json({ error: "Map registry is temporarily unavailable." })
  const eligibleCanonical = new Set((publicRegistry.data || []).filter((item) => item.lifecycle_state === "active" && item.editorial_status !== "hidden").map((item) => item.id))
  const aliasesByCanonical = new Map()
  for (const alias of publicAliases.data || []) aliasesByCanonical.set(alias.resource_id, [...(aliasesByCanonical.get(alias.resource_id) || []), alias])
  const representedLocations = new Set(items.filter((item) => item.location_id).map((item) => item.location_id))
  for (const location of allPublicLocations || []) {
    if (!eligibleCanonical.has(location.resource_id) || representedLocations.has(location.id)) continue
    const sourceAliases = aliasesByCanonical.get(location.resource_id) || []
    if (sourceAliases.some((alias) => alias.source_type === "tavily_resource")) continue
    const curatedAlias = sourceAliases.find((alias) => alias.source_type === "curated_bundle")
    const resource = curatedAlias ? getCuratedMapResource(curatedAlias.source_native_id) : null
    if (!resource) continue
    items.push({ ...resource, canonical_id: location.resource_id, location_id: location.id, address: location.street_address || location.original_address_text || "", ...location, verification_status: location.geocode_status })
  }
  res.setHeader("Cache-Control", "public, max-age=300")
  return res.json({ items })
})

app.get("/api/map/locations/:id/transit", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id || ""))) return res.status(400).json({ error: "Invalid public location ID." })
  const { data: location, error } = await supabase.from("resource_locations")
    .select("id,latitude,longitude,location_type,public_map,geocode_status,review_status")
    .eq("id", req.params.id).eq("location_type", "fixed").eq("public_map", true)
    .eq("geocode_status", "verified").eq("review_status", "approved").maybeSingle()
  if (error) return res.status(503).json({ error: "Transit context is temporarily unavailable." })
  if (!location) return res.status(404).json({ error: "No approved public location was found." })
  try {
    const result = await getNearbyTransit({ latitude: Number(location.latitude), longitude: Number(location.longitude) })
    res.setHeader("Cache-Control", "public, max-age=300")
    return res.json(result)
  } catch (providerError) {
    console.error("Transit provider request failed", { provider: "configured_adapter", message: providerError.message })
    return res.status(503).json({ error: "Nearby transit information is temporarily unavailable." })
  }
})

app.post("/api/navigation/origin", rateLimit({ windowMs: 60_000, max: 12 }), async (req, res) => {
  try {
    const result = await geocodeNavigationOrigin(req.body?.query)
    res.setHeader("Cache-Control", "private, no-store")
    if (!result.ok) return res.status(result.status === "not_configured" ? 503 : 404).json({ error: result.status === "not_configured" ? "Starting-location lookup is unavailable right now." : "I couldn't find that starting location. Try including the city." })
    return res.json(result)
  } catch (error) { return res.status(400).json({ error: error.message }) }
})

app.post("/api/map/locations/:id/access-context", rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id || ""))) return res.status(400).json({ error: "Invalid public location ID." })
  const { data: location, error } = await supabase.from("resource_locations")
    .select("id,resource_id,latitude,longitude,location_type,public_map,geocode_status,review_status")
    .eq("id", req.params.id).eq("location_type", "fixed").eq("public_map", true)
    .eq("geocode_status", "verified").eq("review_status", "approved").maybeSingle()
  if (error) return res.status(503).json({ error: "Getting-there information is temporarily unavailable." })
  if (!location) return res.status(404).json({ error: "This resource does not have an approved public location." })
  const supplied = req.body?.origin
  let origin = null
  let originProvenance = null
  if (supplied != null) {
    const latitude = Number(supplied.latitude), longitude = Number(supplied.longitude)
    if (!Number.isFinite(latitude) || latitude < 48 || latitude > 60 || !Number.isFinite(longitude) || longitude < -140 || longitude > -114) return res.status(400).json({ error: "The starting location is outside British Columbia or invalid." })
    const provider = ["browser_geolocation", "bc_address_geocoder"].includes(supplied.provenance?.provider) ? supplied.provenance.provider : null
    if (!provider) return res.status(400).json({ error: "The starting-location source is invalid." })
    origin = { latitude, longitude }; originProvenance = { provider }
  }
  try {
    const transit = await getNearbyTransit({ latitude: Number(location.latitude), longitude: Number(location.longitude) }, { origin })
    const context = buildAccessContext({ resource: { id: location.resource_id }, location, transit, userCoordinate: origin, originProvenance })
    res.setHeader("Cache-Control", "private, no-store")
    return res.json({ context })
  } catch { return res.status(503).json({ error: "I couldn't find transit information for this location yet." }) }
})

app.post("/api/admin/pending-locations/bounded-approve", requireAdmin, async (req, res) => {
  const selected = Array.isArray(req.body?.locations) ? req.body.locations : []
  if (!selected.length || selected.length > 20) return res.status(400).json({ error: "Select between one and twenty explicit locations." })
  if (req.body?.confirmed_public_statement !== true) return res.status(400).json({ error: "Explicit confirmation that every selected service and exact address may be public is required." })
  if (selected.some((item) => !/^[0-9a-f-]{36}$/i.test(String(item?.location_id)) || !/^[0-9a-f-]{36}$/i.test(String(item?.resource_id)) || !String(item?.expected_name || "").trim() || !String(item?.expected_updated_at || "").trim())) return res.status(400).json({ error: "Location UUID, canonical UUID, expected name, and review version are required." })
  const ids = selected.map((item) => String(item.location_id))
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "Duplicate location IDs are not allowed." })
  const confirmationNames = Array.isArray(req.body?.confirmed_names) ? req.body.confirmed_names.map(String) : []
  if (JSON.stringify(confirmationNames) !== JSON.stringify(selected.map((item) => String(item.expected_name)))) return res.status(400).json({ error: "The complete selected-name confirmation list is required." })
  const { data: locations, error } = await supabase.from("resource_locations").select("*").in("id", ids)
  if (error || (locations || []).length !== selected.length) return res.status(409).json({ error: "One or more selected locations no longer exist." })
  const resourceIds = selected.map((item) => String(item.resource_id))
  const { data: registry, error: registryError } = await supabase.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").in("id", resourceIds)
  if (registryError) return res.status(503).json({ error: "Registry validation is unavailable." })
  const { data: audits, error: auditError } = await supabase.from("resource_location_audit").select("location_id,new_values,created_at").in("location_id", ids).eq("action", "geocoded").order("created_at", { ascending: false })
  if (auditError) return res.status(503).json({ error: "Location evidence validation is unavailable." })
  const locationById = new Map(locations.map((item) => [item.id, item])), registryById = new Map((registry || []).map((item) => [item.id, item]))
  const auditByLocation = new Map()
  for (const audit of audits || []) if (!auditByLocation.has(audit.location_id)) auditByLocation.set(audit.location_id, audit.new_values || {})
  const failures = []
  for (const expected of selected) {
    const location = locationById.get(String(expected.location_id)), resource = registryById.get(String(expected.resource_id))
    if (!location || location.resource_id !== expected.resource_id || !resource || resource.display_name !== expected.expected_name) failures.push({ location_id: expected.location_id, reason: "identity_mismatch" })
    else if (String(location.updated_at) !== String(expected.expected_updated_at)) failures.push({ location_id: expected.location_id, reason: "stale_record" })
    else if (resource.lifecycle_state !== "active" || resource.editorial_status === "hidden") failures.push({ location_id: expected.location_id, reason: "editorially_ineligible" })
    else if (location.review_status === "approved" && location.geocode_status === "verified" && location.public_map === true) continue
    else if (location.location_type !== "fixed" || location.review_status !== "pending" || location.public_map !== false || location.geocode_status !== "matched") failures.push({ location_id: expected.location_id, reason: "not_approvable_pending_state" })
    else if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude)) || !Number(location.latitude) || !Number(location.longitude)) failures.push({ location_id: expected.location_id, reason: "invalid_coordinates" })
    else {
      const evidence = auditByLocation.get(location.id) || {}
      const classification = classifyLocationReview({ location, evidence, resource, addressPeerCount: Number(evidence.address_peer_count || 1) })
      if (classification.tier !== 1 || !classification.selectable) failures.push({ location_id: expected.location_id, reason: "not_tier_one", warnings: classification.warnings })
    }
  }
  if (failures.length) return res.status(409).json({ error: "Bounded approval preflight failed; nothing was changed.", failures })
  const results = []
  for (const expected of selected) {
    const current = locationById.get(String(expected.location_id))
    if (current.review_status === "approved" && current.geocode_status === "verified" && current.public_map === true) { results.push({ location_id: current.id, status: "already_approved" }); continue }
    const now = new Date().toISOString()
    const { data, error: updateError } = await supabase.from("resource_locations").update({ geocode_status: "verified", review_status: "approved", public_map: true, reviewed_by: req.adminUser.id, reviewed_at: now, location_last_verified: now, updated_at: now }).eq("id", current.id).eq("resource_id", current.resource_id).eq("review_status", "pending").eq("public_map", false).select().single()
    if (updateError) return res.status(500).json({ error: "Bounded approval stopped after a database error.", results })
    await supabase.from("resource_location_audit").insert({ location_id: data.id, action: "approved", previous_values: current, new_values: data, actor_id: req.adminUser.id, reason: `Administrator-confirmed bounded approval: ${expected.expected_name}` })
    results.push({ location_id: data.id, status: "approved" })
  }
  return res.json({ results })
})

app.patch("/api/admin/resource-geography/:resourceId", requireAdmin, async (req, res) => {
  const rawResourceId = String(req.params.resourceId || "")
  let canonicalId = /^[0-9a-f-]{36}$/i.test(rawResourceId) ? rawResourceId : null
  if (!canonicalId) {
    const sourceType = /^\d+$/.test(rawResourceId) ? "tavily_resource" : rawResourceId.startsWith("curated:") ? "curated_bundle" : ""
    if (!sourceType) return res.status(400).json({ error: "Invalid resource ID." })
    const { data: alias } = await supabase.from("resource_source_aliases").select("resource_id").eq("source_type", sourceType).eq("source_native_id", rawResourceId).maybeSingle()
    canonicalId = alias?.resource_id || null
  }
  if (!canonicalId) return res.status(404).json({ error: "Canonical resource alias not found." })
  const allowedStatuses = new Set(["geocoded", "verified", "approximate", "failed", "needs_review"])
  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude)
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude)
  if ((latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) return res.status(400).json({ error: "Invalid coordinates." })
  if (!allowedStatuses.has(req.body?.geocode_status)) return res.status(400).json({ error: "Invalid geocode status." })
  const geocodeStatus = { geocoded: "matched", verified: "verified", approximate: "matched", failed: "failed", needs_review: "pending" }[req.body.geocode_status]
  const locationType = req.body.virtual_service === true ? "virtual" : req.body.mobile_service === true ? "mobile" : "fixed"
  const approved = req.body.geocode_status === "verified"
  const changes = {
    resource_id: canonicalId, latitude: locationType === "fixed" ? latitude : null, longitude: locationType === "fixed" ? longitude : null,
    location_type: locationType, geocode_status: locationType === "fixed" ? geocodeStatus : "not_required",
    review_status: approved ? "approved" : "pending",
    public_map: approved && req.body.public_map !== false && latitude != null && longitude != null,
    service_area: String(req.body.service_area || "").slice(0, 500) || null,
    reviewed_by: req.adminUser.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...(req.body.geocode_status === "verified" ? { location_last_verified: new Date().toISOString() } : {}),
  }
  const locationId = String(req.body?.location_id || "")
  const operation = locationId
    ? supabase.from("resource_locations").update(changes).eq("id", locationId).eq("resource_id", canonicalId)
    : supabase.from("resource_locations").insert(changes)
  const { data, error } = await operation.select().single()
  if (error) return res.status(500).json({ error: "Could not update resource geography." })
  await supabase.from("resource_location_audit").insert({ location_id: data.id, action: approved ? "approved" : "corrected", new_values: data, actor_id: req.adminUser.id })
  return res.json({ item: data })
})

app.post("/api/admin/resource-geography/:resourceId/geocode", rateLimit({ windowMs: 60 * 1000, max: 10 }), requireAdmin, async (req, res) => {
  const rawResourceId = String(req.params.resourceId || "")
  const sourceType = /^\d+$/.test(rawResourceId) ? "tavily_resource" : rawResourceId.startsWith("curated:") ? "curated_bundle" : ""
  let canonicalId = /^[0-9a-f-]{36}$/i.test(rawResourceId) ? rawResourceId : null
  if (!canonicalId && sourceType) {
    const { data: alias } = await supabase.from("resource_source_aliases").select("resource_id").eq("source_type", sourceType).eq("source_native_id", rawResourceId).maybeSingle()
    canonicalId = alias?.resource_id || null
  }
  if (!canonicalId) return res.status(404).json({ error: "Canonical resource alias not found." })
  const address = normalizeAddressParts(req.body)
  const candidate = { ...address, virtual_service: req.body?.virtual_service === true, mobile_service: req.body?.mobile_service === true, public_map: req.body?.public_map !== false }
  if (!isPublicGeocodeCandidate(candidate)) return res.status(400).json({ error: "A published street address and city are required. Private, PO box, virtual, or mobile locations are not geocoded." })
  const cacheKey = addressCacheKey(address)
  const { data: cached } = await supabase.from("geocode_cache").select("response_summary").eq("provider", "nominatim").eq("query_hash", cacheKey).eq("validation_status", "accepted").maybeSingle()
  let result = cached?.response_summary ? { ...cached.response_summary, cached: true } : null
  try {
    if (!result) result = await geocoder.geocode(address)
    if (!result) throw new Error("No match")
    if (!cached) await supabase.from("geocode_cache").insert({ provider: "nominatim", normalized_query: Object.values(address).filter(Boolean).join(", "), query_hash: cacheKey, validation_status: "accepted", response_summary: result })
    const locationValues = { resource_id: canonicalId, location_type: "fixed", original_address_text: String(req.body?.original_address_text || req.body?.street_address || "").slice(0, 500), ...address, latitude: result.latitude, longitude: result.longitude, geocode_source: result.geocode_source, geocode_confidence: result.geocode_confidence, geocode_status: "matched", review_status: "pending", public_map: false, updated_at: new Date().toISOString() }
    const { data: existing } = await supabase.from("resource_locations").select("id").eq("resource_id", canonicalId).eq("location_type", "fixed").eq("street_address", address.street_address).eq("city", address.city).maybeSingle()
    const operation = existing?.id ? supabase.from("resource_locations").update(locationValues).eq("id", existing.id) : supabase.from("resource_locations").insert(locationValues)
    const { data, error } = await operation.select().single()
    if (error) throw error
    await supabase.from("resource_location_audit").insert({ location_id: data.id, action: "geocoded", new_values: data, actor_id: req.adminUser.id })
    return res.json({ item: data, cached: Boolean(result.cached) })
  } catch (error) {
    await supabase.from("geocode_cache").upsert({ provider: "nominatim", normalized_query: Object.values(address).filter(Boolean).join(", "), query_hash: cacheKey, validation_status: "failed", error_summary: String(error?.message || "Geocoding failed").slice(0, 300) }, { onConflict: "provider,query_hash" })
    return res.status(422).json({ error: "No reliable public-location match was found." })
  }
})

const reviewRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 })

app.get("/api/admin/tavily-resources/:id/ai-review", requireAdmin, async (req, res) => {
  if (!isValidResourceId(req.params.id)) return res.status(400).json({ error: "Invalid resource ID." })

  const { data, error } = await supabase
    .from("ai_resource_reviews")
    .select("*")
    .eq("resource_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: "Could not load AI review. Has the migration been applied?" })
  return res.json({ review: data || null })
})

app.post("/api/admin/tavily-resources/:id/ai-review", reviewRateLimit, requireAdmin, async (req, res) => {
  if (process.env.AI_REVIEW_ENABLED === "false") return res.status(503).json({ error: "AI review is disabled." })
  if (!isValidResourceId(req.params.id)) return res.status(400).json({ error: "Invalid resource ID." })
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI review is not configured." })
  if (req.body?.force !== undefined && typeof req.body.force !== "boolean") {
    return res.status(400).json({ error: "force must be a boolean." })
  }

  try {
    const review = await runResourceReviewPipeline(Number(req.params.id), {
      supabase,
      openai: client,
      fetchImpl: fetch,
      force: req.body?.force === true,
    })
    return res.status(201).json({ review })
  } catch (error) {
    if (error.code === "RESOURCE_NOT_FOUND") return res.status(404).json({ error: error.message })
    if (error.code === "REVIEW_ALREADY_RUNNING") return res.status(409).json({ error: error.message })
    console.error("AI resource review failed:", String(error?.message || "Unknown error").slice(0, 200))
    return res.status(500).json({ error: "AI review failed." })
  }
})

app.use(express.static(path.join(__dirname, "dist")))

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"))
})

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(port, () => {
    console.log(`Miller server running on http://localhost:${port}`)
  })
}

export { app, clearRateLimitsForTests, isAllowedCorsRequest, isValidResourceId, paidDailyLimit, rateLimit, requireAdmin, setSecurityHeaders }
