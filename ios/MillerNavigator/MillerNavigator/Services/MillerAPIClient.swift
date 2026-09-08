import Foundation

protocol MillerAPIClientProtocol: Sendable {
  func search(_ request: MillerSearchRequest) async throws -> MillerSearchResponse
  func submitFeedback(resource: MillerResource, reason: MillerFeedbackReason) async throws
}

enum MillerAPIError: LocalizedError {
  case invalidConfiguration
  case invalidResponse
  case service(String)

  var errorDescription: String? {
    switch self {
    case .invalidConfiguration: "Miller’s service address is not configured."
    case .invalidResponse: "Miller received an unreadable response."
    case .service(let message): message
    }
  }
}

struct MillerAPIClient: MillerAPIClientProtocol {
  let baseURL: URL
  let session: URLSession

  init(baseURL: URL = AppConfiguration.apiBaseURL, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  func search(_ request: MillerSearchRequest) async throws -> MillerSearchResponse {
    let endpoint = baseURL.appending(path: "api/mobile/v1/search")
    var urlRequest = URLRequest(url: endpoint)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    urlRequest.httpBody = try encoder.encode(request)
    let (data, response) = try await session.data(for: urlRequest)
    guard let http = response as? HTTPURLResponse else { throw MillerAPIError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      let envelope = try? Self.decoder().decode(ErrorEnvelope.self, from: data)
      throw MillerAPIError.service(envelope?.error ?? "Miller could not complete that search.")
    }
    let result = try Self.decoder().decode(MillerSearchResponse.self, from: data)
    guard result.contract == "miller-mobile-search-v1", result.privacy.queryStored == false else {
      throw MillerAPIError.invalidResponse
    }
    return result
  }

  func submitFeedback(resource: MillerResource, reason: MillerFeedbackReason) async throws {
    let endpoint = baseURL.appending(path: "api/resource-submissions")
    var urlRequest = URLRequest(url: endpoint)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let payload = FeedbackPayload(
      resourceName: resource.name,
      city: resource.city.isEmpty ? nil : resource.city,
      note: "Mobile pilot feedback: \(reason.rawValue). Canonical resource: \(resource.canonicalId). No client information collected.",
      website: resource.website.isEmpty ? nil : resource.website
    )
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    urlRequest.httpBody = try encoder.encode(payload)
    let (_, response) = try await session.data(for: urlRequest)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw MillerAPIError.service("Feedback could not be sent right now.")
    }
  }

  private struct ErrorEnvelope: Decodable { let error: String }
  private struct FeedbackPayload: Encodable {
    let resourceName: String
    let city: String?
    let note: String
    let website: String?
  }

  private static func decoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }
}

enum AppConfiguration {
  static var apiBaseURL: URL {
    let configured = Bundle.main.object(forInfoDictionaryKey: "MILLER_API_BASE_URL") as? String
    guard let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines),
          !value.isEmpty,
          !value.contains("$("),
          let url = URL(string: value),
          ["http", "https"].contains(url.scheme?.lowercased()) else {
      return URL(string: "http://127.0.0.1:8787")!
    }
    return url
  }
}
