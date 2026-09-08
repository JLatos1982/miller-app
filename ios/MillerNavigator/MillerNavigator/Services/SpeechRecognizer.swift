import AVFoundation
import Speech
import SwiftUI

@MainActor
final class SpeechRecognizer: ObservableObject {
  @Published private(set) var isListening = false
  @Published private(set) var permissionDenied = false
  @Published var transcript = ""

  private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-CA"))
  private let audioEngine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var hasInputTap = false

  func toggle() async {
    if isListening { stop(); return }
    guard await requestPermission() else {
      permissionDenied = true
      return
    }
    do { try start() } catch { stop() }
  }

  func stop() {
    if audioEngine.isRunning { audioEngine.stop() }
    if hasInputTap {
      audioEngine.inputNode.removeTap(onBus: 0)
      hasInputTap = false
    }
    request?.endAudio()
    task?.cancel()
    request = nil
    task = nil
    isListening = false
  }

  private func requestPermission() async -> Bool {
    let speech = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
    }
    guard speech == .authorized else { return false }
    return await withCheckedContinuation { continuation in
      AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
    }
  }

  private func start() throws {
    stop()
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    self.request = request
    let node = audioEngine.inputNode
    let format = node.outputFormat(forBus: 0)
    node.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
      request.append(buffer)
    }
    hasInputTap = true
    audioEngine.prepare()
    try audioEngine.start()
    isListening = true
    task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
      Task { @MainActor in
        if let result { self?.transcript = result.bestTranscription.formattedString }
        if error != nil || result?.isFinal == true { self?.stop() }
      }
    }
  }
}
