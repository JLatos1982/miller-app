import SwiftUI

struct MillerGuidanceView: View {
  let guidance: MillerGuidance

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "person.crop.circle.fill")
        .font(.system(size: 38))
        .foregroundStyle(MillerTheme.blue)
        .accessibilityLabel("Miller")
      VStack(alignment: .leading, spacing: 9) {
        Text(guidance.title).font(.headline).foregroundStyle(MillerTheme.ink)
        ForEach(Array(guidance.paragraphs.prefix(4).enumerated()), id: \.offset) { _, paragraph in
          Text(paragraph).font(.subheadline).foregroundStyle(.primary)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(16)
    .background(MillerTheme.paleBlue, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}
