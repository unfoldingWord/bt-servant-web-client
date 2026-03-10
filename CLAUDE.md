# CLAUDE.md

## Sensitive Areas

Before modifying code in these areas, read the linked documentation first:

- **Streaming animation system** (`useAnimatedText`, `AnimatedText`,
  `handleComplete`, `finalizeComplete`) — Read [docs/streaming-animation.md](docs/streaming-animation.md).
  This code has had recurring bugs from well-intentioned refactors that
  unknowingly reverted critical fixes. The document explains the invariants
  that must be preserved.
