import { mkdirSync, writeFileSync } from "node:fs"
import { MILLER_NORTH_PUBLIC_SEARCH_INDEX, retrieveMillerNorthResults } from "../server/indigenousHealthcareEvidenceSearch.js"

const cases = [
  { query: "hospital security Saskatchewan", expected: /Hospital security response/i },
  { query: "In Plain Sight", expected: /^In Plain Sight$/i },
  { query: "ambulance rural BC racism", expected: /Interior Health|In Plain Sight/i },
  { query: "Indigenous Patient Safety Advocate", expected: /Indigenous Patient Safety Investigator and Advocate/i },
  { query: "FNHO recommendations", expected: /FNHO recommendations|First Nations Health Ombudsperson Office/i },
  { query: "coerced sterilization Saskatoon", expected: /coerced sterilization/i },
  { query: "emergncy department Alberta", expected: /emergency|ER/i },
  { query: "First Nations health ombudsperson", expected: /ombudsperson/i },
]
const results = cases.map(item => { const matches = retrieveMillerNorthResults(item.query, { limit: 5 }); const rank = matches.findIndex(match => item.expected.test(match.title)); return { query: item.query, expected_pattern: item.expected.source, expected_in_top_five: rank >= 0, expected_rank: rank < 0 ? null : rank + 1, top_results: matches.map(match => ({ result_type: match.result_type, title: match.title, score: match.relevance_score })) } })
const byType = Object.fromEntries([...new Set(MILLER_NORTH_PUBLIC_SEARCH_INDEX.map(item => item.result_type))].sort().map(type => [type, MILLER_NORTH_PUBLIC_SEARCH_INDEX.filter(item => item.result_type === type).length]))
const report = { schema_version: "miller-north-site-search-benchmark-v1", assessed_on: "2026-09-07", index_records: MILLER_NORTH_PUBLIC_SEARCH_INDEX.length, by_result_type: byType, queries: results.length, expected_top_five_hits: results.filter(item => item.expected_in_top_five).length, deterministic_search_available_without_model: true, results }
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("miller-north-site-search-benchmark-2026-09-07.json", dir), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(new URL("miller-north-site-search-benchmark-2026-09-07.md", dir), `# Miller North site-search benchmark\n\n- Public indexed results: ${report.index_records}\n- Result types: ${Object.entries(byType).map(([type, count]) => `${type} ${count}`).join(", ")}\n- Expected result found in top five: ${report.expected_top_five_hits}/${report.queries}\n- Local-model dependency: none; deterministic aliases, normalization, typo tolerance and ranking always run.\n\n| Query | Expected rank | Top result |\n| --- | ---: | --- |\n${results.map(item => `| ${item.query} | ${item.expected_rank || "not found"} | ${item.top_results[0]?.title || "none"} |`).join("\n")}\n\nThis small benchmark checks retrieval behavior, not factual truth or corpus completeness.\n`)
console.log(JSON.stringify({ index_records: report.index_records, byType, expected_top_five_hits: report.expected_top_five_hits, queries: report.queries }))
