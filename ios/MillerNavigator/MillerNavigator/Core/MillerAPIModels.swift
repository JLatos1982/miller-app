import Foundation

public struct MillerSearchRequest: Codable, Equatable, Sendable {
  public let query: String
  public let location: String?
  public let province: String?
  public let categories: [String]
  public let limit: Int

  public init(query: String, location: String? = nil, province: String? = nil, categories: [String] = [], limit: Int = 12) {
    self.query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    self.location = location?.nilIfBlank
    self.province = province?.nilIfBlank
    self.categories = Array(Set(categories.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
    self.limit = min(max(limit, 1), 20)
  }
}

public struct MillerSearchResponse: Codable, Equatable, Sendable {
  public let contract: String
  public let generatedAt: String
  public let interpreted: MillerInterpretation
  public let guidance: MillerGuidance
  public let searchScope: MillerSearchScope
  public let resultCount: Int
  public let returnedCount: Int
  public let results: [MillerResource]
  public let privacy: MillerPrivacyStatement
  public let sourcePolicy: String
}

public struct MillerSearchScope: Codable, Equatable, Sendable {
  public let exactLocationMatches: Int
  public let geographyBroadened: Bool
  public let mode: String
  public let message: String
}

public struct MillerInterpretation: Codable, Equatable, Sendable {
  public let primaryIntent: String?
  public let secondaryIntents: [String]
  public let location: String?
  public let province: String?
}

public struct MillerGuidance: Codable, Equatable, Sendable {
  public let title: String
  public let interpretation: String
  public let context: String
  public let nextStep: String
  public let accessNote: String
  public let navigationNote: String
  public let relatedCollections: [MillerCollectionLink]
  public let safeguards: [String]

  public var paragraphs: [String] {
    [interpretation, context, nextStep, accessNote, navigationNote].filter { !$0.isEmpty }
  }
}

public struct MillerCollectionLink: Codable, Equatable, Sendable, Identifiable {
  public let id: String
  public let href: String?
  public let action: String?
  public let label: String
}

public struct MillerPrivacyStatement: Codable, Equatable, Sendable {
  public let queryStored: Bool
  public let clientRecordCreated: Bool
  public let patientIdentifiersRequested: Bool
}

public struct MillerResourceSource: Codable, Equatable, Sendable, Hashable {
  public let authority: String
  public let url: String
  public let verificationStatus: String
  public let lastVerified: String
}

public struct MillerResource: Codable, Equatable, Sendable, Identifiable, Hashable {
  public let canonicalId: String
  public let name: String
  public let organization: String
  public let category: String
  public let serviceType: String
  public let description: String
  public let province: String
  public let city: String
  public let region: String
  public let address: String
  public let phone: String
  public let email: String
  public let website: String
  public let accessNote: String
  public let accessType: String
  public let referralNote: String
  public let eligibilityNote: String
  public let fundingNote: String
  public let transportationNote: String
  public let verifiedStatus: String
  public let lastVerified: String
  public let sourceUrl: String
  public let mobileReady: Bool
  public let tags: [String]
  public let source: MillerResourceSource

  public var id: String { canonicalId }
  public var locationLine: String { [city, province].filter { !$0.isEmpty }.joined(separator: ", ") }
}

public enum MillerFeedbackReason: String, Codable, CaseIterable, Sendable {
  case useful
  case notUseful = "not_useful"
  case wrongLocation = "wrong_location"
  case outdatedResource = "outdated_resource"
  case missingResource = "missing_resource"
  case unclearAccess = "unclear_access"

  public var label: String {
    switch self {
    case .useful: "Useful"
    case .notUseful: "Not useful"
    case .wrongLocation: "Wrong location"
    case .outdatedResource: "Outdated resource"
    case .missingResource: "Missing resource"
    case .unclearAccess: "Unclear access info"
    }
  }
}

extension String {
  fileprivate var nilIfBlank: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
