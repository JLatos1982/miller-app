export const MILLER_THEME_NAMES = Object.freeze([
  "Classic",
  "Jade",
  "Violet",
  "Rose",
  "North",
])

export const MILLER_THEME_NAME_STORAGE_KEY = "miller-theme-name"
export const MILLER_THEME_LEGACY_INDEX_STORAGE_KEY = "miller-theme-index"

const LEGACY_INDEX_TO_THEME_NAME = Object.freeze([
  "Classic",
  "Jade",
  "Classic", // Gold was retired; preserve a usable, neutral fallback.
  "Violet",
  "Rose",
  "North",
])

export function normalizeMillerThemeName(value) {
  return MILLER_THEME_NAMES.includes(value) ? value : "Classic"
}

export function resolveMillerThemeIndex({ savedName, legacyIndex, randomIndex = 0 } = {}) {
  if (typeof savedName === "string") {
    return MILLER_THEME_NAMES.indexOf(normalizeMillerThemeName(savedName))
  }

  const parsedLegacyIndex = Number(legacyIndex)
  if (Number.isInteger(parsedLegacyIndex)) {
    const legacyName = LEGACY_INDEX_TO_THEME_NAME[parsedLegacyIndex]
    return MILLER_THEME_NAMES.indexOf(normalizeMillerThemeName(legacyName))
  }

  const safeRandomIndex = Number.isInteger(randomIndex) ? randomIndex : 0
  return Math.max(0, Math.min(MILLER_THEME_NAMES.length - 1, safeRandomIndex))
}
