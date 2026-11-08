# Realbook Strudel

An individual-file song library for performing and editing material with [Strudel](https://strudel.cc/). It includes:

- a static web interface with search, playback, pause, local editing, import, and export;
- a Node.js TUI for searching, creating, and editing catalog files;
- automatic GitHub Pages deployment when `main` changes;
- an English/Spanish language selector in the web interface (English is the default).

## Copyright notice

The *Real Book* and many of its transcriptions are protected by copyright. This repository **does not include Real Book songs or arrangements**: it contains only two original CC0 demos. Add only public-domain material or content for which you have distribution authorization, and state its license in each JSON file.

Strudel uses AGPL-3.0-or-later, so this project is distributed under the same license. See `LICENSE`.

## Quick start

```bash
npm install
npm run validate:songs
npm run dev
```

Open the URL shown by Vite. GitHub Pages edits are stored in `localStorage`; use **Download JSON**, then add the file to `songs/` to include it in the published catalog.

### TUI

```bash
npm run tui
```

The TUI manages local JSON files and displays Strudel code. Audio playback is performed by the web interface because Strudel uses Web Audio, and browsers require a user interaction before playing sound.

## Song format

Each `songs/<id>.json` file contains metadata and executable Strudel code:

```json
{
  "schemaVersion": 1,
  "id": "mi-cancion",
  "title": "My song",
  "composer": "Composer",
  "key": "C major",
  "tempo": 120,
  "form": "AABA",
  "tags": ["swing"],
  "license": "CC0-1.0",
  "source": {
    "title": "Source title",
    "url": "https://example.org/source",
    "license": "Public domain or compatible license"
  },
  "strudel": "setcps(120 / 60)\\nnote(\"c4 e4 g4\").s(\"triangle\")"
}
```

Validate the catalog before committing:

```bash
npm run validate:songs
```

## Public-domain research sources

The catalog includes original Strudel sketches for public-domain works only. Each relevant song JSON links to its source and identifies the provenance.

- [IMSLP: *Original Jelly Roll Blues*](https://imslp.org/wiki/Original_Jelly_Roll_Blues_(Morton%2C_Jelly_Roll)) identifies the 1915 first edition as public domain.
- [UCSB Discography of American Historical Recordings: Jimmie Cox](https://adp.library.ucsb.edu/index.php/mastertalent/detail/114506/Cox_Jimmie) documents the composer and dates for *Nobody Knows You When You're Down and Out*.
- [awesome-strudel](https://github.com/terryds/awesome-strudel) was reviewed as a Strudel discovery source. Its catalog largely links to copyrighted covers, so no third-party pattern code was copied into this repository.

## GitHub Pages deployment

The `.github/workflows/deploy-pages.yml` workflow builds and publishes the site. In **Settings → Pages**, set **GitHub Actions** as the deployment source if GitHub does not enable it automatically. The site is available at `https://bogard1.github.io/realbook-strudel/`.
