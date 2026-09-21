import { useEffect, useMemo, useState } from "react"

import { treaty6BusinessesPublicV1 as directory } from "../data/treaty6-businesses-public-v1.js"
import { safeHttpUrl } from "../safeLinks.js"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import { visibleCurrentOpportunities } from "./treaty6BusinessesPublic.js"
import "./Treaty6Businesses.css"

const currentOpportunities = Object.freeze([])

function PublicLink({ href, children }) {
  const safe = safeHttpUrl(href)
  return safe ? <a href={safe} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a> : null
}

export default function Treaty6Businesses() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [nation, setNation] = useState("All")
  const categories = useMemo(() => [...new Set(directory.businesses.flatMap(item => item.categories))].sort(), [])
  const nations = useMemo(() => [...new Set(directory.businesses.map(item => item.nation))].sort(), [])
  const businesses = useMemo(() => directory.businesses.filter(item => {
    const text = `${item.name} ${item.nation} ${item.relationship} ${item.description} ${item.categories.join(" ")}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (category === "All" || item.categories.includes(category)) && (nation === "All" || item.nation === nation)
  }), [query, category, nation])
  const opportunities = useMemo(() => visibleCurrentOpportunities(currentOpportunities), [])

  useEffect(() => {
    const previousTitle = document.title
    document.title = "Treaty 6 Businesses | Miller North"
    return () => { document.title = previousTitle }
  }, [])

  return <main className="mn-public-page treaty6-directory-page">
    <header className="mn-public-header"><MillerNorthHomeLink /><MillerNorthPublicNav current="treaty6_businesses" /></header>
    <section className="t6d-hero">
      <p className="mn-public-eyebrow">Miller North · public business directory</p>
      <h1>Treaty 6 Businesses</h1>
      <p>Public directory of Treaty 6 Nation-owned and Nation-affiliated businesses identified from authoritative public sources. Business capabilities are summarized from public information. Inclusion does not establish eligibility for any particular procurement opportunity.</p>
    </section>

    <section className="t6d-directory" aria-labelledby="t6d-directory-heading">
      <div className="t6d-heading"><div><p className="t6d-kicker">Directory</p><h2 id="t6d-directory-heading">Public business profiles</h2><p>{directory.verifiedBusinessCount} source-linked businesses are shown. Links lead to public business or affiliation information.</p></div><span aria-live="polite">{businesses.length} shown</span></div>
      <div className="t6d-filters" aria-label="Treaty 6 business directory filters">
        <label>Search<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Business or service" /></label>
        <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Nation/community<select value={nation} onChange={event => setNation(event.target.value)}><option>All</option>{nations.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="t6d-grid">{businesses.map(item => <article className="t6d-card" key={item.name}><p className="t6d-region">{item.region}</p><h3>{item.name}</h3><p className="t6d-nation">{item.relationship}</p><p>{item.description}</p><div className="t6d-tags">{item.categories.map(tag => <span key={tag}>{tag}</span>)}</div><footer><PublicLink href={item.website}>Business website</PublicLink><PublicLink href={item.source}>Public source</PublicLink></footer></article>)}</div>
      {!businesses.length ? <p className="t6d-empty">No directory entries match these filters.</p> : null}
    </section>

    <section className="t6d-opportunities" aria-labelledby="t6d-opportunities-heading">
      <p className="t6d-kicker">Public notices</p><h2 id="t6d-opportunities-heading">Current public opportunities</h2>
      {opportunities.length ? <div className="t6d-grid">{opportunities.map(item => <article className="t6d-card" key={item.id}><h3>{item.title}</h3><p>{item.buyer}</p><p>Closing date: {item.closingDate}</p><p>{item.category}</p><PublicLink href={item.sourceUrl}>Official notice</PublicLink></article>)}</div> : <p className="t6d-empty">No independently rechecked contract solicitations are currently shown. Public notices appear here only while their status and closing date remain current.</p>}
      <p className="t6d-note">Selected notices may be shown where their subject matter overlaps with listed business capabilities. Suppliers should consult the official solicitation for eligibility and submission requirements.</p>
    </section>
    <aside className="t6d-boundary"><strong>Separate from Miller North health evidence.</strong><p>This directory is a public resource and does not change, assess or interpret Miller North healthcare, incident or accountability records.</p></aside>
    <footer className="mn-public-footer">Directory information is drawn from public sources and may change. Please use the linked public source for the most current business information.</footer>
  </main>
}
