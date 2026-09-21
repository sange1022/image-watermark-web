import SwiftUI
import AppKit
import Photos

@MainActor final class HelperModel: ObservableObject {
    @Published var status = "正在启动本机连接"
    @Published var savedCount = 0
    @Published var lastName = ""
    @Published var ready = false
    private let server = WMServer()
    private var token = UUID().uuidString + UUID().uuidString
    private var store: PhotoStore?
    private var importing = false

    init() {
        do { store = try PhotoStore() }
        catch { status = "无法打开导入记录：\(error.localizedDescription)"; return }
        startServer()
    }

    private func startServer() {
        let session = token
        let policy = AccessPolicy(token: token)
        let error = server.start(validator: { host, origin, authorization, preflight in
            preflight ? policy.permitsOrigin(host: host, origin: origin) : policy.permits(host: host, origin: origin, authorization: authorization)
        }, handler: { [weak self] path, body, completion in
            Task { @MainActor in
                guard let self else { completion(503, ["error": "助手已退出"]); return }
                guard self.token == session else { completion(403, ["error": "旧连接已断开"]); return }
                await self.handle(path: path, body: body, reply: completion)
            }
        })
        if let error { ready = false; status = "连接启动失败：\(error)" }
        else { ready = true; status = "本机连接已就绪" }
    }

    private func connectionURL() -> URL {
        var components = URLComponents(string: "https://sange1022.github.io/image-watermark-web/mac-preview/")!
        components.fragment = "mac-helper=" + token
        return components.url!
    }
    func copyLink() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(connectionURL().absoluteString, forType: .string)
        status = "连接链接已复制"
    }
    func openWeb() {
        guard ready else { return }
        let url = connectionURL()
        if let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") {
            NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: NSWorkspace.OpenConfiguration())
        } else { NSWorkspace.shared.open(url) }
    }

    func disconnect() {
        guard !importing else { return }
        server.stop(); token = UUID().uuidString + UUID().uuidString
        startServer(); status = "旧连接已断开"
    }
    func openPhotos() { NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Photos.app")) }

    private func handle(path: String, body: Data, reply: @escaping (Int, [AnyHashable: Any]) -> Void) async {
        if path == "/status" { reply(200, ["ok": true, "version": 1, "ready": ready]); return }
        if path == "/open-photos" { openPhotos(); reply(200, ["ok": true]); return }
        guard path == "/import", let store else { reply(503, ["error": "导入服务未就绪"]); return }
        guard !importing else { reply(409, ["error": "正在处理上一张实况，请稍后重试"]); return }
        importing = true
        defer { importing = false }
        do {
            let payload = try JSONDecoder().decode(ImportPayload.self, from: body)
            status = "正在验证并保存实况"
            let receipt = try await store.save(payload)
            savedCount += 1; lastName = payload.name; status = "已存入 Mac 照片"
            reply(200, ["ok": true, "requestId": receipt.requestId.uuidString, "assetId": receipt.assetId])
        } catch {
            status = error.localizedDescription
            reply(422, ["error": error.localizedDescription])
        }
    }
}

@main struct WatermarkPhotoHelperApp: App {
    @StateObject private var model = HelperModel()
    var body: some Scene {
        WindowGroup("水印实况助手 · 试用") {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    Image(systemName: "livephoto").font(.system(size: 32)).foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("水印实况助手").font(.title2.bold())
                        Text("Mac 试用版").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Label(model.status, systemImage: model.ready ? "checkmark.circle" : "exclamationmark.triangle")
                    .font(.body).fixedSize(horizontal: false, vertical: true)
                if !model.lastName.isEmpty {
                    Text("本次已处理 \(model.savedCount) 张 · \(model.lastName)").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                HStack {
                    Button { model.openWeb() } label: { Label("打开试用网页", systemImage: "safari") }.disabled(!model.ready).keyboardShortcut(.defaultAction)
                    Button { model.openPhotos() } label: { Label("打开照片", systemImage: "photo.on.rectangle") }
                    Button { model.copyLink() } label: { Image(systemName: "link") }.help("复制连接链接").accessibilityLabel("复制连接链接").disabled(!model.ready)
                }
                Divider()
                HStack {
                    Button("断开网页连接") { model.disconnect() }.disabled(!model.ready)
                    Spacer()
                    Button("退出助手") { NSApp.terminate(nil) }
                }
            }
            .padding(24).frame(width: 420).frame(minHeight: 230)
            .onOpenURL { url in if url.scheme == "watermark-helper" && url.host == "open" { model.openWeb() } }
        }.windowResizability(.contentSize)
    }
}
