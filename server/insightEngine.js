import { createHash } from "node:crypto"
export const INSIGHT_LIMITS = Object.freeze({ perCycle: 3, active: 12, schemaVersion: "insight-v1" })
const hash = (parts) => createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex")
const safe = (value) => JSON.stringify(value).replace(/"(?:raw_?query|query_text|session_?id|user_?id|ip_?address|device(?:_id)?|email|phone|counselling)"\s*:/ig, "\"forbidden\":")
export function buildInsights({ hypotheses = [], directives = [], asOf = new Date().toISOString() } = {}) {
 const items=[]
 for(const h of hypotheses) {
  if(!["recurring","elevated"].includes(h.strength_band) || ["expired","resolved"].includes(h.status)) continue
  const navigation = h.kind === "barrier" || h.uncertainty_reason === "navigation_or_access_detail_unknown"
  const weak = h.coverage_state === "unknown" || h.coverage_state === "limited"
  if(!navigation && !weak) continue
  const type=navigation?"directory_navigation_gap":"directory_evidence_gap", key=hash([INSIGHT_LIMITS.schemaVersion,type,h.theme,h.geography]), material=hash([type,h.coverage_state,h.uncertainty_reason,h.matching_resource_count,h.strength_band])
  const focused=directives.some((d)=>d.status==="active"&&d.topic_key===`service_system:${h.theme}`&&new Date(d.expires_at)>new Date(asOf))
  items.push({ insight_fingerprint:key,material_fingerprint:material,insight_type:type,hypothesis_id:h.id||null,observation:{aggregate_only:true,theme:h.theme,geography:h.geography,strength_band:h.strength_band,matching_resource_count:Number(h.matching_resource_count)},relationship:{directory_condition:h.uncertainty_reason,human_directed_focus:focused},interpretation:navigation?`Recurring aggregate navigation interest is paired with incomplete navigation information in Miller’s directory for ${h.theme.replaceAll("_"," ")} in ${h.geography.replaceAll("_"," ")}.`:`Recurring aggregate interest is paired with limited Miller directory representation for ${h.theme.replaceAll("_"," ")} in ${h.geography.replaceAll("_"," ")}.`,confidence:h.strength_band==="elevated"?.65:.5,uncertainty:"This evaluates Miller’s information quality, not community prevalence or a real-world service shortage.",alternative_explanation:"The directory taxonomy or matching terms may under-represent relevant services.",provenance:{aggregate_only:true,raw_query_retained:false,source_systems:["human_needs","coverage_hypotheses"],schema_version:INSIGHT_LIMITS.schemaVersion} })
 }
 return items.sort((a,b)=>b.confidence-a.confidence||a.insight_fingerprint.localeCompare(b.insight_fingerprint)).slice(0,INSIGHT_LIMITS.perCycle)
}
export function assertInsightPrivacy(insight){ if(/forbidden/.test(safe(insight))) throw new Error("insight_privacy_boundary"); return true }
export function insightContext({ insight, hypothesis, topic, directives=[] }={}) { if(!insight) throw new Error("insight_required"); const out={evidence:{observation:insight.observation,relationship:insight.relationship,provenance:insight.provenance},analysis:{interpretation:insight.interpretation,confidence:insight.confidence,uncertainty:insight.uncertainty,alternative_explanation:insight.alternative_explanation},related:{hypothesis:hypothesis?{theme:hypothesis.theme,geography:hypothesis.geography,status:hypothesis.status,coverage_state:hypothesis.coverage_state,matching_resource_count:hypothesis.matching_resource_count}:null,attention:topic?{topic_key:topic.topic_key,state:topic.state,current_score:topic.current_score}:null,directives:directives.map((d)=>({directive_type:d.directive_type,strength:d.strength,expires_at:d.expires_at,status:d.status}))},generated_explanation:null}; assertInsightPrivacy(out); return out }
