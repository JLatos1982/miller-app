import { createHash } from "node:crypto"

export const MILLER_NORTH_PRIVATE_EXPANSION_VERSION = "miller-north-private-incident-expansion-v1"
export const MILLER_NORTH_PRIVATE_EXPANSION_CEILING = 200

const id = value => createHash("sha256").update(value).digest("hex").slice(0, 24)
const compact = value => String(value || "").trim().replace(/\s+/g, " ")

const provincialPlans = {
  saskatchewan: {
    treaty6: true,
    source_families: [
      ["APTN News", "site:aptnnews.ca Saskatchewan hospital Indigenous patient"],
      ["FSIN", "site:fsin.com Saskatchewan hospital patient"],
      ["First Nations Health Ombudsperson", "\"First Nations Health Ombudsperson\" Saskatchewan hospital"],
      ["Saskatchewan Health Authority", "site:saskhealthauthority.ca Indigenous patient hospital Saskatchewan"],
      ["Saskatchewan Human Rights", "site:saskatchewanhumanrights.ca healthcare Indigenous complaint"],
      ["Prince Albert Grand Council", "site:pagc.sk.ca hospital patient racism"],
      ["Battlefords Agency Tribal Chiefs", "Battlefords First Nations hospital patient complaint"],
      ["Northern Inter-Tribal Health Authority", "NITHA Saskatchewan hospital patient complaint Indigenous"],
      ["local journalism", "site:panow.com Prince Albert hospital Indigenous patient"],
      ["local journalism", "site:ckom.com Saskatoon hospital Indigenous patient"],
      ["local journalism", "site:cjme.com Regina hospital Indigenous patient"],
      ["local journalism", "site:650ckom.com Saskatchewan hospital First Nations family"],
    ],
    localities: ["Saskatoon", "Prince Albert", "Regina", "North Battleford", "Lloydminster"],
  },
  alberta: {
    treaty6: true,
    source_families: [
      ["Indigenous Patient Safety Investigator and Advocate", "\"Indigenous Patient Safety Investigator\" Alberta hospital"],
      ["Alberta Health Advocates", "site:albertahealthadvocates.ca Indigenous hospital complaint"],
      ["Alberta Human Rights", "site:albertahumanrights.ab.ca Indigenous healthcare complaint"],
      ["Alberta Health Services", "site:albertahealthservices.ca Indigenous patient hospital investigation"],
      ["APTN News", "site:aptnnews.ca Alberta hospital Indigenous patient"],
      ["Siksika Nation", "site:siksikanation.com hospital healthcare discrimination"],
      ["Treaty 6 organizations", "Treaty 6 Alberta hospital Indigenous patient complaint"],
      ["Maskwacis organizations", "Maskwacis hospital Indigenous patient complaint"],
      ["local journalism", "site:edmontonjournal.com hospital Indigenous patient Edmonton"],
      ["local journalism", "site:edmonton.citynews.ca hospital Indigenous patient"],
      ["local journalism", "site:rdnewsnow.com hospital Indigenous patient Alberta"],
      ["local journalism", "site:calgaryherald.com hospital Indigenous patient"],
    ],
    localities: ["Edmonton", "Wetaskiwin", "Maskwacis", "Red Deer", "Calgary"],
  },
  british_columbia: {
    treaty6: false,
    source_families: [
      ["BC Ombudsperson", "site:bcombudsperson.ca Indigenous healthcare complaint hospital"],
      ["BCCNM", "site:bccnm.ca Indigenous patient complaint nursing discipline"],
      ["CPSBC", "site:cpsbc.ca Indigenous patient complaint discipline"],
      ["health authority", "site:healthauthority.ca Indigenous patient hospital investigation British Columbia"],
      ["First Nations Health Authority", "site:fnha.ca hospital patient complaint racism"],
      ["IndigiNews", "site:indiginews.com hospital Indigenous patient British Columbia"],
      ["APTN News", "site:aptnnews.ca British Columbia hospital Indigenous patient"],
      ["local journalism", "site:cheknews.ca hospital Indigenous patient Island Health"],
      ["local journalism", "site:thetyee.ca hospital Indigenous patient British Columbia"],
      ["local journalism", "site:castanet.net hospital Indigenous patient British Columbia"],
    ],
    localities: ["Victoria", "Nanaimo", "Terrace", "Prince George", "Vancouver"],
  },
}

const recency = [
  ["last_90_days", "after:2026-06-07"],
  ["2026", "2026"],
  ["2025", "2025"],
  ["2024", "2024"],
  ["archival_2015_2023", "2015 OR 2016 OR 2017 OR 2018 OR 2019 OR 2020 OR 2021 OR 2022 OR 2023"],
]

function provincialQueries(province, count) {
  const plan = provincialPlans[province], rows = []
  for (const [family, base] of plan.source_families) {
    for (const [bucket, time] of recency) {
      const locality = plan.localities[rows.length % plan.localities.length]
      const pattern = /site:|Ombudsperson|Advocate|Human Rights|BCCNM|CPSBC/.test(base)
        ? `${base} ${time} complaint review patient`
        : `${base} ${locality} ${time} complaint racism mistreatment`
      rows.push({ province, treaty6: plan.treaty6, source_family: family, query_pattern: `${family}:${bucket}`, recency_bucket: bucket, query: compact(pattern) })
      if (rows.length >= count) return rows
    }
  }
  return rows
}

const crossRegional = [
  ["complaint / accountability", "Indigenous patient hospital accepted complaint review Saskatchewan Alberta British Columbia 2026"],
  ["complaint / accountability", "Indigenous patient hospital human rights decision Saskatchewan Alberta British Columbia 2025"],
  ["institutional", "health authority hospital response Indigenous patient complaint Saskatchewan Alberta British Columbia 2026"],
  ["Indigenous journalism", "site:aptnnews.ca Indigenous patient hospital complaint 2026 Saskatchewan Alberta British Columbia"],
  ["Indigenous journalism", "site:indiginews.com Indigenous patient hospital complaint 2025 British Columbia"],
  ["local journalism", "First Nations family hospital complaint Saskatchewan Alberta 2024"],
  ["ombudsperson / advocate", "health ombudsperson Indigenous patient hospital case summary Canada prairie 2025"],
  ["regulatory", "nurse physician discipline Indigenous patient hospital racism Alberta British Columbia Saskatchewan 2024"],
]
const social = [
  ["social", "site:reddit.com/r/saskatchewan Indigenous patient hospital complaint 2025"],
  ["social", "site:reddit.com/r/saskatoon hospital First Nations patient 2026"],
  ["social", "site:reddit.com/r/alberta Indigenous patient hospital complaint 2025"],
  ["social", "site:facebook.com Saskatchewan First Nations hospital patient complaint"],
  ["social", "site:tiktok.com Saskatchewan hospital Indigenous patient complaint"],
]

export function buildMillerNorthPrivateExpansionCampaign() {
  const planned = [
    ...provincialQueries("saskatchewan", 60),
    ...provincialQueries("alberta", 50),
    ...provincialQueries("british_columbia", 30),
    ...Array.from({ length: 40 }, (_, index) => {
      const [source_family, query] = crossRegional[index % crossRegional.length]
      const province = ["saskatchewan", "alberta", "british_columbia"][index % 3]
      const [recency_bucket] = recency[index % 4]
      return { province, treaty6: province !== "british_columbia", source_family, query_pattern: `cross_region:${source_family}:${recency_bucket}`, recency_bucket, query }
    }),
    ...Array.from({ length: 20 }, (_, index) => {
      const [source_family, query] = social[index % social.length]
      const province = ["saskatchewan", "alberta", "british_columbia"][index % 3]
      return { province, treaty6: province !== "british_columbia", source_family, query_pattern: `social_lead:${index % social.length}`, recency_bucket: "social_or_adaptive", query }
    }),
  ]
  const unique = new Map()
  for (const item of planned) {
    const key = `${item.province}\u001f${item.query.toLowerCase()}`
    if (!unique.has(key)) unique.set(key, item)
  }
  const work = [...unique.values()].map(item => ({ ...item, work_id: `mnpx_${id(`${MILLER_NORTH_PRIVATE_EXPANSION_VERSION}\u001f${item.province}\u001f${item.query}`)}`, expected_value: (item.province === "saskatchewan" ? 34 : item.province === "alberta" ? 30 : 22) + (item.recency_bucket === "last_90_days" ? 12 : item.recency_bucket === "2026" ? 9 : item.recency_bucket === "2025" ? 7 : item.recency_bucket === "2024" ? 5 : 0) + (/social/.test(item.source_family) ? -10 : 0) }))
  return { campaign_id: "miller-north-private-incident-expansion-v1", version: MILLER_NORTH_PRIVATE_EXPANSION_VERSION, tavily_ceiling: MILLER_NORTH_PRIVATE_EXPANSION_CEILING, work }
}
