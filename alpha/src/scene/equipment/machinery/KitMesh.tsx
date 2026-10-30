import type { Built } from './kit'

/** Renders a merged Kit build as a single mesh (one draw group per material). */
export function KitMesh({ data, shadows = true }: { data: Built; shadows?: boolean }) {
  return <mesh geometry={data.geometry} material={data.material} castShadow={shadows} receiveShadow={shadows} />
}
