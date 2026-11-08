declare module '@strudel/web' {
  export type StrudelEngine = {
    scheduler: {
      stop: () => void;
    };
  };

  export function initStrudel(options?: Record<string, unknown>): Promise<StrudelEngine>;
  export function evaluate(source: string, updatePattern?: boolean): Promise<unknown>;
}
