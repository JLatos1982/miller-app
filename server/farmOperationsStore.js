import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const parse = (path, fallback) => { try { return JSON.parse(readFileSync(path, "utf8")) } catch { return fallback } }

export function createFarmOperationsStore(root, { now = () => new Date(), lockTtlMs = 30 * 60 * 1000 } = {}) {
  const directory = resolve(root, ".farm-operations")
  const statePath = resolve(directory, "farm-job-state-v1.json")
  const historyPath = resolve(directory, "farm-job-run-history-v1.ndjson")
  const cyclePath = resolve(directory, "farm-last-cycle-v1.json")
  const inventoryPath = resolve(directory, "farm-listener-inventory-v1.json")
  const lockPath = resolve(directory, ".farm-operations.lock")
  mkdirSync(directory, { recursive: true })

  const atomicJson = (path, value) => {
    const temporary = `${path}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, path)
  }

  return {
    paths: { directory, statePath, historyPath, cyclePath, inventoryPath, lockPath },
    acquire() {
      try {
        mkdirSync(lockPath)
        writeFileSync(resolve(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, acquired_at: now().toISOString() }), { mode: 0o600 })
        return { acquired: true }
      } catch {
        let stale = false
        try { stale = now().getTime() - statSync(lockPath).mtimeMs > lockTtlMs } catch { stale = false }
        if (stale) {
          try { rmSync(lockPath, { recursive: true }) } catch { return { acquired: false, reason: "stale_lock_cleanup_failed" } }
          mkdirSync(lockPath)
          writeFileSync(resolve(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, acquired_at: now().toISOString(), stale_lock_recovered: true }), { mode: 0o600 })
          return { acquired: true, stale_lock_recovered: true }
        }
        return { acquired: false, reason: "already_running" }
      }
    },
    release() { try { rmSync(lockPath, { recursive: true }); return true } catch { return false } },
    loadState() { return parse(statePath, { schema_version: "farm-job-state-v1", jobs: {} }) },
    loadHistory() {
      try { return readFileSync(historyPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] }
    },
    saveState(value) { atomicJson(statePath, value) },
    saveCycle(value) { atomicJson(cyclePath, value) },
    saveInventory(value) { atomicJson(inventoryPath, { schema_version: "farm-listener-inventory-v1", generated_at: now().toISOString(), listeners: value }) },
    appendRuns(runs = []) {
      if (!runs.length) return
      mkdirSync(dirname(historyPath), { recursive: true })
      appendFileSync(historyPath, runs.map(run => JSON.stringify(run)).join("\n") + "\n", { mode: 0o600 })
    },
  }
}
