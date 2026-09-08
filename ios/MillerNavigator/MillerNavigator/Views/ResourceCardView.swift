import SwiftUI

struct ResourceCardView: View {
  let resource: MillerResource
  let selected: Bool
  let toggle: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(resource.name).font(.headline).foregroundStyle(MillerTheme.ink)
          if !resource.organization.isEmpty { Text(resource.organization).font(.subheadline).foregroundStyle(.secondary) }
        }
        Spacer()
        Button(action: toggle) {
          Image(systemName: selected ? "checkmark.circle.fill" : "circle")
            .font(.title2).foregroundStyle(selected ? MillerTheme.blue : .secondary)
        }
        .accessibilityLabel(selected ? "Remove from resource pack" : "Add to resource pack")
      }

      HStack(spacing: 7) {
        if !resource.category.isEmpty { Text(resource.category).millerTag() }
        if !resource.locationLine.isEmpty { Text(resource.locationLine).millerTag() }
      }
      if !resource.description.isEmpty { Text(resource.description).font(.subheadline).lineLimit(4) }
      if !resource.accessNote.isEmpty {
        Label(resource.accessNote, systemImage: "door.left.hand.open")
          .font(.footnote).foregroundStyle(.secondary).lineLimit(3)
      }
      if !resource.whyShown.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Text("Why shown").font(.caption.bold()).foregroundStyle(.secondary)
          Text(resource.whyShown.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(3)
        }
      }
      if resource.mobileReady, !resource.lastVerified.isEmpty {
        Label("Official source checked \(resource.lastVerified)", systemImage: "checkmark.seal")
          .font(.caption2).foregroundStyle(.secondary)
      }
      HStack(spacing: 18) {
        if let phone = resource.phoneURL {
          Link(destination: phone) { Label("Call", systemImage: "phone.fill") }
        }
        if let website = resource.websiteURL {
          Link(destination: website) { Label("Website", systemImage: "safari.fill") }
        }
        NavigationLink(value: resource) { Label("Details", systemImage: "info.circle") }
      }
      .font(.subheadline.bold()).foregroundStyle(MillerTheme.blue)
    }
    .padding(16)
    .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.secondary.opacity(0.14)))
    .accessibilityElement(children: .contain)
  }
}

private extension View {
  func millerTag() -> some View {
    font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 5)
      .background(MillerTheme.paleBlue, in: Capsule())
  }
}

extension MillerResource {
  var phoneURL: URL? {
    let digits = phone.filter { $0.isNumber || $0 == "+" }
    return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
  }
  var websiteURL: URL? {
    guard let url = URL(string: website), ["http", "https"].contains(url.scheme?.lowercased()) else { return nil }
    return url
  }
}
