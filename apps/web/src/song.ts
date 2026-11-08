export type BackingPattern = 'arpeggio-up' | 'arpeggio-down' | 'arpeggio-alternating' | 'chords';

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
    pattern?: BackingPattern;
  };
  improvisation?: {
    arpeggios: Array<{
      chord: string;
      notes: string[];
      tip?: string;
    }>;
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
      (song.backing.pattern === undefined || ['arpeggio-up', 'arpeggio-down', 'arpeggio-alternating', 'chords'].includes(song.backing.pattern)) &&
    (song.improvisation === undefined || (
      Array.isArray(song.improvisation.arpeggios) &&
      song.improvisation.arpeggios.every((arpeggio) =>
        typeof arpeggio.chord === 'string' &&
        Array.isArray(arpeggio.notes) &&
        arpeggio.notes.every((note) => typeof note === 'string') &&
        (arpeggio.tip === undefined || typeof arpeggio.tip === 'string')
      )
    )) &&
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
  backing: { progression: ['Cmaj7', 'Am7', 'Dm7', 'G7'], feel: 'Swing comping', pattern: 'arpeggio-up' },
  strudel: 'setcps(120 / 240)\nstack(\n  note("<[c3,e3,g3,b3] [a2,c3,e3,g3] [d3,f3,a3,c4] [g2,b2,d3,f3]>").s("triangle").gain(.22),\n  note("c2 ~ a1 ~ d2 ~ g1 ~").s("sine").gain(.16)\n)',
});

const pitchClasses: Record<string, number> = {
  c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, f: 5,
  'f#': 6, gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11,
};
const pitchNames = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b'];

function notePitch(note: string) {
  const match = note.trim().toLowerCase().match(/^([a-g](?:#|b)?)(-?\d+)$/);
  if (!match || pitchClasses[match[1]] === undefined) return 0;
  return (Number(match[2]) + 1) * 12 + pitchClasses[match[1]];
}

function orderNotes(notes: string[], pattern: BackingPattern) {
  const ascending = [...notes].sort((left, right) => notePitch(left) - notePitch(right));
  if (pattern === 'arpeggio-down') return ascending.reverse();
  if (pattern === 'arpeggio-alternating') {
    const result: string[] = [];
    let low = 0;
    let high = ascending.length - 1;
    while (low <= high) {
      result.push(ascending[low]);
      if (low !== high) result.push(ascending[high]);
      low += 1;
      high -= 1;
    }
    return result;
  }
  return ascending;
}

/** Revoices the first chord-tone pattern without adding melody or lyrics. */
export function applyBackingPattern(code: string, pattern: BackingPattern) {
  return code.replace(/note\("<((?:\[[^\]]+\]\s*)+)>"\)/, (_match, source: string) => {
    const revoiced = source.replace(/\[([^\]]+)\]/g, (_chord, contents: string) => {
      const notes = contents.split(/[\s,]+/).filter(Boolean);
      if (pattern === 'chords') return `[${orderNotes(notes, 'arpeggio-up').join(',')}]`;
      return `[${orderNotes(notes, pattern).join(' ')}]`;
    });
    return `note("<${revoiced}>")`;
  });
}

/** Transposes explicit octave note literals while leaving Strudel structure intact. */
export function transposeStrudelNotes(code: string, semitones: number) {
  if (!semitones) return code;
  return code.replace(/\b([a-g](?:#|b)?)(-?\d+)\b/gi, (_match, name: string, octave: string) => {
    const pitch = pitchClasses[name.toLowerCase()];
    if (pitch === undefined) return _match;
    const midi = (Number(octave) + 1) * 12 + pitch + semitones;
    return `${pitchNames[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  });
}
