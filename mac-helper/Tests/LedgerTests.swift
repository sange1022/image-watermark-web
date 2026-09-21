import Foundation

@main struct LedgerTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("receipts.json")
        let id = UUID(), digest = "digest"
        let first = try ImportLedger(url: url)
        try first.begin(id: id, digest: digest)
        let afterCrash = try ImportLedger(url: url)
        var blocked = false
        do { _ = try afterCrash.lookup(id: id, digest: digest) } catch { blocked = true }
        precondition(blocked, "A persisted intent without receipt must block automatic reimport")
        try first.finish(ImportReceipt(requestId: id, assetId: "asset-one", digest: digest))
        let afterSuccess = try ImportLedger(url: url)
        let saved = try afterSuccess.lookup(id: id, digest: digest)
        precondition(saved?.assetId == "asset-one")
        var mismatch = false
        do { _ = try afterSuccess.lookup(id: id, digest: "different") } catch { mismatch = true }
        precondition(mismatch)
        let failed = UUID(); try first.begin(id: failed, digest: digest); try first.abort(id: failed)
        let aborted = try ImportLedger(url: url).lookup(id: failed, digest: digest)
        precondition(aborted == nil)
        print("PASS durable intents block uncertain retries; committed receipts deduplicate; known failures can retry")
    }
}
