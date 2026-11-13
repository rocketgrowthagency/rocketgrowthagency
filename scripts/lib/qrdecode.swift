// Decode every QR code PNG given on the command line with macOS's own Core Image detector; print "file<TAB>text".
import Foundation
import CoreImage

let ctx = CIContext()
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: ctx, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for path in CommandLine.arguments.dropFirst() {
  guard let img = CIImage(contentsOf: URL(fileURLWithPath: path)) else { print("\(path)\t<unreadable image>"); continue }
  let found = detector.features(in: img).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
  print("\(path)\t\(found.first ?? "<no QR found>")")
}
