import SwiftUI

struct ResultsView: View {
  @ObservedObject var viewModel: SearchViewModel
  @ObservedObject var metrics: PilotMetrics
  @State private var showPack = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 14) {
        HStack {
          Button { viewModel.response = nil } label: { Label("New search", systemImage: "chevron.left") }
          Spacer()
          if let response = viewModel.response {
            Text(response.resultCount == response.returnedCount
              ? "\(response.resultCount) resources"
              : "\(response.resultCount) matches · \(response.returnedCount) shown")
              .font(.subheadline.bold())
          }
        }
        if let guidance = viewModel.response?.guidance { MillerGuidanceView(guidance: guidance) }
        if viewModel.response?.results.isEmpty == true {
          ContentUnavailableView("No verified matches", systemImage: "magnifyingglass", description: Text("Try a nearby city, province, or a broader support category."))
        }
        ForEach(viewModel.response?.results ?? []) { resource in
          ResourceCardView(resource: resource, selected: viewModel.selectedResourceIDs.contains(resource.id)) {
            viewModel.toggleSelection(resource)
          }
        }
      }
      .padding()
      .frame(maxWidth: 820)
      .frame(maxWidth: .infinity)
    }
    .background(Color(uiColor: .systemGroupedBackground))
    .safeAreaInset(edge: .bottom) {
      if !viewModel.selectedResources.isEmpty {
        Button {
          showPack = true
          metrics.recordShare()
        } label: {
          Label("Share \(viewModel.selectedResources.count) selected", systemImage: "square.and.arrow.up")
            .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent).tint(MillerTheme.blue).padding().background(.ultraThinMaterial)
      }
    }
    .navigationDestination(for: MillerResource.self) { resource in
      ResourceDetailView(resource: resource, viewModel: viewModel)
    }
    .sheet(isPresented: $showPack) {
      if let guidance = viewModel.response?.guidance {
        ResourcePackView(guidance: guidance, resources: viewModel.selectedResources)
      }
    }
  }
}
