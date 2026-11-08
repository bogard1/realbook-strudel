import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export type Song = {
  schemaVersion: 1;
  id: string;
  title: string;
  composer: string;
  key: string;
  tempo: number;
  form: string;
  tags: string[];
  license: string;
  backing: {
    progression: string[];
    feel: string;
  };
  source?: {
    title: string;
    url: string;
    license: string;
  };
  strudel: string;
};

export const songsDirectory = join(import.meta.dirname, '..', 'songs');

export function isSong(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<Song>;
  return (
    song.schemaVersion === 1 &&
    typeof song.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(song.id) &&
    typeof song.title === 'string' && song.title.length > 0 &&
    typeof song.composer === 'string' &&
    typeof song.key === 'string' &&
    typeof song.tempo === 'number' && song.tempo > 0 &&
    typeof song.form === 'string' &&
    Array.isArray(song.tags) && song.tags.every((tag) => typeof tag === 'string') &&
    typeof song.license === 'string' && song.license.length > 0 &&
    !!song.backing &&
    Array.isArray(song.backing.progression) && song.backing.progression.every((chord) => typeof chord === 'string') &&
    typeof song.backing.feel === 'string' && song.backing.feel.length > 0 &&
    (song.source === undefined || (
      typeof song.source.title === 'string' &&
      typeof song.source.url === 'string' &&
      typeof song.source.license === 'string'
    )) &&
    typeof song.strudel === 'string' && song.strudel.length > 0
  );
}

export async function loadSongs(): Promise<Song[]> {
  const entries = await readdir(songsDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const songs = await Promise.all(
    files.map(async (file) => {
      const path = join(songsDirectory, file.name);
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isSong(raw)) throw new Error(`${file.name} does not conform to the song schema.`);
      return raw;
    }),
  );
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function makeSong(id: string): Song {
  return {
    schemaVersion: 1,
    id,
    title: 'New song',
    composer: 'Composer',
    key: 'C major',
    tempo: 120,
    form: 'AABA',
    tags: [],
    license: 'State the license or permission to distribute',
    backing: { progression: ['Cmaj7', 'Am7', 'Dm7', 'G7'], feel: 'Swing comping' },
    strudel: 'setcps(120 / 240)\nstack(\n  note("<[c3,e3,g3,b3] [a2,c3,e3,g3] [d3,f3,a3,c4] [g2,b2,d3,f3]>").s("triangle").gain(.22),\n  note("c2 ~ a1 ~ d2 ~ g1 ~").s("sine").gain(.16)\n)',
  };
}

export async function saveSong(song: Song): Promise<void> {
  if (!isSong(song)) throw new Error('The song does not conform to the schema.');
  await writeFile(join(songsDirectory, `${basename(song.id)}.json`), `${JSON.stringify(song, null, 2)}\n`);
}
