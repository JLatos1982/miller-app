import { useCallback, useEffect, useRef, useState } from "react"
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"

const TIMEOUT_MS = 20_000

function PdfPage({ document, pageNumber, scale, onError }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let cancelled = false, renderTask
    document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return
      const viewport = page.getViewport({ scale }), pixelRatio = Math.min(window.devicePixelRatio || 1, 2), canvas = canvasRef.current, context = canvas.getContext("2d", { alpha: false })
      if (!context) throw new Error("Canvas rendering is unavailable")
      canvas.width = Math.floor(viewport.width * pixelRatio); canvas.height = Math.floor(viewport.height * pixelRatio); canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`
      renderTask = page.render({ canvasContext: context, viewport, transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] }); return renderTask.promise
    }).catch(() => { if (!cancelled) onError() })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [document, onError, pageNumber, scale])
  return <figure className="pdf-viewer-page"><canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`}/><figcaption>Page {pageNumber}</figcaption></figure>
}

export default function PdfViewer({ sourceUrl, title }) {
  const [document, setDocument] = useState(null), [progress, setProgress] = useState(0), [error, setError] = useState(false), [scale, setScale] = useState(1.15)
  const containerRef = useRef(null)
  const handleRenderError = useCallback(() => setError(true), [])
  useEffect(() => {
    let cancelled = false, loadingTask
    const timeout = window.setTimeout(() => { if (!cancelled) setError(true); loadingTask?.destroy() }, TIMEOUT_MS)
    import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      if (cancelled) return
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      loadingTask = pdfjs.getDocument({ url: sourceUrl, disableRange: true, disableStream: true })
      loadingTask.onProgress = ({ loaded, total }) => { if (!cancelled && total) setProgress(Math.round((loaded / total) * 100)) }
      return loadingTask.promise
    }).then((loaded) => { if (!cancelled && loaded) { window.clearTimeout(timeout); setDocument(loaded); setError(false) } }).catch(() => { if (!cancelled) { window.clearTimeout(timeout); setError(true) } })
    return () => { cancelled = true; window.clearTimeout(timeout); loadingTask?.destroy() }
  }, [sourceUrl])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => { const available = entry.contentRect.width - 32; if (available > 0 && document) document.getPage(1).then((page) => { const width = page.getViewport({ scale: 1 }).width; setScale((current) => Math.min(current, available / width)) }) })
    observer.observe(containerRef.current); return () => observer.disconnect()
  }, [document])

  if (error) return <div className="pdf-viewer-error" role="alert"><strong>Preview unavailable in this browser.</strong><span>Open or download the complete PDF.</span></div>
  return <section className="pdf-viewer" ref={containerRef} aria-label={`PDF preview: ${title}`}><div className="pdf-viewer-controls"><strong>{document ? `${document.numPages} page${document.numPages === 1 ? "" : "s"}` : "Loading PDF preview…"}</strong><div><button type="button" onClick={() => setScale((value) => Math.max(.6, value - .15))} disabled={!document} aria-label="Zoom out">−</button><span>{Math.round(scale * 100)}%</span><button type="button" onClick={() => setScale((value) => Math.min(2.5, value + .15))} disabled={!document} aria-label="Zoom in">+</button></div></div>{!document ? <div className="pdf-viewer-loading" role="status"><progress max="100" value={progress || undefined}/><span>{progress ? `${progress}% loaded` : "Loading complete document…"}</span></div> : <div className="pdf-viewer-pages">{Array.from({ length: document.numPages }, (_, index) => <PdfPage document={document} pageNumber={index + 1} scale={scale} onError={handleRenderError} key={index + 1}/>)}</div>}</section>
}
