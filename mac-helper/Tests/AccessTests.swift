import Foundation

@main struct AccessTests {
    static func main() {
        let policy = AccessPolicy(token: "session-secret")
        precondition(policy.permits(host: "127.0.0.1:47831", origin: "https://sange1022.github.io", authorization: "Bearer session-secret"))
        precondition(!policy.permits(host: "attacker.example:47831", origin: "https://sange1022.github.io", authorization: "Bearer session-secret"))
        precondition(!policy.permits(host: "127.0.0.1:47831", origin: "https://evil.example", authorization: "Bearer session-secret"))
        precondition(!policy.permits(host: "127.0.0.1:47831", origin: nil, authorization: "Bearer session-secret"))
        precondition(!policy.permits(host: "127.0.0.1:47831", origin: "https://sange1022.github.io", authorization: nil))
        precondition(!policy.permits(host: "127.0.0.1:47831", origin: "https://sange1022.github.io", authorization: "Bearer incorrect"))
        print("PASS host/origin/session authorization")
    }
}
