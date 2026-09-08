import SwiftUI

struct ResourcePackView: View {
  let guidance: MillerGuidance
  let resources: [MillerResource]
  @ObservedObject var metrics: PilotMetrics
  @Environment(\.dismiss) private var dismiss
  @State private var showShare = false
  @State private var draftResources: [MillerResource]
  @State private var options = ResourcePackOptions()

  init(guidance: MillerGuidance, resources: [MillerResource], metrics: PilotMetrics) {
    self.guidance = guidance
    self.resources = resources
    self.metrics = metrics
    _draftResources = State(initialValue: resources)
  }

  private var title: String { "Miller resource pack" }
  private var text: String { ResourcePackFormatter.plainText(title: title, guidance: guidance, resources: draftResources, options: options) }

  var body: some View {
    NavigationStack {
      List {
        Section("A good next step") { Text(guidance.nextStep) }
        Section("Selected resources") {
          ForEach(draftResources) { resource in
            VStack(alignment: .leading, spacing: 4) {
              Text(resource.name).font(.headline)
              if !resource.locationLine.isEmpty { Text(resource.locationLine).font(.subheadline).foregroundStyle(.secondary) }
              if !resource.phone.isEmpty { Text(resource.phone).font(.subheadline) }
            }
          }
          .onDelete { draftResources.remove(atOffsets: $0) }
          .onMove { draftResources.move(fromOffsets: $0, toOffset: $1) }
        }
        Section("Include in the pack") {
          Toggle("Location and service area", isOn: $options.includeLocation)
          Toggle("Access and referral notes", isOn: $options.includeAccess)
          Toggle("Funding and transportation notes", isOn: $options.includeFundingAndTransportation)
        }
        Section {
          Button { metrics.recordShare(); showShare = true } label: { Label("Email, Messages, or Share", systemImage: "square.and.arrow.up") }
            .disabled(draftResources.isEmpty)
          Button { metrics.recordShare(); ResourcePackPrinter.present(title: title, guidance: guidance, resources: draftResources, options: options) } label: { Label("Print resource sheet", systemImage: "printer") }
            .disabled(draftResources.isEmpty)
        }
        Section { Text("The pack contains service details only. It does not include the original request or any client information.").font(.footnote).foregroundStyle(.secondary) }
      }
      .navigationTitle("Resource pack")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
        ToolbarItem(placement: .primaryAction) { EditButton() }
      }
      .sheet(isPresented: $showShare) { ShareSheet(items: [text]) }
    }
  }
}
