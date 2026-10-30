// Site-wide constants: where the registry is served and how the CLI is invoked.
import { cliCommand } from './prompt'

export const SITE = typeof window !== 'undefined' && import.meta.env.DEV ? window.location.origin : 'https://decktwin.com'
// Until the npm package is published, the CLI runs straight from the tarball this site serves. The URL carries the version because npx caches by URL.
export const CLI = cliCommand(SITE)
export const add = (name: string) => `${CLI} add ${name}`
export { version as VERSION } from '../package.json'
