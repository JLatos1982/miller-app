import Foundation

@MainActor
final class PilotMetrics: ObservableObject {
  @Published private(set) var searches: Int
  @Published private(set) var shares: Int
  @Published private(set) var noResults: Int
  @Published private(set) var averageMilliseconds: Int
  @Published private(set) var intentCounts: [String: Int]
  @Published private(set) var provinceCounts: [String: Int]

  private let defaults: UserDefaults
  private let key = "miller.pilot.metrics.v1"
  private var durations: [Int]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let state = defaults.dictionary(forKey: key) ?? [:]
    searches = state["searches"] as? Int ?? 0
    shares = state["shares"] as? Int ?? 0
    noResults = state["no_results"] as? Int ?? 0
    durations = state["durations_ms"] as? [Int] ?? []
    intentCounts = state["intent_counts"] as? [String: Int] ?? [:]
    provinceCounts = state["province_counts"] as? [String: Int] ?? [:]
    averageMilliseconds = durations.isEmpty ? 0 : durations.reduce(0, +) / durations.count
  }

  func recordSearch(duration: Duration, resultCount: Int, intent: String?, province: String?) {
    searches += 1
    if resultCount == 0 { noResults += 1 }
    let milliseconds = Int(duration.components.seconds * 1_000) + Int(duration.components.attoseconds / 1_000_000_000_000_000)
    durations = Array((durations + [max(milliseconds, 0)]).suffix(50))
    if let intent, !intent.isEmpty { intentCounts[intent, default: 0] += 1 }
    if let province, !province.isEmpty { provinceCounts[province, default: 0] += 1 }
    averageMilliseconds = durations.reduce(0, +) / durations.count
    persist()
  }

  func recordShare() { shares += 1; persist() }

  private func persist() {
    defaults.set([
      "searches": searches,
      "shares": shares,
      "no_results": noResults,
      "durations_ms": durations,
      "intent_counts": intentCounts,
      "province_counts": provinceCounts,
    ], forKey: key)
  }
}
