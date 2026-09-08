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
        if let response = viewModel.response {
          workflowSummary(response)
          if !response.searchScope.message.isEmpty {
            Label(response.searchScope.message, systemImage: "location.magnifyingglass")
              .font(.subheadline).foregroundStyle(.secondary)
              .padding(13).frame(maxWidth: .infinity, alignment: .leading)
              .background(MillerTheme.warm, in: RoundedRectangle(cornerRadius: 14))
          }
          if response.broadenNearby.available {
            Button { Task { await viewModel.broadenNearby() } } label: {
              Label(response.broadenNearby.label, systemImage: "arrow.up.left.and.arrow.down.right")
            }
            .buttonStyle(.bordered).disabled(viewModel.isLoading)
            .accessibilityHint("Adds other verified options in the same province. It does not change the requested province.")
          }
          if !response.workflow.recommendedPackIds.isEmpty {
            Button {
              viewModel.selectSuggestedPack()
              showPack = true
            } label: {
              Label("Review suggested resource pack", systemImage: "checklist")
            }
            .buttonStyle(.bordered)
            .accessibilityHint("Selects up to three resources that cover different parts of the request. You can change the selection before sharing.")
          }
        }
        if viewModel.response?.results.isEmpty == true {
          ContentUnavailableView("No verified matches", systemImage: "magnifyingglass", description: Text("Try a nearby city, province, or a broader support category."))
        }
        ForEach(["start_here", "also_useful", "barrier_support"], id: \.self) { group in
          let resources = (viewModel.response?.results ?? []).filter { $0.resultGroup == group }
          if !resources.isEmpty {
            Text(groupTitle(group)).font(.title3.bold()).padding(.top, 4)
            ForEach(resources) { resource in
              ResourceCardView(resource: resource, selected: viewModel.selectedResourceIDs.contains(resource.id)) {
                viewModel.toggleSelection(resource)
              }
            }
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
        ResourcePackView(guidance: guidance, resources: viewModel.selectedResources, metrics: metrics)
      }
    }
  }

  private func groupTitle(_ group: String) -> String {
    switch group {
    case "start_here": "Start here"
    case "barrier_support": "If cost, transportation, or access is a barrier"
    default: "Also useful"
    }
  }

  @ViewBuilder
  private func workflowSummary(_ response: MillerSearchResponse) -> some View {
    if !response.workflow.needs.isEmpty {
      VStack(alignment: .leading, spacing: 9) {
        Text("Miller understood").font(.headline)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack { ForEach(response.workflow.needs) { need in Text(need.label).millerWorkflowTag() } }
        }
      }
      .accessibilityElement(children: .combine)
    }
    if !response.workflow.pathway.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text("A practical order").font(.headline)
        ForEach(response.workflow.pathway) { step in
          HStack(alignment: .top, spacing: 10) {
            Text("\(step.order)").font(.caption.bold()).foregroundStyle(.white)
              .frame(width: 24, height: 24).background(MillerTheme.blue, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
              Text(step.title).font(.subheadline.bold())
              Text(step.detail).font(.footnote).foregroundStyle(.secondary)
            }
          }
        }
      }
      .padding(15).background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 16))
      .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.secondary.opacity(0.14)))
    }
  }
}

private extension View {
  func millerWorkflowTag() -> some View {
    font(.caption.weight(.semibold)).padding(.horizontal, 9).padding(.vertical, 6)
      .background(MillerTheme.paleBlue, in: Capsule())
  }
}
