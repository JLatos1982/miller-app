const cleanText = value => String(value ?? "").replace(/\s+/g, " ").trim()

export function conciseResourceDescription(value, maxLength = 360) {
  const description = cleanText(value)
  if (!description || description.length <= maxLength) return description

  const candidate = description.slice(0, maxLength + 1)
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("? "), candidate.lastIndexOf("! "))
  const minimumUsefulBreak = Math.floor(maxLength * .58)
  const boundary = sentenceEnd >= minimumUsefulBreak ? sentenceEnd + 1 : candidate.lastIndexOf(" ", maxLength)
  return `${candidate.slice(0, Math.max(boundary, minimumUsefulBreak)).trim()}…`
}
