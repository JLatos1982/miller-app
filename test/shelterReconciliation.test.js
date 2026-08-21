import test from "node:test"
import assert from "node:assert/strict"
import { clustersFromPairs, compareShelterCandidates } from "../server/shelterReconciliation.js"
const base={id:1,name:"Harbour Shelter",operator:"Example Society",community:"Prince George",website:"https://example.org/harbour",phone:"250 555 0100",public_address:"10 Main St"}
test("same operator and site alone remains distinct when programs differ",()=>assert.equal(compareShelterCandidates(base,{...base,id:2,name:"Different Program",public_address:"20 Main St"}).classification,"different_program"))
test("same program plus independent identity signals is an exact duplicate",()=>assert.equal(compareShelterCandidates(base,{...base,id:2,name:"Harbour Shelter"}).classification,"same_program_duplicate"))
test("clusters avoid repeated pair-by-pair review",()=>assert.deepEqual(clustersFromPairs([{left:{id:1},right:{id:2},comparison:{classification:"possible_duplicate"}},{left:{id:2},right:{id:3},comparison:{classification:"possible_duplicate"}}]),[[1,2,3]]))
