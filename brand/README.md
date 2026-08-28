# Brand assets

`luca-logo-source.webp` is the original supplied by LUCA — navy artwork on an
opaque white background, saved lossily.

The two files in `public/` are derived from it and are what the app uses:

| File | Used by |
|---|---|
| `public/luca-logo.png` | Login screen, and anywhere on a light background |
| `public/luca-logo-white.png` | The navy sidebar |

Both are transparent. Alpha is derived from the source's luminance so the
antialiased edges stay smooth despite the lossy compression, then the mark is
repainted flat — navy `#061A4C` for one, white for the other. The knockout
areas (the arrows inside the icon) are transparent by design, so they pick up
whatever sits behind them.

Regenerate with `python3 brand/build-logos.py` if the source is ever replaced.
An SVG would be crisper than any of this; ask LUCA whether one exists.
