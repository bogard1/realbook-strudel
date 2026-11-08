# Realbook Strudel

An individual-file song library for performing and editing material with [Strudel](https://strudel.cc/). It includes:

- a static web interface with full-text search, composer/key/feel filters, random practice selection, playback, local editing, import, and export;
- a mouse-enabled [Textual](https://textual.textualize.io/) TUI for searching—including chords and feel—random practice selection, creating, and editing catalog files;
- automatic GitHub Pages deployment when `main` changes;
- an English/Spanish language selector in the web interface (English is the default).

The catalog contains 60 chord-only practice backings for the Real Book Volume 1 title list supplied by the maintainer. Each is an independent JSON file tagged `real-book-volume-1`, with comping and bass only—no melody or lyrics.

It also contains eight public-domain practice backings sourced from OpenBook entries that explicitly identify the composition as public domain. They are tagged `openbook-source` and retain a link to the exact source file.

## Copyright notice

The *Real Book* and many of its transcriptions are protected by copyright. This repository does not include scans, melodies, lyrics, or lead-sheet engravings. Its catalog contains chord-only practice backings requested by the maintainer; add material only when you have distribution authorization, and state its license in each JSON file.

## Intended use

This project is intended for personal study and non-commercial educational practice. This declaration does not grant permission to copy, distribute, or publish third-party music data, and it does not override any copyright or source-license terms. Only add material to the public `songs/` catalog when public distribution is authorized.

Strudel uses AGPL-3.0-or-later, so this project is distributed under the same license. See `LICENSE`.

## Quick start

```bash
npm install
npm run validate:songs
npm run dev
```

Open the URL shown by Vite. GitHub Pages edits are stored in `localStorage`; use **Download JSON**, then add the file to `songs/` to include it in the published catalog.

Every selected song has a direct hash link, for example `#/song/autumn-leaves`. Use **Copy link** to save it or return directly after a refresh. Links to songs created or imported locally work in the same browser; publish their JSON to `songs/` before sharing them with others.

### TUI

```bash
make tui
```

`make tui` creates `.venv`, installs Textual, installs Node dependencies when needed, and starts the application. Use `make setup` to install dependencies only, or `make tui-check` to validate the catalog without starting the interface.

The TUI is a full terminal application and does not require the web interface. It uses Textual, the same Python TUI framework as the maintainer's other TUI projects, so the catalog table, action buttons, dialogs, and scrolling all support the mouse. It uses the same Strudel evaluator as the web app and plays notes through a local Node Web Audio synth. Its live playback panel shows the current song and event notes while it plays.

| Key | Action |
| --- | --- |
| Mouse | Click a song to select it; click an action button; scroll the song list or code |
| `↑` / `↓`, `j` / `k` | Select a song |
| `/` | Search |
| `p`, `Enter` | Play selected song |
| `Space` / `s` | Stop playback |
| `g` | Choose a random song from the current search results |
| `e` / `n` | Edit selected song / create a song in the built-in JSON dialog |
| `i` / `x` | Import / export a JSON song file |
| `l` | Toggle English and Spanish |
| `r` / `q` | Reload catalog / quit |

Press `Esc` to leave search mode and return to catalog navigation. On Linux, install and configure PipeWire-JACK or JACK if the local Node Web Audio backend cannot find an audio device. The original Ink implementation remains available as `npm run tui:legacy`.

## Song format

Each `songs/<id>.json` file contains metadata, a chord progression, and executable Strudel code. Catalog arrangements are backing tracks: comping and bass only, with no melody or lyrics.

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
  "backing": {
    "progression": ["Cmaj7", "Am7", "Dm7", "G7"],
    "feel": "Medium swing comping"
  },
  "improvisation": {
    "arpeggios": [
      { "chord": "Cmaj7", "notes": ["C", "E", "G", "B"], "tip": "Target the 3rd of the next chord." }
    ]
  },
  "source": {
    "title": "Source title",
    "url": "https://example.org/source",
    "license": "Public domain or compatible license"
  },
  "strudel": "setcps(120 / 240)\\nnote(\"<c3,e3,g3,b3>\").s(\"triangle\")"
}
```

`improvisation` is optional. When present, the web app and TUI show its chord-tone arpeggio guide alongside the backing track.

Do not treat an unverified chord chart as permission to reproduce a copyrighted edition. Add works to the shared catalog only when their source is public domain, explicitly licensed, or otherwise authorized for distribution.

## Catalog discovery

The library follows the discovery model of [`real_book`](https://real-book.hexdocs.pm/readme.html): search by title, composer, key, chord, form, tag, or feel; narrow the web library by composer, key, and feel; or choose a random practice song from the current results.

`real_book`'s code is MIT-licensed, but its included iRb Corpus data is documented as educational/personal-use data with potential copyright restrictions. Since this repository is public, the project's intended-use declaration is not sufficient authorization to republish that corpus. This project therefore does **not** copy it into the public catalog; its data model is used as product inspiration only.

Validate the catalog before committing:

```bash
npm run validate:songs
```

## Public-domain research sources

The catalog includes original Strudel sketches for public-domain works only. Each relevant song JSON links to its source and identifies the provenance.

- [IMSLP: *Original Jelly Roll Blues*](https://imslp.org/wiki/Original_Jelly_Roll_Blues_(Morton%2C_Jelly_Roll)) identifies the 1915 first edition as public domain.
- [UCSB Discography of American Historical Recordings: Jimmie Cox](https://adp.library.ucsb.edu/index.php/mastertalent/detail/114506/Cox_Jimmie) documents the composer and dates for *Nobody Knows You When You're Down and Out*.
- [OpenBook](https://github.com/veltzer/book-openbook) was used only for entries whose own metadata marks the composition public domain. The imported song records link to their individual OpenBook source files; no melodies, lyrics, or protected OpenBook arrangements were copied.
- [awesome-strudel](https://github.com/terryds/awesome-strudel) was reviewed as a Strudel discovery source. Its catalog largely links to copyrighted covers, so no third-party pattern code was copied into this repository.

## GitHub Pages deployment

The `.github/workflows/deploy-pages.yml` workflow builds and publishes the site. In **Settings → Pages**, set **GitHub Actions** as the deployment source if GitHub does not enable it automatically. The site is available at `https://bogard1.github.io/realbook-strudel/`.
