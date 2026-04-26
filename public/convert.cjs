const XLSX = require("xlsx")
const fs = require("fs")

const workbook = XLSX.readFile("public/master_resource_master_searchable.xlsx")
const sheet = workbook.Sheets["Master Resources"]

const data = XLSX.utils.sheet_to_json(sheet)

const resources = data.map((row) => ({
  name: row["Resource Name"] || "",
  organization: row["Organization"] || "",
  category: row["Program Category"] || "",
  serviceType: row["Service Type"] || "",
  city: row["City"] || "",
  description: row["Description"] || "",
  phone: row["Phone"] || "",
  website: row["Website"] || "",
  tags: {
    mentalHealth: row["Mental Health Support"] === true,
    substanceUse: true,
    crisis: row["Crisis"] === true,
    youth: row["Youth"] === true,
    indigenous: row["Indigenous"] === true,
    housing: row["Housing"] === true,
    detox: row["Detox"] === true,
    oat: row["OAT"] === true,
    family: row["Family"] === true,
  },
}))

const fileContent =
  "export const resources = " + JSON.stringify(resources, null, 2)

fs.writeFileSync("src/data/resources.js", fileContent)

console.log("✅ resources.js updated with full dataset")