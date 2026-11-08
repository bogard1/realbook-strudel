import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, initStrudel } from '@strudel/web';
import { isSong, makeSong, type Song } from './song';

const builtInSongs = Object.values(
  import.meta.glob('../../../songs/*.json', { eager: true, import: 'default' }),
) as Song[];
const storageKey = 'realbook-strudel:local-songs:v1';

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
  const [selectedId, setSelectedId] = useState(builtInSongs[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Listo para tocar.');
  const [isPlaying, setIsPlaying] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const strudelInitialized = useRef(false);

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

  function updateSelected(patch: Partial<Song>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setLocalSongs((current) => {
      const withoutCurrent = current.filter((song) => song.id !== selected.id);
      const updated = [...withoutCurrent, next];
      persistLocalSongs(updated);
      return updated;
    });
    setStatus('Cambios guardados en este navegador. Exporta el JSON para incorporarlo al repositorio.');
  }

  async function play() {
    if (!selected) return;
    try {
      setStatus('Inicializando audio…');
      if (!strudelInitialized.current) {
        await initStrudel();
        strudelInitialized.current = true;
      }
      await evaluate(selected.strudel);
      setIsPlaying(true);
      setStatus(`Reproduciendo: ${selected.title}`);
    } catch (error) {
      setIsPlaying(false);
      setStatus(`Error de Strudel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function pause() {
    window.hush?.();
    setIsPlaying(false);
    setStatus('Reproducción pausada.');
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
    setStatus('Nueva canción creada localmente.');
  }

  function restoreOriginal() {
    if (!selected) return;
    setLocalSongs((current) => {
      const updated = current.filter((song) => song.id !== selected.id);
      persistLocalSongs(updated);
      return updated;
    });
    setStatus('Se restauró la versión incluida en el catálogo.');
  }

  async function importSong(file?: File) {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isSong(value)) throw new Error('El archivo no cumple el esquema de canción.');
      setLocalSongs((current) => {
        const updated = [...current.filter((song) => song.id !== value.id), value];
        persistLocalSongs(updated);
        return updated;
      });
      setSelectedId(value.id);
      setStatus(`${value.title} importada localmente.`);
    } catch (error) {
      setStatus(`No se pudo importar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!selected) return <main className="empty">No hay canciones. Importa o crea una.</main>;

  const hasOriginal = builtInSongs.some((song) => song.id === selected.id);
  return (
    <main className="app-shell">
      <aside className="library" aria-label="Biblioteca">
        <div className="brand">
          <span className="brand-mark">♩</span>
          <div><strong>Realbook</strong><span>para Strudel</span></div>
        </div>
        <label className="search-label" htmlFor="search">Buscar</label>
        <input id="search" className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título, autor, tono…" />
        <div className="song-count">{filtered.length} de {songs.length} canciones</div>
        <nav className="song-list">
          {filtered.map((song) => (
            <button className={`song-row ${song.id === selected.id ? 'selected' : ''}`} key={song.id} onClick={() => setSelectedId(song.id)}>
              <strong>{song.title}</strong><span>{song.composer} · {song.key}</span>
            </button>
          ))}
        </nav>
        <div className="library-actions">
          <button onClick={createSong}>+ Nueva</button>
          <button onClick={() => importRef.current?.click()}>Importar JSON</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => void importSong(event.target.files?.[0])} />
        </div>
      </aside>

      <section className="workspace">
        <header className="song-header">
          <div>
            <p className="eyebrow">{selected.composer}</p>
            <h1>{selected.title}</h1>
            <p className="metadata">{selected.key} · {selected.tempo} BPM · {selected.form}</p>
          </div>
          <div className="transport">
            <button className="play" onClick={() => void play()}>{isPlaying ? '↻ Reiniciar' : '▶ Reproducir'}</button>
            <button onClick={pause} disabled={!isPlaying}>Ⅱ Pausar</button>
          </div>
        </header>

        <p className="status" role="status">{status}</p>
        <section className="editor-card">
          <div className="editor-heading"><h2>Editar canción</h2><span>Guardado local</span></div>
          <div className="fields">
            <label>Título<input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} /></label>
            <label>Compositor/a<input value={selected.composer} onChange={(event) => updateSelected({ composer: event.target.value })} /></label>
            <label>Tonalidad<input value={selected.key} onChange={(event) => updateSelected({ key: event.target.value })} /></label>
            <label>Tempo (BPM)<input type="number" min="1" value={selected.tempo} onChange={(event) => updateSelected({ tempo: Number(event.target.value) || 1 })} /></label>
            <label>Forma<input value={selected.form} onChange={(event) => updateSelected({ form: event.target.value })} /></label>
            <label>Etiquetas<input value={selected.tags.join(', ')} onChange={(event) => updateSelected({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></label>
          </div>
          <label className="license-field">Licencia o permiso<input value={selected.license} onChange={(event) => updateSelected({ license: event.target.value })} /></label>
          <label className="code-label">Código Strudel<textarea spellCheck="false" value={selected.strudel} onChange={(event) => updateSelected({ strudel: event.target.value })} /></label>
          <div className="editor-actions">
            <button onClick={() => downloadSong(selected)}>Descargar JSON</button>
            {hasOriginal && <button onClick={restoreOriginal}>Restaurar original</button>}
          </div>
        </section>
        <footer>Las ediciones de GitHub Pages viven en este navegador. Descarga el JSON y añádelo a <code>songs/</code> para publicarlo.</footer>
      </section>
    </main>
  );
}

declare global {
  interface Window {
    hush?: () => void;
  }
}
