const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ")

const patterns = [
  "Indigenous patient racism complaint {place}",
  "First Nations patient discrimination hospital {place}",
  "Indigenous family alleges racist treatment {place}",
  "Indigenous patient denied care hospital {place}",
  "Indigenous patient pain medication stereotyping {place}",
  "Indigenous emergency department racism {place}",
  "Indigenous patient death family complaint {place}",
  "Indigenous maternity care racism {place}",
  "Indigenous patient human rights complaint {place}",
  "Indigenous hospital investigation apology {place}",
]

const places = {
  alberta: [
    ["Edmonton hospital Alberta", "Treaty 6 research geography"],
    ["Wetaskiwin hospital Alberta", "Treaty 6 research geography"],
    ["Maskwacis healthcare Alberta", "Treaty 6 research geography"],
    ["central Alberta hospital", "Treaty 6 research geography"],
    ["Lloydminster Alberta hospital", "Treaty 6 research geography"],
    ["Alberta Health Services Edmonton", "Treaty 6 research geography"],
    ["site:aptnnews.ca Alberta hospital", "Alberta Indigenous journalism"],
    ["site:globalnews.ca Alberta hospital", "Alberta journalism"],
  ],
  saskatchewan: [
    ["Saskatoon hospital", "Treaty 6 research geography"],
    ["Prince Albert hospital", "Treaty 6 research geography"],
    ["North Battleford hospital", "Treaty 6 research geography"],
    ["Lloydminster Saskatchewan hospital", "Treaty 6 research geography"],
    ["central Saskatchewan hospital", "Treaty 6 research geography"],
    ["northern Saskatchewan hospital", "Treaty 6 research geography"],
    ["Saskatchewan Health Authority", "Saskatchewan health authority"],
    ["site:aptnnews.ca Saskatchewan hospital", "Saskatchewan Indigenous journalism"],
  ],
  british_columbia: [
    ["Vancouver hospital BC", "British Columbia comparison region"],
    ["Fraser Health Surrey", "British Columbia comparison region"],
    ["Island Health Victoria", "British Columbia comparison region"],
    ["Northern Health Prince George", "British Columbia comparison region"],
  ],
}

export const normalizeCampaignQuery = normalize

export function buildMillerNorthDiscoveryCampaignV2() {
  const campaignId = "miller-north-incident-discovery-campaign-v2"
  const queries = Object.entries(places).flatMap(([province, regionPlaces]) => regionPlaces.flatMap(([place, regional_context]) => patterns.map(pattern => ({
    campaign_id: campaignId,
    province,
    regional_context,
    query: pattern.replace("{place}", place),
  }))))
  const unique = new Set(queries.map(item => `${item.province}\u001f${normalize(item.query)}`))
  if (unique.size !== queries.length) throw new Error("miller_north_campaign_v2_query_collision")
  return { campaign_id: campaignId, version: "miller-north-discovery-checkpoint-v2", queries }
}
