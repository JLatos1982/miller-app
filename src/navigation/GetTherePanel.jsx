import { useEffect, useRef, useState } from "react"
import { googleDirectionsUrl, validateTypedOrigin } from "./navigation.js"

export default function GetTherePanel({ resource, location, initialOrigin = null, onClose }) {
  const panelRef = useRef(null)
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null)
  const [state, setState] = useState({ status: "loading", context: null, message: "" })
  const [origin, setOrigin] = useState(initialOrigin)
  const [typedOrigin, setTypedOrigin] = useState("")
  const [originStatus, setOriginStatus] = useState(initialOrigin ? "Using the starting location from this search for this panel only." : "")

  async function loadContext(nextOrigin = null) {
    setState((current) => ({ ...current, status: "loading", message: "" }))
    try {
      const response = await fetch(`/api/map/locations/${encodeURIComponent(location.location_id)}/access-context`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextOrigin ? { origin: nextOrigin } : {}) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error)
      setState({ status: "ready", context: body.context, message: "" })
    } catch (error) { setState({ status: "error", context: null, message: error.message || "I couldn't find transit information for this location yet." }) }
  }

  useEffect(() => {
    const opener = openerRef.current
    loadContext(initialOrigin)
    panelRef.current?.focus()
    function keydown(event) {
      if (event.key === "Escape") return onClose()
      if (event.key !== "Tab") return
      const controls = [...panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')]
      if (!controls.length) return
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", keydown)
    return () => { document.removeEventListener("keydown", keydown); opener?.focus?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function useMyLocation() {
    setOriginStatus("Requesting location permission…")
    if (!navigator.geolocation) return setOriginStatus("This browser can't share a location. You can enter a starting location instead.")
    navigator.geolocation.getCurrentPosition(({ coords }) => { const next = { latitude: coords.latitude, longitude: coords.longitude, provenance: { provider: "browser_geolocation" } }; setOrigin(next); setOriginStatus("Using your location for this panel only."); loadContext(next) }, () => setOriginStatus("Location wasn't shared. You can enter a starting location instead."), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 })
  }

  async function geocodeTypedOrigin(event) {
    event.preventDefault(); const query = validateTypedOrigin(typedOrigin)
    if (!query) return setOriginStatus("Enter a BC address or intersection.")
    setOriginStatus("Finding that starting location…")
    try {
      const response = await fetch("/api/navigation/origin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error)
      const next = { latitude: body.origin.latitude, longitude: body.origin.longitude, provenance: { provider: "bc_address_geocoder" } }
      setOrigin(next); setOriginStatus(`Starting from ${body.origin.label}.`); loadContext(next)
    } catch (error) { setOriginStatus(error.message || "I couldn't find that starting location.") }
  }

  const context = state.context
  const directions = [
    ["Transit", "transit"], ["Walk", "walking"], ["Drive", "driving"], ["Cycle", "bicycling"],
  ].map(([label, mode]) => ({ label, url: googleDirectionsUrl(location, mode, origin) })).filter((item) => item.url)
  return <div className="get-there-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="get-there-panel" role="dialog" aria-modal="true" aria-labelledby="get-there-title" tabIndex="-1" ref={panelRef}><header><div><p className="eyebrow">Simple travel context</p><h2 id="get-there-title">How can I get to {resource.name}?</h2></div><button type="button" className="get-there-close" onClick={onClose} aria-label="Close getting-there panel">×</button></header><p><strong>Destination:</strong> {location.address}{location.city ? `, ${location.city}` : ""}</p>{state.status === "loading" ? <p role="status">Finding nearby transit…</p> : null}{state.status === "error" ? <p role="alert">{state.message} You can still open the destination in an external map.</p> : null}{context ? <><p><strong>{context.transit.provider.name}</strong> · nearby transit</p>{context.transit.nearbyStops.length ? <ul className="get-there-stops">{context.transit.nearbyStops.map((stop) => <li key={stop.id}><strong>{stop.name}</strong><span>{Math.round(stop.distanceKm * 1000)} m straight-line from the service</span>{stop.routes.length ? <span>Routes: {stop.routes.map((route) => route.shortName || route.longName).filter(Boolean).join(", ")}</span> : null}</li>)}</ul> : <p>No nearby transit stops were found in this provider’s published schedule.</p>}{context.transit.directRoutes.length ? <section className="get-there-direct-routes" aria-label="Direct route indications"><h3>Routes serving both areas</h3>{context.transit.directRoutes.map((route) => <p key={route.id}><strong>{route.shortName || route.longName || route.id}</strong> serves stops near your starting point and this service.</p>)}</section> : origin && context.transit.originCoverage === "same_provider" ? <p>No single route was found serving the nearby stops at both ends. An external planner can help with transfers.</p> : origin && context.transit.originCoverage === "different_or_unsupported_provider" ? <p>Your starting point and destination are not covered by the same available transit feed. An external planner can help with the full trip.</p> : null}{context.transit.relevantAlerts.length ? <section className="transit-alerts" aria-label="Relevant transit alerts"><h3>Relevant service alerts</h3>{context.transit.relevantAlerts.map((alert) => <article key={alert.id}><strong>{alert.header}</strong>{alert.description ? <p>{alert.description}</p> : null}</article>)}</section> : context.transit.status === "temporarily_unavailable" ? <p>Live alerts are temporarily unavailable. Schedule-based stops are still shown.</p> : null}{context.userDistance ? <p><strong>From your starting point:</strong> approximately {context.userDistance.kilometres.toFixed(1)} km straight-line to the service.</p> : null}<small>Transit data from {context.transit.provider.name}. This panel identifies nearby scheduled stops, not a complete journey.</small></> : null}<section className="get-there-origin" aria-labelledby="origin-title"><h3 id="origin-title">Choose a starting point</h3><p>Optional. Your precise location is used only for this open panel and is not saved.</p><button type="button" onClick={useMyLocation}>From my location</button><form onSubmit={geocodeTypedOrigin}><label htmlFor="get-there-origin-input">Or enter a BC address or intersection</label><div><input id="get-there-origin-input" value={typedOrigin} maxLength="180" onChange={(event) => setTypedOrigin(event.target.value)} placeholder="Address or intersection"/><button type="submit">Use this start</button></div></form><p role="status">{originStatus}</p></section>{directions.length ? <section className="get-there-directions" aria-label="External directions"><h3>Open full directions</h3><p>Uses Google Maps in a new tab.</p><div>{directions.map((item) => <a key={item.label} className="get-there-maps" href={item.url} target="_blank" rel="noreferrer">{item.label}</a>)}</div></section> : null}<p className="get-there-privacy">Only the destination—and your starting coordinates if you chose one—will be sent to Google Maps after you open a link.</p></section></div>
}
