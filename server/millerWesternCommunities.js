export const MILLER_WESTERN_COMMUNITY_INVENTORY = Object.freeze([
  ...[
    ["Lower Mainland / Fraser", ["Abbotsford", "Burnaby", "Chilliwack", "Coquitlam", "Hope", "Langley", "Maple Ridge", "Mission", "New Westminster", "Pitt Meadows", "Port Coquitlam", "Port Moody", "Surrey", "White Rock"]],
    ["Sea-to-Sky / Sunshine Coast", ["Powell River", "Sechelt", "Squamish", "Whistler"]],
    ["Vancouver Island", ["Campbell River", "Courtenay", "Duncan", "Nanaimo", "Parksville", "Port Alberni", "Port Hardy", "Port McNeill", "Ucluelet", "Victoria"]],
    ["Interior / Okanagan / Kootenays", ["100 Mile House", "Castlegar", "Clearwater", "Cranbrook", "Creston", "Grand Forks", "Invermere", "Kamloops", "Kelowna", "Kimberley", "Nelson", "Osoyoos", "Penticton", "Revelstoke", "Salmon Arm", "Sparwood", "Trail", "Vernon", "Williams Lake"]],
    ["Northern B.C. / North Coast", ["Atlin", "Burns Lake", "Daajing Giids", "Dawson Creek", "Fort Nelson", "Fort St. James", "Fort St. John", "Hazelton", "Kitimat", "Mackenzie", "Masset", "Prince George", "Prince Rupert", "Quesnel", "Smithers", "Terrace", "Tumbler Ridge", "Valemount", "Vanderhoof"]],
  ].flatMap(([region, communities]) => communities.map(community => Object.freeze({ community, province: "British Columbia", region }))),
  ...[
    ["Calgary / South", ["Airdrie", "Banff", "Brooks", "Canmore", "Chestermere", "Claresholm", "Cochrane", "Didsbury", "High River", "Lethbridge", "Medicine Hat", "Okotoks", "Pincher Creek", "Strathmore", "Vulcan"]],
    ["Central", ["Camrose", "Drumheller", "Leduc", "Olds", "Red Deer", "Rocky Mountain House", "Stettler", "Wetaskiwin"]],
    ["Edmonton / West", ["Edson", "Fort Saskatchewan", "Hinton", "Spruce Grove", "St. Albert", "Whitecourt"]],
    ["North / Northeast", ["Bonnyville", "Cold Lake", "Fairview", "Fort McMurray", "Grande Prairie", "High Level", "High Prairie", "Lac La Biche", "Lloydminster", "Manning", "Peace River", "Slave Lake", "Valleyview"]],
  ].flatMap(([region, communities]) => communities.map(community => Object.freeze({ community, province: "Alberta", region }))),
  ...[
    ["South / Southwest", ["Assiniboia", "Carlyle", "Estevan", "Maple Creek", "Moose Jaw", "Shaunavon", "Swift Current", "Weyburn"]],
    ["Central / West Central", ["Biggar", "Humboldt", "Kindersley", "North Battleford", "Outlook", "Rosetown", "Saskatoon"]],
    ["East / Northeast", ["Broadview", "Canora", "Esterhazy", "Fort Qu'Appelle", "Kamsack", "Melville", "Melfort", "Nipawin", "Tisdale", "Yorkton"]],
    ["North / Far North", ["Big River", "Buffalo Narrows", "Île-à-la-Crosse", "La Loche", "La Ronge", "Meadow Lake", "Prince Albert"]],
  ].flatMap(([region, communities]) => communities.map(community => Object.freeze({ community, province: "Saskatchewan", region }))),
])

export const MILLER_WESTERN_CITY_PROVINCES = Object.freeze(Object.fromEntries(
  MILLER_WESTERN_COMMUNITY_INVENTORY.map(({ community, province }) => [community.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(), province]),
))

// Recognized service regions are search locations, not physical communities.
// Keeping them separate prevents a regional query from creating a false local-facility claim.
export const MILLER_WESTERN_REGION_PROVINCES = Object.freeze({
  "haida gwaii": "British Columbia",
  "mount waddington": "British Columbia",
  "north island": "British Columbia",
  "northern saskatchewan": "Saskatchewan",
  "northwest saskatchewan": "Saskatchewan",
  "northeast british columbia": "British Columbia",
})

export const MILLER_WESTERN_LOCATION_PROVINCES = Object.freeze({
  ...MILLER_WESTERN_CITY_PROVINCES,
  ...MILLER_WESTERN_REGION_PROVINCES,
})

export const MILLER_WESTERN_LOCATION_LABELS = Object.freeze({
  ...Object.fromEntries(MILLER_WESTERN_COMMUNITY_INVENTORY.map(({ community }) => [community.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(), community])),
  "haida gwaii": "Haida Gwaii",
  "mount waddington": "Mount Waddington",
  "north island": "North Island",
  "northern saskatchewan": "Northern Saskatchewan",
  "northwest saskatchewan": "Northwest Saskatchewan",
  "northeast british columbia": "Northeast British Columbia",
})
