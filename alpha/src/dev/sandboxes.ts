/**
 * Registry of dev sandboxes. Each agent/feature owns its own sandbox file and adds
 * ONE line here. Visit /?sandbox=<key>.
 */
import { lazy } from 'react'

export const sandboxes: Record<string, ReturnType<typeof lazy>> = {
  machinery: lazy(() => import('./MachinerySandbox')),
  vessels: lazy(() => import('./VesselsSandbox')),
  structure: lazy(() => import('./StructureSandbox')),
  library: lazy(() => import('./LibrarySandbox')),
  avatar: lazy(() => import('./AvatarSandbox')),
}
