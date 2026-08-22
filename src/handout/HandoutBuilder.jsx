import { useEffect, useRef } from "react"
import { downloadHandoutHtml } from "./handoutExport.js"
import { normalizeHandoutState } from "./handoutState.js"
import { MILLER_COPY } from "../interfaceCopy.js"

function EditableField({ field, label, type = "text", value, onChange }) {
  const id = `handout-${field}`
  return (
    <label className={`handout-field ${type === "textarea" ? "is-wide" : ""} ${value ? "" : "is-empty"}`} htmlFor={id}>
      <span>{label}</span>
      {type === "textarea" ? (
        <textarea id={id} rows="3" value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {value ? <span className="handout-print-value">{value}</span> : null}
    </label>
  )
}

function HandoutResourceCard({ resource, index, total, dispatch }) {
  const details = [
    ["Category", resource.category], ["Service type", resource.serviceType],
    ["City / area", resource.city || resource.region], ["Phone", [resource.phone, resource.altPhone].filter(Boolean).join(" / ")],
    ["Website", resource.website], ["Address", resource.address], ["Hours", resource.hours],
    ["Access", resource.accessType], ["Eligibility", resource.eligibility], ["Population", resource.population],
  ].filter(([, value]) => value)

  return (
    <article className="handout-resource-card">
      <div className="handout-resource-heading">
        <div><p className="handout-resource-number">Resource {index + 1}</p><h3>{resource.name || "Unnamed Resource"}</h3>{resource.organization ? <p>{resource.organization}</p> : null}</div>
        <div className="handout-resource-controls" aria-label={`Manage ${resource.name || "resource"}`}>
          <button type="button" disabled={index === 0} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: -1 })} aria-label={`Move ${resource.name || "resource"} up`}>↑</button>
          <button type="button" disabled={index === total - 1} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: 1 })} aria-label={`Move ${resource.name || "resource"} down`}>↓</button>
          <button type="button" className="remove" onClick={() => dispatch({ type: "remove_resource", key: resource.key })}>Remove</button>
        </div>
      </div>
      {resource.handoutDescription ? <p className="resource-description">{resource.handoutDescription}</p> : null}
      <div className="handout-resource-details">{details.map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}</div>
    </article>
  )
}

export default function HandoutBuilder({ handout: rawHandout, dispatch, onBack }) {
  const headingRef = useRef(null)
  const handout = normalizeHandoutState(rawHandout)

  useEffect(() => { headingRef.current?.focus() }, [])

  function clearHandout() {
    if (window.confirm(MILLER_COPY.clearHandoutConfirm)) dispatch({ type: "clear" })
  }

  return (
    <main className="handout-builder">
      <div className="handout-builder-toolbar handout-screen-only">
        <button type="button" onClick={onBack}>← Back to resources</button>
        <div className="handout-export-actions">
          <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
          <button type="button" onClick={() => downloadHandoutHtml(handout)}>Download HTML</button>
          <button type="button" className="danger" onClick={clearHandout}>Clear handout</button>
        </div>
      </div>

      <header className="handout-builder-header">
        <p className="handout-kicker">Resource handout</p>
        <h1 ref={headingRef} tabIndex="-1">Personalized Community Resources</h1>
        <p className="handout-miller-attribution">Prepared from the resource finder.</p>
        <p className="handout-privacy-note">{MILLER_COPY.handoutIntro} Handout details stay in this browser session and are not saved to this service.</p>
      </header>

      <p className="handout-output-warning handout-screen-only">Printed or downloaded handouts may contain personal information. Handle them according to your workplace privacy practices.</p>

      <section className="handout-fields handout-simple-fields" aria-label="Personalize handout">
        <EditableField field="personName" label="Client name (optional)" value={handout.fields.personName} onChange={(value) => dispatch({ type: "update_field", field: "personName", value })} />
        <EditableField field="generalNotes" label="Notes / suggestions (optional)" type="textarea" value={handout.fields.generalNotes} onChange={(value) => dispatch({ type: "update_field", field: "generalNotes", value })} />
      </section>

      <section className="handout-selected-resources" aria-labelledby="handout-resources-heading">
        <div className="handout-section-heading"><div><p className="handout-kicker">Selected services</p><h2 id="handout-resources-heading">Approved resources ({handout.resources.length})</h2></div><button type="button" className="handout-screen-only" onClick={onBack}>Add more resources</button></div>
        {handout.resources.length ? handout.resources.map((resource, index) => <HandoutResourceCard key={resource.key || index} resource={resource} index={index} total={handout.resources.length} dispatch={dispatch} />) : (
          <div className="handout-empty"><h3>{MILLER_COPY.emptyHandoutTitle}</h3><p>{MILLER_COPY.emptyHandoutBody}</p><button type="button" onClick={onBack}>Return to search</button></div>
        )}
      </section>
    </main>
  )
}
