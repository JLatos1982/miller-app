import test from "node:test"
import assert from "node:assert/strict"
import { activeCoverageWorkspace, buildCoverageHypothesis } from "../server/coverageHypotheses.js"
const bucket={bucket_key:"a".repeat(64),kind:"need",theme:"withdrawal_management",geography:"fraser",observation_count:5,last_observed_at:"2026-08-23T00:00:00Z"}
test("threshold-qualified aggregate need becomes a directory-quality hypothesis, not a service-shortage claim",()=>{const item=buildCoverageHypothesis(bucket,[]);assert.equal(item.coverage_state,"unknown");assert.match(item.research_question,/Does Miller have enough/);assert.doesNotMatch(JSON.stringify(item),/shortage|raw query|session/i)})
test("existing directory evidence changes uncertainty without establishing external truth",()=>{const item=buildCoverageHypothesis(bucket,[{category:"Detox",city:"Surrey",description:"withdrawal"}]);assert.equal(item.coverage_state,"limited");assert.equal(item.uncertainty_reason,"limited_directory_representation")})
test("active hypothesis workspace is bounded and expired items disappear",()=>{const items=Array.from({length:20},(_,i)=>({...buildCoverageHypothesis({...bucket,bucket_key:String(i).padStart(64,"a")}),updated_at:`2026-08-${String(i+1).padStart(2,"0")}T00:00:00Z`}));items[0].expires_at="2026-08-01T00:00:00Z";assert.equal(activeCoverageWorkspace(items,"2026-08-23T00:00:00Z").length,15)})
