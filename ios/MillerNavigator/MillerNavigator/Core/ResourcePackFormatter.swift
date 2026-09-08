import Foundation

public enum ResourcePackFormatter {
  public static func plainText(title: String = "Miller resource pack", guidance: MillerGuidance, resources: [MillerResource]) -> String {
    var lines = [title, ""]
    if !guidance.nextStep.isEmpty {
      lines += ["A good next step", guidance.nextStep, ""]
    }
    for (index, resource) in resources.enumerated() {
      lines.append("\(index + 1). \(resource.name)")
      if !resource.organization.isEmpty { lines.append(resource.organization) }
      if !resource.locationLine.isEmpty { lines.append(resource.locationLine) }
      if let scope = resource.scopeNote, !scope.isEmpty { lines.append("Service area: \(scope)") }
      if !resource.phone.isEmpty { lines.append("Phone: \(resource.phone)") }
      if !resource.website.isEmpty { lines.append("Website: \(resource.website)") }
      if !resource.address.isEmpty { lines.append("Address: \(resource.address)") }
      let access = resource.referralNote.isEmpty ? resource.accessNote : resource.referralNote
      if !access.isEmpty { lines.append("Access: \(access)") }
      if !resource.fundingNote.isEmpty { lines.append("Funding: \(resource.fundingNote)") }
      if !resource.transportationNote.isEmpty { lines.append("Transportation: \(resource.transportationNote)") }
      lines.append("")
    }
    lines.append("Please confirm current intake, eligibility, and availability directly with each service.")
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  public static func printableHTML(title: String = "Miller resource pack", guidance: MillerGuidance, resources: [MillerResource]) -> String {
    let cards = resources.map { resource in
      let details = [
        resource.organization,
        resource.locationLine,
        (resource.scopeNote ?? "").isEmpty ? "" : "Service area: \(resource.scopeNote ?? "")",
        resource.phone.isEmpty ? "" : "Phone: \(resource.phone)",
        resource.website.isEmpty ? "" : "Website: \(resource.website)",
        resource.address.isEmpty ? "" : "Address: \(resource.address)",
        (resource.referralNote.isEmpty ? resource.accessNote : resource.referralNote).isEmpty ? "" : "Access: \(resource.referralNote.isEmpty ? resource.accessNote : resource.referralNote)",
        resource.fundingNote.isEmpty ? "" : "Funding: \(resource.fundingNote)",
        resource.transportationNote.isEmpty ? "" : "Transportation: \(resource.transportationNote)",
      ].filter { !$0.isEmpty }.map { "<div>\(escape($0))</div>" }.joined()
      return "<section><h2>\(escape(resource.name))</h2>\(details)</section>"
    }.joined()
    return """
    <!doctype html><html><head><meta charset="utf-8"><style>
    body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;color:#173042;margin:36px;line-height:1.45}
    h1{font-size:26px}h2{font-size:19px;margin:0 0 6px}section{border-top:1px solid #cad7df;padding:16px 0}
    .guidance{background:#eef7fb;border-radius:10px;padding:14px;margin:14px 0 20px}.note{font-size:13px;color:#506674;margin-top:20px}
    </style></head><body><h1>\(escape(title))</h1>
    <div class="guidance"><strong>A good next step</strong><div>\(escape(guidance.nextStep))</div></div>
    \(cards)<div class="note">Please confirm current intake, eligibility, and availability directly with each service.</div></body></html>
    """
  }

  private static func escape(_ value: String) -> String {
    value.replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
      .replacingOccurrences(of: "'", with: "&#39;")
  }
}
