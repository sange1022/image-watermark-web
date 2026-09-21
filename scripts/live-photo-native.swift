// Generates our own Apple metadata fixture, or validates exported resources without importing a library.
import Foundation
import AVFoundation
import ImageIO
import Photos
import AppKit

let args = CommandLine.arguments
let placeholder = "00000000-0000-0000-0000-000000000000"
func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }

if args.count == 4 && args[1] == "check" {
    let urls = [URL(fileURLWithPath: args[2]), URL(fileURLWithPath: args[3])]
    let image = CGImageSourceCreateWithURL(urls[0] as CFURL, nil)!
    let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil)! as NSDictionary
    let maker = props[kCGImagePropertyMakerAppleDictionary] as? NSDictionary
    guard let identifier = maker?["17"] as? String else { fail("JPEG has no Apple content identifier") }
    let asset = AVURLAsset(url: urls[1])
    guard asset.metadata.contains(where: { $0.key as? String == "com.apple.quicktime.content.identifier" && $0.stringValue == identifier }) else { fail("Identifier mismatch") }
    let tracks = asset.tracks(withMediaType: .metadata)
    guard let track = tracks.first else { fail("Missing timed metadata track") }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    reader.add(output)
    let adaptor = AVAssetReaderOutputMetadataAdaptor(assetReaderTrackOutput: output)
    reader.startReading()
    var found = false
    while let group = adaptor.nextTimedMetadataGroup() {
        if group.items.contains(where: { $0.key as? String == "com.apple.quicktime.still-image-time" }) {
            let time = CMTimeGetSeconds(group.timeRange.start)
            guard abs(time - 1.5) < 0.001 else { fail("Wrong cover timestamp: \(time)") }
            found = true
        }
    }
    guard found else { fail("Missing still-image-time marker") }
    var finished = false
    var valid = false
    PHLivePhoto.request(withResourceFileURLs: urls, placeholderImage: nil, targetSize: .zero, contentMode: .aspectFit) { photo, info in
        if (info[PHLivePhotoInfoIsDegradedKey] as? Bool) == true { return }
        valid = photo != nil
        print("PHLivePhoto: \(valid ? "PASS" : "FAIL") \(info)")
        finished = true
    }
    let deadline = Date().addingTimeInterval(30)
    while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    guard valid else { fail("Apple Live Photo validation failed") }
    print("Identifiers match; still marker at 1.5s; duration \(CMTimeGetSeconds(asset.duration))s")
} else if args.count == 3 && args[1] == "fixture" {
    let folder = URL(fileURLWithPath: args[2], isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let jpg = folder.appendingPathComponent("metadata.jpg")
    let context = CGContext(data: nil, width: 16, height: 16, bitsPerComponent: 8, bytesPerRow: 64, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let destination = CGImageDestinationCreateWithURL(jpg as CFURL, "public.jpeg" as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, [kCGImagePropertyMakerAppleDictionary: ["17": placeholder]] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { fail("JPEG fixture failed") }
    let mov = folder.appendingPathComponent("metadata.mov")
    try? FileManager.default.removeItem(at: mov)
    let writer = try AVAssetWriter(outputURL: mov, fileType: .mov)
    let id = AVMutableMetadataItem()
    id.keySpace = .quickTimeMetadata
    id.key = "com.apple.quicktime.content.identifier" as NSString
    id.value = placeholder as NSString
    id.dataType = "com.apple.metadata.datatype.UTF-8"
    writer.metadata = [id]
    var description: CMFormatDescription?
    let spec: NSDictionary = [kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier: "mdta/com.apple.quicktime.still-image-time", kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType: "com.apple.metadata.datatype.int8"]
    CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: kCFAllocatorDefault, metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &description)
    let input = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: description)
    let adaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: input)
    writer.add(input)
    guard writer.startWriting() else { fail("\(String(describing: writer.error))") }
    writer.startSession(atSourceTime: .zero)
    let marker = AVMutableMetadataItem()
    marker.keySpace = .quickTimeMetadata
    marker.key = "com.apple.quicktime.still-image-time" as NSString
    marker.value = NSNumber(value: Int8(0))
    marker.dataType = "com.apple.metadata.datatype.int8"
    let range = CMTimeRange(start: CMTime(value: 45, timescale: 30), duration: CMTime(value: 1, timescale: 30))
    guard adaptor.append(AVTimedMetadataGroup(items: [marker], timeRange: range)) else { fail("Metadata append failed") }
    input.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: 3, timescale: 1))
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else { fail("\(String(describing: writer.error))") }
    print("Created metadata fixtures in \(folder.path)")
} else { fail("Usage: live-photo-native fixture DIRECTORY | check JPG MOV") }
