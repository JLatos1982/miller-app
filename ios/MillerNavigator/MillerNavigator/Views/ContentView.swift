import SwiftUI

struct ContentView: View {
  @StateObject private var metrics: PilotMetrics
  @StateObject private var viewModel: SearchViewModel
  @StateObject private var speech = SpeechRecognizer()

  init() {
    let metrics = PilotMetrics()
    _metrics = StateObject(wrappedValue: metrics)
    _viewModel = StateObject(wrappedValue: SearchViewModel(metrics: metrics))
  }

  var body: some View {
    NavigationStack {
      Group {
        if viewModel.response == nil { HomeView(viewModel: viewModel, speech: speech) }
        else { ResultsView(viewModel: viewModel, metrics: metrics) }
      }
    }
  }
}
