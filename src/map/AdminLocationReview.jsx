import PendingLocationReview from "./PendingLocationReview.jsx"
import AddressEvidenceReview from "./AddressEvidenceReview.jsx"
import LocationAutomationReview from "./LocationAutomationReview.jsx"
import MapPopulationPanel from "./MapPopulationPanel.jsx"
import CapabilityStatus from "../admin/CapabilityStatus.jsx"
import PrivateLocationReview from "./PrivateLocationReview.jsx"
import RefreshedLocationReviews from "./RefreshedLocationReviews.jsx"

export default function AdminLocationReview() {
  return <><CapabilityStatus/><MapPopulationPanel/><PendingLocationReview/><RefreshedLocationReviews/><LocationAutomationReview/><AddressEvidenceReview/><PrivateLocationReview/></>
}
