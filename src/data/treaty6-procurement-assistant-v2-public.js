import base from "./treaty6-procurement-beta-public-v1.json" with { type: "json" }

// Public, minimal, source-linked enrichment. These are capability-overlap watch
// areas, never a qualification assessment or a recommendation to bid.
const verifiedAt = "2026-09-13T21:30:00.000Z"
const source = (title, url) => ({ title, url, last_verified_at: verifiedAt })

const profiles = {
  "Kitsaki Management Limited Partnership": {
    public_summary: "Kitsaki manages the economic-development activities of Lac La Ronge Indian Band and describes a portfolio spanning environmental, IT, engineering, utility vegetation, forestry, transportation and other sectors.",
    watch_categories: ["ENVIRONMENTAL_SERVICES", "PROFESSIONAL_SERVICES", "INFORMATION_TECHNOLOGY", "UTILITY_VEGETATION", "FORESTRY"],
    buyer_watch: ["CanadaBuys", "Government of Saskatchewan", "SaskPower"],
    supplier_paths: ["CanadaBuys supplier registration", "SaskTenders / GEM supplier portal"],
    official_links: [source("Kitsaki Management", "https://kitsaki.com/"), source("Kitsaki group of companies", "https://kitsaki.com/group-of-companies/")],
  },
  "Canada North Environmental Services": {
    public_summary: "CanNorth describes environmental and heritage services, including assessments, monitoring, regulatory liaison, community-based monitoring, traditional knowledge studies and environmental data management.",
    watch_categories: ["ENVIRONMENTAL_ASSESSMENT", "ENVIRONMENTAL_MONITORING", "WATER_AND_GROUNDWATER", "REGULATORY_ADVISORY", "INDIGENOUS_ENGAGEMENT"],
    buyer_watch: ["CanadaBuys", "Alberta Infrastructure", "SaskPower", "SaskEnergy"],
    supplier_paths: ["CanadaBuys supplier registration", "Alberta Purchasing Connection supplier account", "SaskTenders / GEM supplier portal"],
    official_links: [source("CanNorth services", "https://www.cannorth.com/services"), source("CanNorth projects", "https://cannorth.com/projects-2/"), source("CanNorth Indigenous-led initiatives", "https://www.cannorth.com/indigenous-led-initiatives")],
  },
  "Kitsaki Vegetation Services": {
    public_summary: "Kitsaki Vegetation Services describes vegetation management for utility, municipal and industrial projects, including aerial tree trimming, right-of-way and brush clearing, dangerous-tree removal and herbicide application.",
    watch_categories: ["VEGETATION_MANAGEMENT", "RIGHT_OF_WAY", "UTILITY_SERVICES", "FORESTRY"],
    buyer_watch: ["SaskPower", "Government of Saskatchewan", "Alberta Infrastructure"],
    supplier_paths: ["SaskTenders / GEM supplier portal", "Alberta Purchasing Connection supplier account"],
    official_links: [source("Kitsaki Vegetation Services", "https://kitsaki.com/companies/kitsaki-vegetation-services-kvs/")],
  },
  R8dius: {
    public_summary: "R8dius is described by its Kitsaki and Deloitte sources as an Indigenous professional-services, technology-implementation and managed-services business.",
    watch_categories: ["PROFESSIONAL_SERVICES", "TECHNOLOGY_IMPLEMENTATION", "MANAGED_SERVICES", "DATA_AND_INFORMATION_MANAGEMENT"],
    buyer_watch: ["CanadaBuys", "Government of Alberta", "Government of Saskatchewan"],
    supplier_paths: ["CanadaBuys supplier registration", "Alberta Purchasing Connection supplier account", "SaskTenders / GEM supplier portal"],
    official_links: [source("Kitsaki annual impact report", "https://kitsaki.com/wp-content/uploads/2026/01/2025-Kitsaki-Annual-Impact-Report-2025-WEB-PAGES-3.pdf"), source("Deloitte reconciliation action plan", "https://www.deloitte.com/ca/en/about/story/purpose-values/reconciliation-action-plan.html")],
  },
  "A2SKI Industrial": {
    public_summary: "A2SKI describes itself as a 100% First Nations-owned Canadian general contractor operated by Peter Ballantyne Group of Companies, serving mining, industrial, electrical, commercial and residential markets.",
    watch_categories: ["CONSTRUCTION", "EARTHWORKS", "ELECTRICAL", "MECHANICAL", "MAINTENANCE", "PROJECT_MANAGEMENT"],
    buyer_watch: ["Alberta Infrastructure", "Government of Saskatchewan", "SaskPower", "SaskEnergy"],
    supplier_paths: ["Alberta Purchasing Connection supplier account", "SaskTenders / GEM supplier portal"],
    official_links: [source("A2SKI Industrial", "https://a2ski.ca/"), source("A2SKI projects", "https://a2ski.ca/projects/")],
  },
  "Young Spirit Supplies": {
    public_summary: "Frog Lake First Nation describes Young Spirit Supplies as a 100% First Nations-owned and operated supplier of janitorial and sanitization products, PPE, ASTM Level 3 surgical face masks and promotional-product distribution.",
    watch_categories: ["JANITORIAL_SUPPLIES", "PERSONAL_PROTECTIVE_EQUIPMENT", "MEDICAL_SUPPLIES", "PROMOTIONAL_PRODUCTS"],
    buyer_watch: ["CanadaBuys", "Government of Alberta", "Saskatchewan Health Authority"],
    supplier_paths: ["CanadaBuys supplier registration", "Alberta Purchasing Connection supplier account", "SaskTenders / GEM supplier portal"],
    official_links: [source("Frog Lake First Nation departments", "https://www.froglake.ca/departments"), source("Indigiconnect directory", "https://business.indigiconnect.com/directory/Details/young-spirit-supplies-3487865")],
  },
}

export const treaty6ProcurementAssistantV2 = Object.freeze({
  ...base,
  title: "Treaty 6 Procurement Intelligence",
  subtitle: "A public market watch for Treaty 6 businesses: opportunities, buyers, supplier pathways and meaningful changes.",
  generated_at: verifiedAt,
  disclosures: [
    "Beta — this data is still being refined.",
    "Samwise monitors public procurement sources, buyer activity and supplier pathways. A watch entry reflects public capability overlap, not confirmed qualification or bid advice.",
    "Always confirm deadlines, eligibility and full requirements with the official procurement source.",
  ],
  sections: {
    ...base.sections,
    business_watchlists: base.sections.business_watchlists.map(item => ({ ...item, ...profiles[item.canonical_name], last_verified_at: verifiedAt })),
    weekly_digest: [{ event_type: "MARKET_PASS_COMPLETED", title: "Current market pass completed", summary: "No additional source-verified open bid passed the public gate. The page continues to show the verified planning signal and practical supplier pathways rather than padding the feed.", observed_at: verifiedAt, source_url: "https://canadabuys.canada.ca/en/tender-opportunities" }],
    buyer_intelligence: [
      { name: "CanadaBuys / PSPC", jurisdiction: "Federal", categories: ["Professional services", "Environmental services", "IT", "Goods"], pathway: "Register to view and bid on PSPC tender opportunities; follow searches and notices for updates.", indigenous_signal: "Use the official Indigenous procurement resources and confirm tender-specific PSIB language.", source_url: "https://canadabuys.canada.ca/en/tender-opportunities" },
      { name: "Government of Alberta / APC", jurisdiction: "Alberta", categories: ["Goods", "Services", "Construction"], pathway: "A supplier account is required for competitive bidding features, documents, expressions of interest and updates.", indigenous_signal: "No preference is inferred from inclusion in this watch layer.", source_url: "https://www.alberta.ca/get-started-as-a-supplier" },
      { name: "Government of Saskatchewan / SaskTenders", jurisdiction: "Saskatchewan", categories: ["Public-sector goods", "Services", "Construction"], pathway: "SaskTenders and the GEM Supplier Portal provide opportunity and registration support.", indigenous_signal: "No preference is inferred from inclusion in this watch layer.", source_url: "https://www.saskatchewan.ca/government/doing-business-with-government" },
      { name: "Alberta Infrastructure", jurisdiction: "Alberta", categories: ["Construction", "Property and building management", "Professional consulting"], pathway: "Public opportunities and prequalification requests are advertised through APC.", indigenous_signal: "No preference is inferred from inclusion in this watch layer.", source_url: "https://www.alberta.ca/tendering-contracting-infrastructure-vendor-opportunities" },
    ],
    indigenous_procurement: [
      { title: "Procurement Strategy for Indigenous Business", summary: "Federal Indigenous procurement eligibility and set-aside treatment are tender-specific. Confirm the current official program requirements before relying on a notice.", source_url: "https://canadabuys.canada.ca/en/buyer-s-portal/legislation-and-policies/socioeconomics/indigenous-considerations/procurement-strategy-indigenous-business" },
      { title: "CanadaBuys supplier pathway", summary: "CanadaBuys publishes tender opportunities and supplier guidance. Registration and notice-following can help suppliers receive updates.", source_url: "https://canadabuys.canada.ca/en/tender-opportunities" },
    ],
    recent_awards: [],
  },
  assistant_method: ["Public opportunity discovered", "Official source and status checked", "Category/capability overlap identified", "Source-linked public watch entry created", "Business confirms all qualification and tender requirements"],
})
