import { useEffect, useState } from "react"

export default function TransitNearby({ locationId }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: "idle" })
  useEffect(() => { setOpen(false); setState({ status: "idle" }) }, [locationId])
  async function load() {
    setOpen(true); if (state.status === "ready" || state.status === "loading") return
    setState({ status: "loading" })
    try { const response = await fetch(`/api/map/locations/${encodeURIComponent(locationId)}/transit`); const body = await response.json(); if (!response.ok) throw new Error(body.error); setState({ status: "ready", result: body }) }
    catch { setState({ status: "error" }) }
  }
  return <section className="transit-nearby"><button type="button" aria-expanded={open} onClick={() => open ? setOpen(false) : load()}>Getting there by transit</button>{open ? <div>{state.status === "loading" ? <p role="status">Finding nearby transit stops…</p> : null}{state.status === "error" ? <p role="alert">Nearby transit information is unavailable right now. Use the transit planner below.</p> : null}{state.status === "ready" ? <><p><strong>{state.result.provider.name}</strong> · nearby stops within {state.result.data.radiusKm} km</p>{state.result.data.stops.length ? <ul>{state.result.data.stops.map((stop) => <li key={stop.id}><strong>{stop.name}</strong> — {Math.round(stop.distanceKm * 1000)} m straight-line distance{stop.routes.length ? <span><br/>Routes: {stop.routes.map((route) => route.shortName || route.longName).filter(Boolean).join(", ")}</span> : null}</li>)}</ul> : <p>No stops were found within the pilot radius.</p>}<small>Source: {state.result.provider.name} GTFS schedule data. This is nearby-stop context, not a route or journey recommendation. Data retrieved {new Date(state.result.provenance.retrievedAt).toLocaleString()}.</small></> : null}</div> : null}</section>
}
