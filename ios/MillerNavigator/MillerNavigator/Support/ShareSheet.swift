import SwiftUI
import UIKit

struct ShareSheet: UIViewControllerRepresentable {
  let items: [Any]

  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: items, applicationActivities: nil)
  }

  func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

@MainActor
enum ResourcePackPrinter {
  static func present(title: String, guidance: MillerGuidance, resources: [MillerResource], options: ResourcePackOptions = ResourcePackOptions()) {
    let controller = UIPrintInteractionController.shared
    let info = UIPrintInfo(dictionary: nil)
    info.outputType = .general
    info.jobName = title
    controller.printInfo = info
    controller.printFormatter = UIMarkupTextPrintFormatter(markupText: ResourcePackFormatter.printableHTML(title: title, guidance: guidance, resources: resources, options: options))
    controller.present(animated: true)
  }
}
