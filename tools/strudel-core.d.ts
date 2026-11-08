declare module '@strudel/core' {
  export const evalScope: (...modules: unknown[]) => Promise<unknown>;
  export const repl: (options: Record<string, unknown>) => {
    evaluate: (code: string, autostart?: boolean, shouldHush?: boolean) => Promise<unknown>;
    stop: () => void;
    state: { evalError?: Error };
  };
}

declare module '@strudel/mini' {
  const mini: Record<string, unknown>;
  export = mini;
}

declare module '@strudel/tonal' {
  const tonal: Record<string, unknown>;
  export = tonal;
}

declare module '@strudel/transpiler' {
  export const transpiler: (code: string, options?: Record<string, unknown>) => unknown;
}
