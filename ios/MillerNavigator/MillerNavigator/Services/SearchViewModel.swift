import SwiftUI

@MainActor
final class SearchViewModel: ObservableObject {
  @Published var query = ""
  @Published var selectedProvince = ""
  @Published var response: MillerSearchResponse?
  @Published var selectedResourceIDs = Set<String>()
  @Published var isLoading = false
  @Published var errorMessage: String?
  @Published var feedbackMessage: String?

  let provinces = ["", "British Columbia", "Alberta", "Saskatchewan", "Canada-wide"]
  private let client: any MillerAPIClientProtocol
  private let metrics: PilotMetrics

  init(client: any MillerAPIClientProtocol = MillerAPIClient(), metrics: PilotMetrics) {
    self.client = client
    self.metrics = metrics
  }

  var selectedResources: [MillerResource] {
    response?.results.filter { selectedResourceIDs.contains($0.id) } ?? []
  }

  func search() async {
    await performSearch(broadenNearby: false)
  }

  func broadenNearby() async {
    await performSearch(broadenNearby: true)
    metrics.recordBroadenNearby()
  }

  func selectSuggestedPack() {
    guard let response else { return }
    selectedResourceIDs.formUnion(response.workflow.recommendedPackIds)
    metrics.recordSuggestedSelection()
  }

  private func performSearch(broadenNearby: Bool) async {
    let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty else { errorMessage = "Tell Miller what you’re looking for."; return }
    isLoading = true
    errorMessage = nil
    selectedResourceIDs.removeAll()
    let clock = ContinuousClock()
    let started = clock.now
    do {
      let result = try await client.search(MillerSearchRequest(query: clean, province: selectedProvince, limit: 16, broadenNearby: broadenNearby))
      response = result
      metrics.recordSearch(
        duration: started.duration(to: clock.now),
        resultCount: result.returnedCount,
        intent: result.interpreted.primaryIntent,
        province: result.interpreted.province
      )
    } catch {
      errorMessage = error.localizedDescription
    }
    isLoading = false
  }

  func toggleSelection(_ resource: MillerResource) {
    if selectedResourceIDs.contains(resource.id) { selectedResourceIDs.remove(resource.id) }
    else { selectedResourceIDs.insert(resource.id) }
  }

  func submitFeedback(for resource: MillerResource, reason: MillerFeedbackReason) async {
    do {
      try await client.submitFeedback(resource: resource, reason: reason)
      feedbackMessage = "Thanks — this will go through Miller’s resource-review process."
    } catch {
      feedbackMessage = error.localizedDescription
    }
  }
}
