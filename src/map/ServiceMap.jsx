import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import { analyzeServiceAccess, filterMapResources, groupResourcesByCoordinate, nearestService, normalizeMapResource, resetMapFilters, SERVICE_TYPES } from "./geography.js"
import AddToHandoutButton from "../handout/AddToHandoutButton.jsx"
import { getResourceKey } from "../handout/handoutState.js"
import { safeHttpUrl } from "../safeLinks.js"
import { adminFetch } from "../adminApi.js"
import { buildMapCandidates, resolveAuthorizedMapResults, toMillerMatch } from "./mapChat.js"
import { askMiller, buildMillerRequest } from "../millerApi.js"
import TransitNearby from "./TransitNearby.jsx"

const LOWER_MAINLAND = [49.19, -122.86]
const PIN_COLORS = {
  "Detox / withdrawal": "#b33b55", "Residential treatment": "#7251a5",
  Outpatient: "#2874a6", OAT: "#177c76", "Harm reduction": "#d16a22",
  Counselling: "#4077bd", "Recovery support": "#49824b",
  "Housing / shelter": "#8a6137", Crisis: "#b22d2d", "Basic needs": "#7b6b20", Other: "#596b78",
}

function pinIcon(items, selected = false, result = false) {
  const primaryType = items[0].serviceTypes[0] || "Other"
  const count = items.length
  return L.divIcon({
    className: "service-pin-shell",
    html: `<span class="service-pin${selected ? " is-selected" : ""}${result ? " is-result" : ""}" style="--pin-color:${PIN_COLORS[primaryType] || PIN_COLORS.Other}"><span class="service-pin-dot">${count > 1 ? count : ""}</span></span>`,
    iconSize: [38, 48], iconAnchor: [19, 46], popupAnchor: [0, -43],
  })
}

function AdminGeographyEditor({ resource, onSaved }) {
  const [form, setForm] = useState(() => ({ latitude: resource.latitude ?? "", longitude: resource.longitude ?? "", geocode_status: resource.verification_status || "needs_review", virtual_service: resource.virtual_service, mobile_service: resource.mobile_service, public_map: resource.public_map !== false, service_area: resource.service_area || "" }))
  const [status, setStatus] = useState("")
  async function save(event) {
    event.preventDefault(); setStatus("Saving…")
    const response = await adminFetch(`/api/admin/resource-geography/${encodeURIComponent(resource.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, latitude: form.latitude === "" ? null : Number(form.latitude), longitude: form.longitude === "" ? null : Number(form.longitude) }) })
    if (!response.ok) return setStatus("Could not save geography.")
    const data = await response.json(); setStatus("Saved."); onSaved?.(data.item)
  }
  return <form className="admin-geography" onSubmit={save}><h3>Admin geocode review</h3><label>Latitude<input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })}/></label><label>Longitude<input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })}/></label><label>Status<select value={form.geocode_status} onChange={(e) => setForm({ ...form, geocode_status: e.target.value })}>{["needs_review","geocoded","verified","approximate","failed"].map((value) => <option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={form.virtual_service} onChange={(e) => setForm({ ...form, virtual_service: e.target.checked })}/> Virtual service</label><label><input type="checkbox" checked={form.mobile_service} onChange={(e) => setForm({ ...form, mobile_service: e.target.checked })}/> Mobile/outreach</label><label><input type="checkbox" checked={form.public_map} onChange={(e) => setForm({ ...form, public_map: e.target.checked })}/> Include on public map</label><label>Service area<input value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })}/></label><button className="primary-button" type="submit">Save geography</button><span aria-live="polite">{status}</span></form>
}

export default function ServiceMap({ resources, handout, dispatchHandout, onBack, isAdminMode = false, millerAvatar, sessionId }) {
  const mapNode = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [city, setCity] = useState("All cities")
  const [centre, setCentre] = useState({ latitude: LOWER_MAINLAND[0], longitude: LOWER_MAINLAND[1] })
  const [mobileMapUnlocked, setMobileMapUnlocked] = useState(() => typeof window !== "undefined" && window.innerWidth > 600)
  const [guideExpanded, setGuideExpanded] = useState(() => typeof window === "undefined" || window.innerWidth > 600)
  const [activePanel, setActivePanel] = useState("filters")
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState([])
  const [chatAnswer, setChatAnswer] = useState("")
  const [chatResults, setChatResults] = useState([])
  const [chatStatus, setChatStatus] = useState("idle")
  const [chatError, setChatError] = useState("")
  const normalized = useMemo(() => resources.map(normalizeMapResource), [resources])
  const filtered = useMemo(() => filterMapResources(normalized, { serviceTypes, city, approvedOnly: true }), [normalized, serviceTypes, city])
  const counts = useMemo(() => Object.fromEntries(SERVICE_TYPES.map((type) => [type, filterMapResources(normalized, { serviceTypes: [type], city, approvedOnly: true }).length])), [normalized, city])
  const cities = useMemo(() => ["All cities", ...new Set(normalized.map((item) => item.city).filter(Boolean).sort())], [normalized])
  const analysis = useMemo(() => analyzeServiceAccess(filtered, centre), [filtered, centre])
  const nonFixed = filtered.filter((item) => !item.mappable && (item.virtual_service || item.mobile_service))
  const mapped = useMemo(() => filtered.filter((item) => item.mappable), [filtered])
  const addressGroups = useMemo(() => groupResourcesByCoordinate(mapped), [mapped])
  const guideMessage = chatAnswer || (selected
    ? `${selected.name} is highlighted. I can open a transit or walking route planner—you choose the starting point, and it will not be stored.`
    : city !== "All cities"
      ? `I found ${mapped.length} mapped services in ${city}. Pick a pin for details, or let me highlight the nearest kind of support measured from the centre of the map—not your location.`
      : `There are ${mapped.length} mapped services in this view. Each pin is a public service location; numbered pins contain more than one service at the same address.`)
  const displayedChatResults = useMemo(() => filterMapResources(chatResults, { serviceTypes, city, approvedOnly: true }), [chatResults, serviceTypes, city])
  const chatResultIds = useMemo(() => new Set(displayedChatResults.map((item) => String(item.id))), [displayedChatResults])

  useEffect(() => {
    if (mapRef.current || !mapNode.current) return
    const map = L.map(mapNode.current, { zoomControl: true, dragging: window.innerWidth > 600, scrollWheelZoom: window.innerWidth > 600, tap: false }).setView(LOWER_MAINLAND, 9)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(map)
    layerRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
      maxClusterRadius: 44,
    }).addTo(map)
    map.on("moveend", () => { const value = map.getCenter(); setCentre({ latitude: value.lat, longitude: value.lng }) })
    mapRef.current = map
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(mapNode.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    groupResourcesByCoordinate(filtered).forEach((items) => {
      const first = items[0]
      const isSelected = items.some((item) => String(item.id) === String(selected?.id))
      const isResult = items.some((item) => chatResultIds.has(String(item.id)))
      const label = items.length > 1 ? `${items.length} services at this location. Press Enter to review all services.` : `${first.name}. Press Enter for details.`
      const marker = L.marker([first.latitude, first.longitude], { icon: pinIcon(items, isSelected, isResult), title: label, alt: label, riseOnHover: true, keyboard: true })
      marker.bindTooltip(items.length > 1 ? `${items.length} services at this location` : first.name, { direction: "top", offset: [0, -38] })
      marker.on("click", () => {
        const target = items.find((item) => chatResultIds.has(String(item.id))) || first
        setSelectedLocation(items); setSelected(target)
        if (displayedChatResults.length) {
          setActivePanel("results")
          setTimeout(() => document.getElementById(`map-result-${String(target.id)}`)?.scrollIntoView({ block: "nearest" }), 0)
        }
      })
      marker.addTo(layer)
      marker.getElement()?.setAttribute("aria-label", label)
    })
  }, [filtered, selected, chatResultIds, displayedChatResults.length])

  function toggleType(type) { setServiceTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]) }
  function highlightNearest(type) {
    const nearest = analysis.nearestByType[type]
    if (!nearest) return
    setSelectedLocation([nearest.resource])
    setSelected(nearest.resource)
    mapRef.current?.setView([nearest.resource.latitude, nearest.resource.longitude], 14, { animate: true })
  }
  function highlightSimilar() {
    if (!selected?.mappable) return
    const similar = nearestService(mapped, selected, (item) => item.id !== selected.id && item.serviceTypes.some((type) => selected.serviceTypes.includes(type)))
    if (!similar) return
    setSelectedLocation([similar.resource]); setSelected(similar.resource)
    mapRef.current?.setView([similar.resource.latitude, similar.resource.longitude], 14, { animate: true })
  }
  function showAllPins() {
    const allMapped = normalized.filter((item) => item.mappable && item.approved === true && item.hidden !== true && item.public_map !== false)
    const reset = resetMapFilters()
    setServiceTypes(reset.serviceTypes); setCity(reset.city); setSelected(null); setSelectedLocation([])
    setChatResults([]); setChatAnswer(""); setChatStatus("idle"); setActivePanel("filters")
    if (!allMapped.length) return
    mapRef.current?.fitBounds(L.latLngBounds(allMapped.map((item) => [item.latitude, item.longitude])), { padding: [60, 60], maxZoom: 13 })
  }
  function unlockMap() { setMobileMapUnlocked(true); mapRef.current?.dragging.enable(); mapRef.current?.scrollWheelZoom.enable(); mapRef.current?.getContainer().focus() }
  function selectResult(resource) {
    setSelected(resource); setSelectedLocation(resource.mappable ? groupResourcesByCoordinate(mapped).find((items) => items.some((item) => String(item.id) === String(resource.id))) || [resource] : [resource])
    if (resource.mappable) mapRef.current?.setView([resource.latitude, resource.longitude], Math.max(11, Math.min(14, mapRef.current.getZoom())), { animate: true })
  }
  async function submitMapChat(event) {
    event.preventDefault()
    const query = chatInput.trim()
    if (!query || chatStatus === "loading") return
    const candidates = buildMapCandidates(filtered, query)
    const nextMessages = [...chatMessages, { role: "user", content: query }].slice(-16)
    setChatMessages(nextMessages); setChatInput(""); setChatStatus("loading"); setChatError(""); setChatAnswer(""); setGuideExpanded(true)
    try {
      const data = await askMiller(buildMillerRequest({ mode: "map", query, city, matches: candidates.map(toMillerMatch), conversationMemory: nextMessages, inferredCategories: serviceTypes, sessionId }))
      const contract = data.map || {}
      const authorized = resolveAuthorizedMapResults(candidates, contract.resourceIds)
      setChatResults(authorized); setChatAnswer(contract.noResults ? "I couldn’t find an approved resource matching that request. Try a broader service type or clear the current filters." : contract.message || "I found these approved resources.")
      setChatMessages((current) => [...current, { role: "assistant", content: contract.message || "No approved results found." }].slice(-16))
      setChatStatus(contract.noResults || !authorized.length ? "empty" : "complete"); setActivePanel("results")
      const located = authorized.filter((item) => item.mappable)
      if (located.length > 1) mapRef.current?.fitBounds(L.latLngBounds(located.map((item) => [item.latitude, item.longitude])), { padding: [65, 65], maxZoom: 13 })
      else if (located.length === 1) mapRef.current?.setView([located[0].latitude, located[0].longitude], Math.min(13, Math.max(10, mapRef.current.getZoom())))
    } catch (error) {
      setChatStatus("error"); setChatError(error.name === "AbortError" ? "The search took too long. Please try again." : error.message)
    } finally { /* askMiller always clears its timeout */ }
  }
  function startOver() { setChatInput(""); setChatMessages([]); setChatAnswer(""); setChatResults([]); setChatStatus("idle"); setChatError(""); setSelected(null); setSelectedLocation([]); setActivePanel("filters") }

  const filtersPanel = <><h2>Filter services</h2><p className="map-help">Filters narrow both visible pins and conversational results.</p><div className="map-legend">{SERVICE_TYPES.map((type) => <button type="button" key={type} aria-pressed={serviceTypes.includes(type)} className={serviceTypes.includes(type) ? "active" : ""} onClick={() => toggleType(type)}><span>{type}</span><strong aria-label={`${counts[type]} resources`}>{counts[type]}</strong></button>)}</div>{serviceTypes.length ? <button className="text-button" type="button" onClick={() => setServiceTypes([])}>Show all categories</button> : null}<section className="access-summary"><h2>Service access</h2><p><strong>Reference point:</strong> current map centre. Distances are approximate straight-line distances, not travel distances. This service does not know your location.</p><div className="radius-counts">{Object.entries(analysis.within).map(([radius, count]) => <span key={radius}><strong>{count}</strong> within {radius} km</span>)}</div><p className="cautious-note">These counts describe mapped public resources only; they do not measure service adequacy or current availability.</p></section>{nonFixed.length ? <section><h2>Virtual & mobile ({nonFixed.length})</h2>{nonFixed.slice(0, 10).map((item) => <button className="nonfixed-resource" type="button" key={item.id} onClick={() => { setSelectedLocation([item]); setSelected(item) }}>{item.name}<span>{item.virtual_service ? "Virtual" : "Mobile/outreach"}</span></button>)}</section> : null}</>
  const mappedResultCount = displayedChatResults.filter((item) => item.mappable).length
  const remoteResultCount = displayedChatResults.filter((item) => item.virtual_service || item.mobile_service).length
  const resultsPanel = <section aria-label="Map search results"><div className="map-results-heading"><h2>Search results</h2>{chatResults.length ? <span>{displayedChatResults.length} shown of {chatResults.length} · {mappedResultCount} mapped · {remoteResultCount} virtual/mobile</span> : null}</div>{chatStatus === "loading" ? <p className="map-result-state" role="status">Searching…</p> : null}{chatStatus === "error" ? <p className="map-result-state is-error" role="alert">{chatError}</p> : null}{chatStatus === "empty" ? <p className="map-result-state">No approved resources matched. Current filters may be narrowing the search.</p> : null}{chatResults.length > 0 && displayedChatResults.length === 0 ? <p className="map-result-state">The current filters hide all conversational results. Change filters or start over.</p> : null}<div className="map-result-list">{displayedChatResults.map((resource) => <article id={`map-result-${resource.id}`} key={resource.id} className={`map-result-card ${String(selected?.id) === String(resource.id) ? "is-selected" : ""}`} aria-current={String(selected?.id) === String(resource.id) ? "true" : undefined}><button type="button" className="map-result-select" onClick={() => selectResult(resource)}><strong>{resource.name}</strong><span>{resource.mappable ? "Mapped location" : resource.virtual_service ? "Virtual service" : resource.mobile_service ? "Mobile/outreach" : "No reviewed public coordinate"}</span></button><div className="resource-meta">{resource.serviceTypes.slice(0, 2).map((type) => <span key={type}>{type}</span>)}</div>{resource.city || resource.service_area ? <p>{resource.city || resource.service_area}</p> : null}{resource.description ? <p>{resource.description.slice(0, 150)}{resource.description.length > 150 ? "…" : ""}</p> : null}<div className="map-result-actions">{resource.mappable ? <button type="button" onClick={() => selectResult(resource)}>View on map</button> : <button type="button" onClick={() => selectResult(resource)}>View details</button>}<AddToHandoutButton resource={resource} selected={handout.resources.some((item) => item.key === getResourceKey(resource))} onAdd={(item) => dispatchHandout({ type: "add_resource", resource: item })} onRemove={() => dispatchHandout({ type: "remove_resource", key: getResourceKey(resource) })}/></div></article>)}</div>{chatResults.length || chatStatus !== "idle" ? <button type="button" className="text-button" onClick={startOver}>Start over and return to all resources</button> : <p className="map-help">Search from the map panel to see synchronized results here.</p>}</section>

  return <div className="map-page">
    <header className="map-header"><button type="button" className="ghost-button" onClick={onBack}>← Resource search</button><div><p className="eyebrow">Public addiction services</p><h1>Service Map</h1></div><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Map city"><option>{cities[0]}</option>{cities.slice(1).map((value) => <option key={value}>{value}</option>)}</select></header>
    <div className="map-workspace">
      {selected?.location_id ? <aside className="transit-context-panel"><TransitNearby locationId={selected.location_id}/></aside> : null}
      <aside className="map-sidebar" aria-label="Map results and filters"><div className="map-panel-tabs" role="tablist" aria-label="Map sidebar"><button type="button" role="tab" aria-selected={activePanel === "results"} onClick={() => setActivePanel("results")}>Search results{chatResults.length ? ` (${chatResults.length})` : ""}</button><button type="button" role="tab" aria-selected={activePanel === "filters"} onClick={() => setActivePanel("filters")}>Filters</button></div><div role="tabpanel">{activePanel === "results" ? resultsPanel : filtersPanel}</div></aside>
      <main className={`map-canvas-wrap ${mobileMapUnlocked ? "is-unlocked" : ""}`}><div className="map-canvas" ref={mapNode} aria-label="Interactive addiction services map. Clustered markers expand when selected; pins are keyboard focusable." tabIndex="0"/>{!mobileMapUnlocked ? <button type="button" className="map-unlock" onClick={unlockMap}>Use interactive map</button> : null}<section className={`map-miller-guide ${guideExpanded ? "is-expanded" : "is-collapsed"}`} aria-label="Map resource guide">{millerAvatar ? <img src={millerAvatar} alt=""/> : null}<div className="map-miller-bubble"><button type="button" className="map-guide-toggle" aria-expanded={guideExpanded} onClick={() => setGuideExpanded((value) => !value)}>{chatStatus === "loading" ? "Searching…" : selected ? "Route help" : "Search the map"}<span aria-hidden="true">{guideExpanded ? "−" : "+"}</span></button>{guideExpanded ? <><p className="map-chat-answer" aria-live="polite" aria-atomic="true">{chatStatus === "loading" ? "Searching approved resources…" : chatError || guideMessage}</p><form className="map-chat-form" onSubmit={submitMapChat}><label htmlFor="map-chat-input">What kind of support are you looking for?</label><textarea id="map-chat-input" rows="2" maxLength="500" value={chatInput} disabled={chatStatus === "loading"} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit() } }} placeholder="Try: OAT services in Surrey, or virtual counselling"/><div><button type="submit" disabled={!chatInput.trim() || chatStatus === "loading"}>{chatStatus === "loading" ? "Looking…" : "Send"}</button>{chatMessages.length ? <button type="button" onClick={startOver}>Start over</button> : null}</div></form><div className="miller-map-suggestions">{selected ? <><button type="button" onClick={() => document.querySelector(".resource-drawer")?.focus()}>See service details</button><button type="button" onClick={highlightSimilar}>Similar nearby</button></> : <><button type="button" onClick={showAllPins}>Reset filters and show all pins</button>{analysis.nearestByType["Detox / withdrawal"] ? <button type="button" onClick={() => highlightNearest("Detox / withdrawal")}>Detox nearest map centre</button> : null}{analysis.nearestByType.OAT ? <button type="button" onClick={() => highlightNearest("OAT")}>OAT nearest map centre</button> : null}</>}</div></> : null}</div></section><div className="map-status" aria-live="polite">{mapped.length} public services · {addressGroups.length} address pins · {nonFixed.length} virtual/mobile. Nearby pins cluster until you zoom in.</div></main>
      {selected ? <aside className="resource-drawer" aria-label="Selected resource" tabIndex="-1"><button type="button" className="drawer-close" onClick={() => { setSelected(null); setSelectedLocation([]) }} aria-label="Close resource details">×</button>{selectedLocation.length > 1 ? <section className="shared-location"><h2>{selectedLocation.length} services at this location</h2><p>Select a service to see its details.</p>{selectedLocation.map((item) => <button type="button" key={item.id} aria-pressed={String(item.id) === String(selected.id)} onClick={() => setSelected(item)}>{item.name}</button>)}</section> : null}<p className="drawer-status">{selected.approved === true || selected.source !== "tavily" ? "Miller resource" : "External / unverified"} · {selected.verification_status}</p><h2>{selected.name}</h2>{selected.organization ? <p>{selected.organization}</p> : null}<div className="resource-meta">{selected.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>{selected.address ? <p><strong>Address:</strong> {selected.address}{selected.city ? `, ${selected.city}` : ""}</p> : null}{selected.phone ? <p><strong>Phone:</strong> {selected.phone}</p> : null}{selected.hours ? <p><strong>Hours:</strong> {selected.hours}</p> : null}{selected.eligibility ? <p><strong>Eligibility:</strong> {selected.eligibility}</p> : null}{selected.accessType ? <p><strong>Access:</strong> {selected.accessType}</p> : null}{selected.population ? <p><strong>Population:</strong> {selected.population}</p> : null}<div className="drawer-actions">{selected.mappable ? <><a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude}%2C${selected.longitude}&travelmode=transit`} target="_blank" rel="noreferrer">Open transit planner</a><a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude}%2C${selected.longitude}&travelmode=walking`} target="_blank" rel="noreferrer">Open walking route planner</a><a href={`https://www.openstreetmap.org/directions?to=${selected.latitude}%2C${selected.longitude}`} target="_blank" rel="noreferrer">Open in OpenStreetMap</a></> : null}{safeHttpUrl(selected.website) ? <a href={safeHttpUrl(selected.website)} target="_blank" rel="noreferrer">View full resource</a> : null}<AddToHandoutButton resource={selected} selected={handout.resources.some((item) => item.key === getResourceKey(selected))} onAdd={(item) => dispatchHandout({ type: "add_resource", resource: item })} onRemove={() => dispatchHandout({ type: "remove_resource", key: getResourceKey(selected) })}/></div><p className="route-privacy">Miller sends only this service’s destination to the external route planner. You choose whether to provide a starting point after it opens. Miller does not receive or store that starting point. Map-centre distances are approximate straight-line distances; route results are travel distances calculated by the external provider.</p>{selected.location_last_verified ? <p className="verified-date">Location last verified {new Date(selected.location_last_verified).toLocaleDateString()}</p> : null}{isAdminMode && selected.source === "tavily" ? <AdminGeographyEditor resource={selected}/> : null}</aside> : null}
    </div>
  </div>
}
