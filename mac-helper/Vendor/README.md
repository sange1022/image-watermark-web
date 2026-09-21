# HTTP dependency

GCDWebServer 3.5.4, upstream commit 1c36bf07c848476111d523057a3a63b05328ce2a.
Source: https://github.com/swisspol/GCDWebServer
The GCDWebServer sources and BSD license are included, unmodified.
Only its HTTP core, data request and data response are built. No file-serving,
WebDAV, upload UI, Bonjour publishing or external-network listener is enabled.

This app uses a direct clang/swiftc build. SwiftPM is not required: this machine's
Command Line Tools swift-package and llbuild versions are incompatible.
