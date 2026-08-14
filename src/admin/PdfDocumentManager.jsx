import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { adminFetch, getVerifiedAdminSession } from "../adminApi.js"

function formatBytes(value) { return value ? `${(Number(value) / 1024 / 1024).toFixed(2)} MB` : "Unknown size" }
const PdfViewer = lazy(() => import("../lists/PdfViewer.jsx"))

async function uploadWithProgress({ url, method = "POST", file, headers, onProgress }) {
  const session = await getVerifiedAdminSession()
  if (!session?.access_token) throw new Error("Administrator session expired.")
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open(method, url); request.responseType = "json"
    request.setRequestHeader("Authorization", `Bearer ${session.access_token}`); request.setRequestHeader("Content-Type", "application/pdf")
    for (const [name, value] of Object.entries(headers || {})) request.setRequestHeader(name, encodeURIComponent(value || ""))
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300, body: request.response || {} })
    request.onerror = () => reject(new Error("The upload connection failed.")); request.send(file)
  })
}

export default function PdfDocumentManager() {
  const [documents, setDocuments] = useState([]), [selected, setSelected] = useState(null), [previewUrl, setPreviewUrl] = useState("")
  const [status, setStatus] = useState(""), [progress, setProgress] = useState(null)
  const load = useCallback(async () => { const response = await adminFetch("/api/admin/curated-lists"); const body = await response.json().catch(() => ({})); if (!response.ok) return setStatus(body.error || "PDF documents could not be loaded."); setDocuments((body.items || []).filter((item) => item.content_type === "pdf_document")) }, [])
  useEffect(() => { load() }, [load]); useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function createDocument(event) {
    event.preventDefault(); const form = event.currentTarget, file = form.elements.pdf.files?.[0]; if (!file) return
    setProgress(0); setStatus("Uploading PDF privately…")
    try { const result = await uploadWithProgress({ url: "/api/admin/curated-list-documents", file, onProgress: setProgress, headers: { "X-File-Name": file.name, "X-List-Title": form.elements.title.value, "X-List-Slug": form.elements.slug.value, "X-List-Description": form.elements.description.value, "X-List-Category": form.elements.category.value, "X-Last-Reviewed-Date": form.elements.lastReviewed.value, "X-Download-File-Name": form.elements.downloadFilename.value || file.name } }); setStatus(result.body.message || result.body.error || "Upload completed."); if (result.ok) { form.reset(); await load() } }
    catch (error) { setStatus(error.message) } finally { setProgress(null) }
  }

  async function openDocument(item) {
    setStatus("Loading private PDF preview…"); const [detailResponse, pdfResponse] = await Promise.all([adminFetch(`/api/admin/curated-lists/${item.id}`), adminFetch(`/api/admin/curated-list-documents/${item.id}/pdf`)]); const detail = await detailResponse.json().catch(() => ({}))
    if (!detailResponse.ok || !pdfResponse.ok) return setStatus(detail.error || "PDF preview could not be loaded.")
    if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(URL.createObjectURL(await pdfResponse.blob())); setSelected(detail); setStatus("")
  }

  async function replacePdf(event) {
    const file = event.target.files?.[0]; if (!file || !selected) return; setProgress(0); setStatus("Uploading replacement privately…")
    try { const result = await uploadWithProgress({ url: `/api/admin/curated-list-documents/${selected.list.id}/pdf`, method: "PUT", file, onProgress: setProgress, headers: { "X-File-Name": file.name, "X-Download-File-Name": selected.list.public_download_filename } }); setStatus(result.body.error || "PDF replaced; the slug and prior revision were preserved."); if (result.ok) { await load(); await openDocument(selected.list) } }
    catch (error) { setStatus(error.message) } finally { setProgress(null); event.target.value = "" }
  }

  async function act(action) {
    if ((action === "publish" || action === "archive") && !window.confirm(`${action === "publish" ? "Publish" : "Archive"} “${selected.list.title}”?`)) return
    const response = await adminFetch(`/api/admin/curated-lists/${selected.list.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, confirmed_publication: action === "publish" }) }); const body = await response.json().catch(() => ({})); setStatus(body.error || `Document is now ${body.outcome}.`); if (response.ok) { await load(); await openDocument(body.list) }
  }

  if (selected) return <section className="pdf-admin-panel"><button type="button" onClick={() => { setSelected(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl("") }}>← PDF documents</button><h3>{selected.list.title}</h3><p><strong>Status:</strong> {selected.list.status} · {selected.list.pdf_page_count} page · {formatBytes(selected.list.pdf_file_size_bytes)}</p><div className="pdf-admin-actions"><a href={previewUrl} target="_blank" rel="noreferrer">Open PDF</a><label className="button-like">Replace PDF<input type="file" accept="application/pdf,.pdf" onChange={replacePdf}/></label>{selected.list.status === "published" ? <button onClick={() => act("unpublish")}>Unpublish</button> : <button onClick={() => act("publish")}>Publish</button>}<button onClick={() => act("archive")}>Archive</button></div>{progress !== null ? <progress max="100" value={progress}>{progress}%</progress> : null}<p role="status">{status}</p>{previewUrl ? <Suspense fallback={<div className="pdf-viewer-loading" role="status">Loading PDF preview…</div>}><PdfViewer sourceUrl={previewUrl} title={`Preview ${selected.list.title}`}/></Suspense> : null}<details><summary>Revision history ({selected.revisions?.length || 0})</summary><ul>{selected.revisions?.map((revision) => <li key={revision.id}>{revision.original_filename} · {formatBytes(revision.file_size_bytes)} · {new Date(revision.uploaded_at).toLocaleString()}</li>)}</ul></details></section>

  return <section className="pdf-admin-panel"><details><summary><strong>Add PDF document</strong></summary><form className="pdf-document-form" onSubmit={createDocument}><label>Complete PDF<input name="pdf" type="file" accept="application/pdf,.pdf" required/></label><label>Title<input name="title" required maxLength="160"/></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"/></label><label>Description<textarea name="description" required maxLength="500"/></label><label>Category<input name="category" defaultValue="Recovery and substance use" maxLength="120"/></label><label>Last reviewed<input name="lastReviewed" type="date"/></label><label>Public download filename<input name="downloadFilename" placeholder="printable-guide.pdf"/></label><button type="submit">Upload as draft</button>{progress !== null ? <progress max="100" value={progress}>{progress}%</progress> : null}</form></details><p role="status">{status}</p><div className="premade-list-grid">{documents.map((item) => <article className="premade-list-card" key={item.id}><p className="eyebrow">Printable PDF</p><h3>{item.title}</h3><p>Status: {item.status} · {item.pdf_page_count} page · {formatBytes(item.pdf_file_size_bytes)}</p><button onClick={() => openDocument(item)}>Manage PDF</button></article>)}</div></section>
}
