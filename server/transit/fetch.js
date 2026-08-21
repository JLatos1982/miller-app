import fetch from "node-fetch"
import { MAX_GTFS_DOWNLOAD_BYTES } from "./gtfs.js"

const cache = new Map()
const ALLOWED_HOSTS = new Set(["bct.tmix.se", "gtfs-static.translink.ca", "gtfsapi.translink.ca"])

export function assertTrustedTransitUrl(value) {
  const url = new URL(value)
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error("Transit feed URL is not allowlisted.")
  return url
}

export async function fetchTransitBytes(urlValue, { timeoutMs = 12_000, maxBytes = MAX_GTFS_DOWNLOAD_BYTES, headers = {} } = {}) {
  const url = assertTrustedTransitUrl(urlValue)
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers: { Accept: "application/octet-stream, application/zip", ...headers }, signal: controller.signal, redirect: "error" })
    if (!response.ok) throw new Error(`Transit provider returned HTTP ${response.status}.`)
    const declared = Number(response.headers.get("content-length") || 0)
    if (declared > maxBytes) throw new Error("Transit provider response exceeded the safe size limit.")
    const chunks = []; let received = 0
    for await (const chunk of response.body) { received += chunk.length; if (received > maxBytes) throw new Error("Transit provider response exceeded the safe size limit."); chunks.push(chunk) }
    return new Uint8Array(Buffer.concat(chunks))
  } finally { clearTimeout(timer) }
}

export async function cachedTransitValue(key, loader, ttlMs) {
  const now = Date.now(); const existing = cache.get(key)
  if (existing && existing.expiresAt > now) return existing.value
  if (existing?.promise) return existing.promise
  const promise = Promise.resolve().then(loader).then((value) => { cache.set(key, { value, expiresAt: Date.now() + ttlMs }); return value }).catch((error) => { cache.delete(key); throw error })
  cache.set(key, { promise, expiresAt: now + ttlMs }); return promise
}

export function clearTransitCache() { cache.clear() }
