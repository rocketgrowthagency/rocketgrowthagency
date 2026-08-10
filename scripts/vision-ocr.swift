// vision-ocr.swift — offline OCR with bounding boxes via Apple's Vision framework.
//
// WHY: the video acceptance gate (scripts/check-video-acceptance.mjs) has to read what is
// actually ON SCREEN in a finished video — the business name on the open detail card, the
// "CURRENTLY RANKING #N" overlay, the Google Maps scale bar — and decide fail-CLOSED.
// An OpenAI-vision call can't do that job: it costs money per frame, needs the network, and
// fails OPEN when the API is down. Vision is local, free, deterministic and ~0.5s/frame.
//
// Usage:  vision-ocr <image1> [image2 ...]
// Output: one JSON object per line (NDJSON), one line per input image:
//   {"file":"…","w":1280,"h":720,"lines":[{"t":"Directions","x":83,"y":404,"w":42,"h":11,"c":0.97}]}
// Coordinates are TOP-LEFT-origin pixels (Vision's normalized bottom-left origin is converted).
// An unreadable image emits {"file":"…","error":"…"} — the caller treats that as a hard failure.
import Vision
import AppKit

let paths = Array(CommandLine.arguments.dropFirst())
if paths.isEmpty { FileHandle.standardError.write("usage: vision-ocr <image>...\n".data(using: .utf8)!); exit(2) }

func esc(_ s: String) -> String {
  var o = ""
  for ch in s.unicodeScalars {
    switch ch {
    case "\"": o += "\\\""
    case "\\": o += "\\\\"
    case "\n": o += "\\n"
    case "\r": o += "\\r"
    case "\t": o += "\\t"
    default:
      if ch.value < 0x20 { o += String(format: "\\u%04x", ch.value) } else { o.unicodeScalars.append(ch) }
    }
  }
  return o
}

for path in paths {
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("{\"file\":\"\(esc(path))\",\"error\":\"cannot load image\"}")
    continue
  }
  let W = Double(cg.width), H = Double(cg.height)
  var out: [String] = []
  let req = VNRecognizeTextRequest { (request, _) in
    guard let obs = request.results as? [VNRecognizedTextObservation] else { return }
    for o in obs {
      guard let t = o.topCandidates(1).first else { continue }
      let b = o.boundingBox // normalized, bottom-left origin
      let x = b.minX * W
      let y = (1.0 - b.maxY) * H
      let w = b.width * W
      let h = b.height * H
      out.append("{\"t\":\"\(esc(t.string))\",\"x\":\(Int(x.rounded())),\"y\":\(Int(y.rounded())),\"w\":\(Int(w.rounded())),\"h\":\(Int(h.rounded())),\"c\":\(String(format: "%.2f", t.confidence))}")
    }
  }
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false // business names / "2000 ft" must not be auto-corrected
  do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    print("{\"file\":\"\(esc(path))\",\"w\":\(Int(W)),\"h\":\(Int(H)),\"lines\":[\(out.joined(separator: ","))]}")
  } catch {
    print("{\"file\":\"\(esc(path))\",\"error\":\"\(esc(String(describing: error)))\"}")
  }
}
