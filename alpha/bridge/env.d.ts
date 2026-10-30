/** Types for the CLI's plain-JS checker. */
declare module '*/cli/check.mjs' {
  export function checkPlant(spec: unknown, items: unknown[]): { level: 'error' | 'warning'; code: string; where: string; path: string; message: string; fix: string }[]
}
