import { spawnSync } from "node:child_process"

// This is the public release contract. Each file validates deployed Miller or
// Treaty 6 behavior without requiring owner-only research artifacts, local
// services, or Samwise automation state.
const productionTests = [
  "test/publicCounselling.test.js",
  "test/companionScene.test.js",
  "test/millerHandoutCleanup.test.js",
  "test/millerMobileApi.test.js",
  "test/millerProfessionalWorkflow.test.js",
  "test/sharedResourceRegistry.test.js",
  "test/masterList.test.js",
  "test/treaty6ProcurementBeta.test.js",
  "test/treaty6ProcurementChangeMonitor.test.js",
]

const result = spawnSync(process.execPath, ["--test", ...productionTests], {
  stdio: "inherit",
})

process.exit(result.status ?? 1)
