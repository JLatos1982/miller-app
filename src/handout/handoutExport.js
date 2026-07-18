function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""))
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function safeLogoDataUrl(value) {
  const dataUrl = String(value || "")
  return dataUrl.length <= 3_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(dataUrl) ? dataUrl : ""
}

export function sanitizeHandoutFilename(value) {
  const clean = String(value || "Resource Handout")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80)
  return `${clean || "resource-handout"}.html`.toLowerCase()
}

function detail(label, value) {
  return value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>` : ""
}

function section(title, value) {
  return value ? `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(value).replaceAll("\n", "<br>")}</p></section>` : ""
}

export function generateHandoutHtml(handout) {
  const { fields, resources } = handout
  const identity = handout.identity || {}
  const logo = identity.logo || {}
  const logoDataUrl = logo.visible ? safeLogoDataUrl(logo.dataUrl) : ""
  const logoAlignment = ["left", "center", "right"].includes(logo.alignment) ? logo.alignment : "left"
  const logoSize = ["small", "medium", "large"].includes(logo.size) ? logo.size : "medium"
  const documentTitle = fields.title || identity.organizationName || "Resource Handout"
  const identityItems = [
    identity.preparedBy ? `Prepared by ${identity.preparedBy}` : "", identity.roleOrProgram,
    identity.contactPhone, identity.contactEmail, identity.address,
  ].filter(Boolean)
  const identityWebsite = safeHttpUrl(identity.website)
  const resourceHtml = resources.map((resource) => {
    const website = safeHttpUrl(resource.website)
    const isTemporary = resource.type === "temporary-resource"
    return `<article class="resource">
      <h2>${escapeHtml(resource.name)}</h2>
      ${isTemporary ? `<p class="temporary-badge">Temporary resource · ${resource.verificationStatus === "confirmed" ? "confirmed by handout preparer" : "unverified"}</p>` : ""}
      ${resource.organization ? `<p class="organization">${escapeHtml(resource.organization)}</p>` : ""}
      <div class="tags">${[resource.category, resource.serviceType, resource.city || resource.region].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${resource.handoutDescription ? `<p>${escapeHtml(resource.handoutDescription).replaceAll("\n", "<br>")}</p>` : ""}
      ${resource.handoutNote ? `<p class="note"><strong>Personal note:</strong> ${escapeHtml(resource.handoutNote).replaceAll("\n", "<br>")}</p>` : ""}
      <div class="details">
        ${detail("Phone", [resource.phone, resource.altPhone].filter(Boolean).join(" / "))}
        ${detail("Address", resource.address)}
        ${detail("Hours", resource.hours)}
        ${detail("Access", resource.accessType)}
        ${detail("Eligibility", resource.eligibility)}
        ${detail("Population", resource.population)}
        ${detail("Service area", resource.serviceArea)}
        ${detail("Email", resource.email)}
        ${detail("Referral / intake", resource.referralProcess)}
        ${detail("Cost", resource.cost)}
        ${detail("Accessibility", resource.accessibility)}
        ${detail("Languages", resource.languages)}
        ${detail("Limitations", resource.limitations)}
        ${detail("Call before you go", resource.callBeforeNote)}
        ${website ? `<p><strong>Website:</strong> <a href="${escapeHtml(website)}">${escapeHtml(website)}</a></p>` : detail("Website", resource.website)}
      </div>
      ${isTemporary && resource.showVerificationNote ? `<p class="verification">Please confirm hours, eligibility, and availability before attending.</p>` : ""}
    </article>`
  }).join("\n")

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>
body{max-width:8in;margin:0 auto;padding:32px;font:16px/1.5 Arial,sans-serif;color:#263b50;background:#fffdf7}header{border-bottom:3px solid #555;padding-bottom:18px;margin-bottom:24px}h1{margin:0;color:#263b50}h2{color:#315b62}.logo{display:flex;margin-bottom:12px}.logo.left{justify-content:flex-start}.logo.center{justify-content:center}.logo.right{justify-content:flex-end}.logo img{display:block;max-width:100%;height:auto;object-fit:contain}.logo.small img{max-height:48px}.logo.medium img{max-height:80px}.logo.large img{max-height:120px}.identity-org{font-size:1.2rem;font-weight:bold}.meta,.tags,.identity{display:flex;flex-wrap:wrap;gap:8px}.meta span,.tags span,.identity span{padding:4px 9px;border-radius:999px;background:#edf4ec}.identity-note{white-space:pre-wrap}.resource{break-inside:avoid;border:1px solid #cbd8d0;border-radius:16px;padding:18px;margin:16px 0;background:white}.organization{font-weight:bold;color:#587078}.details p{margin:5px 0}.note{padding:10px;background:#fff1f5;border-left:4px solid #a62f62}.temporary-badge{display:inline-block;padding:4px 9px;border-radius:999px;background:#fff1d6;color:#704b00;font-weight:bold}.verification{padding:9px;background:#fff8e7;border-left:4px solid #b57a00}footer{margin-top:24px;border-top:1px solid #aaa;padding-top:14px}@media print{body{padding:0;background:white}.resource{box-shadow:none}}</style></head>
<body><header>${logoDataUrl ? `<div class="logo ${logoAlignment} ${logoSize}"><img src="${logoDataUrl}" alt="${escapeHtml(identity.organizationName ? `${identity.organizationName} logo` : "Handout logo")}"></div>` : ""}${identity.organizationName ? `<p class="identity-org">${escapeHtml(identity.organizationName)}</p>` : ""}<h1>${escapeHtml(documentTitle)}</h1>${fields.subtitle ? `<p>${escapeHtml(fields.subtitle)}</p>` : ""}${identityItems.length ? `<div class="identity">${identityItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}${identityWebsite ? `<p><a href="${escapeHtml(identityWebsite)}">${escapeHtml(identityWebsite)}</a></p>` : identity.website ? `<p>${escapeHtml(identity.website)}</p>` : ""}${identity.note ? `<p class="identity-note">${escapeHtml(identity.note)}</p>` : ""}${identity.includeMillerAttribution ? `<p>Prepared using Miller.</p>` : ""}<div class="meta">${[fields.personName, fields.date, fields.location].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></header>
${section("Notes", fields.generalNotes)}${section("Next steps", fields.nextSteps)}${section("Follow-up", fields.followUp)}${section("Staff or program contact", fields.staffContact)}
<main>${resourceHtml || "<p>No resources selected.</p>"}</main>${fields.footerNote ? `<footer>${escapeHtml(fields.footerNote).replaceAll("\n", "<br>")}</footer>` : ""}</body></html>`
}

export function downloadHandoutHtml(handout, documentRef = document, urlApi = URL) {
  const html = generateHandoutHtml(handout)
  const blobUrl = urlApi.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
  const link = documentRef.createElement("a")
  link.href = blobUrl
  link.download = sanitizeHandoutFilename(handout.fields.title || handout.identity?.organizationName)
  link.click()
  urlApi.revokeObjectURL(blobUrl)
}
