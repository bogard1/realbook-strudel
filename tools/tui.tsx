import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { TerminalStrudelPlayer } from './audio-player.ts';
import { isSong, loadSongs, makeSong, saveSong, type Song } from './song-library.ts';

type Language = 'en' | 'es';
type Mode = 'browse' | 'search' | 'import' | 'export';
type Action = { type: 'quit' } | { type: 'edit'; song?: Song };

const messages = {
  en: {
    title: 'REALBOOK STRUDEL', search: 'Search', nowPlaying: 'NOW PLAYING', stopped: 'STOPPED', source: 'Source', noSource: 'No source metadata', chords: 'Chords', code: 'Strudel code', noSongs: 'No songs found', controls: '↑↓ select  / search  g random  p play  space pause  e edit  n new  i import  x export  l language  r reload  q quit', importPath: 'JSON file to import:', exportPath: 'Destination path:', imported: (title: string) => `Imported ${title}.`, exported: (path: string) => `Exported to ${path}.`, loaded: (count: number) => `Loaded ${count} songs.`, picked: (title: string) => `Practice pick: ${title}.`, playing: (title: string) => `Playing ${title}.`, paused: 'Playback paused.', editing: 'Opening your editor…', error: (message: string) => `Error: ${message}`, editorSaved: (title: string) => `Saved ${title}.`, language: 'Language', noSelection: 'No song selected.',
  },
  es: {
    title: 'REALBOOK STRUDEL', search: 'Buscar', nowPlaying: 'REPRODUCIENDO', stopped: 'DETENIDO', source: 'Fuente', noSource: 'Sin metadatos de fuente', chords: 'Acordes', code: 'Código Strudel', noSongs: 'No se encontraron canciones', controls: '↑↓ seleccionar  / buscar  g aleatoria  p reproducir  espacio pausar  e editar  n nueva  i importar  x exportar  l idioma  r recargar  q salir', importPath: 'Archivo JSON para importar:', exportPath: 'Ruta de destino:', imported: (title: string) => `${title} se importó.`, exported: (path: string) => `Exportado en ${path}.`, loaded: (count: number) => `${count} canciones cargadas.`, picked: (title: string) => `Selección para practicar: ${title}.`, playing: (title: string) => `Reproduciendo ${title}.`, paused: 'Reproducción pausada.', editing: 'Abriendo el editor…', error: (message: string) => `Error: ${message}`, editorSaved: (title: string) => `${title} se guardó.`, language: 'Idioma', noSelection: 'No hay canción seleccionada.',
  },
} as const;

function preview(code: string): string[] {
  const lines = code.split('\n');
  return lines.length > 8 ? [...lines.slice(0, 8), '…'] : lines;
}

function Dashboard({ initialStatus, onAction }: { initialStatus: string; onAction: (action: Action) => void }) {
  const { exit } = useApp();
  const [songs, setSongs] = useState<Song[]>([]);
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<Mode>('browse');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState(initialStatus);
  const [player] = useState(() => new TerminalStrudelPlayer());
  const t = messages[language];

  const filtered = useMemo(() => songs.filter((song) => {
    const terms = `${song.title} ${song.composer} ${song.key} ${song.form} ${song.tags.join(' ')} ${song.backing.feel} ${song.backing.progression.join(' ')}`.toLowerCase();
    return terms.includes(query.toLowerCase().trim());
  }), [query, songs]);
  const selected = filtered[Math.min(selectedIndex, Math.max(0, filtered.length - 1))];

  const refresh = async () => {
    const next = await loadSongs();
    setSongs(next);
    setSelectedIndex((current) => Math.min(current, Math.max(0, next.length - 1)));
    setStatus(messages[language].loaded(next.length));
  };

  useEffect(() => {
    void refresh();
    return () => { void player.close(); };
    // The player is intentionally created once for the full TUI session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function playSelected() {
    if (!selected) return setStatus(t.noSelection);
    try {
      await player.play(selected.strudel);
      setStatus(t.playing(selected.title));
    } catch (error) {
      setStatus(t.error(error instanceof Error ? error.message : String(error)));
    }
  }

  function pause() {
    player.pause();
    setStatus(t.paused);
  }

  function pickRandom() {
    if (filtered.length === 0) return setStatus(t.noSongs);
    const choices = filtered.length > 1 ? filtered.filter((song) => song.id !== selected?.id) : filtered;
    const song = choices[Math.floor(Math.random() * choices.length)];
    const index = filtered.findIndex((candidate) => candidate.id === song.id);
    setSelectedIndex(index);
    setStatus(t.picked(song.title));
  }

  async function submitPrompt(value: string) {
    try {
      if (mode === 'import') {
        const data: unknown = JSON.parse(await readFile(resolve(value.trim()), 'utf8'));
        if (!isSong(data)) throw new Error('The JSON file does not conform to the song schema.');
        await saveSong(data);
        await refresh();
        setStatus(t.imported(data.title));
      } else if (mode === 'export') {
        if (!selected) throw new Error(t.noSelection);
        const path = resolve(value.trim() || `${selected.id}.json`);
        await writeFile(path, `${JSON.stringify(selected, null, 2)}\n`);
        setStatus(t.exported(path));
      }
    } catch (error) {
      setStatus(t.error(error instanceof Error ? error.message : String(error)));
    } finally {
      setDraft('');
      setMode('browse');
    }
  }

  useInput((input, key) => {
    if (mode !== 'browse') {
      if (key.escape) { setMode('browse'); setDraft(''); }
      return;
    }
    if (key.upArrow || input === 'k') setSelectedIndex((current) => Math.max(0, current - 1));
    else if (key.downArrow || input === 'j') setSelectedIndex((current) => Math.min(Math.max(0, filtered.length - 1), current + 1));
    else if (input === '/') { setMode('search'); setDraft(query); }
    else if (input === 'p' || key.return) void playSelected();
    else if (input === ' ') pause();
    else if (input === 'g') pickRandom();
    else if (input === 'e' && selected) { setStatus(t.editing); onAction({ type: 'edit', song: selected }); exit(); }
    else if (input === 'n') { setStatus(t.editing); onAction({ type: 'edit' }); exit(); }
    else if (input === 'i') { setMode('import'); setDraft(''); }
    else if (input === 'x') { setMode('export'); setDraft(selected ? `${selected.id}.json` : ''); }
    else if (input === 'l') setLanguage((current) => current === 'en' ? 'es' : 'en');
    else if (input === 'r') void refresh();
    else if (input === 'q' || (key.ctrl && input === 'c')) { onAction({ type: 'quit' }); exit(); }
  }, { isActive: mode === 'browse' });

  const prompt = mode === 'search' ? t.search : mode === 'import' ? t.importPath : t.exportPath;
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between"><Text bold color="cyan">{t.title}</Text><Text color="gray">{t.language}: {language === 'en' ? 'English' : 'Español'} · {player.playing ? t.nowPlaying : t.stopped}</Text></Box>
      <Box marginTop={1} gap={2}>
        <Box flexDirection="column" width="42%" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold>{t.search}: {query || '—'}</Text>
          {filtered.length === 0 && <Text color="yellow">{t.noSongs}</Text>}
          {filtered.slice(0, 14).map((song, index) => <Text key={song.id} color={song.id === selected?.id ? 'cyan' : undefined}>{song.id === selected?.id ? '› ' : '  '}{song.title} <Text color="gray">— {song.composer}</Text></Text>)}
        </Box>
        <Box flexDirection="column" width="58%" borderStyle="round" borderColor="gray" paddingX={1}>
          {selected ? <>
            <Text bold color="green">{selected.title}</Text>
            <Text>{selected.composer} · {selected.key} · {selected.tempo} BPM · {selected.form}</Text>
            <Text color="gray">{selected.tags.join(' · ')}</Text>
            <Text>{t.chords}: {selected.backing.progression.join(' · ')} · {selected.backing.feel}</Text>
            <Text>{t.source}: {selected.source ? selected.source.title : t.noSource}</Text>
            {selected.source && <Text color="gray">{selected.source.url}</Text>}
            <Text bold>{t.code}</Text>
            {preview(selected.strudel).map((line, index) => <Text key={index} color="gray">{line}</Text>)}
          </> : <Text color="yellow">{t.noSelection}</Text>}
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {mode === 'browse' ? <Text color={status.startsWith('Error') ? 'red' : 'green'}>{status}</Text> : <Box><Text>{prompt} </Text><TextInput value={draft} onChange={(value) => { setDraft(value); if (mode === 'search') { setQuery(value); setSelectedIndex(0); } }} onSubmit={(value) => void (mode === 'search' ? (setMode('browse'), setDraft('')) : submitPrompt(value))} /></Box>}
        <Text color="gray">{t.controls}</Text>
      </Box>
    </Box>
  );
}

async function openEditor(song?: Song): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'realbook-strudel-'));
  const path = join(directory, 'song.json');
  const originalId = song?.id;
  const template = song ?? makeSong('new-song');
  await writeFile(path, `${JSON.stringify(template, null, 2)}\n`);
  try {
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(`${editor} "${path}"`, { shell: true, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${editor} exited with status ${result.status ?? 'unknown'}.`);
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isSong(value)) throw new Error('The edited JSON does not conform to the song schema.');
    if (originalId && value.id !== originalId) throw new Error('Changing an existing song ID is not supported; create a new song instead.');
    await saveSong(value);
    return messages.en.editorSaved(value.title);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runDashboard(status: string): Promise<Action> {
  let action: Action = { type: 'quit' };
  const instance = render(<Dashboard initialStatus={status} onAction={(next) => { action = next; }} />, { exitOnCtrlC: false, alternateScreen: true });
  await instance.waitUntilExit();
  return action;
}

async function main() {
  if (process.argv.includes('--check')) {
    const songs = await loadSongs();
    console.log(`TUI ready: ${songs.length} song(s) available.`);
    return;
  }
  if (process.argv.includes('--help')) {
    console.log('Run `npm run tui` in an interactive terminal. Press q to quit.');
    return;
  }

  let status = messages.en.loaded((await loadSongs()).length);
  while (true) {
    const action = await runDashboard(status);
    if (action.type === 'quit') break;
    try {
      status = await openEditor(action.song);
    } catch (error) {
      status = messages.en.error(error instanceof Error ? error.message : String(error));
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
