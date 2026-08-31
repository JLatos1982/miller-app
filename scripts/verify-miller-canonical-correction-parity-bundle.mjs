import { verifyCanonicalCorrectionParityBundle } from "../server/canonicalCorrectionParityBundle.js"

const bundlePath = process.argv[2]
if (!bundlePath) throw new Error("usage: node scripts/verify-miller-canonical-correction-parity-bundle.mjs BUNDLE_PATH [EXPECTED_MANIFEST_SHA256]")
console.log(JSON.stringify(verifyCanonicalCorrectionParityBundle({ bundlePath, expectedManifestSha256: process.argv[3] || null })))
