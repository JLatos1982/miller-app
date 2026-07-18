import { downloadHandoutHtml } from "./handoutExport.js"
import { useEffect, useRef } from "react"

const FIELD_CONFIG = [
  ["title", "Handout title", "text"],
  ["subtitle", "Subtitle (optional)", "text"],
  ["personName", "Person or client name (optional)", "text"],
  ["date", "Date", "date"],
  ["location", "Location or community", "text"],
  ["generalNotes", "General notes", "textarea"],
  ["nextSteps", "Next steps or plan", "textarea"],
  ["followUp", "Follow-up information", "textarea"],
  ["staffContact", "Staff or program contact", "textarea"],
  ["footerNote", "Custom footer note", "textarea"],
]

function EditableField({ field, label, type, value, onChange }) {
  const id = `handout-${field}`
  return (
    <label className={`handout-field ${type === "textarea" ? "is-wide" : ""} ${value ? "" : "is-empty"}`} htmlFor={id}>
      <span>{label}</span>
      {type === "textarea" ? (
        <textarea id={id} rows="4" value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      <span className="handout-print-value">{value}</span>
    </label>
  )
}

function HandoutResourceCard({ resource, index, total, dispatch }) {
  const details = [
    ["Category", resource.category],
    ["Service type", resource.serviceType],
    ["City / area", resource.city || resource.region],
    ["Phone", [resource.phone, resource.altPhone].filter(Boolean).join(" / ")],
    ["Website", resource.website],
    ["Address", resource.address],
    ["Hours", resource.hours],
    ["Access", resource.accessType],
    ["Eligibility", resource.eligibility],
    ["Population", resource.population],
  ].filter(([, value]) => value)

  return (
    <article className="handout-resource-card">
      <div className="handout-resource-heading">
        <div>
          <p className="handout-resource-number">Resource {index + 1}</p>
          <h3>{resource.name}</h3>
          {resource.organization ? <p>{resource.organization}</p> : null}
        </div>
        <div className="handout-resource-controls" aria-label={`Manage ${resource.name}`}>
          <button type="button" disabled={index === 0} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: -1 })} aria-label={`Move ${resource.name} up`}>↑</button>
          <button type="button" disabled={index === total - 1} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: 1 })} aria-label={`Move ${resource.name} down`}>↓</button>
          <button type="button" className="remove" onClick={() => dispatch({ type: "remove_resource", key: resource.key })}>Remove</button>
        </div>
      </div>

      <div className="handout-resource-details">
        {details.map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
      </div>

      <label className="handout-resource-edit">
        <span>Handout description</span>
        <textarea rows="4" value={resource.handoutDescription} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field: "handoutDescription", value: event.target.value })} />
        <span className="handout-print-value">{resource.handoutDescription}</span>
      </label>
      {resource.handoutDescription !== resource.originalDescription ? (
        <button type="button" className="restore-description" onClick={() => dispatch({ type: "restore_description", key: resource.key })}>Restore original description</button>
      ) : null}

      <label className="handout-resource-edit">
        <span>Personal note for this resource (optional)</span>
        <textarea rows="3" value={resource.handoutNote} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field: "handoutNote", value: event.target.value })} />
        {resource.handoutNote ? <span className="handout-print-value handout-resource-note"><strong>Personal note:</strong> {resource.handoutNote}</span> : null}
      </label>
    </article>
  )
}

export default function HandoutBuilder({ handout, dispatch, onBack }) {
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function clearHandout() {
    if (window.confirm("Clear all handout fields and selected resources? This cannot be undone.")) {
      dispatch({ type: "clear" })
    }
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
        <p className="handout-kicker">Miller’s personalized resource handout</p>
        <h1 ref={headingRef} tabIndex="-1">{handout.fields.title || "Resource Handout"}</h1>
        {handout.fields.subtitle ? <p className="handout-builder-subtitle">{handout.fields.subtitle}</p> : null}
        <p className="handout-privacy-note">Personalized information stays in this browser session and is not saved to Miller.</p>
      </header>

      <section className="handout-fields" aria-label="Personalize handout">
        {FIELD_CONFIG.map(([field, label, type]) => (
          <EditableField key={field} field={field} label={label} type={type} value={handout.fields[field]} onChange={(value) => dispatch({ type: "update_field", field, value })} />
        ))}
      </section>

      <section className="handout-selected-resources" aria-labelledby="handout-resources-heading">
        <div className="handout-section-heading">
          <div>
            <p className="handout-kicker">Selected services</p>
            <h2 id="handout-resources-heading">Resources ({handout.resources.length})</h2>
          </div>
          <button type="button" className="handout-screen-only" onClick={onBack}>Add more resources</button>
        </div>

        {handout.resources.length ? handout.resources.map((resource, index) => (
          <HandoutResourceCard key={resource.key} resource={resource} index={index} total={handout.resources.length} dispatch={dispatch} />
        )) : (
          <div className="handout-empty">
            <h3>No resources selected yet</h3>
            <p>Return to Miller’s search results and choose “Add to handout” on the services you want to include.</p>
            <button type="button" onClick={onBack}>Find resources</button>
          </div>
        )}
      </section>

      {handout.fields.footerNote ? <footer className="handout-print-footer">{handout.fields.footerNote}</footer> : null}
    </main>
  )
}
