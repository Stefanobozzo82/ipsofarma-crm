import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import FarmScene from './FarmScene'
import type { ShopSelection } from '../components/ShopMenu'

export default function Scene({
  selection,
  onSelectionUsed,
  onOpenCell,
}: {
  selection: ShopSelection
  onSelectionUsed: () => void
  onOpenCell: (cellId: string) => void
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [11, 10, 11], fov: 32 }}
      className="!absolute inset-0"
    >
      <color attach="background" args={['#bdeeff']} />
      <fog attach="fog" args={['#bdeeff', 22, 42]} />

      <ambientLight intensity={0.7} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      <Suspense fallback={null}>
        <FarmScene selection={selection} onSelectionUsed={onSelectionUsed} onOpenCell={onOpenCell} />
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={20} blur={1.8} far={4} />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7}
        maxDistance={20}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.4}
      />
    </Canvas>
  )
}
