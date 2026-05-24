import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import OpenAI from "openai"
import path from "path"
import { fileURLToPath } from "url"
import { tavily } from "@tavily/core"
import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 8787

app.use(cors())
app.use(express.json({ limit: "1mb" }))

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini"

const TAVILY_CLIENT = tavily({
  apiKey: process.env.TAVILY_API_KEY,
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

function getCookieValue(req, name) {
  const cookieHeader = req.headers.cookie || ""
  const cookies = cookieHeader.split(";").map((part) => part.trim())

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=")
    if (key === name) {
      return decodeURIComponent(rest.join("="))
    }
  }

  return ""
}

console.log("OPENAI_API_KEY loaded:", !!process.env.OPENAI_API_KEY)
console.log("SITE_PASSWORD loaded:", !!process.env.SITE_PASSWORD)
console.log("OPENAI_MODEL:", OPENAI_MODEL)

app.get("/unlock", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "unlock.html"))
})

app.use((req, res, next) => {
  const publicPaths = ["/unlock", "/api/unlock"]

  if (publicPaths.includes(req.path)) {
    return next()
  }

  const password = process.env.SITE_PASSWORD
  if (!password) {
    return next()
  }

  const unlocked = getCookieValue(req, "miller_access")
  console.log("Cookie miller_access:", unlocked ? "[present]" : "[missing]")

  if (unlocked === password) {
    return next()
  }

  if (req.path.startsWith("/api/")) {
    console.log("Blocked API request:", req.path)
    return res.status(401).json({ error: "Unauthorized" })
  }

  console.log("Blocked page request:", req.path)
  return res.sendFile(path.join(__dirname, "public", "unlock.html"))
})

app.post("/api/unlock", (req, res) => {
  const { password } = req.body || {}

  console.log("Hit /api/unlock")
  console.log("Password received:", password ? "[provided]" : "[missing]")

  if (!process.env.SITE_PASSWORD) {
    return res.json({ ok: true })
  }

  if (password === process.env.SITE_PASSWORD) {
    res.setHeader(
      "Set-Cookie",
      `miller_access=${encodeURIComponent(password)}; Path=/; SameSite=Lax`
    )
    return res.json({ ok: true })
  }

  return res.status(401).json({ ok: false, error: "Wrong password" })
})

app.post("/api/miller", async (req, res) => {
  try {
    console.log("Hit /api/miller")

    const {
  query,
  city,
  matches,
  conversationMemory = [],
  conversationSummary = "",
  inferredCategories,
  communicationMode
} = req.body || {}

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "Query is required." })
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in .env" })
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

    const safeMatches = Array.isArray(matches) ? matches.slice(0, 20) : []

    let tavilyResults = []

    const matchCount = safeMatches.length

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
  safeMatches.length < 3 ||
  topLocalScore < 120 ||
  noCategoryMatch

const shouldUseBasicTavily =
  !shouldUseAdvancedTavily &&
  (
    safeMatches.length < 8 ||
    topLocalScore < 220
  )

  let tavilyMode = "none"

if (shouldUseAdvancedTavily) {
  tavilyMode = "advanced"
} else if (shouldUseBasicTavily) {
  tavilyMode = "basic"
}

if (tavilyMode !== "none") {
  try {
    const tavilyResponse = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query:
  tavilyMode === "advanced"
    ? `${safeQuery} BC harm reduction detox counselling treatment mental health official services site:.ca`
    : safeQuery,

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
    )

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

    console.log("Tavily mode:", tavilyMode)
    console.log(
  `Tavily returned ${tavilyResults.length} results`
)

  const shouldSuppressLocalCards =
  noCategoryMatch &&
  tavilyResults.length > 0

  } catch (error) {
    console.error("Tavily search failed:", error)
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

    const formattedMemory = conversationMemory
  .map(
    (item) =>
      `${item.role === "user" ? "User" : "Miller"}: ${item.content}`
  )
  .join("\n\n")

      const response = await client.responses.create({
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
    })

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
  organization: "Web Search",
  description: result.content || "",
  website: result.url || "",
  city: city || "",
  category: "Web Result",
  serviceType: "External Resource",

  source: "tavily",
  approved: false,
}))

if (formattedTavilyResults.length > 0) {
  try {
    await supabase
      .from("tavily_resources")
      .insert(
        formattedTavilyResults.map((resource) => ({
          name: resource.name,
          organization: resource.organization,
          description: resource.description,
          website: resource.website,

          city: resource.city,
          category: resource.category,
          service_type: resource.serviceType,

          source: resource.source,
          approved: false,

          original_query: safeQuery,
        }))
      )

    console.log("Saved Tavily resources to Supabase")
  } catch (error) {
    console.error("Could not save Tavily resources:", error)
  }
}

res.json({
  answer,
  searchHints: finalSearchHints,
  safetyMode,
  communicationMode: finalCommunicationMode,
  tavilyResults: formattedTavilyResults,
  suppressLocalCards: shouldSuppressLocalCards,
})
  } catch (error) {
    console.error("Miller API error:", error)
    res.status(500).json({
      error: "Failed to generate Miller response.",
      details: error?.message || "Unknown error",
    })
  }
})

app.use(express.static(path.join(__dirname, "dist")))

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"))
})

app.listen(port, () => {
  console.log(`Miller server running on http://localhost:${port}`)
})