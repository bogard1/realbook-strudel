declare module '@strudel/web' {
  export type StrudelLocation = { start: number; end: number };
  export type StrudelHap = {
    context: { locations?: StrudelLocation[] };
  };
  export type StrudelPattern = {
    onTrigger: (
      callback: (hap: StrudelHap, currentTime: number, cps: number, targetTime: number) => void,
      dominant?: boolean,
    ) => StrudelPattern;
  };
  export type StrudelEngine = {
    scheduler: {
      stop: () => void;
    };
  };

  export function initStrudel(options?: {
    editPattern?: (pattern: StrudelPattern) => StrudelPattern;
  }): Promise<StrudelEngine>;
  export function evaluate(source: string, updatePattern?: boolean): Promise<unknown>;
}
