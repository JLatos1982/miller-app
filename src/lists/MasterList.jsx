import { useMemo, useState } from "react"
import rawResources from "../vancouver_resources_merged_updated.json"
import practicalSupports from "../data/miller-practical-supports-public-v1.json"
import millerFunding from "../data/miller-funding-assistance-public-v1.json"
import sharedResourceRegistry from "../data/miller-shared-resource-registry-v1.json"
import { normalizedResourceRows } from "../resourceData.js"
import { stableCuratedResourceId } from "../map/mapChat.js"
import { safeHttpUrl } from "../safeLinks.js"
import { buildMillerPublicationSafeResourceCorpus } from "../millerPublicSearchResources.js"
import { accessLocationHeading, publicAccessLocation } from "../navigatorPresentation.js"

const allResources = buildMillerPublicationSafeResourceCorpus({
  canonicalResources: normalizedResourceRows(rawResources).map(item => ({ ...item, id: stableCuratedResourceId(item) })),
  practicalRecords: practicalSupports.records,
  fundingRecords: millerFunding.records,
  sharedRecords: sharedResourceRegistry.records,
  sharedAccessLocations: sharedResourceRegistry.access_locations || [],
})
const text = (value) => String(value || "").toLowerCase()
function filterMasterListResources(resources, { query = "", city = "", category = "" } = {}) { return resources.filter((item) => { const accessLocations = (item.accessLocations || []).flatMap((location) => [location.name, location.city, location.address]); const haystack = text([item.name, item.organization, item.city, item.region, item.category, item.serviceType, item.description, item.population, ...accessLocations].join(" ")); const servesCity = (item.accessLocations || []).some((location) => location.city === city); return (!query || haystack.includes(text(query))) && (!city || item.city === city || item.region === city || servesCity) && (!category || item.category === category || item.serviceType === category) }).sort((a, b) => a.name.localeCompare(b.name)) }

export default function MasterList({ onBack }) {
  const [query, setQuery] = useState(""), [city, setCity] = useState(""), [category, setCategory] = useState("")
  const cities = useMemo(() => [...new Set(allResources.flatMap((item) => [item.city || item.region, ...(item.accessLocations || []).map((location) => location.city)]).filter(Boolean))].sort(), [])
  const categories = useMemo(() => [...new Set(allResources.map((item) => item.category || item.serviceType).filter(Boolean))].sort(), [])
  const items = useMemo(() => filterMasterListResources(allResources, { query, city, category }), [query, city, category])
  return <main className="premade-lists-page master-list-page"><div className="premade-toolbar"><button onClick={onBack}>← All pre-made lists</button></div><header><p className="eyebrow">Miller Resources</p><h1>Master List</h1><p>Browse and search Miller’s shared publication-safe service-navigation corpus by city or type of support. Strongest coverage is currently in British Columbia. Coverage is expanding. Curated pre-made lists remain separate, topic-focused subsets.</p></header><section className="master-list-filters" aria-label="Master List filters"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, service, city, or support"/></label><label>City<select value={city} onChange={(event) => setCity(event.target.value)}><option value="">All cities and areas</option>{cities.map((value) => <option key={value}>{value}</option>)}</select></label><label>Category / Type of Support<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setQuery(""); setCity(""); setCategory("") }}>Clear filters</button></section><p className="master-list-count" role="status" aria-live="polite">{items.length}{items.length !== allResources.length ? ` of ${allResources.length}` : ""} resources</p>{items.length ? <div className="premade-entry-grid">{items.map((item) => <article className="premade-entry" key={`${item.name}-${item.website}`}><h2>{item.name}</h2>{item.organization ? <p>{item.organization}</p> : null}<p>{[item.city || item.region, item.category || item.serviceType].filter(Boolean).join(" · ")}</p>{item.description ? <p>{item.description}</p> : null}{item.accessLocations?.length ? <div className="navigator-access-locations"><strong>{accessLocationHeading(item.accessLocations)}</strong><p>These are access points for this program, not separate services.</p><ul>{item.accessLocations.map((location) => { const accessPoint = publicAccessLocation(location); return <li key={accessPoint.id || accessPoint.name}><strong>{accessPoint.name}</strong>{accessPoint.address ? ` — ${accessPoint.address}` : ""}<span>{accessPoint.purpose}</span></li> })}</ul></div> : null}<div className="resource-links">{item.phone ? <a className="resource-link-button" href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}>Call {item.phone}</a> : null}{safeHttpUrl(item.website) ? <a className="resource-link-button" href={safeHttpUrl(item.website)} target="_blank" rel="noreferrer">Website</a> : null}</div></article>)}</div> : <p className="master-list-empty">No resources match those filters. Try another city, category, or search term.</p>}</main>
}
