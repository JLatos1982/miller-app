import XCTest
@testable import MillerNavigatorCore

final class MillerNavigatorCoreTests: XCTestCase {
  private let guidance = MillerGuidance(
    title: "Miller’s guide",
    interpretation: "Sounds like you’re looking for treatment.",
    context: "Programs use different intake pathways.",
    nextStep: "Call the program to confirm intake.",
    accessNote: "",
    navigationNote: "",
    relatedCollections: [],
    safeguards: []
  )

  func testSearchRequestBoundsLimitAndRemovesDuplicateCategories() {
    let request = MillerSearchRequest(query: "  Detox in Surrey  ", province: "BC", categories: ["detox", "detox"], limit: 100)
    XCTAssertEqual(request.query, "Detox in Surrey")
    XCTAssertEqual(request.categories, ["detox"])
    XCTAssertEqual(request.limit, 20)
  }

  func testResourcePackContainsOnlyPracticalShareFields() {
    let resource = fixtureResource(name: "Surrey service")
    let output = ResourcePackFormatter.plainText(guidance: guidance, resources: [resource])
    XCTAssertTrue(output.contains("Surrey service"))
    XCTAssertTrue(output.contains("Phone: 604-555-0100"))
    XCTAssertTrue(output.contains("confirm current intake"))
    XCTAssertFalse(output.lowercased().contains("score"))
  }

  func testPrintableResourcePackEscapesUntrustedText() {
    let resource = fixtureResource(name: "Service <script>alert(1)</script>")
    let output = ResourcePackFormatter.printableHTML(guidance: guidance, resources: [resource])
    XCTAssertTrue(output.contains("&lt;script&gt;"))
    XCTAssertFalse(output.contains("<script>alert"))
  }

  func testDemoPromptsContainThreeWesternProvinceCities() {
    XCTAssertTrue(DemoPrompts.all.contains { $0.contains("Surrey") })
    XCTAssertTrue(DemoPrompts.all.contains { $0.contains("Edmonton") })
    XCTAssertTrue(DemoPrompts.all.contains { $0.contains("Saskatoon") })
  }

  private func fixtureResource(name: String) -> MillerResource {
    MillerResource(
      canonicalId: "resource-1", name: name, organization: "Example Society", category: "Treatment",
      serviceType: "Outpatient", description: "A practical service.", province: "British Columbia", city: "Surrey",
      region: "Lower Mainland", address: "100 Main Street",
      physicalLocation: MillerPhysicalLocation(community: "Surrey", address: "100 Main Street", province: "British Columbia"),
      localServiceArea: ["Surrey"], regionalServiceArea: ["Lower Mainland"], provinceWide: false,
      virtual: false, navigationOnly: false, scopeNote: "Located in Surrey.",
      locationRelationship: "located_here", locationLabel: "Located in Surrey",
      phone: "604-555-0100", email: "",
      website: "https://example.org", accessNote: "Call first", accessType: "phone_first",
      referralNote: "Self-referral", eligibilityNote: "", fundingNote: "", transportationNote: "",
      verifiedStatus: "verified_active", lastVerified: "2026-09-08", sourceUrl: "https://example.org",
      mobileReady: true, tags: [],
      source: MillerResourceSource(authority: "Example Society", url: "https://example.org", verificationStatus: "verified_active", lastVerified: "2026-09-08")
    )
  }
}
