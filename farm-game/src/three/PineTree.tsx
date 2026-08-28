import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

/** Pino stilizzato low-poly, usato per le zone non sbloccate e come decorazione. */
export default function PineTree({ scale = 1, sway = true }: { scale?: number; sway?: boolean }) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (ref.current && sway) {
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.2) * 0.03
    }
  })

  return (
    <group ref={ref} scale={scale} position={[0, 0, 0]}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.24, 6]} />
        <meshStandardMaterial color="#6b4a2b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <coneGeometry args={[0.26, 0.42, 7]} />
        <meshStandardMaterial color="#2f7d3a" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <coneGeometry args={[0.19, 0.34, 7]} />
        <meshStandardMaterial color="#3d9146" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.79, 0]} castShadow>
        <coneGeometry args={[0.12, 0.26, 7]} />
        <meshStandardMaterial color="#4ea656" roughness={0.8} flatShading />
      </mesh>
    </group>
  )
}
