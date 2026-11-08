import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { evaluate, initStrudel, type StrudelEngine, type StrudelHap, type StrudelLocation } from '@strudel/web';
import { isSong, makeSong, type Song } from './song';

const builtInSongs = Object.values(
  import.meta.glob('../../../songs/*.json', { eager: true, import: 'default' }),
) as Song[];
const storageKey = 'realbook-strudel:local-songs:v1';
const languageStorageKey = 'realbook-strudel:language:v1';

type Language = 'en' | 'es';
type Status =
  | { type: 'ready' | 'saved' | 'initializing' | 'stopped' | 'created' | 'restored' | 'linkCopied' }
  | { type: 'playing' | 'imported' | 'practicePick'; title: string }
  | { type: 'error'; message: string };

type Filters = {
  composer: string;
  key: string;
  feel: string;
};

const noFilter = '__all__';
const songHashPrefix = '#/song/';

function songHash(id: string) {
  return `${songHashPrefix}${encodeURIComponent(id)}`;
}

function songIdFromHash() {
  const match = window.location.hash.match(/^#\/song\/([^/]+)$/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function renderHighlightedCode(code: string, locations: StrudelLocation[]) {
  const ranges = locations
    .map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(code.length, end) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = ranges.reduce<Array<{ start: number; end: number }>>((result, range) => {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
    return result;
  }, []);
  const parts: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (cursor < range.start) parts.push(code.slice(cursor, range.start));
    parts.push(<mark className="executing-token" key={`${range.start}-${range.end}-${index}`}>{code.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < code.length) parts.push(code.slice(cursor));
  return parts;
}

const copy = {
  en: {
    ready: 'Ready to play.', saved: 'Changes are saved in this browser. Export the JSON to add it to the repository.', initializing: 'Initializing audio…', playing: (title: string) => `Playing: ${title}`, stopped: 'Playback stopped.', nothingToStop: 'Nothing is playing.', created: 'New song created locally.', restored: 'The bundled catalog version was restored.', imported: (title: string) => `${title} was imported locally.`, practicePick: (title: string) => `Practice pick: ${title}`, linkCopied: 'Song link copied.', copyLinkError: 'Could not copy the song link.', noSongs: 'There are no songs. Import or create one.', library: 'Library', brandSuffix: 'for Strudel', search: 'Search', searchPlaceholder: 'Title, composer, key, chord…', filters: 'Filters', all: 'All', clearFilters: 'Clear filters', randomSong: '♢ Random practice song', songCount: (visible: number, total: number) => `${visible} of ${total} songs`, newSong: '+ New', importJson: 'Import JSON', restart: '↻ Restart', play: '▶ Play', stop: '■ Stop', copyLink: '⌁ Copy link', editSong: 'Edit song', localSave: 'Saved locally', title: 'Title', composer: 'Composer', key: 'Key', tempo: 'Tempo (BPM)', form: 'Form', chordProgression: 'Chord progression', arpeggios: 'Arpeggios for improvisation', feel: 'Feel', source: 'Source', sourceLicense: 'Source license', tags: 'Tags', license: 'License or permission', strudelCode: 'Strudel code', liveCode: 'Live execution', download: 'Download JSON', restore: 'Restore bundled version', footer: 'GitHub Pages edits stay in this browser. Download the JSON and add it to ', footerEnd: ' to publish it.', language: 'Language', english: 'English', spanish: 'Español', invalidSong: 'The file does not conform to the song schema.', audioError: (message: string) => `Strudel error: ${message}`, importError: (message: string) => `Could not import: ${message}`,
  },
  es: {
    ready: 'Listo para tocar.', saved: 'Los cambios se guardaron en este navegador. Exporta el JSON para añadirlo al repositorio.', initializing: 'Inicializando audio…', playing: (title: string) => `Reproduciendo: ${title}`, stopped: 'Reproducción detenida.', nothingToStop: 'No hay reproducción activa.', created: 'Nueva canción creada localmente.', restored: 'Se restauró la versión incluida del catálogo.', imported: (title: string) => `${title} se importó localmente.`, practicePick: (title: string) => `Selección para practicar: ${title}`, linkCopied: 'Enlace de la canción copiado.', copyLinkError: 'No se pudo copiar el enlace de la canción.', noSongs: 'No hay canciones. Importa o crea una.', library: 'Biblioteca', brandSuffix: 'para Strudel', search: 'Buscar', searchPlaceholder: 'Título, compositor, tonalidad, acorde…', filters: 'Filtros', all: 'Todos', clearFilters: 'Limpiar filtros', randomSong: '♢ Canción aleatoria', songCount: (visible: number, total: number) => `${visible} de ${total} canciones`, newSong: '+ Nueva', importJson: 'Importar JSON', restart: '↻ Reiniciar', play: '▶ Reproducir', stop: '■ Detener', copyLink: '⌁ Copiar enlace', editSong: 'Editar canción', localSave: 'Guardado local', title: 'Título', composer: 'Compositor/a', key: 'Tonalidad', tempo: 'Tempo (BPM)', form: 'Forma', chordProgression: 'Progresión de acordes', arpeggios: 'Arpegios para improvisar', feel: 'Aire', source: 'Fuente', sourceLicense: 'Licencia de la fuente', tags: 'Etiquetas', license: 'Licencia o permiso', strudelCode: 'Código Strudel', liveCode: 'Ejecución en vivo', download: 'Descargar JSON', restore: 'Restaurar versión incluida', footer: 'Las ediciones de GitHub Pages permanecen en este navegador. Descarga el JSON y añádelo a ', footerEnd: ' para publicarlo.', language: 'Idioma', english: 'English', spanish: 'Español', invalidSong: 'El archivo no cumple el esquema de canción.', audioError: (message: string) => `Error de Strudel: ${message}`, importError: (message: string) => `No se pudo importar: ${message}`,
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
  const [selectedId, setSelectedId] = useState(() => songIdFromHash() ?? builtInSongs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ composer: noFilter, key: noFilter, feel: noFilter });
  const [status, setStatus] = useState<Status>({ type: 'ready' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLocations, setActiveLocations] = useState<StrudelLocation[]>([]);
  const [executingCode, setExecutingCode] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const strudelInitialized = useRef(false);
  const strudelEngine = useRef<StrudelEngine | undefined>(undefined);
  const playbackRevision = useRef(0);
  const scheduledHighlights = useRef(new Map<number, { locations: StrudelLocation[]; timeout: number; revision: number }>());
  const t = copy[language];

  const songs = useMemo(() => {
    const merged = new Map(builtInSongs.map((song) => [song.id, song]));
    localSongs.forEach((song) => merged.set(song.id, song));
    return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [localSongs]);
  const selected = songs.find((song) => song.id === selectedId) ?? songs[0];
  const filterOptions = useMemo(() => ({
    composers: [...new Set(songs.map((song) => song.composer))].sort((a, b) => a.localeCompare(b)),
    keys: [...new Set(songs.map((song) => song.key))].sort((a, b) => a.localeCompare(b)),
    feels: [...new Set(songs.map((song) => song.backing.feel))].sort((a, b) => a.localeCompare(b)),
  }), [songs]);
  const filtered = useMemo(() => songs.filter((song) => {
    const text = `${song.title} ${song.composer} ${song.key} ${song.form} ${song.tags.join(' ')} ${song.backing.feel} ${song.backing.progression.join(' ')}`.toLowerCase();
    return text.includes(query.toLowerCase().trim()) &&
      (filters.composer === noFilter || song.composer === filters.composer) &&
      (filters.key === noFilter || song.key === filters.key) &&
      (filters.feel === noFilter || song.backing.feel === filters.feel);
  }), [filters, query, songs]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const selectFromUrl = () => {
      const id = songIdFromHash();
      if (id) setSelectedId(id);
    };
    window.addEventListener('hashchange', selectFromUrl);
    window.addEventListener('popstate', selectFromUrl);
    return () => {
      window.removeEventListener('hashchange', selectFromUrl);
      window.removeEventListener('popstate', selectFromUrl);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const hash = songHash(selected.id);
    if (window.location.hash !== hash) {
      const url = new URL(window.location.href);
      url.hash = hash;
      window.history.replaceState(null, '', url.toString());
    }
    document.title = `${selected.title} · Realbook Strudel`;
  }, [selected]);

  useEffect(() => () => {
    scheduledHighlights.current.forEach(({ timeout }) => window.clearTimeout(timeout));
  }, []);

  function clearLiveHighlights() {
    playbackRevision.current += 1;
    scheduledHighlights.current.forEach(({ timeout }) => window.clearTimeout(timeout));
    scheduledHighlights.current.clear();
    setActiveLocations([]);
  }

  function highlightTriggeredHap(hap: StrudelHap, currentTime: number, _cps: number, targetTime: number) {
    const locations = hap.context.locations ?? [];
    if (locations.length === 0) return;
    const key = Math.round(targetTime * 1000);
    const existing = scheduledHighlights.current.get(key);
    if (existing) {
      locations.forEach((location) => {
        if (!existing.locations.some(({ start, end }) => start === location.start && end === location.end)) existing.locations.push(location);
      });
      return;
    }
    const revision = playbackRevision.current;
    const timeout = window.setTimeout(() => {
      const scheduled = scheduledHighlights.current.get(key);
      scheduledHighlights.current.delete(key);
      if (scheduled?.revision === playbackRevision.current) setActiveLocations(scheduled.locations);
    }, Math.max(0, (targetTime - currentTime) * 1000));
    scheduledHighlights.current.set(key, { locations: [...locations], timeout, revision });
  }

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

  function selectSong(id: string) {
    if (id === selectedId) return;
    const url = new URL(window.location.href);
    url.hash = songHash(id);
    if (window.location.hash !== url.hash) window.history.pushState(null, '', url.toString());
    setSelectedId(id);
  }

  async function copySongLink() {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.hash = songHash(selected.id);
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(url.toString());
      else {
        const input = document.createElement('textarea');
        input.value = url.toString();
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard copy failed.');
      }
      setStatus({ type: 'linkCopied' });
    } catch {
      setStatus({ type: 'error', message: t.copyLinkError });
    }
  }

  async function play() {
    if (!selected) return;
    try {
      clearLiveHighlights();
      setExecutingCode(selected.strudel);
      setStatus({ type: 'initializing' });
      if (!strudelInitialized.current) {
        strudelEngine.current = await initStrudel({
          editPattern: (pattern) => pattern.onTrigger(highlightTriggeredHap, false),
        });
        strudelInitialized.current = true;
      }
      await evaluate(selected.strudel);
      setIsPlaying(true);
      setStatus({ type: 'playing', title: selected.title });
    } catch (error) {
      clearLiveHighlights();
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
    clearLiveHighlights();
    setIsPlaying(false);
    setStatus({ type: 'stopped' });
  }

  function choosePracticeSong() {
    if (filtered.length === 0) return;
    const choices = filtered.length > 1 ? filtered.filter((song) => song.id !== selected?.id) : filtered;
    const song = choices[Math.floor(Math.random() * choices.length)];
    selectSong(song.id);
    setStatus({ type: 'practicePick', title: song.title });
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

  const statusText = status.type === 'playing' || status.type === 'imported' || status.type === 'practicePick'
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
        <fieldset className="filters">
          <legend>{t.filters}</legend>
          <label>{t.composer}<select value={filters.composer} onChange={(event) => setFilters((current) => ({ ...current, composer: event.target.value }))}><option value={noFilter}>{t.all}</option>{filterOptions.composers.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>{t.key}<select value={filters.key} onChange={(event) => setFilters((current) => ({ ...current, key: event.target.value }))}><option value={noFilter}>{t.all}</option>{filterOptions.keys.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>{t.feel}<select value={filters.feel} onChange={(event) => setFilters((current) => ({ ...current, feel: event.target.value }))}><option value={noFilter}>{t.all}</option>{filterOptions.feels.map((value) => <option key={value}>{value}</option>)}</select></label>
          <button type="button" className="text-button" onClick={() => setFilters({ composer: noFilter, key: noFilter, feel: noFilter })}>{t.clearFilters}</button>
        </fieldset>
        <div className="song-count">{t.songCount(filtered.length, songs.length)}</div>
        <nav className="song-list">
          {filtered.map((song) => (
            <button className={`song-row ${song.id === selected.id ? 'selected' : ''}`} key={song.id} onClick={() => selectSong(song.id)}>
              <strong>{song.title}</strong><span>{song.composer} · {song.key}</span>
            </button>
          ))}
        </nav>
        <button className="random-song" onClick={choosePracticeSong} disabled={filtered.length === 0}>{t.randomSong}</button>
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
            <button onClick={() => void copySongLink()}>{t.copyLink}</button>
          </div>
        </header>

        <p className="status" role="status">{statusText}</p>
        {isPlaying && <section className="live-code live-code-prominent" aria-label={t.liveCode} aria-live="polite">
          <div className="live-code-heading"><span><i />{t.liveCode}</span><strong>{statusText}</strong></div>
          <pre><code>{renderHighlightedCode(executingCode, activeLocations)}</code></pre>
        </section>}
        {selected.improvisation && <section className="arpeggio-card" aria-label={t.arpeggios}>
          <h2>{t.arpeggios}</h2>
          <div className="arpeggio-list">
            {selected.improvisation.arpeggios.map((arpeggio) => <article key={arpeggio.chord}>
              <strong>{arpeggio.chord}</strong>
              <span>{arpeggio.notes.join(' · ')}</span>
              {arpeggio.tip && <small>{arpeggio.tip}</small>}
            </article>)}
          </div>
        </section>}
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
