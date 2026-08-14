import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { tavily } from "@tavily/core"
import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"
import { runResourceReviewPipeline } from "./server/review/orchestrator.js"
import { createRequireAdmin } from "./server/adminAuth.js"
import { createPublicWriteHandlers } from "./server/publicWrites.js"
import { validateMillerRequest } from "./server/millerValidation.js"
import { addressCacheKey, createGeocoder, isPublicGeocodeCandidate, normalizeAddressParts } from "./server/geocoding.js"
import { boundedMapConversation, buildAuthorizedMapResponse } from "./server/mapChat.js"
import { authorizeMapMatches, getCuratedMapResource } from "./server/mapResources.js"
import { classifyLocationReview } from "./server/locationReview.js"
import { canonicalSeedId } from "./server/resourceIdentity.js"
import { directoryApprovalState, findConservativeMatches, prepareShelterCandidate, SHELTER_REVIEW_ACTIONS } from "./server/shelterDiscovery.js"

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
    allowedHeaders: ["Authorization", "Content-Type"],
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

const addressEvidencePath = path.join(__dirname, "data", "address-evidence-inventory.json")
const locationAutomationDryRunPath = path.join(__dirname, "data", "location-automation-v1.2-dry-run.json")
function readAddressEvidence() { return JSON.parse(fs.readFileSync(addressEvidencePath, "utf8")) }
app.get("/api/admin/address-evidence", requireAdmin, (_req, res) => {
  try { res.setHeader("Cache-Control", "private, no-store"); return res.json(readAddressEvidence()) }
  catch { return res.status(503).json({ error: "Address evidence has not been generated locally." }) }
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
  catch { return res.status(503).json({ error: "The local v1.2 dry-run inventory has not been generated." }) }
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
  if (req.body?.expected_updated_at && String(req.body.expected_updated_at) !== String(current.updated_at)) return res.status(409).json({ error: "This item changed after it was loaded. Reconcile the queue and review it again.", code: "stale_record" })
  if (current.location_type !== "fixed" && ["approve", "correct"].includes(action)) return res.status(409).json({ error: "This resource has no fixed public point to approve or correct.", code: "not_fixed" })
  const isPublished = current.review_status === "approved" && current.public_map === true
  if (current.review_status !== "pending" && !isPublished) return res.status(409).json({ error: "This location is not reviewable." })
  if (isPublished && action === "approve") return res.status(409).json({ error: "This location is already approved." })
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

app.post("/api/events", analyticsRateLimit, publicWriteHandlers.createEvent)

app.post("/api/resource-submissions", submissionRateLimit, publicWriteHandlers.createResourceSubmission)

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

app.post("/api/admin/discovery-candidates", requireAdmin, async (req, res) => {
  let candidate
  try { candidate = prepareShelterCandidate(req.body) }
  catch (error) { return res.status(400).json({ error: error.message, code: "invalid_candidate" }) }
  const existingCandidate = await supabase.from("resource_discovery_candidates").select("*").eq("source_fingerprint", candidate.source_fingerprint).maybeSingle()
  if (existingCandidate.error) return res.status(503).json({ error: "The candidate registry could not be checked.", code: "candidate_lookup_failed" })
  if (existingCandidate.data) return res.status(200).json({ outcome: "existing_candidate", candidate: existingCandidate.data, message: "This candidate was already saved. Its existing review record is shown." })
  const { data: resources, error: resourceError } = await supabase.from("tavily_resources").select("id,name,organization,website,city,approved,hidden").limit(1000)
  if (resourceError) return res.status(503).json({ error: "Existing resources could not be checked for duplicates.", code: "duplicate_check_failed" })
  const matches = findConservativeMatches(candidate, resources || []).slice(0, 10).map((item) => ({ tavily_resource_id: item.resource.id, name: item.resource.name, classification: item.classification, score: item.score, evidence: item.evidence }))
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
