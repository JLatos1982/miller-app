import SwiftUI

struct ResourceDetailView: View {
  let resource: MillerResource
  @ObservedObject var viewModel: SearchViewModel

  var body: some View {
    List {
      Section {
        Text(resource.name).font(.title2.bold()).foregroundStyle(MillerTheme.ink)
        if !resource.organization.isEmpty { Text(resource.organization).foregroundStyle(.secondary) }
        if !resource.description.isEmpty { Text(resource.description) }
      }
      detailSection("Contact", rows: [
        ("Phone", resource.phone), ("Email", resource.email), ("Website", resource.website), ("Address", resource.address),
      ])
      detailSection("Access", rows: [
        ("Location", resource.locationLine), ("Service area", resource.scopeNote ?? resource.region), ("Access / referral", resource.referralNote.isEmpty ? resource.accessNote : resource.referralNote),
        ("Eligibility", resource.eligibilityNote), ("Funding", resource.fundingNote), ("Transportation", resource.transportationNote),
      ])
      if !resource.whyShown.isEmpty { Section("Why Miller showed this") { ForEach(resource.whyShown, id: \.self) { Text($0) } } }
      Section("Verification") {
        if !resource.source.authority.isEmpty { LabeledContent("Official source", value: resource.source.authority) }
        if !resource.source.lastVerified.isEmpty { LabeledContent("Last verified", value: resource.source.lastVerified) }
        Text("Confirm current intake, eligibility, and availability directly with the service.").font(.footnote).foregroundStyle(.secondary)
      }
      Section("Pilot feedback") {
        Menu("Tell Miller about this resource") {
          ForEach(MillerFeedbackReason.allCases, id: \.self) { reason in
            Button(reason.label) { Task { await viewModel.submitFeedback(for: resource, reason: reason) } }
          }
        }
        Text("Feedback sends only the resource ID and selected reason—never client information.")
          .font(.footnote).foregroundStyle(.secondary)
      }
    }
    .navigationTitle("Resource details")
    .navigationBarTitleDisplayMode(.inline)
    .alert("Feedback", isPresented: Binding(get: { viewModel.feedbackMessage != nil }, set: { if !$0 { viewModel.feedbackMessage = nil } })) {
      Button("OK", role: .cancel) {}
    } message: { Text(viewModel.feedbackMessage ?? "") }
  }

  @ViewBuilder
  private func detailSection(_ title: String, rows: [(String, String)]) -> some View {
    let visible = rows.filter { !$0.1.isEmpty }
    if !visible.isEmpty {
      Section(title) { ForEach(visible, id: \.0) { label, value in LabeledContent(label, value: value) } }
    }
  }
}
