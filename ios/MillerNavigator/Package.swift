// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "MillerNavigatorCore",
  platforms: [.macOS(.v13), .iOS(.v17)],
  products: [.library(name: "MillerNavigatorCore", targets: ["MillerNavigatorCore"])],
  targets: [
    .target(name: "MillerNavigatorCore", path: "MillerNavigator/Core"),
    .testTarget(name: "MillerNavigatorCoreTests", dependencies: ["MillerNavigatorCore"], path: "MillerNavigatorTests"),
  ]
)
