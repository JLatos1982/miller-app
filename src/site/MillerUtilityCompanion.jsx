import MillerSheepdog from "../companion/MillerSheepdog.jsx"
import "./MillerUtilityCompanion.css"

export default function MillerUtilityCompanion() {
  return <div className="miller-utility-companion" aria-hidden="true"><MillerSheepdog themeName="Jade" scenePosition="home" idleAllowed={false} /></div>
}
