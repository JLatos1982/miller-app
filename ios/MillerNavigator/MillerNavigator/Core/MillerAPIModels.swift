import Foundation

public struct MillerSearchRequest: Codable, Equatable, Sendable {
  public let query: String
  public let location: String?
  public let province: String?
  public let categories: [String]
  public let limit: Int
  public let broadenNearby: Bool

  public init(query: String, location: String? = nil, province: String? = nil, categories: [String] = [], limit: Int = 12, broadenNearby: Bool = false) {
    self.query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    self.location = location?.nilIfBlank
    self.province = province?.nilIfBlank
    self.categories = Array(Set(categories.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
    self.limit = min(max(limit, 1), 20)
    self.broadenNearby = broadenNearby
  }
}

public struct MillerSearchResponse: Codable, Equatable, Sendable {
  public let contract: String
  public let generatedAt: String
  public let interpreted: MillerInterpretation
  public let guidance: MillerGuidance
  public let searchScope: MillerSearchScope
  public let broadenNearby: MillerBroadenNearby
  public let workflow: MillerProfessionalWorkflow
  public let resultCount: Int
  public let returnedCount: Int
  public let results: [MillerResource]
  public let privacy: MillerPrivacyStatement
  public let sourcePolicy: String
}

public struct MillerBroadenNearby: Codable, Equatable, Sendable {
  public let available: Bool
  public let applied: Bool
  public let additionalMatchCount: Int
  public let label: String
}

public struct MillerProfessionalWorkflow: Codable, Equatable, Sendable {
  public let needs: [MillerNeed]
  public let pathway: [MillerPathwayStep]
  public let recommendedPackIds: [String]
  public let target: String
}

public struct MillerNeed: Codable, Equatable, Sendable, Identifiable {
  public let needId: String
  public let label: String
  public let role: String
  public let basis: String
  public var id: String { needId }
}

public struct MillerPathwayStep: Codable, Equatable, Sendable, Identifiable {
  public let stepId: String
  public let title: String
  public let detail: String
  public let resourceIds: [String]
  public let basis: String
  public let order: Int
  public var id: String { "\(order)-\(stepId)" }
}

public struct MillerSearchScope: Codable, Equatable, Sendable {
  public let exactLocationMatches: Int
  public let physicalLocationMatches: Int?
  public let serviceAreaMatches: Int?
  public let noVerifiedLocalFacility: Bool?
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

public struct MillerPhysicalLocation: Codable, Equatable, Sendable, Hashable {
  public let community: String
  public let address: String
  public let province: String
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
  public let physicalLocation: MillerPhysicalLocation?
  public let localServiceArea: [String]?
  public let regionalServiceArea: [String]?
  public let provinceWide: Bool?
  public let virtual: Bool?
  public let navigationOnly: Bool?
  public let scopeNote: String?
  public let locationRelationship: String?
  public let locationLabel: String?
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
  public let whyShown: [String]
  public let matchedNeeds: [String]
  public let resultGroup: String
  public let tags: [String]
  public let source: MillerResourceSource

  public var id: String { canonicalId }
  public var locationLine: String {
    if let locationLabel, !locationLabel.isEmpty { return locationLabel }
    return [city, province].filter { !$0.isEmpty }.joined(separator: ", ")
  }
}

public enum MillerFeedbackReason: String, Codable, CaseIterable, Sendable {
  case useful
  case notUseful = "not_useful"
  case wrongPhone = "wrong_phone"
  case brokenLink = "broken_link"
  case serviceClosed = "service_closed"
  case wrongLocation = "wrong_location"
  case outdatedResource = "outdated_resource"
  case missingResource = "missing_resource"
  case accessInformationWrong = "access_information_wrong"

  public var label: String {
    switch self {
    case .useful: "Useful"
    case .notUseful: "Not useful"
    case .wrongPhone: "Wrong phone"
    case .brokenLink: "Link broken"
    case .serviceClosed: "Service closed"
    case .wrongLocation: "Wrong location"
    case .outdatedResource: "Outdated resource"
    case .missingResource: "Missing resource"
    case .accessInformationWrong: "Access information wrong"
    }
  }
}

extension String {
  fileprivate var nilIfBlank: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
