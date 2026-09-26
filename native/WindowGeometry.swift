import Foundation
import CoreGraphics

// Read-only window geometry in desktop points. No images, titles, input hooks,
// Accessibility automation, or screen-recording permission requests.
let excluded = CommandLine.arguments.count > 1 ? Int32(CommandLine.arguments[1]) ?? -1 : -1
func scan() -> [[String: Any]] {
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
    return windows.compactMap { window in
        guard let pid = window[kCGWindowOwnerPID as String] as? NSNumber,
              pid.int32Value != excluded,
              let id = window[kCGWindowNumber as String] as? NSNumber,
              let layer = window[kCGWindowLayer as String] as? NSNumber,
              layer.intValue == 0,
              let alpha = window[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0,
              let bounds = window[kCGWindowBounds as String] as? [String: Any],
              let x = bounds["X"] as? NSNumber, let y = bounds["Y"] as? NSNumber,
              let width = bounds["Width"] as? NSNumber, let height = bounds["Height"] as? NSNumber
        else { return nil }
        let values = [x.doubleValue, y.doubleValue, width.doubleValue, height.doubleValue]
        guard values.allSatisfy({ $0.isFinite && abs($0) <= 1000000 }), width.doubleValue >= 8, height.doubleValue >= 8 else { return nil }
        return ["id": "\(id):\(pid)", "x": x, "y": y, "width": width, "height": height,
                "standable": width.doubleValue >= 160 && height.doubleValue >= 80]
    }
}
while let command = readLine() {
    if command == "quit" { break }
    if command != "scan" { continue }
    autoreleasepool {
        let data = (try? JSONSerialization.data(withJSONObject: scan())) ?? Data("[]".utf8)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}
