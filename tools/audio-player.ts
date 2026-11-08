import { AudioContext, GainNode, OscillatorNode } from 'node-web-audio-api';

type Repl = {
  evaluate: (code: string, autostart?: boolean, shouldHush?: boolean) => Promise<unknown>;
  stop: () => void;
  state: { evalError?: Error };
};

export type PlaybackEvent = {
  notes: string[];
  sound: string;
  gain: number;
};

const waveforms = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const pitchClasses: Record<string, number> = {
  c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, f: 5,
  'f#': 6, gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11,
};
const percussionFrequencies: Record<string, number> = {
  bd: 58, sd: 190, hh: 5600, oh: 4200, cp: 820, rim: 1250,
};

function noteToFrequency(note: unknown): number | undefined {
  if (typeof note === 'number' && Number.isFinite(note)) return 440 * 2 ** ((note - 69) / 12);
  const match = String(note).trim().toLowerCase().match(/^([a-g](?:#|b)?)(-?\d+)$/);
  if (!match) return undefined;
  const pitch = pitchClasses[match[1]];
  if (pitch === undefined) return undefined;
  const midi = (Number(match[2]) + 1) * 12 + pitch;
  return 440 * 2 ** ((midi - 69) / 12);
}

function numeric(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/** Evaluates Strudel code and routes its note events to a local oscillator synth. */
export class TerminalStrudelPlayer {
  private context?: AudioContext;
  private controller?: Repl;
  private isPlaying = false;
  private originalLog?: typeof console.log;

  constructor(private readonly onEvent?: (event: PlaybackEvent) => void) {}

  get playing() {
    return this.isPlaying;
  }

  async play(code: string): Promise<void> {
    await this.initialize();
    await this.context!.resume();
    await this.controller!.evaluate(code, true, true);
    if (this.controller!.state.evalError) throw this.controller!.state.evalError;
    this.isPlaying = true;
  }

  pause() {
    this.controller?.stop();
    this.isPlaying = false;
  }

  async close() {
    this.pause();
    await this.context?.close();
    this.context = undefined;
    this.controller = undefined;
    // Let Strudel's scheduler finish its stop notification before restoring
    // console output to Ink's terminal renderer.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    if (this.originalLog) {
      console.log = this.originalLog;
      this.originalLog = undefined;
    }
  }

  private async initialize() {
    if (this.context && this.controller) return;
    this.originalLog = console.log;
    console.log = (...messages: unknown[]) => {
      const output = messages.map(String).join(' ');
      if (!output.includes('🌀') && !output.includes('[eval]') && !output.includes('[cyclist]')) this.originalLog?.(...messages);
    };
    const originalWarn = console.warn;
    console.warn = (...messages: unknown[]) => {
      if (!messages.some((message) => String(message).includes('cannot use window'))) originalWarn(...messages);
    };
    try {
      const [core, mini, tonal, transpiler] = await Promise.all([
        import('@strudel/core'),
        import('@strudel/mini'),
        import('@strudel/tonal'),
        import('@strudel/transpiler'),
      ]);
      this.context = new AudioContext({ latencyHint: 'playback' });
      await core.evalScope(core, mini, tonal);
      this.controller = core.repl({
        getTime: () => this.context!.currentTime,
        transpiler: transpiler.transpiler,
        defaultOutput: (hap: { value: Record<string, unknown> }, deadline: number, duration: number, cps: number) => {
          this.trigger(hap.value, deadline, duration, cps);
        },
      }) as Repl;
    } finally {
      console.warn = originalWarn;
      if (!this.context && this.originalLog) {
        console.log = this.originalLog;
        this.originalLog = undefined;
      }
    }
  }

  private trigger(value: Record<string, unknown>, deadline: number, duration: number, cps: number) {
    const context = this.context;
    if (!context) return;
    const rawNotes = value.note ?? value.n;
    const notes = Array.isArray(rawNotes) ? rawNotes : [rawNotes];
    const start = context.currentTime + Math.max(0, numeric(deadline, 0));
    const length = Math.max(0.025, Math.min(4, numeric(duration, 0.25) / Math.max(0.01, numeric(cps, 1))));
    const gain = Math.max(0.001, Math.min(0.28, numeric(value.gain, 0.16)));
    const sound = String(value.s ?? 'sine').toLowerCase();
    this.onEvent?.({ notes: notes.filter((note) => note !== undefined && note !== null).map(String), sound, gain });
    const type = waveforms.has(sound) ? sound as OscillatorType : 'sine';
    const frequencies = notes.map(noteToFrequency).filter((frequency): frequency is number => frequency !== undefined);
    if (!frequencies.length && percussionFrequencies[sound]) frequencies.push(percussionFrequencies[sound]);

    for (const frequency of frequencies) {
      const envelope = new GainNode(context, { gain: 0 });
      envelope.connect(context.destination);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.015, length / 4));
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
      const oscillator = new OscillatorNode(context, { type, frequency });
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
    }
  }
}
