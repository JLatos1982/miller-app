export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim())
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

export function safeEmailAddress(value) {
  const email = String(value || "").trim()
  if (email.length > 254 || /[\r\n]/.test(email)) return ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}
