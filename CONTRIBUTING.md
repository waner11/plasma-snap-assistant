# Contributing to Plasma Snap Assistant

## Building

Use the Makefile at the repository root:

```bash
make install    # Install KWin effect + build tray companion
make test       # Run unit tests
make clean      # Remove build artifacts
```

Or follow the manual steps in the README.

## Code style

- **QML / JavaScript**: Use `var` for variable declarations, not `const` or `let`.
- **C++**: C++17 standard.
- **Logging**: All log messages must use the `[PlasmaSnap]` prefix.

## Configuration

Effect configuration uses `contents/config/main.xml`. Do not create `.kcfg` files.

## Submitting changes

- Fork the repository and create a feature branch.
- Submit pull requests against the `main` branch.
- Keep commits focused on a single change.
