import { orientMaintenanceCycle, reflectMaintenanceCycle } from "./maintenanceCycle.js"
import { staleCycleNeed, recoverStaleMaintenanceCycle } from "./maintenanceHealing.js"
export const MAX_TIER1_HEALING_ACTIONS_PER_CYCLE = 1
export async function runMaintenanceCycle({ mode="observe", store, persistence, snapshot=async()=>({}), findStaleCycle=async()=>null, now=()=>Date.now() }={}) {
 if(!["observe","maintain","preview_growth"].includes(mode)) throw new Error("maintenance_mode_denied")
 const started=await store.start(mode); if(started.already_running)return {status:"already_running",cycle:started.cycle}; const cycle=started.cycle
 try { const orientation=orientMaintenanceCycle(await snapshot()), outcomes=[]
  if(mode==="maintain"){const target=await findStaleCycle(),need=staleCycleNeed(target,now());if(need){const result=await recoverStaleMaintenanceCycle({store,cycle:target,now:now()}),outcome={cycle_id:cycle.id,need_key:need.id,action_id:need.action_id,domain:"operations",target_type:"maintenance_cycle",target_key:target.id,before:result.before,expected:need.expected,after:result.after,verified:result.verified,classification:result.classification};const saved=await persistence.recordOutcome(outcome);await persistence.updateLesson({...outcome,verification:saved.verification});outcomes.push(outcome)}}
  const reflection=reflectMaintenanceCycle({orientation,outcomes:outcomes.map((item)=>({operation_id:item.action_id,verification:item.verified?"passed":"failed"}))}),final=await store.finish(cycle,{status:outcomes.some((item)=>!item.verified)?"degraded":"completed",completeness:"complete",phase:"idle",needs_discovered:orientation.needs.length,work_attempted:outcomes.length,work_improved:outcomes.filter((item)=>item.classification==="resolved").length,work_failed:outcomes.filter((item)=>!item.verified).length,healing_attempted:outcomes.length,summary:{reflection}});return {status:final.status,cycle:final,orientation,outcomes,reflection}
 } catch(error){await store.fail(cycle,{phase:"idle",summary:{failure_code:"maintenance_cycle_failed"}});throw error}
}
