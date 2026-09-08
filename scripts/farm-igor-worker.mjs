import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { handleFarmIgorEnvelope } from "../server/farmIgorWorker.js"

const root = process.env.FARM_IGOR_ROOT ? resolve(process.env.FARM_IGOR_ROOT) : resolve(fileURLToPath(new URL("..", import.meta.url)))
const credentialPath = process.env.FARM_IGOR_CREDENTIAL_PATH
if (!credentialPath) { console.error("igor_credential_path_missing"); process.exit(2) }

let input = ""
for await (const chunk of process.stdin) input += chunk

try {
  const request = JSON.parse(input)
  const credential = JSON.parse(readFileSync(credentialPath, "utf8"))
  const response = await handleFarmIgorEnvelope({ request, credential, root })
  process.stdout.write(JSON.stringify(response))
} catch (error) {
  console.error(String(error?.message || error).replace(/[^a-z0-9_-]/gi, "_").slice(0, 160))
  process.exit(1)
}
