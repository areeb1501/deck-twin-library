/** Invisible pick box for environment-drawn items (drilling rig, BOP): clickable and gaze-able, never drawn. */
import type { Proxy } from '../../model/types'

const hidden = { transparent: true, opacity: 0, depthWrite: false, colorWrite: false }

export function ProxyModel({ eq }: { eq: Proxy }) {
  const [x, y, z] = eq.size
  return (
    <mesh position={[0, y / 2, 0]}>
      <boxGeometry args={[x, y, z]} />
      <meshBasicMaterial {...hidden} />
    </mesh>
  )
}
