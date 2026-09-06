const validYear = value => Number.isInteger(value) && value >= 1800 && value <= 2200
const cleanUrl = value => { try { return new URL(String(value)).toString() } catch { return "" } }

// URL dates establish only source-publication timing. They never become incident dates.
export function deriveSourcePublicationTiming(source = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(source.publication_date || "")) return { source_publication_date: source.publication_date, source_publication_year: Number(source.publication_date.slice(0, 4)), derivation_method: "existing_source_metadata", confidence: "confirmed" }
  const url = cleanUrl(source.url)
  const exact = url.match(/(?:^|[/_.-])((?:19|20)\d{2})[-_/]([01]\d)[-_/]([0-3]\d)(?:[/_.-]|$)/)
  if (exact) return { source_publication_date: `${exact[1]}-${exact[2]}-${exact[3]}`, source_publication_year: Number(exact[1]), derivation_method: "deterministic_url_date", confidence: "strongly_supported" }
  const month = url.match(/(?:^|[/_.-])((?:19|20)\d{2})[/_.-]([01]\d)(?:[/_.-]|$)/)
  if (month) return { source_publication_date: null, source_publication_year: Number(month[1]), derivation_method: "deterministic_url_year_month", confidence: "strongly_supported" }
  const year = url.match(/(?:^|[/_.-])((?:19|20)\d{2})(?:[/_.-]|$)/)
  if (year) return { source_publication_date: null, source_publication_year: Number(year[1]), derivation_method: "deterministic_url_year", confidence: "approximate" }
  return null
}

export function dateSemantics(record, recovery = null) {
  const base = { event_date: null, event_year: validYear(record?.year) ? record.year : null, approximate_event_year: null, publication_date: null, source_publication_year: null, confidence: validYear(record?.year) ? "strongly_supported" : "unresolved", derivation_method: validYear(record?.year) ? "legacy_record_year" : "unresolved" }
  const recovered = recovery || deriveSourcePublicationTiming(record?.source)
  if (!recovered) return base
  return { ...base, ...recovered, publication_date: recovered.source_publication_date || null, confidence: recovered.confidence, derivation_method: recovered.derivation_method }
}

export function displayDateSemantics(value = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.event_date || "")) return new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.event_date}T00:00:00Z`))
  if (validYear(value.event_year)) return String(value.event_year)
  if (validYear(value.approximate_event_year)) return `Approx. ${value.approximate_event_year}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.publication_date || "")) return `Event date unknown · Published ${value.publication_date}`
  if (validYear(value.source_publication_year)) return `Event date unknown · Published ${value.source_publication_year}`
  return "Event date unknown"
}
