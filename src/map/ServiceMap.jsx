import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { analyzeServiceAccess, filterMapResources, normalizeMapResource, SERVICE_TYPES } from "./geography.js"
import AddToHandoutButton from "../handout/AddToHandoutButton.jsx"
import { getResourceKey } from "../handout/handoutState.js"
import { safeHttpUrl } from "../safeLinks.js"
import { adminFetch } from "../adminApi.js"

const LOWER_MAINLAND = [49.19, -122.86]

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

export default function ServiceMap({ resources, handout, dispatchHandout, onBack, isAdminMode = false }) {
  const mapNode = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [serviceTypes, setServiceTypes] = useState([])
  const [city, setCity] = useState("All cities")
  const [centre, setCentre] = useState({ latitude: LOWER_MAINLAND[0], longitude: LOWER_MAINLAND[1] })
  const normalized = useMemo(() => resources.map(normalizeMapResource), [resources])
  const filtered = useMemo(() => filterMapResources(normalized, { serviceTypes, city, approvedOnly: true }), [normalized, serviceTypes, city])
  const counts = useMemo(() => Object.fromEntries(SERVICE_TYPES.map((type) => [type, filterMapResources(normalized, { serviceTypes: [type], city, approvedOnly: true }).length])), [normalized, city])
  const cities = useMemo(() => ["All cities", ...new Set(normalized.map((item) => item.city).filter(Boolean).sort())], [normalized])
  const analysis = useMemo(() => analyzeServiceAccess(filtered, centre), [filtered, centre])
  const nonFixed = filtered.filter((item) => !item.mappable && (item.virtual_service || item.mobile_service))

  useEffect(() => {
    if (mapRef.current || !mapNode.current) return
    const map = L.map(mapNode.current, { zoomControl: true }).setView(LOWER_MAINLAND, 9)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    map.on("moveend", () => { const value = map.getCenter(); setCentre({ latitude: value.lat, longitude: value.lng }) })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const groups = new Map()
    filtered.filter((item) => item.mappable).forEach((item) => {
      const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`
      groups.set(key, [...(groups.get(key) || []), item])
    })
    groups.forEach((items) => {
      const first = items[0]
      const marker = L.circleMarker([first.latitude, first.longitude], { radius: Math.min(18, 7 + Math.log2(items.length) * 3), color: "#275b83", fillColor: "#6bbcff", fillOpacity: 0.9, weight: 2 })
      marker.bindTooltip(items.length > 1 ? `${items.length} services` : first.name)
      marker.on("click", () => setSelected(first))
      marker.addTo(layer)
    })
  }, [filtered])

  function toggleType(type) { setServiceTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]) }

  return <div className="map-page">
    <header className="map-header"><button type="button" className="ghost-button" onClick={onBack}>← Resource search</button><div><p className="eyebrow">Public addiction services</p><h1>Service Map</h1></div><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Map city"><option>{cities[0]}</option>{cities.slice(1).map((value) => <option key={value}>{value}</option>)}</select></header>
    <div className="map-workspace">
      <aside className="map-sidebar" aria-label="Map filters"><h2>Filter services</h2><p className="map-help">Select one or more categories. Counts respond to the city filter.</p><div className="map-legend">{SERVICE_TYPES.map((type) => <button type="button" key={type} aria-pressed={serviceTypes.includes(type)} className={serviceTypes.includes(type) ? "active" : ""} onClick={() => toggleType(type)}><span>{type}</span><strong>{counts[type]}</strong></button>)}</div>{serviceTypes.length ? <button className="text-button" type="button" onClick={() => setServiceTypes([])}>Show all categories</button> : null}<section className="access-summary"><h2>Service access</h2><p>From current map centre · deterministic straight-line distance</p><div className="radius-counts">{Object.entries(analysis.within).map(([radius, count]) => <span key={radius}><strong>{count}</strong> within {radius} km</span>)}</div><p className="cautious-note">These counts describe mapped public resources only; they do not measure service adequacy or current availability.</p></section>{nonFixed.length ? <section><h2>Virtual & mobile ({nonFixed.length})</h2>{nonFixed.slice(0, 10).map((item) => <button className="nonfixed-resource" type="button" key={item.id} onClick={() => setSelected(item)}>{item.name}<span>{item.virtual_service ? "Virtual" : "Mobile/outreach"}</span></button>)}</section> : null}</aside>
      <main className="map-canvas-wrap"><div className="map-canvas" ref={mapNode} aria-label="Interactive addiction services map"/><div className="map-status">{filtered.filter((item) => item.mappable).length} mapped · {nonFixed.length} virtual/mobile</div></main>
      {selected ? <aside className="resource-drawer" aria-label="Selected resource"><button type="button" className="drawer-close" onClick={() => setSelected(null)} aria-label="Close resource">×</button><p className="drawer-status">{selected.approved === true || selected.source !== "tavily" ? "Miller resource" : "External / unverified"} · {selected.verification_status}</p><h2>{selected.name}</h2>{selected.organization ? <p>{selected.organization}</p> : null}<div className="resource-meta">{selected.serviceTypes.map((type) => <span key={type}>{type}</span>)}</div>{selected.address ? <p><strong>Address:</strong> {selected.address}{selected.city ? `, ${selected.city}` : ""}</p> : null}{selected.phone ? <p><strong>Phone:</strong> {selected.phone}</p> : null}{selected.hours ? <p><strong>Hours:</strong> {selected.hours}</p> : null}{selected.eligibility ? <p><strong>Eligibility:</strong> {selected.eligibility}</p> : null}{selected.accessType ? <p><strong>Access:</strong> {selected.accessType}</p> : null}{selected.population ? <p><strong>Population:</strong> {selected.population}</p> : null}<div className="drawer-actions">{selected.mappable ? <a href={`https://www.openstreetmap.org/directions?to=${selected.latitude}%2C${selected.longitude}`} target="_blank" rel="noreferrer">Open directions</a> : null}{safeHttpUrl(selected.website) ? <a href={safeHttpUrl(selected.website)} target="_blank" rel="noreferrer">View full resource</a> : null}<AddToHandoutButton resource={selected} selected={handout.resources.some((item) => item.key === getResourceKey(selected))} onAdd={(item) => dispatchHandout({ type: "add_resource", resource: item })} onRemove={() => dispatchHandout({ type: "remove_resource", key: getResourceKey(selected) })}/></div>{selected.location_last_verified ? <p className="verified-date">Location last verified {new Date(selected.location_last_verified).toLocaleDateString()}</p> : null}{isAdminMode && selected.source === "tavily" ? <AdminGeographyEditor resource={selected}/> : null}</aside> : null}
    </div>
  </div>
}
