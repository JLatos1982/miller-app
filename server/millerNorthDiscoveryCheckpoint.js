import { createHash } from "node:crypto"
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs"
export const queryId = (province, query, version = "v1") => createHash("sha256").update(`${version}\u001f${province}\u001f${query.trim().toLowerCase().replace(/\s+/g," ")}`).digest("hex").slice(0,24)
export function loadManifest(path) { try { return JSON.parse(readFileSync(path,"utf8")) } catch { return { version:"miller-north-discovery-checkpoint-v1", queries:{}, sources:{} } } }
export function saveManifest(path, manifest) {
  const tmp=`${path}.${process.pid}.tmp`, fd = openSync(tmp, "w")
  try { writeSync(fd, `${JSON.stringify(manifest,null,2)}\n`); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(tmp,path)
}
export function acquireManifestLock(path) {
  const lockPath = `${path}.lock`
  try {
    const fd = openSync(lockPath, "wx")
    try { writeSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })); fsyncSync(fd) } finally { closeSync(fd) }
    return lockPath
  } catch (error) {
    if (error?.code !== "EEXIST") throw error
    let holder = null
    try { holder = JSON.parse(readFileSync(lockPath, "utf8")) } catch { /* stale malformed lock is safely replaced */ }
    try {
      if (holder?.pid) process.kill(holder.pid, 0)
      throw new Error("miller_north_manifest_lock_held")
    } catch (lockError) {
      if (lockError?.message === "miller_north_manifest_lock_held") throw lockError
      if (existsSync(lockPath)) unlinkSync(lockPath)
      return acquireManifestLock(path)
    }
  }
}
export function releaseManifestLock(lockPath) { if (lockPath && existsSync(lockPath)) unlinkSync(lockPath) }
export function startQuery(manifest, province, query, version = manifest.version === "miller-north-discovery-checkpoint-v2" ? manifest.version : "v1") {
  const id=queryId(province,query,version), previous=manifest.queries[id]
  if (["terminal","sources_assessed","search_complete"].includes(previous?.status)) return { id, reused:true }
  manifest.queries[id]={ ...(previous||{}), query_id:id, province, query, status:"in_progress", started_at:new Date().toISOString() }
  return {id,reused:false}
}
export function saveSearch(manifest,id,results) { manifest.queries[id]={...manifest.queries[id],status:"search_complete",completed_at:new Date().toISOString(),results:results.map(x=>({title:x.title||"",url:x.url||"",content:x.content||""}))} }
export function finishQuery(manifest,id,assessments=[]) { manifest.queries[id]={...manifest.queries[id],status:"terminal",assessments} }
