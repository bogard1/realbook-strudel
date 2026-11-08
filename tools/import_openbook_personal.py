#!/usr/bin/env python3
"""Create an ignored, local-only Strudel library from OpenBook chord sections.

The OpenBook repository contains its own GPL project material, while the tunes
have their own copyright holders. This importer intentionally writes everything
under personal-library/, which is ignored by Git and never becomes part of this
project's public catalog.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PERSONAL_LIBRARY = ROOT / "personal-library"
SOURCE_DIRECTORY = PERSONAL_LIBRARY / "openbook-source"
OUTPUT_DIRECTORY = PERSONAL_LIBRARY / "songs"
OPENBOOK_URL = "https://github.com/veltzer/book-openbook.git"
RAW_URL = "https://github.com/veltzer/book-openbook/blob/master/src/openbook"

LILY_ROOTS = {
    "ces": "cb", "des": "db", "ees": "eb", "fes": "fb", "ges": "gb", "aes": "ab", "bes": "bb",
    "cis": "c#", "dis": "d#", "eis": "e#", "fis": "f#", "gis": "g#", "ais": "a#", "bis": "b#",
}
PITCHES = {"c": 0, "c#": 1, "db": 1, "d": 2, "d#": 3, "eb": 3, "e": 4, "f": 5, "f#": 6, "gb": 6, "g": 7, "g#": 8, "ab": 8, "a": 9, "a#": 10, "bb": 10, "b": 11}
PITCH_NAMES = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"]
CHORD_SECTION = re.compile(r'{% if part == "Chords(?:Laurent|Fake|Real)" %}\\chordmode \{(.*?)\n\}\n{% endif %}', re.DOTALL)
CHORD_TOKEN = re.compile(r'(?<![a-zA-Z\\])([a-g](?:es|is|[b#])?)(?:\d+(?:\*\d+)?\.?|)?(?::([a-zA-Z0-9.+/\-]+))?')


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def run(command: list[str], cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def download_source(refresh: bool) -> None:
    PERSONAL_LIBRARY.mkdir(exist_ok=True)
    if SOURCE_DIRECTORY.exists():
        if refresh:
            run(["git", "pull", "--ff-only"], SOURCE_DIRECTORY)
        return
    run(["git", "clone", "--depth", "1", OPENBOOK_URL, str(SOURCE_DIRECTORY)])


def front_matter(text: str) -> dict[str, Any]:
    match = re.match(r"\{#\s*(.*?)\s*#\}", text, re.DOTALL)
    if not match:
        return {}
    try:
        return tomllib.loads(match.group(1))
    except tomllib.TOMLDecodeError:
        return {}


def lily_root(root: str) -> str:
    return LILY_ROOTS.get(root, root)


def chord_name(root: str, quality: str | None) -> str:
    root = lily_root(root)
    quality = quality or ""
    quality = quality.replace(".5-", "b5").replace(".5+", "#5").replace(".9-", "b9").replace(".9+", "#9").replace(".11+", "#11")
    quality = quality.replace("/", "/")
    if quality == "maj":
        quality = "maj7"
    return root[:1].upper() + root[1:] + quality


def extract_chords(text: str) -> list[str]:
    sections = CHORD_SECTION.findall(text)
    if not sections:
        return []
    # Laurent is the first variant in files that provide it; otherwise Fake/Real.
    section = sections[0]
    chords: list[str] = []
    for root, quality in CHORD_TOKEN.findall(section):
        normalized = lily_root(root)
        if normalized not in PITCHES:
            continue
        chords.append(chord_name(root, quality or None))
    return chords


def chord_intervals(chord: str) -> tuple[str, list[int]]:
    match = re.match(r"^([A-G](?:#|b)?)(.*)$", chord)
    if not match:
        return "c", [0, 4, 7]
    root, quality = match.groups()
    normalized = root.lower()
    if "m7b5" in quality or "dim" in quality:
        return normalized, [0, 3, 6, 10]
    if quality.startswith("m"):
        return normalized, [0, 3, 7, 10] if "7" in quality else [0, 3, 7]
    if quality.startswith("7"):
        return normalized, [0, 4, 7, 10]
    if "maj7" in quality:
        return normalized, [0, 4, 7, 11]
    if "6" in quality:
        return normalized, [0, 4, 7, 9]
    return normalized, [0, 4, 7]


def note_name(midi: int) -> str:
    return f"{PITCH_NAMES[midi % 12]}{midi // 12 - 1}"


def voicing(chord: str, octave: int) -> list[str]:
    root, intervals = chord_intervals(chord)
    base = (octave + 1) * 12 + PITCHES.get(root, 0)
    return [note_name(base + interval) for interval in intervals]


def make_strudel(chords: list[str], tempo: int) -> str:
    upper = " ".join(f"[{' '.join(voicing(chord, 3))}]" for chord in chords)
    lower = " ".join(f"[{','.join(voicing(chord, 2))}]" for chord in chords)
    bass = " ".join(f"{voicing(chord, 1)[0]} ~" for chord in chords)
    return (
        "// Private study backing generated locally from an OpenBook chord section; no melody or lyrics.\n"
        f"setcps({tempo} / 240)\nstack(\n"
        f'  note("<{upper}>").s("triangle").gain(.17).room(.14),\n'
        f'  note("<{lower}>").s("triangle").gain(.09),\n'
        f'  note("<{bass}>").s("sine").gain(.15)\n)'
    )


def source_song(path: Path) -> dict[str, Any] | None:
    text = path.read_text(encoding="utf-8")
    metadata = front_matter(text).get("attributes", {})
    chords = extract_chords(text)
    title = str(metadata.get("title", "")).strip()
    if not title or not chords:
        return None
    tempo_match = re.search(r'\\tempo\s+"[^"]+"\s+4\s*=\s*(\d+)', text)
    tempo = int(tempo_match.group(1)) if tempo_match else 120
    key_match = re.search(r'\\key\s+([a-g](?:es|is|[b#])?)\s+\\(major|minor)', text)
    key = f"{lily_root(key_match.group(1)).upper()} {key_match.group(2)}" if key_match else "Unspecified"
    source_license = str(metadata.get("copyright", "Composition copyright is held by its respective owner."))
    song_id = f"openbook-{slugify(title)}"
    return {
        "schemaVersion": 1,
        "id": song_id,
        "title": title,
        "composer": str(metadata.get("composer", "Unknown")),
        "key": key,
        "tempo": tempo,
        "form": str(metadata.get("structure", "Personal study changes")),
        "tags": ["personal-library", "openbook-import", "backing-track", "no-melody", "arpeggio-practice"],
        "license": "Private study import only. Do not publish or redistribute without verifying composition rights.",
        "source": {
            "title": f"OpenBook: {title}",
            "url": f"{RAW_URL}/{path.name}",
            "license": source_license,
        },
        "backing": {"progression": chords, "feel": "Personal study arpeggio comping", "pattern": "arpeggio-up"},
        "strudel": make_strudel(chords, tempo),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import OpenBook chord sections into the ignored personal library.")
    parser.add_argument("--refresh", action="store_true", help="Fast-forward the existing local OpenBook clone.")
    parser.add_argument("--limit", type=int, help="Import at most this many usable songs.")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing personal JSON files.")
    args = parser.parse_args()
    try:
        download_source(args.refresh)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Could not download OpenBook: {error}", file=sys.stderr)
        return 1

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    imported = 0
    skipped = 0
    for path in sorted((SOURCE_DIRECTORY / "src" / "openbook").glob("*.ly.tera")):
        song = source_song(path)
        if not song:
            skipped += 1
            continue
        destination = OUTPUT_DIRECTORY / f"{song['id']}.json"
        if destination.exists() and not args.overwrite:
            skipped += 1
            continue
        destination.write_text(json.dumps(song, indent=2) + "\n", encoding="utf-8")
        imported += 1
        if args.limit and imported >= args.limit:
            break

    print(f"Personal OpenBook library: {imported} imported, {skipped} skipped. Output: {OUTPUT_DIRECTORY}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
