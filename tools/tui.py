#!/usr/bin/env python3
"""Mouse-enabled Textual interface for the Realbook Strudel catalog."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import threading
from pathlib import Path
from random import choice
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
SONGS_DIRECTORY = ROOT / "songs"
PERSONAL_SONGS_DIRECTORY = ROOT / "personal-library" / "songs"
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
BACKING_PATTERNS = {"arpeggio-up", "arpeggio-down", "arpeggio-alternating", "chords"}
PITCH_CLASSES = {"c": 0, "c#": 1, "db": 1, "d": 2, "d#": 3, "eb": 3, "e": 4, "f": 5, "f#": 6, "gb": 6, "g": 7, "g#": 8, "ab": 8, "a": 9, "a#": 10, "bb": 10, "b": 11}
PITCH_NAMES = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"]


def is_song(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    backing = value.get("backing")
    required_strings = ("id", "title", "composer", "key", "form", "license", "strudel")
    return (
        value.get("schemaVersion") == 1
        and all(isinstance(value.get(key), str) and value[key] for key in required_strings)
        and bool(ID_PATTERN.match(value["id"]))
        and isinstance(value.get("tempo"), (int, float)) and value["tempo"] > 0
        and isinstance(value.get("tags"), list) and all(isinstance(tag, str) for tag in value["tags"])
        and isinstance(backing, dict)
        and isinstance(backing.get("progression"), list)
        and all(isinstance(chord, str) for chord in backing["progression"])
        and isinstance(backing.get("feel"), str) and bool(backing["feel"])
        and (backing.get("pattern") is None or backing.get("pattern") in BACKING_PATTERNS)
    )


def load_songs() -> list[dict[str, Any]]:
    songs: list[dict[str, Any]] = []
    for directory in (SONGS_DIRECTORY, PERSONAL_SONGS_DIRECTORY):
        if not directory.exists():
            continue
        for path in directory.glob("*.json"):
            value = json.loads(path.read_text(encoding="utf-8"))
            if not is_song(value):
                raise ValueError(f"{path.name} does not conform to the song schema.")
            songs.append(value)
    return sorted(songs, key=lambda song: song["title"].casefold())


def new_song(song_id: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "id": song_id,
        "title": "New song",
        "composer": "Composer",
        "key": "C major",
        "tempo": 120,
        "form": "AABA",
        "tags": [],
        "license": "State the license or permission to distribute",
        "backing": {"progression": ["Cmaj7", "Am7", "Dm7", "G7"], "feel": "Swing comping", "pattern": "arpeggio-up"},
        "strudel": "setcps(120 / 240)\nstack(\n  note(\"<[c3,e3,g3,b3] [a2,c3,e3,g3] [d3,f3,a3,c4] [g2,b2,d3,f3]>\").s(\"triangle\").gain(.22),\n  note(\"c2 ~ a1 ~ d2 ~ g1 ~\").s(\"sine\").gain(.16)\n)",
    }


def note_pitch(note: str) -> int:
    match = re.match(r"^([a-g](?:#|b)?)(-?\d+)$", note.strip().lower())
    if not match or match.group(1) not in PITCH_CLASSES:
        return 0
    return (int(match.group(2)) + 1) * 12 + PITCH_CLASSES[match.group(1)]


def apply_backing_pattern(code: str, pattern: str) -> str:
    """Revoice the top chord-tone part while keeping the backing melody-free."""
    if pattern not in BACKING_PATTERNS:
        return code

    def revoice(match: re.Match[str]) -> str:
        def revoice_chord(chord: re.Match[str]) -> str:
            notes = [note for note in re.split(r"[\s,]+", chord.group(1)) if note]
            ordered = sorted(notes, key=note_pitch)
            if pattern == "arpeggio-down":
                ordered.reverse()
            elif pattern == "arpeggio-alternating":
                alternating: list[str] = []
                low, high = 0, len(ordered) - 1
                while low <= high:
                    alternating.append(ordered[low])
                    if low != high:
                        alternating.append(ordered[high])
                    low += 1
                    high -= 1
                ordered = alternating
            separator = "," if pattern == "chords" else " "
            return f"[{separator.join(ordered)}]"

        revoiced = re.sub(r"\[([^\]]+)\]", revoice_chord, match.group(1))
        return f'note("<{revoiced}>")'

    return re.sub(r'note\("<((?:\[[^\]]+\]\s*)+)>"\)', revoice, code, count=1)


def transpose_notes(code: str, semitones: int) -> str:
    if not semitones:
        return code

    def transpose(match: re.Match[str]) -> str:
        name, octave = match.groups()
        pitch = PITCH_CLASSES.get(name.lower())
        if pitch is None:
            return match.group(0)
        midi = (int(octave) + 1) * 12 + pitch + semitones
        return f"{PITCH_NAMES[midi % 12]}{midi // 12 - 1}"

    return re.sub(r"\b([a-g](?:#|b)?)(-?\d+)\b", transpose, code, flags=re.IGNORECASE)


def run_check() -> int:
    try:
        songs = load_songs()
    except Exception as error:
        print(f"TUI check failed: {error}", file=sys.stderr)
        return 1
    print(f"Textual TUI ready: {len(songs)} song(s) available.")
    return 0


MESSAGES = {
    "en": {
        "library": "LIBRARY", "details": "STRUDEL WORKBENCH", "search": "Search title, composer, key, chord…",
        "live": "LIVE PLAYBACK", "stopped": "STOPPED", "now": "Now sounding", "play": "▶ Play",
        "stop": "■ Stop", "save_code": "Save code", "random": "♢ Random", "edit": "✎ JSON", "new": "+ New", "import": "Import",
        "pattern": "Backing", "arpeggio_up": "Arpeggio ↑", "arpeggio_down": "Arpeggio ↓", "arpeggio_alternating": "Alternating", "chords": "Simple chords",
        "transpose": "Transpose",
        "export": "Export", "loaded": lambda count: f"Loaded {count} songs. Click a row or use ↑ ↓ to select.",
        "playing": lambda title: f"Playing {title}.", "stopped_message": "Playback stopped.",
        "picked": lambda title: f"Practice pick: {title}.", "saved": lambda title: f"Saved {title}.",
        "imported": lambda title: f"Imported {title}.", "exported": lambda path: f"Exported to {path}.",
        "path_import": "Path to a JSON song file", "path_export": "Destination JSON path", "save": "Save",
        "cancel": "Cancel", "editor": "Edit song JSON", "invalid": "The JSON does not conform to the song schema.",
        "error": lambda message: f"Error: {message}", "controls": "Mouse: click a song or action. Keys: F5/Ctrl+P play/pause · / search · p play · space/s stop · Ctrl+S save code · g random · e JSON · n new · i import · x export · l language · r reload · q quit",
    },
    "es": {
        "library": "BIBLIOTECA", "details": "ESPACIO STRUDEL", "search": "Buscar título, compositor, tonalidad, acorde…",
        "live": "REPRODUCCIÓN EN VIVO", "stopped": "DETENIDO", "now": "Sonando ahora", "play": "▶ Reproducir",
        "stop": "■ Detener", "save_code": "Guardar código", "random": "♢ Aleatoria", "edit": "✎ JSON", "new": "+ Nueva", "import": "Importar",
        "pattern": "Acompañamiento", "arpeggio_up": "Arpegio ↑", "arpeggio_down": "Arpegio ↓", "arpeggio_alternating": "Alternado", "chords": "Acordes simples",
        "transpose": "Transponer",
        "export": "Exportar", "loaded": lambda count: f"{count} canciones cargadas. Haz clic o usa ↑ ↓ para seleccionar.",
        "playing": lambda title: f"Reproduciendo {title}.", "stopped_message": "Reproducción detenida.",
        "picked": lambda title: f"Selección para practicar: {title}.", "saved": lambda title: f"{title} se guardó.",
        "imported": lambda title: f"{title} se importó.", "exported": lambda path: f"Exportado en {path}.",
        "path_import": "Ruta del archivo JSON para importar", "path_export": "Ruta de destino JSON", "save": "Guardar",
        "cancel": "Cancelar", "editor": "Editar JSON de la canción", "invalid": "El JSON no cumple el esquema de canción.",
        "error": lambda message: f"Error: {message}", "controls": "Ratón: haz clic en una canción o acción. Teclas: F5/Ctrl+P reproducir/pausar · / buscar · p reproducir · espacio/s detener · Ctrl+S guardar código · g aleatoria · e JSON · n nueva · i importar · x exportar · l idioma · r recargar · q salir",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--help", action="store_true")
    options = parser.parse_args()
    if options.check:
        return run_check()
    if options.help:
        print("Install Textual with `python3 -m pip install -r tools/requirements-tui.txt`, then run `npm run tui`.")
        return 0

    try:
        from rich.markup import escape
        from textual.app import App, ComposeResult
        from textual.binding import Binding
        from textual.containers import Grid, Horizontal, Vertical
        from textual.document._document import Selection
        from textual.screen import ModalScreen
        from textual.widgets import Button, DataTable, Footer, Header, Input, Label, Select, Static, TextArea
    except ModuleNotFoundError:
        print("Textual is required for the mouse-enabled TUI. Install it with `python3 -m pip install -r tools/requirements-tui.txt`.", file=sys.stderr)
        return 1

    class PathPrompt(ModalScreen[str | None]):
        def __init__(self, title: str, placeholder: str, save_label: str, cancel_label: str, value: str = "") -> None:
            super().__init__()
            self.title = title
            self.placeholder = placeholder
            self.save_label = save_label
            self.cancel_label = cancel_label
            self.value = value

        def compose(self) -> ComposeResult:
            with Vertical(id="prompt-dialog"):
                yield Label(self.title, classes="dialog-title")
                yield Input(value=self.value, placeholder=self.placeholder, id="path-input")
                with Horizontal(classes="dialog-actions"):
                    yield Button(self.save_label, id="prompt-save", variant="primary")
                    yield Button(self.cancel_label, id="prompt-cancel")

        def on_mount(self) -> None:
            self.query_one("#path-input", Input).focus()

        def on_input_submitted(self, event: Input.Submitted) -> None:
            self.dismiss(event.value.strip() or None)

        def on_button_pressed(self, event: Button.Pressed) -> None:
            self.dismiss(self.query_one("#path-input", Input).value.strip() or None if event.button.id == "prompt-save" else None)

    class SongEditor(ModalScreen[dict[str, Any] | None]):
        def __init__(self, song: dict[str, Any], messages: dict[str, Any]) -> None:
            super().__init__()
            self.song = song
            self.messages = messages

        def compose(self) -> ComposeResult:
            with Vertical(id="editor-dialog"):
                yield Label(self.messages["editor"], classes="dialog-title")
                yield TextArea(json.dumps(self.song, indent=2), language="json", id="song-json")
                yield Label("", id="editor-error")
                with Horizontal(classes="dialog-actions"):
                    yield Button(self.messages["save"], id="editor-save", variant="primary")
                    yield Button(self.messages["cancel"], id="editor-cancel")

        def on_mount(self) -> None:
            self.query_one("#song-json", TextArea).focus()

        def on_button_pressed(self, event: Button.Pressed) -> None:
            if event.button.id == "editor-cancel":
                self.dismiss(None)
                return
            try:
                value = json.loads(self.query_one("#song-json", TextArea).text)
                if not is_song(value):
                    raise ValueError(self.messages["invalid"])
                self.dismiss(value)
            except Exception as error:
                self.query_one("#editor-error", Label).update(f"[red]{escape(str(error))}[/red]")

    class PlayerService:
        def __init__(self, on_message: Callable[[dict[str, Any]], None]) -> None:
            command = [str(ROOT / "node_modules" / ".bin" / "vite-node"), "--config", str(ROOT / "vite.tui.config.ts"), str(ROOT / "tools" / "tui-player-service.ts")]
            self.process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
            self.on_message = on_message
            self.thread = threading.Thread(target=self._read_messages, daemon=True)
            self.thread.start()

        def _read_messages(self) -> None:
            if self.process.stdout is None:
                return
            for line in self.process.stdout:
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                try:
                    self.on_message(message)
                except Exception:
                    # A Textual test run or terminal shutdown can finish before
                    # this daemon reader receives the service's final message.
                    return

        def send(self, message: dict[str, Any]) -> None:
            if self.process.poll() is not None:
                raise RuntimeError(f"Audio player exited with code {self.process.returncode}.")
            if self.process.stdin is None:
                raise RuntimeError("Audio player input is unavailable.")
            try:
                self.process.stdin.write(json.dumps(message) + "\n")
                self.process.stdin.flush()
            except OSError as error:
                raise RuntimeError(f"Could not contact audio player: {error}") from error

        def close(self) -> None:
            try:
                self.send({"type": "quit"})
            except RuntimeError:
                return
            try:
                self.process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.process.terminate()

    class RealbookTextualApp(App[None]):
        TITLE = "Realbook Strudel"
        CSS = """
        Screen { background: #10131a; color: #eff3f6; }
        Header { background: #151a22; color: #78dfd4; }
        Footer { background: #151a22; }
        #body { padding: 1 2; height: 1fr; min-height: 0; }
        #search { margin-bottom: 1; }
        #panels { height: 1fr; min-height: 0; }
        #library-panel { width: 34%; border: round #315a5d; padding: 0 1; margin-right: 1; }
        #detail-panel { width: 1fr; border: heavy #3b716e; padding: 0 1; }
        .panel-title { color: #78dfd4; text-style: bold; height: 2; content-align: left middle; }
        #song-table { height: 1fr; }
        #song-table > .datatable--cursor { background: #284d50; color: #ffffff; }
        #live { border: heavy #4aa99f; padding: 0 1; margin-bottom: 1; color: #b8e9df; height: 5; }
        #song-details { height: 3; color: #d6e2e5; }
        #pattern-toolbar { height: 3; align: left middle; }
        #pattern-toolbar Label { width: 14; color: #78dfd4; }
        #pattern-select { width: 28; }
        #transpose-select { width: 10; }
        #code-editor { height: 1fr; min-height: 12; border: solid #3b5861; margin: 1 0; background: #0b1118; }
        #code-editor:focus { border: heavy #55c6b9; }
        #arpeggios { height: auto; max-height: 5; color: #b8e9df; overflow: auto; }
        #actions { height: 7; margin: 0 2 1 2; grid-size: 4; grid-columns: 1fr 1fr 1fr 1fr; grid-gutter: 1; background: #10131a; }
        #actions Button { width: 1fr; }
        #play, #save-code { background: #55c6b9; color: #071012; }
        #stop { background: #5e3138; }
        #status { height: 1; margin: 0 2; color: #aab6c1; background: #10131a; }
        PathPrompt, SongEditor { align: center middle; background: #00000088; }
        #prompt-dialog { width: 70; height: auto; border: heavy #4aa99f; background: #171d26; padding: 1 2; }
        #editor-dialog { width: 90%; height: 88%; border: heavy #4aa99f; background: #171d26; padding: 1 2; }
        #song-json { height: 1fr; }
        .dialog-title { text-style: bold; color: #78dfd4; margin-bottom: 1; }
        .dialog-actions { height: 3; margin-top: 1; }
        .dialog-actions Button { margin-right: 1; }
        #editor-error { height: 1; }
        """
        BINDINGS = [
            Binding("q", "quit", "Quit"), Binding("slash", "focus_search", "Search"), Binding("p", "play", "Play"),
            Binding("space", "stop", "Stop"), Binding("s", "stop", "Stop"), Binding("g", "random", "Random"),
            Binding("e", "edit", "Edit"), Binding("n", "new", "New"), Binding("i", "import_song", "Import"),
            Binding("x", "export_song", "Export"), Binding("l", "language", "Language"), Binding("r", "reload", "Reload"),
            Binding("ctrl+s", "save_code", "Save code"),
            Binding("j", "next_song", "Next", show=False), Binding("k", "previous_song", "Previous", show=False),
            Binding("escape", "focus_table", "Browse", show=False),
            # These remain available when the code editor has focus, unlike
            # plain p / space which are valid characters in Strudel code.
            Binding("f5", "toggle_playback", "Play/Pause", priority=True),
            Binding("ctrl+p", "toggle_playback", "Play/Pause", priority=True),
        ]

        def __init__(self) -> None:
            super().__init__()
            self.language = "en"
            self.songs: list[dict[str, Any]] = []
            self.visible_songs: list[dict[str, Any]] = []
            self.selected_id = ""
            self.playing_title = ""
            self.live_event: dict[str, Any] | None = None
            self.code_drafts: dict[str, str] = {}
            self.loading_code = False
            self.loading_pattern = False
            self.updating_table = False
            self.transpose_semitones = 0
            self.live_update_timer: Any = None
            self.player: PlayerService | None = None

        @property
        def t(self) -> dict[str, Any]:
            return MESSAGES[self.language]

        @property
        def selected(self) -> dict[str, Any] | None:
            return next((song for song in self.songs if song["id"] == self.selected_id), None)

        def compose(self) -> ComposeResult:
            yield Header()
            with Vertical(id="body"):
                yield Input(placeholder=self.t["search"], id="search")
                with Horizontal(id="panels"):
                    with Vertical(id="library-panel"):
                        yield Label(self.t["library"], classes="panel-title", id="library-title")
                        yield DataTable(id="song-table", cursor_type="row", show_header=False)
                    with Vertical(id="detail-panel"):
                        yield Label(self.t["details"], classes="panel-title", id="details-title")
                        yield Static("", id="live")
                        yield Static("", id="song-details")
                        with Horizontal(id="pattern-toolbar"):
                            yield Label(self.t["pattern"], id="pattern-label")
                            yield Select(self._pattern_options(), value="arpeggio-up", allow_blank=False, id="pattern-select")
                            yield Label(self.t["transpose"], id="transpose-label")
                            yield Select(self._transpose_options(), value=0, allow_blank=False, id="transpose-select")
                        yield TextArea("", language="javascript", theme="monokai", soft_wrap=False, tab_behavior="indent", show_line_numbers=True, id="code-editor")
                        yield Static("", id="arpeggios")
            with Grid(id="actions"):
                yield Button(self.t["play"], id="play", variant="primary")
                yield Button(self.t["stop"], id="stop")
                yield Button(self.t["save_code"], id="save-code", variant="primary")
                yield Button(self.t["random"], id="random")
                yield Button(self.t["edit"], id="edit")
                yield Button(self.t["new"], id="new")
                yield Button(self.t["import"], id="import")
                yield Button(self.t["export"], id="export")
            yield Label("", id="status")
            yield Footer()

        def on_mount(self) -> None:
            table = self.query_one("#song-table", DataTable)
            table.add_columns("Title", "Composer · Key")
            self.player = PlayerService(self._queue_player_message)
            self._reload_library()
            table.focus()
            self.call_after_refresh(self._update_details)

        def on_unmount(self) -> None:
            if self.live_update_timer is not None:
                self.live_update_timer.stop()
            if self.player:
                self.player.close()

        def _set_status(self, message: str) -> None:
            status = self.query_one_optional("#status", Label)
            if status is not None:
                status.update(message)

        def _pattern_options(self) -> list[tuple[str, str]]:
            return [
                (self.t["arpeggio_up"], "arpeggio-up"),
                (self.t["arpeggio_down"], "arpeggio-down"),
                (self.t["arpeggio_alternating"], "arpeggio-alternating"),
                (self.t["chords"], "chords"),
            ]

        def _transpose_options(self) -> list[tuple[str, int]]:
            return [("0", 0), ("+2", 2), ("+5", 5), ("+7", 7), ("+12", 12), ("−2", -2), ("−5", -5), ("−7", -7), ("−12", -12)]

        def _reload_library(self) -> None:
            try:
                self.songs = load_songs()
                if not self.selected_id or not any(song["id"] == self.selected_id for song in self.songs):
                    self.selected_id = self.songs[0]["id"] if self.songs else ""
                self._filter_songs(self.query_one("#search", Input).value)
                self._set_status(self.t["loaded"](len(self.songs)))
            except Exception as error:
                self._set_status(self.t["error"](str(error)))

        def _filter_songs(self, query: str) -> None:
            needle = query.casefold().strip()
            self.visible_songs = [song for song in self.songs if needle in " ".join([
                song["title"], song["composer"], song["key"], song["form"], " ".join(song["tags"]),
                song["backing"]["feel"], " ".join(song["backing"]["progression"]),
            ]).casefold()]
            table = self.query_one("#song-table", DataTable)
            self.updating_table = True
            table.clear()
            table.add_rows([(song["title"], f"{song['composer']} · {song['key']}") for song in self.visible_songs])
            if self.visible_songs:
                index = next((i for i, song in enumerate(self.visible_songs) if song["id"] == self.selected_id), 0)
                self.selected_id = self.visible_songs[index]["id"]
                table.move_cursor(row=index, animate=False)
            self._update_details()
            self.call_after_refresh(self._finish_table_update)

        def _finish_table_update(self) -> None:
            self.updating_table = False

        def _update_details(self) -> None:
            song = self.selected
            details = self.query_one_optional("#song-details", Static)
            if details is None:
                return
            if not song:
                details.update("[yellow]No song selected.[/yellow]")
                return
            backing = song["backing"]
            pattern = backing.get("pattern", "arpeggio-up")
            selector = self.query_one_optional("#pattern-select", Select)
            if selector is not None and selector.value != pattern:
                self.loading_pattern = True
                selector.value = pattern
                self.loading_pattern = False
            details.update(
                f"[bold]{escape(song['title'])}[/bold]\n{escape(song['composer'])} · {escape(song['key'])} · {song['tempo']} BPM · {escape(song['form'])}\n"
                f"[dim]{escape(backing['feel'])}[/dim]\n[cyan]Chords:[/] {escape(' · '.join(backing['progression']))}"
            )
            arpeggios = song.get("improvisation", {}).get("arpeggios", [])
            arpeggio_text = "\n".join(f"[cyan]{escape(item['chord'])}[/]  {escape(' · '.join(item['notes']))}" for item in arpeggios)
            self.query_one("#arpeggios", Static).update(f"[bold]Arpeggios[/bold]\n{arpeggio_text}" if arpeggio_text else "")
            self._load_code_editor(song)
            self._update_live_panel()

        def _current_code(self) -> str:
            song = self.selected
            if not song:
                return ""
            return self.code_drafts.get(song["id"], song["strudel"])

        def _current_playback_code(self) -> str:
            return transpose_notes(self._current_code(), self.transpose_semitones)

        def _schedule_live_update(self) -> None:
            if not self.playing_title:
                return
            if self.live_update_timer is not None:
                self.live_update_timer.stop()
            self.live_update_timer = self.set_timer(0.3, self._refresh_live_playback)

        def _refresh_live_playback(self) -> None:
            self.live_update_timer = None
            if not self.playing_title or not self.player:
                return
            try:
                self.live_event = None
                self.player.send({"type": "play", "code": self._current_playback_code()})
                self._update_live_panel()
                if self.selected:
                    self._set_status(self.t["playing"](self.selected["title"]))
            except RuntimeError as error:
                self.playing_title = ""
                self._set_status(self.t["error"](str(error)))

        def _load_code_editor(self, song: dict[str, Any]) -> None:
            editor = self.query_one("#code-editor", TextArea)
            code = self.code_drafts.get(song["id"], song["strudel"])
            if editor.text == code:
                return
            self.loading_code = True
            editor.load_text(code)
            self.loading_code = False

        def _highlight_live_code(self, locations: list[dict[str, Any]]) -> None:
            if not locations:
                return
            editor = self.query_one("#code-editor", TextArea)
            code = self._current_code()
            # Strudel supplies both enclosing expressions and leaf locations.
            # The shortest range is the active note token; using min/max made
            # the editor select an entire expression or line.
            leaf = min(
                (location for location in locations if int(location.get("end", 0)) > int(location.get("start", 0))),
                key=lambda location: int(location["end"]) - int(location["start"]),
                default=None,
            )
            if leaf is None:
                return
            start = max(0, int(leaf["start"]))
            end = min(len(code), int(leaf["end"]))
            if end <= start:
                return
            editor.selection = Selection(
                editor.document.get_location_from_index(start),
                editor.document.get_location_from_index(end),
            )

        def _update_live_panel(self) -> None:
            live = self.query_one("#live", Static)
            if not self.playing_title:
                live.update(f"[dim]○ {self.t['stopped']}[/dim]\n{self.t['now']}: —")
                return
            event = self.live_event or {}
            notes = " · ".join(str(note) for note in event.get("notes", [])) or "…"
            sound = event.get("sound", "…")
            live.update(f"[bold green]● {self.t['live']}[/bold green]\n[bold]{escape(self.playing_title)}[/bold]\n{self.t['now']}: [cyan]{escape(notes)}[/cyan]  [dim][{escape(str(sound))}][/dim]\n[green]▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮[/green]")

        def _on_player_message(self, message: dict[str, Any]) -> None:
            kind = message.get("type")
            if kind == "event":
                self.live_event = message.get("event")
                self._highlight_live_code(self.live_event.get("locations", []) if self.live_event else [])
            elif kind == "stopped":
                self.playing_title = ""
                self.live_event = None
            elif kind == "error":
                self.playing_title = ""
                self.live_event = None
                self._set_status(self.t["error"](str(message.get("message", "Unknown player error"))))
            self._update_live_panel()

        def _queue_player_message(self, message: dict[str, Any]) -> None:
            """Safely transfer audio-process messages from its reader thread."""
            try:
                self.call_from_thread(self._on_player_message, message)
            except RuntimeError:
                # The terminal can close before the audio process emits its last event.
                pass

        def _play(self) -> None:
            song = self.selected
            if not song or not self.player:
                return
            try:
                self.player.send({"type": "play", "code": self._current_playback_code()})
                self.playing_title = song["title"]
                self.live_event = None
                self._update_live_panel()
                self._set_status(self.t["playing"](song["title"]))
            except RuntimeError as error:
                self.playing_title = ""
                self.live_event = None
                self._update_live_panel()
                self._set_status(self.t["error"](str(error)))

        def _stop(self) -> None:
            if self.live_update_timer is not None:
                self.live_update_timer.stop()
                self.live_update_timer = None
            try:
                if self.player:
                    self.player.send({"type": "stop"})
            except RuntimeError as error:
                self._set_status(self.t["error"](str(error)))
                return
            self.playing_title = ""
            self.live_event = None
            editor = self.query_one("#code-editor", TextArea)
            editor.selection = Selection.cursor(editor.selection.end)
            self._update_live_panel()
            self._set_status(self.t["stopped_message"])

        def _save_song(self, song: dict[str, Any], imported: bool = False) -> None:
            if not is_song(song):
                self._set_status(self.t["error"](self.t["invalid"]))
                return
            directory = PERSONAL_SONGS_DIRECTORY if (PERSONAL_SONGS_DIRECTORY / f"{song['id']}.json").exists() else SONGS_DIRECTORY
            directory.mkdir(parents=True, exist_ok=True)
            (directory / f"{song['id']}.json").write_text(json.dumps(song, indent=2) + "\n", encoding="utf-8")
            self.code_drafts.pop(song["id"], None)
            self.selected_id = song["id"]
            self._reload_library()
            self._set_status(self.t["imported"](song["title"]) if imported else self.t["saved"](song["title"]))

        def on_input_changed(self, event: Input.Changed) -> None:
            if event.input.id == "search":
                self._filter_songs(event.value)

        def on_text_area_changed(self, event: TextArea.Changed) -> None:
            if event.text_area.id != "code-editor" or self.loading_code or not self.selected:
                return
            self.code_drafts[self.selected["id"]] = event.text_area.text
            self._set_status("Code changed — Ctrl+S or Save code to write it." if self.language == "en" else "Código modificado — Ctrl+S o Guardar código para escribirlo.")
            self._schedule_live_update()

        def on_select_changed(self, event: Select.Changed) -> None:
            if event.select.id == "transpose-select" and isinstance(event.value, int):
                self.transpose_semitones = event.value
                direction = f"{event.value:+d}" if event.value else "0"
                self._set_status(f"Transpose: {direction} semitones" if self.language == "en" else f"Transposición: {direction} semitonos")
                self._schedule_live_update()
                return
            if event.select.id != "pattern-select" or self.loading_pattern or not self.selected or not isinstance(event.value, str):
                return
            pattern = event.value
            if pattern not in BACKING_PATTERNS:
                return
            song = self.selected
            if song["backing"].get("pattern", "arpeggio-up") == pattern:
                return
            code = apply_backing_pattern(self._current_code(), pattern)
            self.code_drafts[song["id"]] = code
            self._save_song({**song, "strudel": code, "backing": {**song["backing"], "pattern": pattern}})
            self._schedule_live_update()

        def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
            if not self.updating_table and event.data_table.id == "song-table" and event.cursor_row < len(self.visible_songs):
                self.selected_id = self.visible_songs[event.cursor_row]["id"]
                self._update_details()

        def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
            if not self.updating_table and event.data_table.id == "song-table" and event.cursor_row < len(self.visible_songs):
                self.selected_id = self.visible_songs[event.cursor_row]["id"]
                self._play()

        def on_button_pressed(self, event: Button.Pressed) -> None:
            """Dispatch every action button through Textual's standard handler.

            Keeping this in one bubbling handler also works when a button is
            clicked after the code editor had keyboard focus.
            """
            actions: dict[str | None, Callable[[], None]] = {
                "play": self._play,
                "stop": self._stop,
                "save-code": self.action_save_code,
                "random": self.action_random,
                "edit": self.action_edit,
                "new": self.action_new,
                "import": self.action_import_song,
                "export": self.action_export_song,
            }
            action = actions.get(event.button.id)
            if action is not None:
                action()

        def action_focus_search(self) -> None:
            self.query_one("#search", Input).focus()

        def action_focus_table(self) -> None:
            self.query_one("#song-table", DataTable).focus()

        def _move_selection(self, offset: int) -> None:
            if not self.visible_songs:
                return
            table = self.query_one("#song-table", DataTable)
            current = table.cursor_row if table.cursor_row is not None else 0
            index = max(0, min(len(self.visible_songs) - 1, current + offset))
            table.move_cursor(row=index, animate=False)
            self.selected_id = self.visible_songs[index]["id"]
            self._update_details()

        def action_next_song(self) -> None:
            self._move_selection(1)

        def action_previous_song(self) -> None:
            self._move_selection(-1)

        def action_play(self) -> None:
            self._play()

        def action_toggle_playback(self) -> None:
            """Toggle playback from a keyboard shortcut, even in the editor."""
            if self.playing_title:
                self._stop()
            else:
                self._play()

        def action_save_code(self) -> None:
            song = self.selected
            if not song:
                return
            self._save_song({**song, "strudel": self._current_code()})

        def action_stop(self) -> None:
            self._stop()

        def action_random(self) -> None:
            if not self.visible_songs:
                return
            choices = [song for song in self.visible_songs if song["id"] != self.selected_id] or self.visible_songs
            song = choice(choices)
            self.selected_id = song["id"]
            self._filter_songs(self.query_one("#search", Input).value)
            self._set_status(self.t["picked"](song["title"]))

        def action_edit(self) -> None:
            if self.selected:
                self.push_screen(SongEditor(self.selected, self.t), self._save_song)

        def action_new(self) -> None:
            song_id = f"song-{len(self.songs) + 1}"
            while (SONGS_DIRECTORY / f"{song_id}.json").exists():
                song_id += "-new"
            self.push_screen(SongEditor(new_song(song_id), self.t), self._save_song)

        def action_import_song(self) -> None:
            self.push_screen(PathPrompt(self.t["import"], self.t["path_import"], self.t["save"], self.t["cancel"]), self._import_path)

        def _import_path(self, path: str | None) -> None:
            if not path:
                return
            try:
                song = json.loads(Path(path).expanduser().read_text(encoding="utf-8"))
                self._save_song(song, imported=True)
            except Exception as error:
                self._set_status(self.t["error"](str(error)))

        def action_export_song(self) -> None:
            if self.selected:
                self.push_screen(PathPrompt(self.t["export"], self.t["path_export"], self.t["save"], self.t["cancel"], f"{self.selected['id']}.json"), self._export_path)

        def _export_path(self, path: str | None) -> None:
            if not path or not self.selected:
                return
            try:
                destination = Path(path).expanduser()
                destination.write_text(json.dumps(self.selected, indent=2) + "\n", encoding="utf-8")
                self._set_status(self.t["exported"](str(destination)))
            except Exception as error:
                self._set_status(self.t["error"](str(error)))

        def action_language(self) -> None:
            self.language = "es" if self.language == "en" else "en"
            self.query_one("#search", Input).placeholder = self.t["search"]
            self.query_one("#library-title", Label).update(self.t["library"])
            self.query_one("#details-title", Label).update(self.t["details"])
            self.query_one("#pattern-label", Label).update(self.t["pattern"])
            self.query_one("#transpose-label", Label).update(self.t["transpose"])
            selector = self.query_one("#pattern-select", Select)
            self.loading_pattern = True
            selector.set_options(self._pattern_options())
            self.loading_pattern = False
            for button_id, label in (("play", "play"), ("stop", "stop"), ("save-code", "save_code"), ("random", "random"), ("edit", "edit"), ("new", "new"), ("import", "import"), ("export", "export")):
                self.query_one(f"#{button_id}", Button).label = self.t[label]
            self._update_details()

        def action_reload(self) -> None:
            self._reload_library()

    RealbookTextualApp().run(mouse=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
