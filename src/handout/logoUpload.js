export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]

export function validateLogoFile(file) {
  if (!file || !LOGO_TYPES.includes(file.type)) return "Choose a PNG, JPEG, or WebP image."
  if (file.size > LOGO_MAX_BYTES) return "Choose an image smaller than 2 MB."
  return ""
}

export function safeLogoDataUrl(value) {
  const dataUrl = String(value || "")
  if (dataUrl.length > 3_000_000) return ""
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(dataUrl) ? dataUrl : ""
}

export function readLogoFile(file, FileReaderClass = FileReader) {
  const error = validateLogoFile(file)
  if (error) return Promise.reject(new Error(error))
  return new Promise((resolve, reject) => {
    const reader = new FileReaderClass()
    reader.onerror = () => reject(new Error("The logo could not be read."))
    reader.onload = () => {
      const dataUrl = safeLogoDataUrl(reader.result)
      if (!dataUrl) reject(new Error("The selected image is not a valid PNG, JPEG, or WebP file."))
      else resolve(dataUrl)
    }
    reader.readAsDataURL(file)
  })
}
