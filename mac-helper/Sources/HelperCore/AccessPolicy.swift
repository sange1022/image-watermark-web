import Foundation

public struct AccessPolicy {
    public static let port = 47831
    public static let maxBody = 64 * 1024 * 1024
    public let token: String
    public let origins: Set<String>
    public init(token: String, origins: Set<String> = ["https://sange1022.github.io"]) {
        self.token = token; self.origins = origins
    }
    public func permitsOrigin(host: String?, origin: String?) -> Bool {
        guard host == "127.0.0.1:\(Self.port)", let origin else { return false }
        return origins.contains(origin)
    }
    public func permits(host: String?, origin: String?, authorization: String?) -> Bool {
        guard permitsOrigin(host: host, origin: origin), !token.isEmpty else { return false }
        return authorization == "Bearer \(token)"
    }
}
