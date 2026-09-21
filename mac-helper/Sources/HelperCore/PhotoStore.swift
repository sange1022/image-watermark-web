import Foundation
import AppKit
import Photos
import AVFoundation
import ImageIO
import CryptoKit

struct ImportPayload: Decodable {
    let requestId: UUID
    let name: String
    let jpg: Data
    let mov: Data
}
enum HelperError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let message) = self { return message }; return nil }
}

@MainActor final class PhotoStore {
    private let ledger: ImportLedger
    init() throws {
        let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("WatermarkPhotoHelperTrial", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        ledger = try ImportLedger(url: folder.appendingPathComponent("receipts.json"))
    }

    func save(_ payload: ImportPayload) async throws -> ImportReceipt {
        guard !payload.name.isEmpty, payload.name.count <= 200, payload.jpg.count > 0, payload.mov.count > 0,
              payload.jpg.count <= 24 * 1024 * 1024, payload.mov.count <= 24 * 1024 * 1024 else { throw HelperError.message("实况文件大小或名称无效") }
        var digest = SHA256(); digest.update(data: payload.jpg); digest.update(data: payload.mov)
        let hash = digest.finalize().map { String(format: "%02x", $0) }.joined()
        if let existing = try ledger.lookup(id: payload.requestId, digest: hash) { return existing }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("watermark-live-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: folder) }
        let jpg = folder.appendingPathComponent("photo.jpg"), mov = folder.appendingPathComponent("photo.mov")
        try payload.jpg.write(to: jpg); try payload.mov.write(to: mov)
        try await Self.validate(jpg: jpg, mov: mov)
        var authorization = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if authorization == .notDetermined {
            NSApp.activate(ignoringOtherApps: true)
            authorization = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        }
        guard authorization == .authorized || authorization == .limited else { throw HelperError.message("未允许添加照片。请在系统设置 > 隐私与安全性 > 照片中允许水印实况助手") }
        var assetId: String?
        try ledger.begin(id: payload.requestId, digest: hash)
        do { try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = payload.name.replacingOccurrences(of: "/", with: "-") + ".jpg"
            request.addResource(with: .photo, fileURL: jpg, options: options)
            let movieOptions = PHAssetResourceCreationOptions()
            movieOptions.originalFilename = payload.name.replacingOccurrences(of: "/", with: "-") + ".mov"
            request.addResource(with: .pairedVideo, fileURL: mov, options: movieOptions)
            assetId = request.placeholderForCreatedAsset?.localIdentifier
        } } catch { try? ledger.abort(id: payload.requestId); throw error }
        guard let assetId else { throw HelperError.message("照片已提交，但未取得回执；请先检查照片图库，不要重复导入") }
        let receipt = ImportReceipt(requestId: payload.requestId, assetId: assetId, digest: hash)
        try? ledger.finish(receipt)
        return receipt
    }

    static func validate(jpg: URL, mov: URL) async throws {
        guard let image = CGImageSourceCreateWithURL(jpg as CFURL, nil), CGImageSourceGetType(image) as String? == "public.jpeg",
              let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any],
              let maker = props[kCGImagePropertyMakerAppleDictionary as String] as? [String: Any], let identifier = maker["17"] as? String,
              UUID(uuidString: identifier) != nil else { throw HelperError.message("照片缺少实况配对信息") }
        let asset = AVURLAsset(url: mov)
        let duration = try await asset.load(.duration).seconds
        let metadata = try await asset.load(.metadata)
        var matched = false
        for item in metadata where item.key as? String == "com.apple.quicktime.content.identifier" {
            if try await item.load(.stringValue) == identifier { matched = true }
        }
        guard matched, duration > 2.9, duration < 3.1 else { throw HelperError.message("实况视频与照片不匹配，或时长不是 3 秒") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHLivePhoto.request(withResourceFileURLs: [jpg, mov], placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { photo, info in
                if info[PHLivePhotoInfoIsDegradedKey] as? Bool == true { return }
                if photo != nil { continuation.resume() }
                else { continuation.resume(throwing: HelperError.message("苹果系统未能识别这组实况文件")) }
            }
        }
    }
}
