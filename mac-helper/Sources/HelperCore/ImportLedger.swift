import Foundation

struct ImportReceipt: Codable {
    let requestId: UUID
    let assetId: String
    let digest: String
}

final class ImportLedger {
    private struct Record: Codable {
        let requestId: UUID
        let digest: String
        var assetId: String?
    }
    private struct LedgerError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
    private let url: URL
    private var records: [Record]
    init(url: URL) throws {
        self.url = url
        records = FileManager.default.fileExists(atPath: url.path)
            ? try JSONDecoder().decode([Record].self, from: Data(contentsOf: url)) : []
    }
    func lookup(id: UUID, digest: String) throws -> ImportReceipt? {
        guard let record = records.first(where: { $0.requestId == id }) else { return nil }
        guard record.digest == digest else { throw LedgerError(message: "导入编号与文件不一致") }
        guard let assetId = record.assetId else {
            throw LedgerError(message: "上次保存结果未确认，为避免重复添加已停止。请先检查 Mac 照片")
        }
        return ImportReceipt(requestId: id, assetId: assetId, digest: digest)
    }
    private func persist() throws {
        try JSONEncoder().encode(records).write(to: url, options: .atomic)
    }
    func begin(id: UUID, digest: String) throws {
        guard !records.contains(where: { $0.requestId == id }) else {
            throw LedgerError(message: "导入编号已使用")
        }
        records.append(Record(requestId: id, digest: digest, assetId: nil))
        do { try persist() } catch { records.removeAll { $0.requestId == id }; throw error }
    }
    func finish(_ receipt: ImportReceipt) throws {
        guard let index = records.firstIndex(where: { $0.requestId == receipt.requestId }) else {
            throw LedgerError(message: "缺少导入记录")
        }
        records[index].assetId = receipt.assetId
        // Keep the in-memory receipt even if disk persistence fails; disk retains the protective intent.
        try persist()
    }
    func abort(id: UUID) throws {
        let old = records
        records.removeAll { $0.requestId == id }
        do { try persist() } catch { records = old; throw error }
    }
}
