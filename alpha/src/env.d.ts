/** demo password gate, injected by vite.config.ts (null = no gate) */
declare const __DEMO_GATE__: { salt: string; hash: string; iter: number } | null
