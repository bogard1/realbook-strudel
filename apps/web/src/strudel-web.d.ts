declare module '@strudel/web' {
  export function initStrudel(options?: Record<string, unknown>): Promise<unknown>;
  export function evaluate(source: string, updatePattern?: boolean): Promise<unknown>;
}
