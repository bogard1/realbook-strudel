import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, initStrudel, type StrudelEngine } from '@strudel/web';
import { isSong, makeSong, type Song } from './song';

const builtInSongs = Object.values(
  import.meta.glob('../../../songs/*.json', { eager: true, import: 'default' }),
) as Song[];
const storageKey = 'realbook-strudel:local-songs:v1';
const languageStorageKey = 'realbook-strudel:language:v1';

type Language = 'en' | 'es';
type Status =
  | { type: 'ready' | 'saved' | 'initializing' | 'stopped' | 'created' | 'restored' }
  | { type: 'playing' | 'imported'; title: string }
  | { type: 'error'; message: string };

const copy = {
  en: {
    ready: 'Ready to play.', saved: 'Changes are saved in this browser. Export the JSON to add it to the repository.', initializing: 'Initializing audio…', playing: (title: string) => `Playing: ${title}`, stopped: 'Playback stopped.', nothingToStop: 'Nothing is playing.', created: 'New song created locally.', restored: 'The bundled catalog version was restored.', imported: (title: string) => `${title} was imported locally.`, noSongs: 'There are no songs. Import or create one.', library: 'Library', brandSuffix: 'for Strudel', search: 'Search', searchPlaceholder: 'Title, composer, key…', songCount: (visible: number, total: number) => `${visible} of ${total} songs`, newSong: '+ New', importJson: 'Import JSON', restart: '↻ Restart', play: '▶ Play', stop: '■ Stop', editSong: 'Edit song', localSave: 'Saved locally', title: 'Title', composer: 'Composer', key: 'Key', tempo: 'Tempo (BPM)', form: 'Form', chordProgression: 'Chord progression', feel: 'Feel', source: 'Source', sourceLicense: 'Source license', tags: 'Tags', license: 'License or permission', strudelCode: 'Strudel code', download: 'Download JSON', restore: 'Restore bundled version', footer: 'GitHub Pages edits stay in this browser. Download the JSON and add it to ', footerEnd: ' to publish it.', language: 'Language', english: 'English', spanish: 'Español', invalidSong: 'The file does not conform to the song schema.', audioError: (message: string) => `Strudel error: ${message}`, importError: (message: string) => `Could not import: ${message}`,
  },
  es: {
    ready: 'Listo para tocar.', saved: 'Los cambios se guardaron en este navegador. Exporta el JSON para añadirlo al repositorio.', initializing: 'Inicializando audio…', playing: (title: string) => `Reproduciendo: ${title}`, stopped: 'Reproducción detenida.', nothingToStop: 'No hay reproducción activa.', created: 'Nueva canción creada localmente.', restored: 'Se restauró la versión incluida del catálogo.', imported: (title: string) => `${title} se importó localmente.`, noSongs: 'No hay canciones. Importa o crea una.', library: 'Biblioteca', brandSuffix: 'para Strudel', search: 'Buscar', searchPlaceholder: 'Título, compositor, tonalidad…', songCount: (visible: number, total: number) => `${visible} de ${total} canciones`, newSong: '+ Nueva', importJson: 'Importar JSON', restart: '↻ Reiniciar', play: '▶ Reproducir', stop: '■ Detener', editSong: 'Editar canción', localSave: 'Guardado local', title: 'Título', composer: 'Compositor/a', key: 'Tonalidad', tempo: 'Tempo (BPM)', form: 'Forma', chordProgression: 'Progresión de acordes', feel: 'Aire', source: 'Fuente', sourceLicense: 'Licencia de la fuente', tags: 'Etiquetas', license: 'Licencia o permiso', strudelCode: 'Código Strudel', download: 'Descargar JSON', restore: 'Restaurar versión incluida', footer: 'Las ediciones de GitHub Pages permanecen en este navegador. Descarga el JSON y añádelo a ', footerEnd: ' para publicarlo.', language: 'Idioma', english: 'English', spanish: 'Español', invalidSong: 'El archivo no cumple el esquema de canción.', audioError: (message: string) => `Error de Strudel: ${message}`, importError: (message: string) => `No se pudo importar: ${message}`,
  },
} as const;

function getLanguage(): Language {
  return localStorage.getItem(languageStorageKey) === 'es' ? 'es' : 'en';
}

function loadLocalSongs(): Song[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter(isSong) : [];
  } catch {
    return [];
  }
}

function persistLocalSongs(songs: Song[]) {
  localStorage.setItem(storageKey, JSON.stringify(songs));
}

function downloadSong(song: Song) {
  const href = URL.createObjectURL(new Blob([`${JSON.stringify(song, null, 2)}\n`], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${song.id}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function App() {
  const [localSongs, setLocalSongs] = useState<Song[]>(loadLocalSongs);
  const [language, setLanguage] = useState<Language>(getLanguage);
  const [selectedId, setSelectedId] = useState(builtInSongs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'ready' });
  const [isPlaying, setIsPlaying] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const strudelInitialized = useRef(false);
  const strudelEngine = useRef<StrudelEngine | undefined>(undefined);
  const t = copy[language];

  const songs = useMemo(() => {
    const merged = new Map(builtInSongs.map((song) => [song.id, song]));
    localSongs.forEach((song) => merged.set(song.id, song));
    return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [localSongs]);
  const selected = songs.find((song) => song.id === selectedId) ?? songs[0];
  const filtered = songs.filter((song) => {
    const text = `${song.title} ${song.composer} ${song.key} ${song.tags.join(' ')}`.toLowerCase();
    return text.includes(query.toLowerCase().trim());
  });

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language;
  }, [language]);

  function updateSelected(patch: Partial<Song>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setLocalSongs((current) => {
      const withoutCurrent = current.filter((song) => song.id !== selected.id);
      const updated = [...withoutCurrent, next];
      persistLocalSongs(updated);
      return updated;
    });
    setStatus({ type: 'saved' });
  }

  async function play() {
    if (!selected) return;
    try {
      setStatus({ type: 'initializing' });
      if (!strudelInitialized.current) {
        strudelEngine.current = await initStrudel();
        strudelInitialized.current = true;
      }
      await evaluate(selected.strudel);
      setIsPlaying(true);
      setStatus({ type: 'playing', title: selected.title });
    } catch (error) {
      setIsPlaying(false);
      setStatus({ type: 'error', message: t.audioError(error instanceof Error ? error.message : String(error)) });
    }
  }

  function stop() {
    if (!strudelInitialized.current) {
      setStatus({ type: 'error', message: t.nothingToStop });
      return;
    }
    strudelEngine.current?.scheduler.stop();
    setIsPlaying(false);
    setStatus({ type: 'stopped' });
  }

  function createSong() {
    const id = `song-${Date.now().toString(36)}`;
    const song = makeSong(id);
    setLocalSongs((current) => {
      const updated = [...current, song];
      persistLocalSongs(updated);
      return updated;
    });
    setSelectedId(id);
    setStatus({ type: 'created' });
  }

  function restoreOriginal() {
    if (!selected) return;
    setLocalSongs((current) => {
      const updated = current.filter((song) => song.id !== selected.id);
      persistLocalSongs(updated);
      return updated;
    });
    setStatus({ type: 'restored' });
  }

  async function importSong(file?: File) {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isSong(value)) throw new Error(t.invalidSong);
      setLocalSongs((current) => {
        const updated = [...current.filter((song) => song.id !== value.id), value];
        persistLocalSongs(updated);
        return updated;
      });
      setSelectedId(value.id);
      setStatus({ type: 'imported', title: value.title });
    } catch (error) {
      setStatus({ type: 'error', message: t.importError(error instanceof Error ? error.message : String(error)) });
    }
  }

  const statusText = status.type === 'playing' || status.type === 'imported'
    ? t[status.type](status.title)
    : status.type === 'error'
      ? status.message
      : t[status.type];

  if (!selected) return <main className="empty">{t.noSongs}</main>;

  const hasOriginal = builtInSongs.some((song) => song.id === selected.id);
  return (
    <main className="app-shell">
      <aside className="library" aria-label={t.library}>
        <div className="brand">
          <span className="brand-mark">♩</span>
          <div><strong>Realbook</strong><span>{t.brandSuffix}</span></div>
        </div>
        <label className="language-picker">{t.language}<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">{t.english}</option><option value="es">{t.spanish}</option></select></label>
        <label className="search-label" htmlFor="search">{t.search}</label>
        <input id="search" className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
        <div className="song-count">{t.songCount(filtered.length, songs.length)}</div>
        <nav className="song-list">
          {filtered.map((song) => (
            <button className={`song-row ${song.id === selected.id ? 'selected' : ''}`} key={song.id} onClick={() => setSelectedId(song.id)}>
              <strong>{song.title}</strong><span>{song.composer} · {song.key}</span>
            </button>
          ))}
        </nav>
        <div className="library-actions">
          <button onClick={createSong}>{t.newSong}</button>
          <button onClick={() => importRef.current?.click()}>{t.importJson}</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => void importSong(event.target.files?.[0])} />
        </div>
      </aside>

      <section className="workspace">
        <header className="song-header">
          <div>
            <p className="eyebrow">{selected.composer}</p>
            <h1>{selected.title}</h1>
            <p className="metadata">{selected.key} · {selected.tempo} BPM · {selected.form}</p>
            <p className="metadata">{t.chordProgression}: {selected.backing.progression.join(' · ')} · {selected.backing.feel}</p>
            {selected.source && <p className="source"><a href={selected.source.url} target="_blank" rel="noreferrer">{t.source}: {selected.source.title}</a> · {t.sourceLicense}: {selected.source.license}</p>}
          </div>
          <div className="transport">
            <button className="play" onClick={() => void play()}>{isPlaying ? t.restart : t.play}</button>
            <button onClick={stop} disabled={!isPlaying}>{t.stop}</button>
          </div>
        </header>

        <p className="status" role="status">{statusText}</p>
        <section className="editor-card">
          <div className="editor-heading"><h2>{t.editSong}</h2><span>{t.localSave}</span></div>
          <div className="fields">
            <label>{t.title}<input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} /></label>
            <label>{t.composer}<input value={selected.composer} onChange={(event) => updateSelected({ composer: event.target.value })} /></label>
            <label>{t.key}<input value={selected.key} onChange={(event) => updateSelected({ key: event.target.value })} /></label>
            <label>{t.tempo}<input type="number" min="1" value={selected.tempo} onChange={(event) => updateSelected({ tempo: Number(event.target.value) || 1 })} /></label>
            <label>{t.form}<input value={selected.form} onChange={(event) => updateSelected({ form: event.target.value })} /></label>
            <label>{t.feel}<input value={selected.backing.feel} onChange={(event) => updateSelected({ backing: { ...selected.backing, feel: event.target.value } })} /></label>
            <label>{t.tags}<input value={selected.tags.join(', ')} onChange={(event) => updateSelected({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></label>
          </div>
          <label className="license-field">{t.chordProgression}<input value={selected.backing.progression.join(', ')} onChange={(event) => updateSelected({ backing: { ...selected.backing, progression: event.target.value.split(',').map((chord) => chord.trim()).filter(Boolean) } })} /></label>
          <label className="license-field">{t.license}<input value={selected.license} onChange={(event) => updateSelected({ license: event.target.value })} /></label>
          <label className="code-label">{t.strudelCode}<textarea spellCheck="false" value={selected.strudel} onChange={(event) => updateSelected({ strudel: event.target.value })} /></label>
          <div className="editor-actions">
            <button onClick={() => downloadSong(selected)}>{t.download}</button>
            {hasOriginal && <button onClick={restoreOriginal}>{t.restore}</button>}
          </div>
        </section>
        <footer>{t.footer}<code>songs/</code>{t.footerEnd}</footer>
      </section>
    </main>
  );
}
