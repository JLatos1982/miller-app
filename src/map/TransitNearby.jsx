import { useEffect, useState } from "react"

export default function TransitNearby({ locationId }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: "idle" })
  useEffect(() => { setOpen(false); setState({ status: "idle" }) }, [locationId])
  async function load() {
    setOpen(true)
    if (state.status === "ready" || state.status === "loading") return
    setState({ status: "loading" })
    try {
      const response = await fetch(`/api/map/locations/${encodeURIComponent(locationId)}/transit`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setState({ status: "ready", result: body })
    } catch { setState({ status: "error" }) }
  }
  const result = state.result
  return <section className="transit-nearby" aria-labelledby="transit-nearby-title"><button id="transit-nearby-title" type="button" aria-expanded={open} onClick={() => open ? setOpen(false) : load()}>Getting there by transit</button>{open ? <div>{state.status === "loading" ? <p role="status">Finding nearby transit stops…</p> : null}{state.status === "error" ? <p role="alert">Nearby transit information is unavailable right now. Use the transit planner below.</p> : null}{state.status === "ready" ? <><p><strong>{result.provider.name}</strong> · nearby stops within {result.data.radiusKm} km</p>{result.data.stops.length ? <ul>{result.data.stops.map((stop) => <li key={stop.id}><strong>{stop.name}</strong> — {Math.round(stop.distanceKm * 1000)} m straight-line distance{stop.routes.length ? <span><br/>Routes: {stop.routes.map((route) => route.shortName || route.longName).filter(Boolean).join(", ")}</span> : null}</li>)}</ul> : <p>No stops were found within the pilot radius.</p>}{result.realtime.alerts?.length ? <section className="transit-alerts" aria-label="Relevant transit service alerts"><h3>Relevant service alerts</h3>{result.realtime.alerts.map((alert) => <article key={alert.id}><strong>{alert.header}</strong>{alert.effect ? <span> · {alert.effect.toLowerCase().replaceAll("_", " ")}</span> : null}{alert.description ? <p>{alert.description}</p> : null}</article>)}</section> : result.realtime.status === "temporarily_unavailable" ? <p className="transit-realtime-note">Live service alerts are temporarily unavailable. Nearby stops and routes are still shown from schedule data.</p> : null}<small>Source: {result.provider.name} GTFS data. This is nearby-stop context, not a route or journey recommendation. Data retrieved {new Date(result.provenance.retrievedAt).toLocaleString()}.</small></> : null}</div> : null}</section>
}
