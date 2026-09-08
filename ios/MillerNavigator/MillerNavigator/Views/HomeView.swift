import SwiftUI

struct HomeView: View {
  @ObservedObject var viewModel: SearchViewModel
  @ObservedObject var speech: SpeechRecognizer

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        VStack(alignment: .leading, spacing: 7) {
          Text("Miller").font(.largeTitle.bold()).foregroundStyle(MillerTheme.ink)
          Text("Find practical supports across Western Canada.")
            .font(.title3).foregroundStyle(.secondary)
        }

        VStack(alignment: .leading, spacing: 12) {
          Text("Tell Miller what you’re looking for").font(.headline)
          ZStack(alignment: .topLeading) {
          TextEditor(text: $viewModel.query)
              .frame(minHeight: 116)
              .padding(8)
              .scrollContentBackground(.hidden)
            if viewModel.query.isEmpty {
              Text("For example: detox and housing options in Surrey")
                .foregroundStyle(.tertiary).padding(.horizontal, 13).padding(.vertical, 17)
              .allowsHitTesting(false)
            }
          }
          .accessibilityLabel("Describe the practical supports needed")
          .accessibilityHint("Use a generic request without names or health numbers.")
          .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 16))
          .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.secondary.opacity(0.2)))

          HStack {
            Button {
              Task {
                if !speech.isListening { speech.transcript = "" }
                await speech.toggle()
              }
            } label: {
              Label(speech.isListening ? "Stop listening" : "Speak request", systemImage: speech.isListening ? "stop.circle.fill" : "mic.circle.fill")
            }
            .buttonStyle(.bordered)
            .tint(speech.isListening ? .red : MillerTheme.blue)
            .accessibilityHint("Speech is transcribed into the same private, unsaved search field as typed input.")
            Spacer()
            Picker("Province", selection: $viewModel.selectedProvince) {
              Text("Auto").tag("")
              ForEach(viewModel.provinces.dropFirst(), id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
          }

          if speech.permissionDenied {
            Text("Microphone or speech permission is off. Typed search still works fully.")
              .font(.footnote).foregroundStyle(.secondary)
          }

          Button {
            speech.stop()
            Task { await viewModel.search() }
          } label: {
            HStack {
              if viewModel.isLoading { ProgressView().tint(.white) }
              Text(viewModel.isLoading ? "Finding supports…" : "Find resources")
              Spacer()
              Image(systemName: "arrow.right")
            }
            .font(.headline).padding(.vertical, 7)
          }
          .buttonStyle(.borderedProminent)
          .tint(MillerTheme.blue)
          .disabled(viewModel.isLoading)
        }
        .padding(18)
        .background(MillerTheme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

        VStack(alignment: .leading, spacing: 10) {
          Text("Demo requests").font(.headline)
          ForEach(DemoPrompts.all, id: \.self) { prompt in
            Button(prompt) {
              speech.stop()
              viewModel.query = prompt
              Task { await viewModel.search() }
            }
            .buttonStyle(.bordered)
            .tint(MillerTheme.blue)
          }
        }

        Label("Use a generic request. Miller does not need a name, PHN, diagnosis, or case note.", systemImage: "hand.raised.fill")
          .font(.footnote).foregroundStyle(.secondary)
          .padding(14).background(MillerTheme.warm, in: RoundedRectangle(cornerRadius: 14))
      }
      .padding()
      .frame(maxWidth: 720)
      .frame(maxWidth: .infinity)
    }
    .background(Color(uiColor: .systemGroupedBackground))
    .onChange(of: speech.transcript) { _, value in
      if !value.isEmpty { viewModel.query = value }
    }
    .alert("Miller", isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })) {
      Button("OK", role: .cancel) {}
    } message: { Text(viewModel.errorMessage ?? "") }
  }
}
