# Apple metadata fixtures

These tiny files were generated specifically for this application, with
`scripts/live-photo-native.swift fixture public/live-photo` on macOS. They contain
no user photographs. The JPEG is a blank 16x16 image; the MOV contains only a
timed metadata sample, not video footage. The all-zero identifier is a placeholder.

The browser copies only the JPEG MakerApple note, not the fixture's dimensions.
For MOV it copies Apple's metadata track and movie-level metadata, relocates the
sample chunk, converts movie-time edit durations, and sets a unique matching UUID.
Mediabunny encodes and muxes the actual animated video. Its tail-moov layout is
required so existing video sample offsets do not change.

The native `check JPG MOV` command verifies matching identifiers, the timed
still-image marker at 1.5 seconds, and PHLivePhoto resource loading without
adding assets to a Photos library. The current developer machine requires
`xcrun swift -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk` because
the default newer SDK does not match its installed Swift compiler.
