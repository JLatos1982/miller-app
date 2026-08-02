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
  handout = normalizeHandoutState(handout)
  const { fields, resources } = handout
  const documentTitle = "Personalized Community Resources"
  const resourceHtml = resources.map((resource) => {
    const website = safeHttpUrl(resource.website)
    return `<article class="resource">
      <h2>${escapeHtml(resource.name)}</h2>
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
    </article>`
  }).join("\n")

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>
body{max-width:8in;margin:0 auto;padding:32px;font:16px/1.5 Arial,sans-serif;color:#263b50;background:#fffdf7}header{border-bottom:3px solid #555;padding-bottom:18px;margin-bottom:24px}h1{margin:0;color:#263b50}h2{color:#315b62}.meta,.tags{display:flex;flex-wrap:wrap;gap:8px}.meta span,.tags span{padding:4px 9px;border-radius:999px;background:#edf4ec}.resource{break-inside:avoid;border:1px solid #cbd8d0;border-radius:16px;padding:18px;margin:16px 0;background:white}.organization{font-weight:bold;color:#587078}.details p{margin:5px 0}@media print{body{padding:0;background:white}.resource{box-shadow:none}}</style></head>
<body><header><h1>${escapeHtml(documentTitle)}</h1><p>Prepared using Miller.</p>${fields.personName ? `<div class="meta"><span>${escapeHtml(fields.personName)}</span></div>` : ""}</header>
${section("Notes / suggestions", fields.generalNotes)}
<main>${resourceHtml || "<p>No resources selected.</p>"}</main></body></html>`
}

export function downloadHandoutHtml(handout, documentRef = document, urlApi = URL) {
  handout = normalizeHandoutState(handout)
  const html = generateHandoutHtml(handout)
  const blobUrl = urlApi.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
  const link = documentRef.createElement("a")
  link.href = blobUrl
  link.download = sanitizeHandoutFilename("Personalized Community Resources")
  link.click()
  urlApi.revokeObjectURL(blobUrl)
}
import { normalizeHandoutState } from "./handoutState.js"
