import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateMillerNorthResearchPolicyProjection } from "../server/millerNorthResearchPolicyPublic.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifacts = resolve(root, "artifacts/miller-north")
const dataDir = resolve(root, "src/data")
mkdirSync(dataDir, { recursive: true })

const readJson = path => JSON.parse(readFileSync(resolve(root, path), "utf8"))
const privateCases = {
  bc: readJson("artifacts/miller-north/miller-north-provincial-case-british-columbia-in-plain-sight-2026-09-06.json"),
  sk: readJson("artifacts/miller-north/miller-north-provincial-case-saskatchewan-saskatoon-coerced-sterilization-2026-09-06.json"),
  ab: readJson("artifacts/miller-north/miller-north-provincial-case-alberta-indigenous-primary-care-panel-2026-09-06.json"),
}
const ledger = readJson("artifacts/farm/in-plain-sight-24-recommendation-public-evidence-ledger-2026-09-06.json")

const categoryFor = source => {
  const text = `${source.source_type || ""} ${source.source_organization || ""} ${source.title || ""}`.toLowerCase()
  if (text.includes("external review") || text.includes("original report") || text.includes("in plain sight: addressing")) return "original report"
  if (text.includes("first nations health authority") || text.includes("indigenous-led") || text.includes("indigenous organization")) return "Indigenous organization"
  if (text.includes("court") || text.includes("case digest") || text.includes("legislation") || text.includes("parliament") || text.includes("human rights")) return "legal / human-rights"
  if (text.includes("health authority") || text.includes("health system") || text.includes("hospital") || text.includes("health quality")) return "health system"
  if (text.includes("ombud") || text.includes("regulat") || text.includes("advocate")) return "regulator / oversight"
  if (text.includes("progress") || text.includes("evaluation") || text.includes("implementation") || text.includes("program")) return "implementation / follow-up"
  return "government"
}

const publicSource = source => ({ title: source.title, organization: source.source_organization, category: categoryFor(source), url: source.url, ...(source.publication_date ? { publication_date: source.publication_date } : {}) })
const caseSourceMaps = Object.fromEntries(Object.entries(privateCases).map(([key, record]) => [key, new Map(record.sources.map(source => [source.source_id, publicSource(source)]))]))
const sourcesFor = (caseKey, ids) => [...new Map(ids.map(id => caseSourceMaps[caseKey].get(id)).filter(Boolean).map(source => [source.url, source])).values()]
const ledgerSources = new Map(ledger.source_catalog.map(publicSourceItem => [publicSourceItem.source_id, publicSource(publicSourceItem)]))
const ledgerSourcesFor = ids => [...new Map(ids.map(id => ledgerSources.get(id)).filter(Boolean).map(source => [source.url, source])).values()]
const sourceByTitle = (key, phrase) => publicSource(privateCases[key].sources.find(source => source.title.toLowerCase().includes(phrase.toLowerCase())))
const claim = (text, sources) => ({ text, sources })
const edge = (from, relationship, to, sources) => ({ from, relationship, to, sources })

const statusLabels = {
  implemented: "Implemented",
  substantially_implemented: "Substantially implemented",
  partially_implemented: "Partially implemented",
  implementation_underway: "Implementation underway",
  implementation_evidence_fragmentary: "Fragmentary implementation evidence",
}

const themeTitles = new Map(privateCases.bc.recommendation_themes.map(theme => [theme.theme_id, theme.title]))
const recommendations = ledger.recommendations.map(item => ({
  number: item.recommendation_number,
  summary: item.neutral_recommendation_summary,
  theme: themeTitles.get(privateCases.bc.recommendation_tracker.find(row => row.recommendation_number === item.recommendation_number).theme),
  status: item.current_defensible_status,
  status_label: statusLabels[item.current_defensible_status],
  latest_evidence_date: item.latest_evidence_date,
  responsible_organizations: item.original_responsible_parties,
  what_followed: item.implementation_actions.map(action => ({ date: action.date, description: action.summary, depth: action.depth.replaceAll("_", " "), sources: ledgerSourcesFor(action.source_references) })),
  evidence_summary: item.implementation_evidence.map(evidence => evidence.summary),
  sources: ledgerSourcesFor(item.source_references),
  source_availability: item.source_references.length > 1 ? `${item.source_references.length} public sources linked` : "1 public source linked",
  reporting_limitation: item.reporting_limitation,
  ...(item.recommendation_number === 11 ? { source_note: "Current provincial reporting appears to use a different recommendation number. Miller North follows the numbering in the original In Plain Sight report." } : {}),
}))

const statusCounts = Object.fromEntries(Object.keys(statusLabels).map(status => [status, recommendations.filter(item => item.status === status).length]))
const themes = privateCases.bc.thematic_summary.map(theme => ({ title: theme.title, recommendation_numbers: theme.recommendation_numbers, status_distribution: theme.status_distribution, strongest_evidence: theme.strongest_implementation_evidence, reporting_gap: theme.major_reporting_gap }))

const timelineFor = (key, record) => record.timeline.map(item => ({ date: item.date_or_range, type: item.event_type.replaceAll("_", " "), title: item.title, description: item.short_description, organization: item.organization, sources: sourcesFor(key, item.source_references) }))
const uniquePublicSources = key => privateCases[key].sources.map(publicSource)

const bccdcApology = { title: "BCCDC apologizes for harms caused to Indigenous Peoples", organization: "BC Centre for Disease Control", category: "health system", url: "https://www.bccdc.ca/about/news-stories/stories/2025/apology", publication_date: "2025-12-18" }
const bc2025Status = { title: "A Path Forward: June 2025 Status Update", organization: "Government of British Columbia", category: "government", url: "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/about-bc-justice-system/inquiries/mmiw/mmiwg-status-update-2025.pdf", publication_date: "2025-06" }
const bcPatientCareQualityReview = { title: "Patient Care Quality Review", organization: "B.C. Ministry of Health", category: "government", url: "https://engage.gov.bc.ca/govtogetherbc/engagement/patient-care-quality-review/", publication_date: "2026-05-14" }
const bcIslandHealthIsiPause = { title: "Temporary Pause of the Indigenous Patient Self-Identification Program in Acute Care", organization: "Island Health", category: "health system", url: "https://medicalstaff.islandhealth.ca/news-events/paused-indgi-self-identi", publication_date: "2026-06-30" }
const bcAntiRacismActionPlan = { title: "B.C. Anti-Racism Action Plan 2026–28", organization: "Government of British Columbia", category: "government", url: "https://news.gov.bc.ca/releases/2026AG0032-000635", publication_date: "2026-06-18" }
const albertaReconciliation = { title: "Reconciliation in Alberta — health actions", organization: "Government of Alberta", category: "government", url: "https://www.alberta.ca/reconciliation-in-alberta" }
const albertaMapsProgress = { title: "Modernizing primary health care — progress on 2-year plan", organization: "Government of Alberta", category: "implementation / follow-up", url: "https://www.alberta.ca/modernizing-primary-health-care-progress-on-2-year-plan", publication_date: "2026-01-05" }
const albertaAntiRacismEngagement = { title: "Addressing racism in Indigenous health care", organization: "Government of Alberta", category: "government", url: "https://www.alberta.ca/addressing-racism-in-indigenous-health-care", publication_date: "2025-07-24" }
const fnhooInauguralReport = { title: "Inaugural Report, July 2023–March 2025", organization: "First Nations Health Ombudsperson Office", category: "Indigenous organization", url: "https://fnhoo.ca/annual-reports/", publication_date: "2025-10-27" }
const saskatchewanFnhooResponse = { title: "October 28, 2025 Hansard", organization: "Legislative Assembly of Saskatchewan", category: "government", url: "https://docs.legassembly.sk.ca/legdocs/Assembly/Debates/30L2S/20251028DebatesHTML.htm", publication_date: "2025-10-28" }
const saskatchewanNavigatorNetwork = { title: "UN Declaration Act Action Plan 2026 reporting — Shared Priority 8", organization: "Government of Canada", category: "government", url: "https://justice.canada.ca/eng/declaration/report-rapport/2026/b1.html", publication_date: "2026" }

const bcSources = [...uniquePublicSources("bc"), bc2025Status, bccdcApology, bcPatientCareQualityReview, bcIslandHealthIsiPause, bcAntiRacismActionPlan]
const skSources = [...uniquePublicSources("sk"), fnhooInauguralReport, saskatchewanFnhooResponse, saskatchewanNavigatorNetwork]
const abSources = [...uniquePublicSources("ab"), albertaReconciliation, albertaMapsProgress, albertaAntiRacismEngagement]

const cases = [
  {
    slug: "in-plain-sight",
    province: "British Columbia",
    title: "In Plain Sight",
    focus: "What current public evidence shows about implementation of 24 recommendations",
    what_happened: "The 2020 In Plain Sight review documented widespread Indigenous-specific racism and discrimination in B.C. health care and issued 24 recommendations. Later public records describe laws, standards, offices, programs and reporting created in response.",
    why_this_matters: privateCases.bc.owner_view.why_this_matters,
    one_thing_to_remember: "Public evidence documents substantial activity, but evidence of activity is not the same as evidence of system-wide outcomes.",
    metrics: [{ label: "Recommendations", value: "24" }, { label: "Implemented", value: "2" }, { label: "Substantially implemented", value: "3" }, { label: "Partially implemented", value: "12" }, { label: "Underway", value: "4" }, { label: "Fragmentary evidence", value: "3" }],
    status_counts: statusCounts,
    recommendations,
    themes,
    source_note: { canonical_recommendation_number: 11, text: "Source note: current provincial reporting appears to use a different recommendation number for the Public Interest Disclosure Act change. Miller North follows recommendation 11 in the original In Plain Sight report; no authoritative renumbering was found." },
    timeline: [...timelineFor("bc", privateCases.bc), { date: "2025-06", type: "follow-up", title: "Cross-government status update", description: "A later status report adds implementation examples, including patient-feedback work and a bilateral Métis health table.", organization: "Government of British Columbia", sources: [bc2025Status] }, { date: "2025-12-10", type: "health-system response", title: "BCCDC apology and leadership commitments", description: "BCCDC issued a formal apology and leadership commitments linked to In Plain Sight and its own review of institutional practices.", organization: "BC Centre for Disease Control", sources: [bccdcApology] }, { date: "2026-05 to 2026-07", type: "policy review", title: "Patient-care-quality review engagement", description: "The Ministry of Health reviewed two quality-review pathways, explicitly including Indigenous-specific racism and discrimination, with broader First Nations and Métis engagement planned through 2026.", organization: "B.C. Ministry of Health", sources: [bcPatientCareQualityReview] }, { date: "2026-07-08", type: "program redesign", title: "Island Health pauses Indigenous self-identification in acute care", description: "After First Nations feedback, Island Health paused the program and committed to distinctions-based redesign, shared governance and stronger Indigenous data-governance safeguards.", organization: "Island Health", sources: [bcIslandHealthIsiPause] }],
    evidence_path: [
      edge("Documented systemic concern", "examined by", "Independent In Plain Sight review", [sourceByTitle("bc", "Addressing Indigenous-specific")]),
      edge("Independent review", "issued", "24 recommendations", [sourceByTitle("bc", "Addressing Indigenous-specific")]),
      edge("Recommendation 11", "followed by", "Health-authority PIDA coverage", [sourceByTitle("bc", "24-Month"), sourceByTitle("bc", "first anniversary")]),
      edge("Cultural-safety recommendations", "followed by", "B.C. Cultural Safety and Humility Standard", [sourceByTitle("bc", "Cultural Safety and Humility Standard")]),
      edge("Implementation activity", "reported through", "24-month and Declaration Act updates", [sourceByTitle("bc", "24-Month"), sourceByTitle("bc", "Action 3.07")]),
    ],
    policy_and_government: [
      { label: "legislation", title: "Public Interest Disclosure Act coverage", description: "Official reporting states that health-authority employees were brought within disclosure protections.", sources: [sourceByTitle("bc", "24-Month")] },
      { label: "professional regulation", title: "Health Professions and Occupations Act", description: "Professional-regulation modernization is part of the response context; enactment does not demonstrate practice compliance.", sources: [sourceByTitle("bc", "Health Professions and Occupations Act")] },
      { label: "professional standard", title: "B.C. Cultural Safety and Humility Standard", description: "The First Nations-led standard is a concrete output; adoption and assessment remain separate evidence questions.", sources: [sourceByTitle("bc", "Cultural Safety and Humility Standard")] },
      { label: "governance framework", title: "Tripartite First Nations health governance", description: "An Indigenous-led evaluation records progress and continuing governance work.", sources: [sourceByTitle("bc", "Tripartite Framework")] },
    ],
    what_public_evidence_shows: [
      claim("All 24 recommendations have an official public-evidence baseline.", [sourceByTitle("bc", "Addressing Indigenous-specific"), sourceByTitle("bc", "24-Month")]),
      claim("Health-sector disclosure protection, professional-regulation changes, a cultural-safety standard and complaint-related mechanisms are publicly documented.", [sourceByTitle("bc", "24-Month"), sourceByTitle("bc", "Health Professions and Occupations Act"), sourceByTitle("bc", "Cultural Safety and Humility Standard"), sourceByTitle("bc", "Sharing Concerns")]),
      claim("Later reporting adds new health-system and governance actions, including a 2025 BCCDC apology and leadership commitments.", [bc2025Status, bccdcApology]),
      claim("In 2026, the Ministry began a provincewide patient-care-quality review tied to In Plain Sight, while Island Health separately paused and began redesigning its Indigenous self-identification program after First Nations feedback.", [bcPatientCareQualityReview, bcIslandHealthIsiPause]),
    ],
    what_remains_unclear: [
      claim("No current comprehensive public status ledger covering every recommendation was located.", [sourceByTitle("bc", "Action 3.07")]),
      claim("Public reporting is stronger on activities than on consistent provincewide outcomes.", [sourceByTitle("bc", "Action 3.07"), sourceByTitle("bc", "Tripartite Framework")]),
      claim("Responsibility and implementation evidence remain distributed across ministries, health authorities, regulators and Indigenous partners.", [sourceByTitle("bc", "Action 3.07")]),
    ],
    recommended_next_question: "Will the Ministry publish a current recommendation-by-recommendation status update for all 24 recommendations?",
    sources: bcSources,
  },
  {
    slug: "saskatoon-coerced-sterilization",
    province: "Saskatchewan",
    title: "Saskatoon coerced sterilization / tubal-ligation cohort",
    focus: "Reported experiences, external review, Calls to Action, a service response and later legal developments",
    what_happened: "A Saskatoon Health Region-commissioned review documented the reported experiences of seven Indigenous women who described pressure or coercion around tubal ligation. The review issued ten Calls to Action and was followed by an apology, a hospital-based Indigenous birth-support program and legal proceedings.",
    why_this_matters: privateCases.sk.owner_view.why_this_matters,
    one_thing_to_remember: "A current birth-support service is documented, but one program should not be mistaken for completion of the review's wider structural recommendations.",
    metrics: [{ label: "Review interviews", value: "7 women" }, { label: "Calls to Action", value: "10" }, { label: "Program operating since", value: "2019" }, { label: "Legal update", value: "2025" }],
    timeline: timelineFor("sk", privateCases.sk),
    evidence_path: [
      edge("Reported experiences", "examined by", "2017 external review", [sourceByTitle("sk", "Lived Experience")]),
      edge("External review", "issued", "Ten Calls to Action", [sourceByTitle("sk", "Lived Experience")]),
      edge("Review", "followed by", "Health-region response and apology", [sourceByTitle("sk", "Forced and Coerced")]),
      edge("Review", "followed by", "Indigenous Birth Support Worker Program", [sourceByTitle("sk", "Lessons learned")]),
      edge("Program", "confirmed by", "Current hospital service information and evaluation", [sourceByTitle("sk", "Lessons learned"), sourceByTitle("sk", "Maternal Care Centre")]),
      edge("Related allegations", "considered in", "Popp v Canada class-certification process", [sourceByTitle("sk", "Case Mail")]),
    ],
    policy_and_government: [
      { label: "health-system review", title: "Ten Calls to Action", description: "The review called for rights-informed care, training, equal Indigenous partnership, workforce reform, support, reparation and revised consent policy.", sources: [sourceByTitle("sk", "Lived Experience")] },
      { label: "legal process", title: "Popp v Canada", description: "Class certification was dismissed in 2025. That procedural decision did not adjudicate the merits of individual allegations.", sources: [sourceByTitle("sk", "Case Mail")] },
      { label: "legislation", title: "Bill S-228 / S.C. 2026, c. 10", description: "The later Criminal Code amendment is national legal context only and is not presented as a retroactive case remedy.", sources: [sourceByTitle("sk", "sterilization procedures")] },
      { label: "territorial context", title: "Treaty 6 territory and Homeland of the Métis", description: "This identifies location and governance context; it does not by itself establish a legal-right conclusion.", sources: [sourceByTitle("sk", "Treaty 6 Territory")] },
    ],
    legal_note: "Class certification dismissed means the proposed class action did not proceed in that form at that stage. The decision did not adjudicate the merits of individual allegations or determine whether an individual legal claim would succeed.",
    what_public_evidence_shows: [
      claim("The commissioned review preserves seven anonymized reported experiences as cohort evidence and documents ten Calls to Action.", [sourceByTitle("sk", "Lived Experience")]),
      claim("The Indigenous Birth Support Worker Program was created as part of the response, began in December 2019 and remains represented in current SHA service information.", [sourceByTitle("sk", "Lessons learned"), sourceByTitle("sk", "Maternal Care Centre")]),
      claim("The 2025 class-certification application was dismissed on procedural certification criteria rather than after adjudicating individual merits.", [sourceByTitle("sk", "Case Mail")]),
      claim("Later federal legislation clarified the Criminal Code treatment of non-consensual sterilization; it is contextual legal development, not a retroactive finding in the Saskatoon cohort.", [sourceByTitle("sk", "sterilization procedures")]),
    ],
    what_remains_unclear: [
      claim("A current public implementation ledger for all ten Calls to Action was not located.", [sourceByTitle("sk", "Lived Experience"), sourceByTitle("sk", "Lessons learned")]),
      claim("Public sources reviewed did not establish whether the 2025 decision was appealed or followed by a reconfigured proceeding.", [sourceByTitle("sk", "Case Mail")]),
      claim("Current provincewide consent-policy adoption and auditing could not be demonstrated from the located sources.", [sourceByTitle("sk", "Lived Experience")]),
    ],
    recommended_next_question: "Can Saskatchewan Health Authority provide a current implementation table for the review's ten Calls to Action?",
    sources: skSources,
  },
  {
    slug: "alberta-indigenous-primary-care",
    province: "Alberta",
    title: "Indigenous Primary Health Care Advisory Panel",
    focus: "Twenty-two recommendations and the structures created to respond",
    what_happened: "Alberta's Indigenous Primary Health Care Advisory Panel issued 22 recommendations for culturally safe, Indigenous-led and accountable primary health care. Government later published an implementation plan and created or funded a ministry division, navigation programs, an innovation fund and a patient-safety advocate.",
    why_this_matters: privateCases.ab.owner_view.why_this_matters,
    one_thing_to_remember: "Alberta publicly documents implementation machinery, but not one complete current account of every recommendation and its outcomes.",
    metrics: [{ label: "Recommendations", value: "22" }, { label: "Implementation plan", value: "Published" }, { label: "Oversight mechanism", value: "Operating" }, { label: "Geographic scope", value: "Provincewide" }],
    selection_note: "A Red Deer and Central Alberta search was completed first. It found relevant cultural-safety concerns and operational Indigenous support services, but not an equally deep local accountability chain. This provincewide case was selected because its recommendations, government response, funding and implementation mechanisms are more completely documented. Absence of a deep public record is not evidence that local problems do not exist.",
    timeline: timelineFor("ab", privateCases.ab),
    evidence_path: [
      edge("Documented barriers and systemic concerns", "informed", "Indigenous advisory panel", [sourceByTitle("ab", "final report")]),
      edge("Advisory panel", "issued", "22 recommendations", [sourceByTitle("ab", "final report")]),
      edge("Recommendations", "followed by", "The Way Forward implementation plan", [sourceByTitle("ab", "Way Forward")]),
      edge("Implementation plan", "supported by", "Navigator grants and innovation funding", [sourceByTitle("ab", "Navigator Grant"), sourceByTitle("ab", "Innovation Fund")]),
      edge("Recommendations", "followed by", "Indigenous Health Division and patient-safety advocate", [sourceByTitle("ab", "Improving Indigenous"), sourceByTitle("ab", "Patient Safety Investigator")]),
    ],
    policy_and_government: [
      { label: "government response", title: "The Way Forward", description: "The plan is the formal implementation framework associated with the panel recommendations.", sources: [sourceByTitle("ab", "Way Forward")] },
      { label: "funding relationship", title: "Navigator and innovation funding", description: "The programs fund Indigenous communities and organizations; funding does not by itself establish provincewide service availability or outcomes.", sources: [sourceByTitle("ab", "Navigator Grant"), sourceByTitle("ab", "Innovation Fund")] },
      { label: "oversight mechanism", title: "Indigenous Patient Safety Investigator and Advocate", description: "The office supports complaints, can undertake delegated Health Charter reviews, and has explicit limits: it is not a court or disciplinary regulator.", sources: [sourceByTitle("ab", "Patient Safety Investigator"), sourceByTitle("ab", "Health Charter")] },
      { label: "governance context", title: "Indigenous Health Division and advisory structures", description: "Government reports a dedicated division, health tables and an advisory council; these are distinct from Indigenous governance authority.", sources: [sourceByTitle("ab", "Improving Indigenous"), albertaReconciliation] },
    ],
    what_public_evidence_shows: [
      claim("The advisory panel produced 22 recommendations across five themes.", [sourceByTitle("ab", "final report"), sourceByTitle("ab", "Improving Indigenous")]),
      claim("A dedicated implementation plan, Indigenous Health Division, grant programs and patient-safety advocate are publicly documented.", [sourceByTitle("ab", "Way Forward"), sourceByTitle("ab", "Improving Indigenous"), sourceByTitle("ab", "Navigator Grant"), sourceByTitle("ab", "Patient Safety Investigator")]),
      claim("Current provincial reporting says implementation is continuing and describes an Indigenous Advisory Council and later anti-racism engagement.", [albertaReconciliation, sourceByTitle("ab", "Addressing racism")]),
      claim("The broader MAPS progress page reports 13 of 30 two-year-plan actions completed and 17 in progress, but it does not provide a recommendation-by-recommendation status for the Indigenous panel's 22 recommendations.", [albertaMapsProgress]),
    ],
    what_remains_unclear: [
      claim("No comprehensive current public status ledger for all 22 recommendations was located.", [sourceByTitle("ab", "Improving Indigenous"), sourceByTitle("ab", "Way Forward")]),
      claim("Geographic reach and measured outcomes for funded initiatives are not reported in one place.", [sourceByTitle("ab", "Navigator Grant"), sourceByTitle("ab", "Innovation Fund")]),
      claim("A final action plan resulting from the later anti-racism engagement was not located in this bounded search.", [sourceByTitle("ab", "Addressing racism")]),
    ],
    recommended_next_question: "Will Alberta publish a current crosswalk showing the status of each of the 22 panel recommendations?",
    sources: abSources,
  },
]

const boundedDiscovery = {
  british_columbia: [
    claim("A 2026 Ministry of Health review is examining internal patient-safety reviews and patient-initiated quality reviews, explicitly including Indigenous-specific racism and discrimination; engagement is intended to inform policy direction and possible legislative change.", [bcPatientCareQualityReview]),
    claim("Island Health paused its acute-care Indigenous self-identification program effective July 8, 2026 after First Nations feedback, separating the pause from a later redesign commitment centred on shared governance and Indigenous data sovereignty.", [bcIslandHealthIsiPause]),
    claim("B.C.'s 2026–28 Anti-Racism Action Plan commits to a Ministry of Health centre for anti-racism and cultural safety and says the first progress report is due in September 2027; this is an announced commitment, not implementation evidence.", [bcAntiRacismActionPlan]),
  ],
  saskatchewan: [
    claim("The First Nations Health Ombudsperson Office published its inaugural July 2023–March 2025 report, creating a strong Indigenous-led accountability source family separate from the Saskatoon cohort.", [fnhooInauguralReport]),
    claim("The Saskatchewan legislature records the Health Minister saying both the Ministry and Saskatchewan Health Authority were reviewing the ombudsperson report and recommendations; no later formal response was located in this bounded pass.", [saskatchewanFnhooResponse]),
    claim("Federal 2025–26 UN Declaration reporting confirms that the ISC Saskatchewan Region established an Anti-Indigenous Racism Navigator Network for First Nations-organization health navigators, but gives no named participant list or outcome report.", [saskatchewanNavigatorNetwork]),
  ],
  alberta: [
    claim("Current Alberta reporting groups the Indigenous Health Division, navigator and innovation funding, advisory council, and patient-safety advocate as continuing response mechanisms, while preserving their different governance and operational roles.", [albertaReconciliation, sourceByTitle("ab", "Improving Indigenous")]),
    claim("The broader MAPS two-year-plan page reports 13 of 30 actions completed and 17 in progress; those aggregate numbers should not be read as a status ledger for the Indigenous panel's 22 recommendations.", [albertaMapsProgress]),
    claim("Alberta says 11 in-person and 27 virtual sessions informed a planned What We Heard report and Indigenous Anti-Racism Strategy. The engagement page still presents the outcome as drafting work, so the final strategy remains a bounded follow-up question.", [albertaReconciliation, albertaAntiRacismEngagement]),
  ],
}

const projection = {
  schema_version: "miller-north-research-policy-public-v1",
  generated_at: "2026-09-06",
  visibility: "hidden_site_read_only",
  publication_state: "owner_approved_hidden_experience",
  title: "Research & Policy",
  introduction: "Miller North follows documented public evidence beyond an original incident or systemic concern. A case may connect a review to recommendations, a government or health-system response, policy or governance changes, implementation evidence and later follow-up. Not every case contains every stage.",
  research_path: ["Incident or systemic concern", "Investigation or review", "Recommendation", "Government or health-system response", "Policy or governance change", "Implementation evidence", "Later follow-up"],
  caution: "Miller North uses public-source evidence. Evidence statuses describe what current public reporting supports. Missing public evidence does not prove an action did not occur. Legal material is public-record context, not legal advice. The project distinguishes reported experiences from formal findings.",
  status_notice: "These classifications describe available public evidence. They are not ratings of effectiveness, legal compliance or institutional performance.",
  cases,
  bounded_discovery: boundedDiscovery,
}

const validation = validateMillerNorthResearchPolicyProjection(projection)
writeFileSync(resolve(dataDir, "miller-north-research-policy-public-v1.json"), `${JSON.stringify(projection, null, 2)}\n`)
writeFileSync(resolve(artifacts, "miller-north-research-policy-bounded-discovery-2026-09-06.json"), `${JSON.stringify({ schema_version: "miller-north-bounded-discovery-v1", publication_scope: "private_owner_review", findings: boundedDiscovery, new_case_candidates: [{ candidate_id: "mn_candidate_sk_fnhoo_inaugural_accountability_chain_2026", province: "Saskatchewan", title: "First Nations Health Ombudsperson inaugural reporting and response chain", evidence_depth: "Indigenous-led annual report; legislated-government acknowledgement and review response; federal continuation funding context", status: "private_owner_review", reason: "The source chain is strong enough for a separate accountability dossier, but it should not be folded into the Saskatoon coerced-sterilization cohort without case-specific evidence." }], stopping_reason: "High-value official updates were captured. Additional searches repeated existing sources, lacked recommendation-level disaggregation, or did not meet the significance threshold.", web_search_calls: 5, search_queries: 20, source_inspections: 8, tavily_calls: 0, local_model_calls: 0, cloud_model_api_calls: 0, measurable_external_cost_usd: 0 }, null, 2)}\n`)
writeFileSync(resolve(artifacts, "miller-north-research-policy-public-projection-validation-2026-09-06.json"), `${JSON.stringify({ schema_version: "miller-north-research-policy-public-projection-validation-v1", validation, safeguards: { raw_owner_review_fields_excluded: true, internal_identifiers_excluded: true, anonymized_people_not_identified: true, sources_required_for_material_claims: true, no_database_mutation: true, no_migration: true } }, null, 2)}\n`)

const mdSources = sources => sources.map(source => `[${source.title}](${source.url})`).join(", ")
writeFileSync(resolve(artifacts, "miller-north-research-policy-bounded-discovery-2026-09-06.md"), `# Miller North bounded Research & Policy discovery\n\n> Private research artifact. Only publication-safe findings were added to the hidden-site projection.\n\n## British Columbia\n\n- The Ministry of Health's 2026 patient-care-quality review directly connects In Plain Sight to current review of internal patient-safety and patient-initiated quality-review processes. ${mdSources([bcPatientCareQualityReview])}\n- Island Health paused its acute-care Indigenous self-identification program after First Nations feedback and committed to a distinctions-based redesign with shared governance and Indigenous data-governance safeguards. ${mdSources([bcIslandHealthIsiPause])}\n- B.C.'s 2026–28 Anti-Racism Action Plan announces a Ministry of Health centre and a September 2027 first progress report. These remain commitments until later evidence demonstrates implementation. ${mdSources([bcAntiRacismActionPlan])}\n\n## Saskatchewan\n\n- The First Nations Health Ombudsperson Office published its inaugural report covering July 2023 to March 2025. ${mdSources([fnhooInauguralReport])}\n- The Health Minister stated that the Ministry and Saskatchewan Health Authority were reviewing the report and recommendations; no later formal response was located. ${mdSources([saskatchewanFnhooResponse])}\n- Federal reporting confirms a Saskatchewan Anti-Indigenous Racism Navigator Network, while leaving participants and outcome reporting unclear. ${mdSources([saskatchewanNavigatorNetwork])}\n\n## Alberta\n\n- Current reporting brings the Indigenous Health Division, funding programs, advisory council and advocate together as continuing but distinct response mechanisms. ${mdSources([albertaReconciliation])}\n- The broader MAPS progress page reports 13 of 30 two-year-plan actions completed and 17 in progress, but does not disaggregate the Indigenous panel's 22 recommendations. ${mdSources([albertaMapsProgress])}\n- Alberta records 38 anti-racism engagement sessions feeding a planned What We Heard report and strategy; a final strategy was not located. ${mdSources([albertaReconciliation, albertaAntiRacismEngagement])}\n\n## New case candidate\n\nThe FNHO inaugural-report chain is strong enough for a separate private accountability dossier. It should remain distinct from the Saskatoon coerced-sterilization cohort unless case-specific evidence links them.\n`)

console.log(JSON.stringify(validation, null, 2))
