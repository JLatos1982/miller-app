import SwiftUI

struct ResourcePackView: View {
  let guidance: MillerGuidance
  let resources: [MillerResource]
  @ObservedObject var metrics: PilotMetrics
  @Environment(\.dismiss) private var dismiss
  @State private var showShare = false

  private var title: String { "Miller resource pack" }
  private var text: String { ResourcePackFormatter.plainText(title: title, guidance: guidance, resources: resources) }

  var body: some View {
    NavigationStack {
      List {
        Section("A good next step") { Text(guidance.nextStep) }
        Section("Selected resources") {
          ForEach(resources) { resource in
            VStack(alignment: .leading, spacing: 4) {
              Text(resource.name).font(.headline)
              if !resource.locationLine.isEmpty { Text(resource.locationLine).font(.subheadline).foregroundStyle(.secondary) }
              if !resource.phone.isEmpty { Text(resource.phone).font(.subheadline) }
            }
          }
        }
        Section {
          Button { metrics.recordShare(); showShare = true } label: { Label("Email, Messages, or Share", systemImage: "square.and.arrow.up") }
          Button { metrics.recordShare(); ResourcePackPrinter.present(title: title, guidance: guidance, resources: resources) } label: { Label("Print resource sheet", systemImage: "printer") }
        }
        Section { Text("The pack contains service details only. It does not include the original request or any client information.").font(.footnote).foregroundStyle(.secondary) }
      }
      .navigationTitle("Resource pack")
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
      .sheet(isPresented: $showShare) { ShareSheet(items: [text]) }
    }
  }
}
