declare module 'saxen' {
  export class Parser {
    constructor(options?: { proxy?: boolean });
    ns(namespaces?: Record<string, string>): void;
    on(
      event: 'openTag',
      callback: (
        element: { name: string; attrs: Record<string, string>; ns: Record<string, string> },
        decode: (s: string) => string,
      ) => unknown,
    ): this;
    on(event: 'closeTag', callback: () => unknown): this;
    on(event: 'text', callback: (value: string, decode: (s: string) => string) => unknown): this;
    on(event: 'cdata', callback: (value: string) => unknown): this;
    on(event: 'error' | 'warn', callback: () => unknown): this;
    parse(source: string): void;
  }
}
