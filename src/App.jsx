import { useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import rawResources from "./vancouver_resources_merged_updated.json"
import { supabase } from "./supabaseClient"
import millerClassic from "./assets/miller_classic.png"
import millerJade from "./assets/miller_jade.png"
import millerGold from "./assets/miller_gold.png"
import millerViolet from "./assets/miller_violet.png"
import millerRose from "./assets/miller_rose.png"
import millerNorth from "./assets/miller_north.png"

import titleClassic from "./assets/title.png"
import titleJade from "./assets/title_jade.png"
import titleGold from "./assets/title_gold.png"
import titleViolet from "./assets/title_violet.png"
import titleRose from "./assets/title_rose.png"
import titleNorth from "./assets/title_north.png"

import arrowLeft from "./assets/arrow_left.png";
import arrowRight from "./assets/arrow_right.png";

import backgroundClassic from "./assets/background_classic.png"
import backgroundViolet from "./assets/background_violet.png"
import backgroundJade from "./assets/background_jade.png"
import backgroundGold from "./assets/background_gold.png"
import backgroundNorth from "./assets/background_north.png"
import backgroundRose from "./assets/background_rose.png"

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
  ],
  "Counselling": [
    "counselling",
    "counseling",
    "therapy",
    "therapist",
    "talk to someone",
    "mental health",
    "anxiety",
    "depression",
    "supportive counselling",
  ],
  "Crisis Support": [
    "crisis",
    "suicidal",
    "suicide",
    "overdose",
    "emergency",
    "unsafe",
    "panic",
    "help now",
    "urgent",
  ],
  "OAT / Med Support": [
    "oat",
    "methadone",
    "suboxone",
    "suboclade",
    "buprenorphine",
    "medication",
    "med support",
    "opioid treatment",
  ],
  "Harm Reduction": [
    "harm reduction",
    "safe use",
    "safer use",
    "naloxone",
    "supplies",
    "needle",
    "needles",
    "safer smoking",
  ],
  "Treatment Programs": [
    "treatment",
    "treatment center",
    "treatment centre",
    "residential",
    "residential treatment",
    "inpatient",
    "recovery home",
    "recovery house",
    "supportive recovery",
    "private pay",
    "program",
    "rehab",
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
  "Housing / Outreach": [
    "housing",
    "homeless",
    "outreach",
    "shelter",
    "street",
    "homelessness",
  ],
  "Youth Support": ["youth", "teen", "teenager", "young person", "young adult"],
  "Indigenous Support": ["indigenous", "first nations", "metis", "inuit", "aboriginal"],
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

const MILLER_THEMES = [
  {
    name: "Classic",
    avatar: millerClassic,
    title: titleClassic,
    background: backgroundClassic,
    accent: "#6bbcff",
  },
  {
    name: "Jade",
    avatar: millerJade,
    title: titleJade,
    background: backgroundJade,
    accent: "#71c99a",
  },
  {
    name: "Gold",
    avatar: millerGold,
    title: titleGold,
    background: backgroundGold,
    accent: "#d8ac55",
  },
  {
    name: "Violet",
    avatar: millerViolet,
    title: titleViolet,
    background: backgroundViolet,
    accent: "#ae8cff",
  },
  {
    name: "Rose",
    avatar: millerRose,
    title: titleRose,
    background: backgroundRose,
    accent: "#ef91a8",
  },
  {
    name: "North",
    avatar: millerNorth,
    title: titleNorth,
    background: backgroundNorth,
    accent: "#6fd4d7",
  },
]

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueStrings(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

function looksLikePersonalEmail(value) {
  const email = String(value || "").trim().toLowerCase()
  if (!email || !email.includes("@")) return false

  const personalDomains = [
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "shaw.ca",
    "telus.net",
    "yahoo.com",
    "me.com",
  ]

  return personalDomains.some((domain) => email.endsWith(`@${domain}`))
}

function looksLikePersonName(value) {
  const text = String(value || "").trim()
  if (!text) return false

  const cleaned = text.replace(/[^a-zA-Z\s'-]/g, " ").replace(/\s+/g, " ").trim()
  const parts = cleaned.split(" ").filter(Boolean)

  if (parts.length < 2 || parts.length > 3) return false

  return parts.every((part) => /^[A-Z][a-z'-]+$/.test(part))
}

function safeOrganization(resource) {
  const org = String(resource.organization || "").trim()
  if (!org) return ""

  if (looksLikePersonName(org)) return ""
  return org
}

function safeEmail(resource) {
  const email = String(resource.email || "").trim()
  if (!email) return ""

  if (looksLikePersonalEmail(email)) return ""
  return email
}

function safeNotes() {
  return ""
}

function getField(resource, keys) {
  for (const key of keys) {
    const value = resource[key]
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim()
    }
  }
  return ""
}

function cleanResources(rows) {
  return rows.map((row) => {
    const cleaned = {}

    for (const [key, value] of Object.entries(row)) {
      const cleanKey = String(key).replace(/^\uFEFF/, "").trim()
      cleaned[cleanKey] = value
    }

    return {
      name: getField(cleaned, ["Resource Name", "Name", "name"]) || "Unnamed Resource",
      organization: getField(cleaned, ["Organization", "organization"]),
      serviceType: getField(cleaned, ["Service Type", "serviceType"]),
      category: getField(cleaned, ["Program Category", "category"]),
      population: getField(cleaned, ["Population", "population"]),
      eligibility: getField(cleaned, ["Age / Eligibility", "eligibility"]),
      description: getField(cleaned, ["Description", "description"]),
      accessType: getField(cleaned, ["Access Type", "accessType"]),
      hours: getField(cleaned, ["Hours", "hours"]),
      phone: getField(cleaned, ["Phone", "phone"]),
      altPhone: getField(cleaned, ["Alt Phone", "altPhone"]),
      email: getField(cleaned, ["Email", "email"]),
      website: getField(cleaned, ["Website", "website"]),
      address: getField(cleaned, ["Address", "address"]),
      city: getField(cleaned, ["City", "city"]),
      region: getField(cleaned, ["Region", "region"]),
      notes: getField(cleaned, ["Notes", "notes"]),
    }
  })
}

function buildSearchText(resource) {
  return `
    ${resource.name}
    ${resource.organization}
    ${resource.serviceType}
    ${resource.category}
    ${resource.population}
    ${resource.eligibility}
    ${resource.description}
    ${resource.accessType}
    ${resource.hours}
    ${resource.phone}
    ${resource.altPhone}
    ${resource.email}
    ${resource.website}
    ${resource.address}
    ${resource.city}
    ${resource.region}
    ${resource.notes}
    ${(resource.tags || []).join(" ")}
  `
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function dedupeResources(resources) {
  const seen = new Set()

  return resources.filter((resource) => {
    const key = `${resource.name}|${resource.city}|${resource.organization}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

function isDetoxSearch(query, inferredCategories = []) {
  const search = normalizeText(query)

  return (
    inferredCategories.includes("Detox / Withdrawal") ||
    search.includes("detox") ||
    search.includes("withdrawal") ||
    search.includes("medical detox")
  )
}

function isTreatmentSearch(query, inferredCategories = []) {
  const search = normalizeText(query)

  return (
    inferredCategories.includes("Treatment Programs") ||
    search.includes("treatment") ||
    search.includes("treatment center") ||
    search.includes("treatment centre") ||
    search.includes("residential") ||
    search.includes("recovery home") ||
    search.includes("recovery house") ||
    search.includes("rehab")
  )
}

function shouldHideFromDetoxResults(resource, query, inferredCategories = []) {
  if (!isDetoxSearch(query, inferredCategories)) return false

  const name = normalizeText(resource.name)
  const category = normalizeText(resource.category)
  const serviceType = normalizeText(resource.serviceType)
  const description = normalizeText(resource.description)

  const isSusat =
    name.includes("susat") ||
    name.includes("substance use services access team")

  const isTreatmentOnly =
    category.includes("treatment") ||
    category.includes("recovery home") ||
    category.includes("fnha treatment centre") ||
    serviceType.includes("residential treatment") ||
    serviceType.includes("recovery home") ||
    serviceType.includes("supportive recovery")

  const onlyMentionsDetoxSupport =
    description.includes("detox support") &&
    !category.includes("detox") &&
    !serviceType.includes("withdrawal")

  return isSusat || isTreatmentOnly || onlyMentionsDetoxSupport
}

function applySearchSafetyFilters(resources, query, inferredCategories = []) {
  return resources.filter(
    (resource) => !shouldHideFromDetoxResults(resource, query, inferredCategories)
  )
}

function getResultLimit(query, inferredCategories = []) {
  if (isTreatmentSearch(query, inferredCategories)) return 40
  if (isDetoxSearch(query, inferredCategories)) return 24
  if (inferredCategories.length > 0) return 20
  return 16
}

function extractKeywordTokens(query) {
  return uniqueStrings(
    normalizeText(query)
      .split(/\s+/)
      .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token))
  )
}

function expandTerms(query, categories = [], aiHints = null) {
  const terms = [...extractKeywordTokens(query)]

  for (const category of categories) {
    const aliases = CATEGORY_ALIASES[category] || []
    terms.push(...aliases.map((item) => normalizeText(item)))
    terms.push(normalizeText(category))
  }

  if (aiHints?.keywords?.length) {
    terms.push(...aiHints.keywords.map((item) => normalizeText(item)))
  }

  return uniqueStrings(terms).filter(Boolean)
}

function cityMatches(resource, selectedCity) {
  if (selectedCity === "All Cities") return true
  return normalizeText(resource.city) === normalizeText(selectedCity)
}

function scoreResource(resource, query, selectedCity, options = {}) {
  const search = normalizeText(query)
  const text = buildSearchText(resource)
  const name = normalizeText(resource.name)
  const tags = (resource.tags || []).join(" ").toLowerCase()
  const organization = normalizeText(resource.organization)
  const serviceType = normalizeText(resource.serviceType)
  const category = normalizeText(resource.category)
  const city = normalizeText(resource.city)

  const inferredCategories = options.inferredCategories || []
  const aiHints = options.aiHints || null
  const terms = expandTerms(query, inferredCategories, aiHints)

  let score = 0

  if (selectedCity !== "All Cities" && city === normalizeText(selectedCity)) {
    score += 40
  }

  if (!search) {
    if (selectedCity === "All Cities") return 1
    return city === normalizeText(selectedCity) ? 50 : 0
  }

  if (text.includes(search)) score += 100
  if (name.includes(search)) score += 150
  if (organization.includes(search)) score += 50
  if (serviceType.includes(search)) score += 45
  if (category.includes(search)) score += 60
  if (city.includes(search)) score += 30

  for (const term of terms) {
    if (!term) continue
    if (text.includes(term)) score += 12
    if (name.includes(term)) score += 26
    if (organization.includes(term)) score += 12
    if (serviceType.includes(term)) score += 18
    if (category.includes(term)) score += 20
  }

  if (inferredCategories.length > 0) {
    for (const inferred of inferredCategories) {
      const normalizedCategory = normalizeText(inferred)
      if (category === normalizedCategory) score += 110
      else if (category.includes(normalizedCategory)) score += 70
      else if (serviceType.includes(normalizedCategory)) score += 40
    }
  }

  if (aiHints) {
    const suggestedCategories = (aiHints.categories || []).map((item) => normalizeText(item))
    const suggestedNames = (aiHints.recommendedResourceNames || []).map((item) =>
      normalizeText(item)
    )
    const suggestedKeywords = (aiHints.keywords || []).map((item) => normalizeText(item))

    if (suggestedNames.includes(name)) score += 250

    for (const suggestedCategory of suggestedCategories) {
      if (category === suggestedCategory) score += 130
      else if (category.includes(suggestedCategory)) score += 75
    }

    for (const keyword of suggestedKeywords) {
      if (!keyword) continue
      if (text.includes(keyword)) score += 18
      if (name.includes(keyword)) score += 22
    }
  }

if (resource.source === "tavily") {
  score += 25
}

if (resource.approved) {
  score += 140
}

  return score
}

function sortResources(resources, query, selectedCity, options = {}) {
  return [...resources].sort((a, b) => {
    const scoreA = scoreResource(a, query, selectedCity, options)
    const scoreB = scoreResource(b, query, selectedCity, options)

    if (scoreB !== scoreA) return scoreB - scoreA

    const cityCompare = (a.city || "").localeCompare(b.city || "")
    if (cityCompare !== 0) return cityCompare

    return (a.name || "").localeCompare(b.name || "")
  })
}

function uniqueResourceObjects(resources) {
  const seen = new Set()

  return resources.filter((resource) => {
    const normalizedName = normalizeText(resource.name)
      .replace(/community mental health and substance use centre/g, "mental health substance use")
      .replace(/substance use services clinic/g, "substance use clinic")
      .replace(/fraser health/g, "")
      .trim()

    let websiteHost = ""

    try {
      if (resource.website) {
        websiteHost = new URL(resource.website).hostname
          .replace("www.", "")
      }
    } catch {
      websiteHost = ""
    }

    const key = `
      ${normalizedName}
      |
      ${normalizeText(resource.city)}
      |
      ${websiteHost}
    `
      .replace(/\s+/g, " ")
      .trim()

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function buildCandidatePack(resources, query, selectedCity) {
  const inferredCategories = inferCategoriesFromQuery(query)

  const cityPool = resources.filter((resource) => cityMatches(resource, selectedCity))

  let scored = sortResources(cityPool, query, selectedCity, {
    inferredCategories,
  }).filter((resource) => scoreResource(resource, query, selectedCity, { inferredCategories }) > 0)

  scored = applySearchSafetyFilters(scored, query, inferredCategories)

  if (scored.length < 12 && inferredCategories.length > 0) {
    const categoryFallback = cityPool.filter((resource) =>
      inferredCategories.some(
        (category) =>
          normalizeText(resource.category) === normalizeText(category) ||
          normalizeText(resource.category).includes(normalizeText(category))
      )
    )

    scored = uniqueResourceObjects([...scored, ...categoryFallback])
    scored = applySearchSafetyFilters(scored, query, inferredCategories)
    scored = sortResources(scored, query, selectedCity, { inferredCategories })
  }

  if (scored.length === 0 && !query.trim()) {
    scored = sortResources(cityPool, query, selectedCity, { inferredCategories })
  }

  const candidates = scored.slice(0, 24)

  return {
    inferredCategories,
    candidates,
    candidatePool: scored,
  }
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

function shortenTitle(text, max = 60) {
  const clean = String(text || "").trim()

  if (clean.length <= max) {
    return clean
  }

  return clean.slice(0, max).trim() + "..."
}

function renderMessageWithLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g

  return text.split(urlRegex).map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="miller-inline-link"
        >
          🌐 {part}
        </a>
      )
    }

    return part
  })
}

function App() {
  const normalizedResources = useMemo(() => {
    return dedupeResources(cleanResources(rawResources))
  }, [])

  const defaultReply =
    "Tell me what kind of help you’re looking for. I’ll follow the trail, answer in plain language, and bring the closest resources forward."

  const [query, setQuery] = useState("")
  const [selectedCity, setSelectedCity] = useState("All Cities")
  const [hasSearched, setHasSearched] = useState(false)

  const [millerIndex, setMillerIndex] = useState(() => {
  const saved = localStorage.getItem("miller-theme-index")

  if (saved !== null) {
    return Number(saved)
  }

  return Math.floor(Math.random() * MILLER_THEMES.length)
})

const [switchDirection, setSwitchDirection] = useState("right")

const currentTheme = MILLER_THEMES[millerIndex]

const sessionId = useMemo(() => {
  let existing = localStorage.getItem("miller_session_id")

  if (!existing) {
    existing = crypto.randomUUID()
    localStorage.setItem("miller_session_id", existing)
  }

  return existing
}, [])

useEffect(() => {
  async function trackVisit() {
    console.log("Attempting page_view insert...")

    const { data, error } = await supabase
      .from("site_events")
      .insert([
        {
          event_type: "page_view",
          miller_theme: currentTheme.name,
          query: null,
          city: null,
        },
      ])
      .select()

    if (error) {
      console.error("SUPABASE INSERT ERROR:", error)
    } else {
      console.log("Page view tracked:", data)
    }
  }

  trackVisit()
}, [currentTheme.name])

  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [aiReply, setAiReply] = useState(defaultReply)
  const [displayedReply, setDisplayedReply] = useState("")
  const [results, setResults] = useState([])
  const [adminReviewItems, setAdminReviewItems] = useState([])
  const [totalMatches, setTotalMatches] = useState(0)

  const chestRef = useRef(null)
  const searchPanelRef = useRef(null)
  const resultsPanelRef = useRef(null)
  const controlsRowRef = useRef(null)
  const bubbleRef = useRef(null)
  const appShellRef = useRef(null)

  const [isChestOpen, setIsChestOpen] = useState(false)
  const [isChestWiggling, setIsChestWiggling] = useState(false)
  const [millerMood, setMillerMood] = useState("idle")
  const [isSearchBarHovered, setIsSearchBarHovered] = useState(false)
  const [cursorOffset, setCursorOffset] = useState({ x: 0, y: 0 })
  const [showSearchReveal, setShowSearchReveal] = useState(false)

  const [conversationMemory, setConversationMemory] = useState([])
  const [conversationSummary, setConversationSummary] = useState("")

  const [submission, setSubmission] = useState({
    resource_name: "",
    city: "",
    note: "",
  })
  const [submissionStatus, setSubmissionStatus] = useState("")
  const isAdminMode =
  localStorage.getItem("miller_admin") === "true"

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer = null

    async function runTyping() {
      let index = 0
      const fullText = isLoading ? "I am checking the clues, please wait..." : aiReply || ""

      setDisplayedReply("")

      await new Promise((resolve) =>
        setTimeout(resolve, isLoading ? 120 : 140 + Math.random() * 70)
      )

      if (cancelled) return

      timer = setInterval(() => {
        index += 1
        setDisplayedReply(fullText.slice(0, index))

        if (index >= fullText.length) {
          clearInterval(timer)
          timer = null
        }
      }, 18)
    }

    runTyping()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [aiReply, isLoading])

  useEffect(() => {
  localStorage.setItem("miller-theme-index", millerIndex)
}, [millerIndex])

useEffect(() => {
  async function loadAdminReviewQueue() {
    if (!isAdminMode) return

    const { data, error } = await supabase
      .from("tavily_resources")
      .select("*")
      .eq("approved", false)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(40)

    if (error) {
      console.error("Admin review load failed:", error)
      return
    }

    setAdminReviewItems(data || [])
  }

  loadAdminReviewQueue()
}, [isAdminMode])

  const isBubbleTyping =
    isLoading || displayedReply.length < String(aiReply || "").length

    const shouldShowResults =
  hasSearched && !isBubbleTyping

  const cities = useMemo(() => {
    const uniqueCities = Array.from(
      new Set(
        normalizedResources
          .map((resource) => resource.city)
          .filter(Boolean)
          .map((city) => city.trim())
      )
    ).sort((a, b) => a.localeCompare(b))

    return ["All Cities", ...uniqueCities]
  }, [normalizedResources])

  function distanceToRef(event, ref) {
    if (!ref.current) return Infinity

    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY

    return Math.sqrt(dx * dx + dy * dy)
  }

  useEffect(() => {
    if (isTyping) {
      setShowSearchReveal(true)
      return
    }

    const timer = setTimeout(() => {
      setShowSearchReveal(false)
    }, 180)

    return () => clearTimeout(timer)
  }, [isTyping])

  useEffect(() => {
    function handleGlobalMouseMove(event) {
      const chestDistance = distanceToRef(event, chestRef)
      const controlsDistance = distanceToRef(event, controlsRowRef)
      const resultsDistance = distanceToRef(event, resultsPanelRef)
      const bubbleDistance = distanceToRef(event, bubbleRef)

      setIsChestWiggling(chestDistance < 150)

      if (appShellRef.current) {
        const rect = appShellRef.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const dx = (event.clientX - centerX) / rect.width
        const dy = (event.clientY - centerY) / rect.height

        setCursorOffset({
          x: Math.max(-1, Math.min(1, dx)) * 10,
          y: Math.max(-1, Math.min(1, dy)) * 8,
        })
      }

      if (isTyping || isSearchBarHovered) {
        setMillerMood("search")
        return
      }

      if (isChestOpen) {
        setMillerMood("satchel")
        return
      }

      if (hasSearched && results.length === 0) {
        setMillerMood("confused")
        return
      }

      const candidates = [
        { mood: "satchel", distance: chestDistance, threshold: 170 },
        { mood: "controls", distance: controlsDistance, threshold: 260 },
        { mood: "results", distance: resultsDistance, threshold: 320 },
        { mood: "bubble", distance: bubbleDistance, threshold: 180 },
      ].filter((item) => item.distance < item.threshold)

      if (candidates.length === 0) {
        setMillerMood("idle")
        return
      }

      candidates.sort((a, b) => a.distance - b.distance)
      setMillerMood(candidates[0].mood)
    }

    function handleGlobalMouseOut(event) {
      if (!event.relatedTarget && !event.toElement) {
        setIsChestWiggling(false)
        setIsSearchBarHovered(false)
        setCursorOffset({ x: 0, y: 0 })

        if (hasSearched && results.length === 0) {
          setMillerMood("confused")
        } else {
          setMillerMood("idle")
        }
      }
    }

    window.addEventListener("mousemove", handleGlobalMouseMove)
    window.addEventListener("mouseout", handleGlobalMouseOut)

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseout", handleGlobalMouseOut)
    }
  }, [hasSearched, isSearchBarHovered, isTyping, isChestOpen, results.length])

  async function handleSearch(event) {
    event.preventDefault()

    const trimmedQuery = query.trim()

let updatedMemory = [
  ...conversationMemory,
  {
    role: "user",
    content: trimmedQuery,
  },
]

if (updatedMemory.length > 12) {
  const olderMessages = updatedMemory.slice(0, 8)

  const summaryText = olderMessages
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join(" ")

  setConversationSummary(summaryText)

  updatedMemory = updatedMemory.slice(-8)
}

setConversationMemory(updatedMemory)

   await supabase.from("site_events").insert([
  {
    event_type: "search",
    query: trimmedQuery,
    city: selectedCity,
    miller_theme: currentTheme.name,
    session_id: sessionId,
  }
])

    if (!trimmedQuery) {
      const cityPool = normalizedResources.filter((resource) =>
        cityMatches(resource, selectedCity)
      )
      const firstResults = sortResources(cityPool, "", selectedCity).slice(0, 24)

      setHasSearched(true)
      setResults(firstResults)
      setTotalMatches(cityPool.length)
      setAiReply("You can ask for something like detox, counselling, crisis help, OAT, treatment, peer support, or harm reduction.")
      return
    }

    const candidatePack = buildCandidatePack(normalizedResources, trimmedQuery, selectedCity)
    const resultLimit = getResultLimit(trimmedQuery, candidatePack.inferredCategories)

    setHasSearched(true)
    setIsLoading(true)
    setResults(candidatePack.candidates.slice(0, resultLimit))
    setTotalMatches(candidatePack.candidatePool.length)

    try {
      const response = await retry(() =>
  fetch("/api/miller", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-site-password": localStorage.getItem("miller_site_password") || "",
        },
        body: JSON.stringify({
          query: trimmedQuery,
          conversationMemory: updatedMemory,
          conversationSummary,
          city: selectedCity,
          inferredCategories: candidatePack.inferredCategories,
          matches: candidatePack.candidatePool.slice(0, 30),
        }),
      }))

      if (!response.ok) {
        throw new Error("Could not get Miller response.")
      }

      const data = await response.json()
      const aiHints = data.searchHints || {}

      const { data: approvedMemory = [] } =
  await supabase
    .from("tavily_resources")
    .select("*")
    .eq("approved", true)
    .eq("hidden", false)
    .limit(200)

      const tavilyResults = data.tavilyResults || []

      const filteredTavilyResults = tavilyResults.filter((resource) => {
  const description = String(resource.description || "").trim()

  const hasGoodDescription =
    description.length >= 60

  const hasPhone =
    Boolean(resource.phone)

  const hasWebsite =
    Boolean(resource.website)

  const looksUseful =
    hasGoodDescription ||
    hasPhone ||
    hasWebsite

  return looksUseful
})

      let rankedPool = sortResources(
        candidatePack.candidatePool.length ? candidatePack.candidatePool : candidatePack.candidates,
        trimmedQuery,
        selectedCity,
        {
          inferredCategories: candidatePack.inferredCategories,
          aiHints,
        }
      )

      rankedPool = applySearchSafetyFilters(
        rankedPool,
        trimmedQuery,
        candidatePack.inferredCategories
      )

      const localNames = new Set(
  rankedPool.map((resource) =>
    normalizeText(resource.name)
  )
)

const preferredTavilyResults =
  filteredTavilyResults.filter((resource) => {
    const tavilyName =
      normalizeText(resource.name)

    return !Array.from(localNames).some((localName) =>
      localName.includes(tavilyName) ||
      tavilyName.includes(localName)
    )
  })

const mergedResults = uniqueResourceObjects([
  ...rankedPool,
  ...approvedMemory,
  ...preferredTavilyResults,
])

const rerankedResults = sortResources(
  mergedResults,
  trimmedQuery,
  selectedCity,
  {
    inferredCategories: candidatePack.inferredCategories,
    aiHints,
  }
)

const finalResults = rerankedResults.slice(0, resultLimit)

setResults(finalResults)

setTotalMatches(rankedPool.length)

setAiReply(
  data.answer ||
    "Heres what stands out. I pulled the closest matches below so you can scan the best leads first."
)

setConversationMemory((prev) =>
  [
    ...prev,
    {
      role: "assistant",
      content: data.answer,
    },
  ].slice(-24)
)

    } catch (error) {
      console.error(error)

      let fallbackPool = sortResources(candidatePack.candidatePool, trimmedQuery, selectedCity, {
        inferredCategories: candidatePack.inferredCategories,
      })

      fallbackPool = applySearchSafetyFilters(
        fallbackPool,
        trimmedQuery,
        candidatePack.inferredCategories
      )

      const fallbackResults = fallbackPool.slice(0, resultLimit)

      setResults(fallbackResults)
      setTotalMatches(fallbackPool.length)
      setAiReply("I couldnt reach the AI just now, but I still pulled the closest matches below.")
    } finally {
      setIsLoading(false)
    }
  }

async function approveTavilyResource(resource) {
  if (!resource.website) return

  const { data, error } = await supabase
  .from("tavily_resources")
  .update({
    approved: true,
    hidden: false,
  })
  .eq("id", resource.id)
  .select()

console.log("APPROVE RESULT:", data)
console.log("APPROVE ERROR:", error)

  setAdminReviewItems((prev) =>
  prev.filter(
    (item) =>
      item.website !== resource.website
  )
)
}

async function hideTavilyResource(resource) {
  if (!resource.website) return

  const { data, error } = await supabase
    .from("tavily_resources")
    .update({
      hidden: true,
    })
    .eq("id", resource.id)

    .select()

console.log("HIDE RESULT:", data)
console.log("HIDE ERROR:", error)

  setAdminReviewItems((prev) =>
    prev.filter(
      (item) =>
        item.website !== resource.website
    )
  )
}

  function clearSearch() {
    setQuery("")
    setSelectedCity("All Cities")
    setHasSearched(false)
    setResults([])
    setTotalMatches(0)
    setIsTyping(false)
    setMillerMood("idle")
    setAiReply(defaultReply)
  }

 function nextMiller() {
  setSwitchDirection("right")

  setMillerIndex((prev) => (prev + 1) % MILLER_THEMES.length)
}

function previousMiller() {
  setSwitchDirection("left")

  setMillerIndex((prev) =>
    prev === 0 ? MILLER_THEMES.length - 1 : prev - 1
  )
}

  function updateSubmissionField(field, value) {
    setSubmission((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  async function handleSubmission(event) {
    event.preventDefault()
    setSubmissionStatus("")

    if (!submission.note.trim()) {
      setSubmissionStatus("Please add a note before submitting.")
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        name: submission.resource_name.trim() || null,
        city: submission.city.trim() || null,
        category: submission.note.trim(),
      }

      const { error } = await supabase.from("resource_submissions").insert([payload])

      if (error) {
        throw error
      }

      setSubmission({
        resource_name: "",
        city: "",
        note: "",
      })
      setSubmissionStatus("Thanks — your submission was sent.")
    } catch (error) {
      console.error("Submission failed:", error)
      setSubmissionStatus(
        `Something went wrong sending the submission.${error?.message ? ` ${error.message}` : ""}`
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const shouldShowSearchMiller = isTyping || showSearchReveal || isLoading
 const millerImageSrc = currentTheme.avatar

  const millerClasses = [
  "miller-image",
  "theme-fade",
  `switch-${switchDirection}`,
  `miller-${millerMood}`,
  shouldShowSearchMiller ? "is-searching" : "",
  showSearchReveal ? "search-reveal" : "",
]
  .filter(Boolean)
  .join(" ")

  const millerStyle = {}

const millerImageStyle = {}

  return (
    <div
  className="app-shell"
  ref={appShellRef}
>
  <img
  src={currentTheme.background}
  alt=""
  className="scene-background"
/>
      <div className="hero-header">
       <p className="eyebrow">Gentle help finding support in BC’s Lower Mainland</p>

          <div className="title-stage">
            <div className="title-frame">
              <img
  src={currentTheme.title}
  alt="Addiction Resource Finder"
  className="title-image theme-fade"
/>
            </div>
          </div>
          </div>
      <main className="hero-layout">
        <section className="hero-copy">
         

          <form className="search-panel" onSubmit={handleSearch} ref={searchPanelRef}>
            <div
              className="search-bar-wrap"
              onMouseEnter={() => setIsSearchBarHovered(true)}
              onMouseLeave={() => setIsSearchBarHovered(false)}
            >
              <input
                className="main-search-input"
                placeholder="Try detox, treatment centre, counselling, OAT, crisis, or harm reduction..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
              />
            </div>

            <div className="controls-row" ref={controlsRowRef}>
              <select
                className="city-select"
                value={selectedCity}
                onChange={(event) => setSelectedCity(event.target.value)}
              >
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              <button type="submit" className="primary-button">
                Ask Miller
              </button>

              <button type="button" className="ghost-button" onClick={clearSearch}>
                Clear
              </button>
            </div>

            <div className="micro-options">
              <span className="ai-note">
                Miller gives a short guide first, then the list stays searchable by city.
              </span>
            </div>
          </form>

          {shouldShowResults && (
  <div className="results-panel" ref={resultsPanelRef}>
              <div className="results-head">
                <h2>
                  Matching resources
                  <span className="results-count">
                    {" "}
                    {results.length} of {totalMatches}
                  </span>
                </h2>
              </div>

              {results.length === 0 ? (
                <div className="empty-card">
                  <h3>No matches found</h3>
                  <p>Try a broader keyword, or switch the city filter back to All Cities.</p>
                </div>
              ) : (
                <div className="resource-list">
                  {results.map((resource, index) => (
                    <article
                      key={`${resource.name}-${resource.city}-${resource.organization}-${index}`}
                      className="resource-card"
                    >
                      <div className="resource-top">
                        <div>
                          <h3>
  {resource.source === "tavily"
    ? shortenTitle(resource.name)
    : resource.name}
</h3>
                          {safeOrganization(resource) && (
                            <p className="resource-org">{safeOrganization(resource)}</p>
                          )}
                        </div>
                        {resource.city && <span className="resource-city">{resource.city}</span>}
                      </div>

                      <div className="resource-meta">
                        {resource.serviceType && <span>{resource.serviceType}</span>}
                        {resource.category && <span>{resource.category}</span>}

                        {resource.source === "tavily" && (
  <span className="web-result-badge">
    🌐 Found Online
  </span>
)}

{isAdminMode &&
  resource.source === "tavily" &&
  !resource.approved && (
    <div className="resource-review-actions">

      <button
        className="approve-button"
        onClick={() =>
          approveTavilyResource(resource)
        }
      >
        ✅ Approve
      </button>

      <button
        className="hide-button"
        onClick={() =>
          hideTavilyResource(resource)
        }
      >
        🚫 Hide
      </button>

    </div>
)}
                      </div>

                      {resource.description && (
                        <p className="resource-description">{resource.description}</p>
                      )}

                      <div className="resource-details">
                        {resource.accessType && (
                          <p>
                            <strong>Access:</strong> {resource.accessType}
                          </p>
                        )}
                        {resource.phone && (
                          <p>
                            <strong>Phone:</strong> {resource.phone}
                            {resource.altPhone ? ` / ${resource.altPhone}` : ""}
                          </p>
                        )}
                        {resource.hours && (
                          <p>
                            <strong>Hours:</strong> {resource.hours}
                          </p>
                        )}
                        {resource.address && (
                          <p>
                            <strong>Address:</strong> {resource.address}
                          </p>
                        )}
                        {resource.population && (
                          <p className="secondary-detail">
  <strong>Population:</strong> {resource.population}
</p>
                        )}
                        {resource.eligibility && (
                         <p className="secondary-detail">
  <strong>Eligibility:</strong> {resource.eligibility}
</p>
                        )}
                        {safeNotes(resource) && (
                          <p>
                            <strong>Notes:</strong> {safeNotes(resource)}
                          </p>
                        )}
                      </div>

                      <div className="resource-links">
  {resource.phone ? (
  <a
    className="resource-link-button"
    href={`tel:${resource.phone}`}
  >
    📞 Call
  </a>
) : null}
  
  {resource.website ? (
    <a
      className="resource-link-button"
      href={resource.website}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        supabase.from("site_events").insert([
          {
            event_type: "resource_click",
            resource_name: resource.name,
            city: resource.city,
            query,
            miller_theme: currentTheme.name,
            session_id: sessionId,
          }
        ])
      }}
    >
      🌐 Open Website
    </a>
  ) : (
    <span className="muted">No website listed</span>
  )}

  {safeEmail(resource) ? (
    <a
      className="resource-link-button secondary"
      href={`mailto:${safeEmail(resource)}`}
    >
      ✉ Email
    </a>
  ) : null}
</div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

{isAdminMode && adminReviewItems.length > 0 && (
  <div className="admin-review-panel">

    <div className="results-head">
      <h2>
        Admin Review Queue
        <span className="results-count">
          {" "}
          {adminReviewItems.length} pending
        </span>
      </h2>
    </div>

    <div className="resource-list">
      {adminReviewItems.map((resource, index) => (
        <article
          key={`admin-${resource.website}-${index}`}
          className="resource-card"
        >

          <div className="resource-top">
            <div>
              <h3>{shortenTitle(resource.name)}</h3>

              {resource.city && (
                <p className="resource-org">
                  {resource.city}
                </p>
              )}
            </div>
          </div>

          {resource.description && (
            <p className="resource-description">
              {resource.description}
            </p>
          )}

          <div className="resource-links">

            {resource.website && (
              <a
                className="resource-link-button"
                href={resource.website}
                target="_blank"
                rel="noreferrer"
              >
                🌐 Open Website
              </a>
            )}

          </div>

          <div className="resource-review-actions">

            <button
              className="approve-button"
              onClick={() =>
                approveTavilyResource(resource)
              }
            >
              ✅ Approve
            </button>

            <button
              className="hide-button"
              onClick={() =>
                hideTavilyResource(resource)
              }
            >
              🚫 Hide
            </button>

          </div>

        </article>
      ))}
    </div>
  </div>
)}

        <aside className="hero-art">
          <div className="miller-stage">
            <div className="miller-figure" style={millerStyle}>

  <div className="miller-image-frame">
    <img
      src={millerImageSrc}
      alt="Miller"
      className={millerClasses}
      style={millerImageStyle}
    />
  </div>

  <div className="miller-switcher-wrap">

    <div className="miller-switcher">
      <button
  className="miller-arrow"
  type="button"
  onClick={previousMiller}
  aria-label="Previous Miller"
>
  <img
    src={arrowLeft}
    alt="Previous"
    className="miller-arrow-image"
  />
</button>

<div className="miller-dots">
  {MILLER_THEMES.map((theme, index) => (
    <button
      key={theme.name}
      type="button"
      className={`miller-dot ${index === millerIndex ? "active" : ""}`}
      style={{
        background:
          index === millerIndex
            ? theme.accent
            : "rgba(255,255,255,0.45)",
        borderColor: theme.accent,
      }}
      onClick={() => setMillerIndex(index)}
    />
  ))}
</div>

<button
  className="miller-arrow"
  type="button"
  onClick={nextMiller}
  aria-label="Next Miller"
>
  <img
    src={arrowRight}
    alt="Next"
    className="miller-arrow-image"
  />
</button>
    </div>

    <div className="miller-theme-name">
      {currentTheme.name}
    </div>

  </div>

</div>

            <div
              ref={bubbleRef}
              className={`miller-bubble ${isBubbleTyping ? "is-typing" : ""}`}
              aria-live="polite"
            >
              {renderMessageWithLinks(displayedReply)}
              {isBubbleTyping ? <span className="typing-cursor" /> : null}
            </div>

            <div className="miller-satchel-zone">

  <div className="community-label">
    Suggest a Resource
  </div>

  <button
                ref={chestRef}
                className={`treasure-chest-button ${isChestOpen ? "open" : ""} ${isChestWiggling ? "wiggle" : ""}`}
                type="button"
                onClick={() => setIsChestOpen((prev) => !prev)}
                aria-label="Open submission satchel"
              >
                <span className="chest-lid" />
                <span className="chest-lock" />
                <span className="chest-spark chest-spark-1">✦</span>
                <span className="chest-spark chest-spark-2">✦</span>
                <span className="chest-label">Notes</span>
              </button>

              {isChestOpen && (
                <div className="submission-panel">
                  <div className="submission-panel-glow" />

                  <div className="submission-panel-head">
                    <div>
                      <p className="submission-kicker">Miller’s satchel</p>
                      <h3>Share a resource update</h3>
                    </div>

                    <button
                      type="button"
                      className="submission-close-button"
                      onClick={() => setIsChestOpen(false)}
                      aria-label="Close submission panel"
                    >
                      ×
                    </button>
                  </div>

                  <p className="submission-panel-text">
                    Found a missing service, correction, or helpful note? Leave it here and I’ll tuck it into the collection.
                  </p>

                  <form className="submission-form" onSubmit={handleSubmission}>
                    <input
                      type="text"
                      placeholder="Resource name (optional)"
                      value={submission.resource_name}
                      onChange={(event) =>
                        updateSubmissionField("resource_name", event.target.value)
                      }
                    />

                    <input
                      type="text"
                      placeholder="City (optional)"
                      value={submission.city}
                      onChange={(event) => updateSubmissionField("city", event.target.value)}
                    />

                    <textarea
                      placeholder="Write your note, correction, or resource suggestion..."
                      rows="5"
                      value={submission.note}
                      onChange={(event) => updateSubmissionField("note", event.target.value)}
                    />

                    <button
                      className="submission-submit-button"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Sending..." : "Tuck into satchel"}
                    </button>

                    {submissionStatus ? (
                      <p className="submission-status">{submissionStatus}</p>
                    ) : null}
                  </form>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App