import dns from "node:dns/promises"
import net from "node:net"
import http from "node:http"
import https from "node:https"

const MAX_REDIRECTS = 3
const MAX_BODY_BYTES = 256 * 1024
const REQUEST_TIMEOUT_MS = 7000

export function isPrivateIp(address) {
  if (!net.isIP(address)) return true
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true

  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224
  }

  const normalized = address.toLowerCase()
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7)
    if (net.isIPv4(mapped)) return isPrivateIp(mapped)
  }
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")
}

async function resolveSafePublicUrl(value, lookup = dns.lookup) {
  let url
  try {
    url = new URL(String(value || "").trim())
  } catch {
    throw new Error("Invalid URL")
  }

  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol")
  const hostname = url.hostname.toLowerCase()
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Internal hostname blocked")
  }

  const literal = hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(literal)
    ? [{ address: literal, family: net.isIP(literal) }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private or unresolved network address blocked")
  }
  return { url, addresses }
}

export async function assertSafePublicUrl(value, lookup = dns.lookup) {
  return (await resolveSafePublicUrl(value, lookup)).url
}

function pinnedAgent(url, addresses) {
  const Agent = url.protocol === "https:" ? https.Agent : http.Agent
  return new Agent({
    lookup(hostname, options, callback) {
      if (options?.all) return callback(null, addresses)
      const selected = addresses[0]
      return callback(null, selected.address, selected.family)
    },
  })
}

function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([^<]{1,300})<\/title>/i)
  return match ? match[1].replace(/\s+/g, " ").trim().slice(0, 200) : ""
}

async function readLimitedText(response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return ""

  let size = 0
  const chunks = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) break
    chunks.push(chunk)
  }
  response.body?.destroy?.()
  return Buffer.concat(chunks).toString("utf8")
}

export async function checkResourceQuality(resource, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  if (!resource.website) {
    return { url_status: "unchecked", http_status: null, final_url: null, uses_https: false, apparent_title: "", missing_key_information: ["website"], stale_or_low_quality_signals: [], confidence: 1, explanation: "No website was supplied." }
  }

  let current
  let safeAddresses
  try {
    const resolved = await resolveSafePublicUrl(resource.website, lookup)
    current = resolved.url
    safeAddresses = resolved.addresses
  } catch (error) {
    return { url_status: "blocked", http_status: null, final_url: null, uses_https: false, apparent_title: "", missing_key_information: [], stale_or_low_quality_signals: [error.message], confidence: 1, explanation: "The URL was blocked by server-side request safety checks." }
  }

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let response
      try {
        response = await fetchImpl(current, { redirect: "manual", signal: controller.signal, agent: pinnedAgent(current, safeAddresses), headers: { "User-Agent": "MillerResourceReview/1.0", Accept: "text/html,text/plain;q=0.8" } })
      } finally {
        clearTimeout(timer)
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        response.body?.destroy?.()
        if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many or invalid redirects")
        const resolved = await resolveSafePublicUrl(new URL(location, current).toString(), lookup)
        current = resolved.url
        safeAddresses = resolved.addresses
        continue
      }

      const html = await readLimitedText(response)
      const missing = ["name", "description", "city"].filter((field) => !String(resource[field] || "").trim())
      return {
        url_status: response.ok ? (redirect ? "redirected" : "reachable") : "broken",
        http_status: response.status,
        final_url: current.toString(),
        uses_https: current.protocol === "https:",
        apparent_title: extractTitle(html),
        missing_key_information: missing,
        stale_or_low_quality_signals: response.ok ? [] : [`HTTP ${response.status}`],
        confidence: 0.9,
        explanation: response.ok ? "The website responded to a limited safety-checked request." : "The website returned an unsuccessful status; automated blocking is still possible.",
      }
    }
  } catch (error) {
    const timedOut = error?.name === "AbortError"
    return { url_status: timedOut ? "timeout" : "broken", http_status: null, final_url: current.toString(), uses_https: current.protocol === "https:", apparent_title: "", missing_key_information: [], stale_or_low_quality_signals: [], confidence: 0.65, explanation: timedOut ? "The limited request timed out." : "The limited request failed; this does not by itself mean the resource is low quality." }
  }
}
