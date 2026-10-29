// Site-wide constants: where the registry is served and how the CLI is invoked.
export const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://deck-twin-library.demoareeb.workers.dev'
// Until the npm package is published, the CLI runs straight from the tarball this site serves.
export const CLI = `npx -y ${SITE}/cli/deck-twin.tgz`
export const add = (name: string) => `${CLI} add ${name}`
