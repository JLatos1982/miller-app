import { useEffect, useMemo, useState } from "react"

import { treaty6ProcurementAssistantV2 as model } from "../data/treaty6-procurement-assistant-v2-public.js"
import { safeHttpUrl } from "../safeLinks.js"
import MillerNorthPublicNav, { MillerNorthHomeLink } from "./MillerNorthPublicNav.jsx"
import { filterAndSortTreaty6Beta } from "./treaty6ProcurementBetaFilters.js"
import "./Treaty6ProcurementPreview.css"

const EMPTY = Object.freeze([])
const fitLabels = Object.freeze({
  SOLO_FRIENDLY: "May suit smaller suppliers",
  MICRO_BUSINESS_FRIENDLY: "May suit smaller suppliers",
  SMALL_TEAM_FRIENDLY: "May suit smaller suppliers",
  CREDENTIAL_HEAVY: "Likely requires specialized capability",
  EQUIPMENT_HEAVY: "Likely requires specialized capability",
  CAPITAL_HEAVY: "Large / complex procurement",
  MEDIUM_BUSINESS: "Large / complex procurement",
  INSUFFICIENT_INFORMATION: "Requirements still being verified",
})
const pretty = value => String(value || "").replaceAll("_", " ").toLocaleLowerCase("en-CA").replace(/\b\w/g, letter => letter.toUpperCase())
const formatDate = value => value ? new Date(value).toLocaleDateString("en-CA", { dateStyle: "medium" }) : null

function OfficialLink({ href, children = "Open official source" }) {
  const safe = safeHttpUrl(href)
  return safe ? <a className="t6p-source-button" href={safe} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a> : null
}

function OpportunityCard({ item, watched = false }) {
  const planning = ["RFI_ONLY", "UPCOMING_PLANNING"].includes(item.actionability)
  return <article className={`t6p-card t6p-opportunity-card${watched ? " is-watched" : ""}`}>
    <div className="t6p-card-tags"><span className={planning ? "is-planning" : "is-open"}>{item.action_label}</span><span>{item.province}</span><span>{item.indigenous_label}</span></div>
    <h3>{item.title}</h3><p className="t6p-buyer">{item.buyer}</p>
    <dl className="t6p-facts">
      <div><dt>{planning ? "Response / notice date" : "Closing date"}</dt><dd>{formatDate(item.close_date) || "Check the official source"}</dd></div>
      <div><dt>Region</dt><dd>{item.community_region || pretty(item.treaty6_relevance)}</dd></div>
      <div><dt>Category</dt><dd>{item.categories?.map(pretty).join(", ") || "Not specified"}</dd></div>
      <div><dt>Supplier scale</dt><dd>{fitLabels[item.small_business_fit] || "Requirements still being verified"}</dd></div>
    </dl>
    <p>{item.plain_language_summary}</p>
    <p className="t6p-why"><strong>Why it may be worth watching</strong>{item.why_watch}</p>
    {item.key_requirements?.length ? <div className="t6p-requirements"><strong>Key verified requirements</strong><ul>{item.key_requirements.map(requirement => <li key={`${requirement.type}-${requirement.value}`}>{pretty(requirement.type)}: {requirement.value}</li>)}</ul></div> : <p className="t6p-requirements-note">{item.requirements_note || "See the official tender for full requirements."}</p>}
    <footer><OfficialLink href={item.source_url}>{planning ? "Read the official planning notice" : "Check the official opportunity"}</OfficialLink><small>Last verified {formatDate(item.verified_at)}</small></footer>
  </article>
}

function SupportCard({ item, linkText = "Visit official source" }) {
  return <article className="t6p-card t6p-support-card"><span className="t6p-mini-label">{pretty(item.support_type || item.jurisdiction)}</span><h3>{item.title}</h3><p>{item.summary || item.description}</p>{item.registration_or_alerts ? <p><strong>Alerts or registration:</strong> {item.registration_or_alerts}</p> : null}{item.full_documents_may_require_account ? <p className="t6p-caveat">An account may be needed for complete documents.</p> : null}<OfficialLink href={item.source_url}>{linkText}</OfficialLink></article>
}

function BusinessWatchlistCard({ business }) {
  return <article className="t6p-card t6p-business-card">
    <div className="t6p-card-tags"><span>{business.province}</span><span>{business.current_opportunity_count} current {business.current_opportunity_count === 1 ? "watch" : "watches"}</span></div>
    <h3>{business.canonical_name}</h3>
    <p className="t6p-buyer">{business.public_affiliation}</p>
    <p className="t6p-muted">{business.region || business.province}</p>
    {business.public_summary ? <p>{business.public_summary}</p> : null}
    <div className="t6p-capability-tags">{business.capabilities.map(item => <span key={item}>{pretty(item)}</span>)}</div>
    {business.watch_categories?.length ? <><strong>Samwise watches</strong><div className="t6p-capability-tags">{business.watch_categories.map(item => <span key={item}>{pretty(item)}</span>)}</div></> : null}
    {business.buyer_watch?.length ? <p><strong>Buyers to watch:</strong> {business.buyer_watch.join(", ")}</p> : null}
    {business.supplier_paths?.length ? <p><strong>Supplier pathways:</strong> {business.supplier_paths.join(" · ")}</p> : null}
    {business.watchlist.length ? <div className="t6p-business-watch-items">{business.watchlist.map(item => <div key={item.opportunity_id}><span className="t6p-mini-label">{item.relevance_label}</span><h4>{item.title}</h4><p><strong>{item.buyer}</strong> · {item.action_label}</p><p>{item.why_watch}</p><p className="t6p-requirements-note">{item.requirements_note}</p><OfficialLink href={item.source_url}>Read official notice</OfficialLink></div>)}</div> : <p className="t6p-empty">{business.no_current_match_note}</p>}
    <p className="t6p-business-disclaimer">{business.qualification_disclaimer}</p>
    <footer><OfficialLink href={business.website}>Business source</OfficialLink><OfficialLink href={business.source_url}>Affiliation source</OfficialLink>{business.official_links?.map(item => <OfficialLink key={item.url} href={item.url}>{item.title}</OfficialLink>)}</footer>
  </article>
}

function EmptyState({ children }) {
  return <div className="t6p-empty"><strong>No verified open bids are displayed right now.</strong><p>{children}</p></div>
}

export default function Treaty6ProcurementPreview() {
  const [province, setProvince] = useState("ALL")
  const [action, setAction] = useState("OPEN_BID_READY")
  const [category, setCategory] = useState("ALL")
  const [relevance, setRelevance] = useState("ALL")
  const [buyer, setBuyer] = useState("ALL")
  const [closingSoon, setClosingSoon] = useState(false)
  const [sort, setSort] = useState("CLOSING_SOON")
  const allOpportunities = useMemo(() => [...(model.sections.current_opportunities || EMPTY), ...(model.sections.watching || EMPTY), ...(model.sections.registration_prequalification || EMPTY)], [])
  const categories = useMemo(() => [...new Set(allOpportunities.flatMap(item => item.categories || []))].sort(), [allOpportunities])
  const buyers = useMemo(() => [...new Set(allOpportunities.map(item => item.buyer))].sort(), [allOpportunities])
  const relevanceOptions = useMemo(() => [...new Set(allOpportunities.map(item => item.indigenous_relevance_class))].sort(), [allOpportunities])
  const visible = useMemo(() => {
    return filterAndSortTreaty6Beta(allOpportunities, { province, action, category, relevance, buyer, closing_soon: closingSoon }, sort)
  }, [allOpportunities, province, action, category, relevance, buyer, closingSoon, sort])

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.getAttribute("content")
    document.title = "Treaty 6 Procurement Opportunities | Miller North"
    if (description) description.setAttribute("content", model.description)
    return () => {
      document.title = previousTitle
      if (description && previousDescription !== null) description.setAttribute("content", previousDescription)
    }
  }, [])

  const registration = model.sections.supports.filter(item => item.support_type !== "INDIGENOUS_PROGRAM")
  const supports = model.sections.supports.filter(item => item.support_type === "INDIGENOUS_PROGRAM")

  return <main className="mn-public-page t6p-page">
    <header className="mn-public-header"><MillerNorthHomeLink/><MillerNorthPublicNav current="procurement" /></header>
    <section className="t6p-hero"><div><p className="mn-public-eyebrow">Miller North · practical economic opportunity</p><span className="t6p-beta-badge">Beta · data still being refined</span><h1>{model.title}</h1><p>{model.subtitle}</p></div><aside className="t6p-beta-note"><strong>{model.disclosures[0]}</strong>{model.disclosures.slice(1).map(item => <p key={item}>{item}</p>)}</aside></section>

    <section className="t6p-section" aria-labelledby="t6p-current">
      <div className="t6p-section-heading"><div><p className="t6p-kicker">Official sources control</p><h2 id="t6p-current">Current opportunities</h2><p>Start with open bids, or switch the action filter to see verified planning notices.</p></div><span aria-live="polite">{visible.length} shown</span></div>
      <div className="t6p-filters" aria-label="Procurement opportunity filters">
        <label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="ALL">All</option><option value="Alberta">Alberta</option><option value="Saskatchewan">Saskatchewan</option><option value="Federal">Federal</option></select></label>
        <label>Action<select value={action} onChange={event => setAction(event.target.value)}><option value="OPEN_BID_READY">Open bids</option><option value="RFI_ONLY">Planning / RFI</option><option value="OPEN_REGISTRATION">Registration</option><option value="PREQUALIFICATION">Prequalification</option><option value="ALL">All monitored</option></select></label>
        <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="ALL">All categories</option>{categories.map(item => <option key={item} value={item}>{pretty(item)}</option>)}</select></label>
        <label>Indigenous relevance<select value={relevance} onChange={event => setRelevance(event.target.value)}><option value="ALL">All relevance</option>{relevanceOptions.map(item => <option key={item} value={item}>{pretty(item)}</option>)}</select></label>
        <label>Buyer<select value={buyer} onChange={event => setBuyer(event.target.value)}><option value="ALL">All buyers</option>{buyers.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="CLOSING_SOON">Closing soon</option><option value="NEWEST">Newest</option><option value="RECENTLY_CHANGED">Recently changed</option><option value="INDIGENOUS_SPECIFIC">Indigenous-specific</option><option value="BUYER">Buyer</option></select></label>
        <label className="t6p-check"><input type="checkbox" checked={closingSoon} onChange={event => setClosingSoon(event.target.checked)}/> Closing within 7 days</label>
      </div>
      {visible.length ? <div className="t6p-grid">{visible.map(item => <OpportunityCard key={item.opportunity_id} item={item}/>)}</div> : <EmptyState>We’re monitoring public sources and add opportunities only after validation. Try “Planning / RFI,” review the official portals below, or check back after the next monitored update.</EmptyState>}
    </section>

    <section className="t6p-section" aria-labelledby="t6p-week"><p className="t6p-kicker">This week</p><h2 id="t6p-week">Market digest</h2><div className="t6p-grid">{model.sections.weekly_digest.map(item => <article className="t6p-card" key={item.event_type}><span className="t6p-mini-label">{pretty(item.event_type)}</span><h3>{item.title}</h3><p>{item.summary}</p><OfficialLink href={item.source_url}>Check official market source</OfficialLink></article>)}</div></section>

    <section className="t6p-section t6p-watch-section" aria-labelledby="t6p-watch"><p className="t6p-kicker">Early public signals</p><h2 id="t6p-watch">Opportunities we’re watching</h2><p>These are not yet open contract bids. They may help suppliers see future needs, consultations or market planning earlier.</p>{model.sections.watching.length ? <div className="t6p-grid">{model.sections.watching.map(item => <OpportunityCard key={`watch-${item.opportunity_id}`} item={item} watched/>)}</div> : <p className="t6p-empty">No source-supported planning signal currently passes the beta publication gate.</p>}</section>
    <section className="t6p-section" aria-labelledby="t6p-businesses"><p className="t6p-kicker">Public capability overlap only</p><h2 id="t6p-businesses">Business watchlists</h2><p>These six public profiles come from the existing Treaty 6 research record. A watch is a category signal, not a qualification assessment or bid recommendation.</p><div className="t6p-grid">{model.sections.business_watchlists.map(item => <BusinessWatchlistCard key={item.canonical_name} business={item}/>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-radar"><p className="t6p-kicker">Registering is not winning</p><h2 id="t6p-radar">Get on the radar</h2><p>These official paths can help a supplier find notices, register or follow opportunities. Registration does not establish qualification or guarantee a contract.</p><div className="t6p-grid">{registration.map(item => <SupportCard key={item.support_id} item={item} linkText="Review registration path"/>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-portals"><p className="t6p-kicker">Go to the source</p><h2 id="t6p-portals">Where to find more opportunities</h2><div className="t6p-grid">{model.sections.portals.map(item => <SupportCard key={item.portal_id} item={item} linkText="Open official portal"/>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-buyers"><p className="t6p-kicker">Public purchasing pathways</p><h2 id="t6p-buyers">Buyers to watch</h2><p>Inclusion means Samwise monitors an official buyer or portal pathway. It does not imply an Indigenous preference.</p><div className="t6p-buyer-grid">{model.sections.buyers.map(item => <article className="t6p-buyer-card" key={item.buyer_id}><span>{item.province}</span><h3>{item.name}</h3><p>{item.why_watch}</p><OfficialLink href={item.source_url}>Official procurement source</OfficialLink></article>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-buyer-intel"><p className="t6p-kicker">Practical buyer intelligence</p><h2 id="t6p-buyer-intel">Buyer pathways</h2><div className="t6p-grid">{model.sections.buyer_intelligence.map(item => <article className="t6p-card" key={item.name}><span className="t6p-mini-label">{item.jurisdiction}</span><h3>{item.name}</h3><p><strong>Categories to watch:</strong> {item.categories.join(", ")}</p><p><strong>Supplier pathway:</strong> {item.pathway}</p><p><strong>Indigenous procurement:</strong> {item.indigenous_signal}</p><OfficialLink href={item.source_url}>Official source</OfficialLink></article>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-categories"><p className="t6p-kicker">Current monitored sample</p><h2 id="t6p-categories">Common procurement categories</h2><div className="t6p-category-list">{model.sections.categories.map(item => <span key={item.category}>{item.label}<small>{item.history_status === "REPEATED_IN_CURRENT_SAMPLE" ? "Repeated in sample" : "Currently observed"}</small></span>)}</div><p className="t6p-muted">Longer-term recurring-category signals will appear only after the monitor accumulates enough source-backed history.</p></section>
    <section className="t6p-section" aria-labelledby="t6p-changes"><p className="t6p-kicker">Meaningful updates only</p><h2 id="t6p-changes">What changed</h2>{model.sections.recently_changed.length ? <ul className="t6p-change-list">{model.sections.recently_changed.map(item => <li key={item.event_id}><strong>{pretty(item.event_type)}</strong> — {item.title} · {formatDate(item.observed_at)} <OfficialLink href={item.source_url}>Check source</OfficialLink></li>)}</ul> : <p className="t6p-empty">No verified material change has been recorded since the monitor baseline. Cosmetic page changes are not shown.</p>}</section>
    <section className="t6p-section" aria-labelledby="t6p-supports"><p className="t6p-kicker">Prepare to compete</p><h2 id="t6p-supports">Supports for businesses</h2><div className="t6p-grid">{supports.map(item => <SupportCard key={item.support_id} item={item} linkText="Review official program"/>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-indigenous"><p className="t6p-kicker">Tender-specific confirmation required</p><h2 id="t6p-indigenous">Indigenous procurement</h2><div className="t6p-grid">{model.sections.indigenous_procurement.map(item => <SupportCard key={item.title} item={{ ...item, support_type: "INDIGENOUS_PROCUREMENT" }} linkText="Review official program"/>)}</div></section>
    <section className="t6p-section" aria-labelledby="t6p-method"><p className="t6p-kicker">Plain-language method</p><h2 id="t6p-method">How Samwise decides what is worth reviewing</h2><ol className="t6p-method-list">{model.assistant_method.map(item => <li key={item}>{item}</li>)}</ol><p className="t6p-muted">A public watch is not a qualification score, a bid recommendation or a prediction of an award.</p></section>
    <section className="t6p-context" aria-labelledby="t6p-context"><div><p className="t6p-kicker">Treaty 6 context</p><h2 id="t6p-context">Regional relevance, not an eligibility shortcut</h2><p>{model.sections.treaty6_context.summary}</p><p>{model.sections.treaty6_context.boundary_caveat}</p><div className="t6p-context-links">{model.sections.treaty6_context.references.map(item => <OfficialLink key={item.source_url} href={item.source_url}>{item.title}</OfficialLink>)}</div></div><div><p className="t6p-kicker">Who this may help</p><ul className="t6p-who-list">{model.who_this_may_help.map(item => <li key={item}>{item}</li>)}</ul></div></section>
    <aside className="t6p-accountability-boundary"><strong>Practical opportunities stay separate from accountability research.</strong><p>{model.accountability_boundary}</p></aside>
    <section className="t6p-feedback" aria-labelledby="t6p-feedback"><p className="t6p-kicker">Early beta</p><h2 id="t6p-feedback">{model.feedback.heading}</h2><p>{model.feedback.prompt}</p><p><strong>No form is collecting business or personal information in this beta.</strong></p></section>
    <footer className="mn-public-footer">Coverage is not comprehensive. Listings may change, and the official procurement source controls. Last beta projection: {formatDate(model.generated_at)}.</footer>
  </main>
}
