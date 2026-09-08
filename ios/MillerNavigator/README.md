# Miller Navigator iOS MVP

This is a native SwiftUI prototype for iPhone and iPad. It is a thin client over Miller's versioned, public-safe mobile API; it does not carry a second resource database or connect to Palantír/Farm systems.

Open `MillerNavigator.xcodeproj` in Xcode 16 or newer. Debug builds use `http://127.0.0.1:8787`; Release builds use `https://miller-app.onrender.com`. Override `MILLER_API_BASE_URL` in the target build settings for a device-accessible development server.

The core flow is: type or speak a generic need, review Miller's deterministic guidance and verified resources, select resources, then share by Mail, Messages, another iOS share destination, or AirPrint.

The app intentionally does not request or store client names, PHNs, dates of birth, diagnoses, or case notes. Pilot metrics are local aggregate counts only. Resource feedback contains the canonical resource ID and a bounded reason, never the search request.

For command-line core tests, run `swift test` in this directory with a matching Apple Swift toolchain/SDK. The full app requires Xcode because it imports SwiftUI, UIKit, Speech, and AVFoundation.
