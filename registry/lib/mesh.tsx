// React glue: render a Kit build as one mesh, rebuild on prop changes, dispose old geometry.
import { useEffect, useMemo, type DependencyList, type ReactNode } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { Kit, type Built } from './kit'

export type GroupProps = Omit<ThreeElements['group'], 'children'> & { children?: ReactNode }

export function useKit(draw: (k: Kit) => void, deps: DependencyList): Built {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => {
    const k = new Kit()
    draw(k)
    return k.build()
  }, deps)
  useEffect(() => () => built.geometry.dispose(), [built])
  return built
}

export function KitMesh({ data, shadows = true, ...props }: { data: Built; shadows?: boolean } & Omit<ThreeElements['mesh'], 'geometry' | 'material'>) {
  return <mesh geometry={data.geometry} material={data.material} castShadow={shadows} receiveShadow={shadows} {...props} />
}
