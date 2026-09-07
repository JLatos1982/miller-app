import Foundation
import ImageIO
import Vision

guard CommandLine.arguments.count == 2 else {
    fputs("usage: miller-north-macos-vision-ocr IMAGE\n", stderr)
    exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL
guard let source = CGImageSourceCreateWithURL(imageURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fputs("unable to load image\n", stderr)
    exit(3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-CA", "en-US"]

try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])

let observations = (request.results ?? []).sorted {
    let verticalDelta = abs($0.boundingBox.midY - $1.boundingBox.midY)
    if verticalDelta > 0.015 { return $0.boundingBox.midY > $1.boundingBox.midY }
    return $0.boundingBox.minX < $1.boundingBox.minX
}

for observation in observations {
    if let text = observation.topCandidates(1).first?.string {
        print(text)
    }
}
