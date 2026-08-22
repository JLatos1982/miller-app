import { useEffect, useRef, useState } from "react"
import { formatAttachmentSize, validateResourceAttachmentSelection } from "./resourceAttachmentSelection.js"

export default function ResourceAttachmentPicker({ files, onFilesChange, disabled = false, resetKey = 0, onValidationMessage }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = ""
  }, [resetKey])

  function addFiles(incoming) {
    const next = [...files, ...Array.from(incoming || [])]
    const error = validateResourceAttachmentSelection(next)
    if (error) return onValidationMessage(error)
    onValidationMessage("")
    onFilesChange(next)
  }

  function removeFile(index) {
    onValidationMessage("")
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))
  }

  return <fieldset className="resource-attachment-picker" disabled={disabled}>
    <legend>Attach resource documents <span>(optional)</span></legend>
    <p id="resource-attachment-help" className="resource-attachment-help">You can attach up to 2 PDF, JPG, PNG, or TXT files, up to 5 MB each.</p>
    <p id="resource-attachment-privacy" className="resource-attachment-privacy">Please don't upload medical records, identification, or other confidential personal information.</p>
    <div
      className={`resource-attachment-dropzone ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (!disabled) addFiles(event.dataTransfer.files) }}
    >
      <p>Drop resource files here</p>
      <label className="resource-attachment-choose" htmlFor="resource-attachment-input">or choose files</label>
      <input
        ref={inputRef}
        id="resource-attachment-input"
        className="resource-attachment-input"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
        multiple
        aria-describedby="resource-attachment-help resource-attachment-privacy"
        onChange={(event) => addFiles(event.target.files)}
      />
    </div>
    {files.length ? <ul className="resource-attachment-list" aria-label="Selected resource documents">
      {files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`}><span>{file.name} <small>{formatAttachmentSize(file.size)}</small></span><button type="button" onClick={() => removeFile(index)} disabled={disabled} aria-label={`Remove ${file.name}`}>Remove</button></li>)}
    </ul> : null}
  </fieldset>
}
