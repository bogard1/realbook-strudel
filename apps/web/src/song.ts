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
    !!song.backing &&
    Array.isArray(song.backing.progression) &&
    song.backing.progression.every((chord) => typeof chord === 'string') &&
    typeof song.backing.feel === 'string' &&
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
  backing: { progression: ['Cmaj7', 'Am7', 'Dm7', 'G7'], feel: 'Swing comping' },
  strudel: 'setcps(120 / 60)\nstack(\n  note("<[c3,e3,g3,b3] [a2,c3,e3,g3] [d3,f3,a3,c4] [g2,b2,d3,f3]>").s("triangle").gain(.22),\n  note("c2 ~ a1 ~ d2 ~ g1 ~").s("sine").gain(.16)\n)',
});
