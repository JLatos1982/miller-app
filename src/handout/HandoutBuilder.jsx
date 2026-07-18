import { downloadHandoutHtml } from "./handoutExport.js"
import { useEffect, useRef, useState } from "react"
import { TEMPORARY_CARD_NOTICE } from "./temporaryCard.js"
import { readLogoFile } from "./logoUpload.js"
import { MILLER_COPY } from "../interfaceCopy.js"

const FIELD_CONFIG = [
  ["title", "Handout heading", "text"],
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

const IDENTITY_FIELDS = [
  ["preparedBy", "Prepared by", "text"], ["organizationName", "Organization or team name", "text"],
  ["roleOrProgram", "Role or program", "text"], ["contactPhone", "Contact phone", "tel"],
  ["contactEmail", "Contact email", "email"], ["address", "Address (optional)", "text"],
  ["website", "Website (optional)", "url"], ["note", "Short identity or footer note", "textarea"],
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
  const isTemporary = resource.type === "temporary-resource"
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
    ["Service area", resource.serviceArea],
    ["Email", resource.email],
    ["Referral / intake", resource.referralProcess],
    ["Cost", resource.cost],
    ["Accessibility", resource.accessibility],
    ["Languages", resource.languages],
    ["Limitations", resource.limitations],
    ["Call before you go", resource.callBeforeNote],
    ["Population", resource.population],
  ].filter(([, value]) => value)

  return (
    <article className="handout-resource-card">
      <div className="handout-resource-heading">
        <div>
          <p className="handout-resource-number">Resource {index + 1}</p>
          <h3>{resource.name}</h3>
          {isTemporary ? <span className="temporary-resource-badge">Temporary · {resource.verificationStatus === "confirmed" ? "preparer confirmed" : "unverified"}</span> : null}
          {resource.organization ? <p>{resource.organization}</p> : null}
        </div>
        <div className="handout-resource-controls" aria-label={`Manage ${resource.name}`}>
          <button type="button" disabled={index === 0} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: -1 })} aria-label={`Move ${resource.name} up`}>↑</button>
          <button type="button" disabled={index === total - 1} onClick={() => dispatch({ type: "move_resource", key: resource.key, direction: 1 })} aria-label={`Move ${resource.name} down`}>↓</button>
          <button type="button" className="remove" onClick={() => dispatch({ type: "remove_resource", key: resource.key })}>Remove</button>
        </div>
      </div>

      {isTemporary ? (
        <details className="temporary-resource-editor handout-screen-only">
          <summary>Edit temporary resource details</summary>
          <div className="temporary-resource-edit-grid">
            {[
              ["name", "Resource name"], ["organization", "Organization"], ["category", "Category"], ["city", "City"],
              ["serviceArea", "Service area"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"],
              ["website", "Website"], ["hours", "Hours"], ["eligibility", "Eligibility"], ["referralProcess", "Referral / intake"],
              ["cost", "Cost"], ["accessibility", "Accessibility"], ["languages", "Languages"], ["limitations", "Limitations"],
              ["callBeforeNote", "Call-before note"],
            ].map(([field, label]) => <label key={field}><span>{label}</span><textarea rows="2" value={resource[field] || ""} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field, value: event.target.value })} /></label>)}
          </div>
          <div className="temporary-resource-options">
            <label><span>Verification status</span><select value={resource.verificationStatus} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field: "verificationStatus", value: event.target.value })}><option value="unconfirmed">Temporary / unverified</option><option value="confirmed">Confirmed by handout preparer</option></select></label>
            <label><input type="checkbox" checked={resource.showVerificationNote} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field: "showVerificationNote", value: event.target.checked })} /> Include general verification reminder</label>
          </div>
          <p className="temporary-source-detail"><strong>Original source:</strong> <a href={resource.sourceUrl} target="_blank" rel="noreferrer">{resource.sourceTitle || resource.sourceUrl}</a> · Retrieved {new Date(resource.sourceRetrievedAt).toLocaleDateString()} · {resource.aiAssisted ? "AI-assisted draft" : "Source-based draft"}</p>
        </details>
      ) : null}

      <div className="handout-resource-details">
        {details.map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
      </div>

      <label className="handout-resource-edit">
        <span>Handout description</span>
        <textarea rows="4" value={resource.handoutDescription} onChange={(event) => dispatch({ type: "update_resource", key: resource.key, field: "handoutDescription", value: event.target.value })} />
        <span className="handout-print-value">{resource.handoutDescription}</span>
      </label>
      {isTemporary && resource.showVerificationNote ? <p className="temporary-verification-note">{TEMPORARY_CARD_NOTICE}</p> : null}
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
  const logoInputRef = useRef(null)
  const [logoError, setLogoError] = useState("")

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function clearHandout() {
    if (window.confirm(MILLER_COPY.clearHandoutConfirm)) {
      dispatch({ type: "clear" })
    }
  }

  async function chooseLogo(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readLogoFile(file)
      dispatch({ type: "set_logo", dataUrl, name: file.name })
      setLogoError("")
    } catch (error) {
      setLogoError(error.message)
    } finally {
      event.target.value = ""
    }
  }

  const logo = handout.identity.logo

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
        {logo.dataUrl && logo.visible ? <div className={`handout-logo logo-${logo.size} align-${logo.alignment}`}><img src={logo.dataUrl} alt={handout.identity.organizationName ? `${handout.identity.organizationName} logo` : "Handout logo"} /></div> : null}
        {handout.identity.organizationName ? <p className="handout-identity-organization">{handout.identity.organizationName}</p> : null}
        <p className="handout-kicker">Personalized resource handout</p>
        <h1 ref={headingRef} tabIndex="-1">{handout.fields.title || "Resource Handout"}</h1>
        {handout.fields.subtitle ? <p className="handout-builder-subtitle">{handout.fields.subtitle}</p> : null}
        <div className="handout-identity-output">
          {handout.identity.preparedBy ? <span>Prepared by {handout.identity.preparedBy}</span> : null}
          {handout.identity.roleOrProgram ? <span>{handout.identity.roleOrProgram}</span> : null}
          {handout.identity.contactPhone ? <span>{handout.identity.contactPhone}</span> : null}
          {handout.identity.contactEmail ? <span>{handout.identity.contactEmail}</span> : null}
          {handout.identity.address ? <span>{handout.identity.address}</span> : null}
          {handout.identity.website ? <span>{handout.identity.website}</span> : null}
        </div>
        {handout.identity.note ? <p className="handout-identity-note">{handout.identity.note}</p> : null}
        {handout.identity.includeMillerAttribution ? <p className="handout-miller-attribution">Prepared using Miller.</p> : null}
        <p className="handout-privacy-note">{MILLER_COPY.handoutIntro} Identity details and logos stay in this browser session and are not saved to Miller.</p>
      </header>

      <section className="handout-identity-section handout-screen-only" aria-labelledby="handout-identity-heading">
        <div><p className="handout-kicker">Optional identity</p><h2 id="handout-identity-heading">Handout identity</h2><p>Use your own name, team, clinic, or organization—or leave every field blank.</p></div>
        <div className="handout-fields">
          {IDENTITY_FIELDS.map(([field, label, type]) => <EditableField key={field} field={`identity-${field}`} label={label} type={type} value={handout.identity[field]} onChange={(value) => dispatch({ type: "update_identity", field, value })} />)}
        </div>
        <div className="handout-logo-controls">
          <label className="handout-logo-upload"><span>Local logo (PNG, JPEG, or WebP; maximum 2 MB)</span><input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label>
          {logoError ? <p className="handout-logo-error" role="alert">{logoError}</p> : null}
          {logo.dataUrl ? <div className="handout-logo-options"><button type="button" onClick={() => dispatch({ type: "remove_logo" })}>Remove logo</button><label><input type="checkbox" checked={logo.visible} onChange={(event) => dispatch({ type: "update_logo_option", field: "visible", value: event.target.checked })} /> Show logo</label><label>Size<select value={logo.size} onChange={(event) => dispatch({ type: "update_logo_option", field: "size", value: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>Alignment<select value={logo.alignment} onChange={(event) => dispatch({ type: "update_logo_option", field: "alignment", value: event.target.value })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label></div> : null}
        </div>
        <label className="handout-attribution-option"><input type="checkbox" checked={handout.identity.includeMillerAttribution} onChange={(event) => dispatch({ type: "toggle_miller_attribution", value: event.target.checked })} /> Include Miller attribution</label>
        <p className="handout-privacy-note">Identity details and logos stay in this browser session and are not saved to Miller.</p>
      </section>

      <p className="handout-output-warning handout-screen-only">Printed or downloaded handouts may contain personal information. Handle them according to your workplace privacy practices.</p>

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
            <h3>{MILLER_COPY.emptyHandoutTitle}</h3>
            <p>{MILLER_COPY.emptyHandoutBody}</p>
            <button type="button" onClick={onBack}>Return to search</button>
          </div>
        )}
      </section>

      {handout.fields.footerNote ? <footer className="handout-print-footer">{handout.fields.footerNote}</footer> : null}
    </main>
  )
}
