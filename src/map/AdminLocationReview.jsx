import PendingLocationReview from "./PendingLocationReview.jsx"
import AddressEvidenceReview from "./AddressEvidenceReview.jsx"
import LocationAutomationReview from "./LocationAutomationReview.jsx"
import MapPopulationPanel from "./MapPopulationPanel.jsx"

export default function AdminLocationReview() {
  return <><MapPopulationPanel/><PendingLocationReview/><LocationAutomationReview/><AddressEvidenceReview/></>
}
