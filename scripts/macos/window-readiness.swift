// Black-box CI probe only: require rendered application content in the actual screenshot.
// No application IPC, accessibility permissions, credentials or UI automation bypass.
import Foundation
import Vision

if CommandLine.arguments.count != 2 { exit(2) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["de-DE", "en-US"]
do {
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:])
    try handler.perform([request])
    let text = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: " ")
        .lowercased()
    if text.contains("start") && text.contains("verbinden") && text.contains("einreichung") {
        print("Native macOS start screen is visibly rendered.")
        exit(0)
    }
    exit(1)
} catch {
    // Do not print recognized desktop text or paths into CI logs.
    exit(2)
}
