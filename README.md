Strip turns any file into a printable strip or an animated on-screen code sequence that a phone camera reads back, entirely in the browser.

# Strip (working name)

Strip is a modern rebuild of the 1985 Cauzin Softstrip idea: data strips that carried files on paper. It turns any file into either a printable strip or an animated on-screen code sequence, and a phone camera reads it back. Everything runs client-side in the browser. There is no backend, no account, no network use at runtime, and no cloud.

## Status

The fountain codec (`packages/codec`) and the QR symbol layer (`packages/symbols`) are implemented and tested. The sender and receiver screens of the PWA are not built yet. The symbol layer has only been tested on synthetic images; the plan for real phones is in [docs/device-test.md](docs/device-test.md).

## Prior art

This is not a new idea, and the transport is not a claim of novelty. Related projects, as far as we know:

- **Decimen Optical Transfer**: a browser-based tool that shows a file as a stream of fountain-coded animated QR codes and reads it with another device's camera. The closest relative of Strip's on-screen mode.
- **TXQR**: protocol and tools that send data as animated QR codes, using fountain codes so frames can be missed.
- **cimbar**: a high-density colour 2D barcode with its own error correction, used with fountain-coded file transfer from a screen.
- **PaperBack**: prints a file on paper as a dense dot pattern with redundancy and reads it back from a scan.
- **qr-backup**: backs up files on paper as QR codes.
- **Cauzin Softstrip** (1985): the historical model for data strips on paper.

Strip combines parts that already exist: a standard QR encoder and reader, and its own fountain codec. What it adds is the packaging: one offline PWA that does both the printable strip and the animated screen, with no backend, account or network use at runtime.

## Disclosure

Planning and visual design were produced outside Kiro, with Claude and Claude Design. All code is written in Kiro.

## License

MIT. See [LICENSE](LICENSE).
