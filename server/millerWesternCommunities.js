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

// A bounded national inventory used for place recognition and coverage reporting.
// It does not claim complete municipal coverage. Regions remain search/service
// areas rather than physical facilities.
export const MILLER_CANADIAN_FOUNDATION_COMMUNITIES = Object.freeze([
  ...[
    ["Manitoba", "Winnipeg / South", ["Winnipeg", "Brandon", "Selkirk", "Portage la Prairie"]],
    ["Manitoba", "Northern Manitoba", ["Thompson", "The Pas", "Flin Flon", "Churchill", "Norway House", "Cross Lake", "Gillam", "Swan River", "Brochet", "Garden Hill", "God's Lake", "God's River", "Lac Brochet", "Leaf Rapids", "Oxford House", "Shamattawa", "Split Lake", "Thicket Portage", "Wabowden", "Wasagamack", "York Landing"]],
    ["Ontario", "Greater Toronto Area", ["Toronto", "Mississauga", "Brampton", "Vaughan", "Markham", "Oshawa", "Oakville", "Burlington"]],
    ["Ontario", "Southwestern Ontario", ["London", "Windsor", "Sarnia", "Chatham", "Kitchener", "Waterloo", "Guelph", "Brantford"]],
    ["Ontario", "Central / Eastern Ontario", ["Hamilton", "St. Catharines", "Niagara Falls", "Barrie", "Peterborough", "Kingston", "Belleville", "Ottawa", "Cornwall"]],
    ["Ontario", "Northern Ontario", ["Sudbury", "Thunder Bay", "Kenora", "Dryden", "Fort Frances", "Sioux Lookout", "Red Lake", "Timmins", "North Bay", "Sault Ste. Marie"]],
    ["Quebec", "Southern Quebec", ["Montréal", "Québec City", "Laval", "Gatineau", "Sherbrooke", "Trois-Rivières", "Saguenay"]],
    ["Quebec", "Northern Quebec", ["Kuujjuaq"]],
    ["New Brunswick", "New Brunswick", ["Moncton", "Saint John", "Fredericton", "Bathurst", "Campbellton", "Miramichi", "Edmundston", "Grand Falls", "Tracadie"]],
    ["Nova Scotia", "Nova Scotia", ["Halifax", "Dartmouth", "Springhill", "Sydney", "North Sydney", "Port Hawkesbury", "New Glasgow", "Amherst", "Truro", "Lunenburg", "Middleton", "Yarmouth"]],
    ["Prince Edward Island", "Prince Edward Island", ["Charlottetown", "Summerside", "Souris", "Montague", "Alberton"]],
    ["Newfoundland and Labrador", "Newfoundland and Labrador", ["St. John's", "Corner Brook", "Gander", "Grand Falls-Windsor", "Happy Valley-Goose Bay", "Labrador City", "Churchill Falls", "St. Anthony", "Nain", "Hopedale", "Makkovik", "Postville", "Rigolet"]],
    ["Yukon", "Yukon", ["Whitehorse", "Dawson City", "Watson Lake"]],
    ["Northwest Territories", "Northwest Territories", ["Yellowknife", "Inuvik", "Fort Smith", "Hay River", "Behchokǫ̀"]],
    ["Nunavut", "Nunavut", ["Iqaluit", "Rankin Inlet", "Cambridge Bay"]],
  ].flatMap(([province, region, communities]) => communities.map(community => Object.freeze({ community, province, region }))),
])

const normalizedLocation = value => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

export const MILLER_CANADIAN_COMMUNITY_INVENTORY = Object.freeze([
  ...MILLER_WESTERN_COMMUNITY_INVENTORY,
  ...MILLER_CANADIAN_FOUNDATION_COMMUNITIES,
])

export const MILLER_CANADIAN_REGION_PROVINCES = Object.freeze({
  ...MILLER_WESTERN_REGION_PROVINCES,
  "northern manitoba": "Manitoba",
  "northern ontario": "Ontario",
  "northwestern ontario": "Ontario",
  "greater toronto area": "Ontario",
  "southwestern ontario": "Ontario",
  "eastern ontario": "Ontario",
  "sioux lookout region": "Ontario",
  "nishnawbe aski nation territory": "Ontario",
  "nunavik": "Quebec",
  "eeyou istchee": "Quebec",
  "cree territory": "Quebec",
  "cape breton": "Nova Scotia",
  "labrador": "Newfoundland and Labrador",
  "western newfoundland": "Newfoundland and Labrador",
  "qikiqtaaluk": "Nunavut",
  "kivalliq": "Nunavut",
  "kitikmeot": "Nunavut",
})

export const MILLER_CANADIAN_LOCATION_PROVINCES = Object.freeze({
  ...Object.fromEntries(MILLER_CANADIAN_COMMUNITY_INVENTORY.map(({ community, province }) => [normalizedLocation(community), province])),
  ...MILLER_CANADIAN_REGION_PROVINCES,
})

export const MILLER_CANADIAN_LOCATION_LABELS = Object.freeze({
  ...Object.fromEntries(MILLER_CANADIAN_COMMUNITY_INVENTORY.map(({ community }) => [normalizedLocation(community), community])),
  ...Object.fromEntries(Object.keys(MILLER_CANADIAN_REGION_PROVINCES).map(region => [region, region.replace(/\b\w/g, character => character.toUpperCase())])),
  "haida gwaii": "Haida Gwaii",
  "mount waddington": "Mount Waddington",
  "north island": "North Island",
  "nunavik": "Nunavik",
  "eeyou istchee": "Eeyou Istchee",
  "cree territory": "Cree territory",
  "cape breton": "Cape Breton",
  "labrador": "Labrador",
  "northwestern ontario": "Northwestern Ontario",
  "greater toronto area": "Greater Toronto Area",
  "southwestern ontario": "Southwestern Ontario",
  "eastern ontario": "Eastern Ontario",
  "sioux lookout region": "Sioux Lookout region",
  "nishnawbe aski nation territory": "Nishnawbe Aski Nation territory",
  "western newfoundland": "Western Newfoundland",
  "qikiqtaaluk": "Qikiqtaaluk",
  "kivalliq": "Kivalliq",
  "kitikmeot": "Kitikmeot",
})

export const MILLER_COVERAGE_MATURITY = Object.freeze({
  "British Columbia": "deep",
  Alberta: "developing",
  Saskatchewan: "developing",
  Manitoba: "foundation",
  Ontario: "foundation",
  Quebec: "foundation",
  "New Brunswick": "foundation",
  "Nova Scotia": "foundation",
  "Prince Edward Island": "foundation",
  "Newfoundland and Labrador": "foundation",
  Yukon: "exploratory",
  "Northwest Territories": "exploratory",
  Nunavut: "exploratory",
  "Canada-wide": "foundation",
})
