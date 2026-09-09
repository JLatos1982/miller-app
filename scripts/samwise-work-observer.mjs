import { readFileSync } from "node:fs"
import path from "node:path"

import { createWorkObserverStore } from "../server/samwiseWorkObserver.js"

const usage = `Usage: npm run samwise:work-observer -- <status|start|stop|recent|summary|cleanup|record> [options]
  start --project=miller-app --scopes=git,samwise_jobs --minutes=90 [--directories=ios/MillerNavigator]
  stop --session=<session_id>
  recent [--limit=25]
  summary --session=<session_id>
  record --input=<repo-relative-json-file>
All data stays in artifacts/samwise/runtime/work-observer; screenshots are disabled by default.`
const args = process.argv.slice(2)
const command = args.shift()
const option = name => { const item = args.find(value => value.startsWith(`--${name}=`)); return item ? item.slice(name.length + 3) : null }
const store = createWorkObserverStore(process.cwd())
const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

if (!command || command === "help" || command === "--help") process.stdout.write(`${usage}\n`)
else if (command === "status") print(store.status())
else if (command === "start") print(store.start({ project: option("project"), scopes: (option("scopes") || "").split(",").filter(Boolean), duration_minutes: option("minutes") ? Number(option("minutes")) : null, project_directories: (option("directories") || "").split(",").filter(Boolean) }))
else if (command === "stop") print(store.stop(option("session")))
else if (command === "recent") print(store.recent(option("limit")))
else if (command === "summary") print(store.summary(option("session")))
else if (command === "cleanup") print(store.cleanup())
else if (command === "record") {
  const relative = option("input")
  const root = path.resolve(process.cwd())
  const inputPath = path.resolve(root, relative || "")
  if (!relative || (inputPath !== root && !inputPath.startsWith(`${root}${path.sep}`))) throw new Error("samwise_work_observer_record_input_must_be_repo_relative")
  print(store.record(JSON.parse(readFileSync(inputPath, "utf8"))))
} else throw new Error(`samwise_work_observer_command_unknown:${command}`)
