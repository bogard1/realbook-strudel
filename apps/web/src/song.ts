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
  source?: {
    title: string;
    url: string;
    license: string;
  };
  strudel: string;
};

export const isSong = (value: unknown): value is Song => {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<Song>;
  return (
    song.schemaVersion === 1 &&
    typeof song.id === 'string' &&
    typeof song.title === 'string' &&
    typeof song.composer === 'string' &&
    typeof song.key === 'string' &&
    typeof song.tempo === 'number' &&
    typeof song.form === 'string' &&
    Array.isArray(song.tags) &&
    song.tags.every((tag) => typeof tag === 'string') &&
    typeof song.license === 'string' &&
    (song.source === undefined || (
      typeof song.source.title === 'string' &&
      typeof song.source.url === 'string' &&
      typeof song.source.license === 'string'
    )) &&
    typeof song.strudel === 'string'
  );
};

export const makeSong = (id: string): Song => ({
  schemaVersion: 1,
  id,
  title: 'New song',
  composer: 'Composer',
  key: 'C major',
  tempo: 120,
  form: 'AABA',
  tags: [],
  license: 'State the license or permission to distribute',
  strudel: 'setcps(120 / 60)\nnote("c4 e4 g4 b4").s("triangle").gain(.35)',
});
