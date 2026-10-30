/** Places every equipment model at its position/rotation and tags it for picking. */
import type { Equipment, PickData } from '../model/types'
import type { ComponentType } from 'react'
import { ErrorBoundary } from '../ui/ErrorBoundary'

// Resolved by name so the scene still renders (with a placeholder) while a model is being built.
const mods = import.meta.glob('./equipment/*.tsx', { eager: true }) as Record<string, Record<string, unknown>>
function get(name: string): ComponentType<{ eq: never }> {
  for (const m of Object.values(mods)) if (m[name]) return m[name] as ComponentType<{ eq: never }>
  return Placeholder as ComponentType<{ eq: never }>
}
function Placeholder() {
  return (
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#888" wireframe />
    </mesh>
  )
}
const HorizontalVesselModel = get('HorizontalVesselModel')
const VerticalVesselModel = get('VerticalVesselModel')
const ShellTubeModel = get('ShellTubeModel')
const PigTrapModel = get('PigTrapModel')
const PumpPackageModel = get('PumpPackageModel')
const CompressorPackageModel = get('CompressorPackageModel')
const ChemSkidModel = get('ChemSkidModel')
const ModuleModel = get('ModuleModel')
const ManifoldModel = get('ManifoldModel')
const XmasTreeModel = get('XmasTreeModel')

function Model({ eq }: { eq: Equipment }) {
  switch (eq.kind) {
    case 'horizontalVessel':
      return <HorizontalVesselModel eq={eq as never} />
    case 'verticalVessel':
      return <VerticalVesselModel eq={eq as never} />
    case 'shellTube':
      return <ShellTubeModel eq={eq as never} />
    case 'pigTrap':
      return <PigTrapModel eq={eq as never} />
    case 'pumpPackage':
      return <PumpPackageModel eq={eq as never} />
    case 'compressorPackage':
      return <CompressorPackageModel eq={eq as never} />
    case 'chemSkid':
      return <ChemSkidModel eq={eq as never} />
    case 'module':
      return <ModuleModel eq={eq as never} />
    case 'manifold':
      return <ManifoldModel eq={eq as never} />
    case 'xmasTree':
      return <XmasTreeModel eq={eq as never} />
  }
}

export function EquipmentLayer({ equipment }: { equipment: Equipment[] }) {
  return (
    <group>
      {equipment.map((eq) => (
        <group
          key={eq.tag}
          position={eq.position}
          rotation-y={eq.rotationY}
          userData={{ pick: { tag: eq.tag, kind: 'equipment' } satisfies PickData }}
        >
          <ErrorBoundary label={eq.tag}>
            <Model eq={eq} />
          </ErrorBoundary>
        </group>
      ))}
    </group>
  )
}
