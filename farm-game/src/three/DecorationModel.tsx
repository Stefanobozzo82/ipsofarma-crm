import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import PineTree from './PineTree'

export default function DecorationModel({ decorationId }: { decorationId: string }) {
  const ref = useRef<Group>(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.05
  })

  if (decorationId === 'albero') return <PineTree scale={0.9} />

  if (decorationId === 'girasoli') {
    return (
      <group ref={ref}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[(i - 1) * 0.16, 0, 0]}>
            <mesh position={[0, 0.14, 0]} castShadow>
              <cylinderGeometry args={[0.012, 0.015, 0.28, 5]} />
              <meshStandardMaterial color="#4c8a3a" flatShading />
            </mesh>
            <mesh position={[0, 0.3, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 0.02, 10]} />
              <meshStandardMaterial color="#7a4a1e" flatShading />
            </mesh>
            {Array.from({ length: 8 }).map((_, p) => {
              const a = (p / 8) * Math.PI * 2
              return (
                <mesh
                  key={p}
                  position={[Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12]}
                  rotation={[Math.PI / 2, 0, a]}
                  castShadow
                >
                  <coneGeometry args={[0.03, 0.09, 5]} />
                  <meshStandardMaterial color="#f7cb3b" flatShading />
                </mesh>
              )
            })}
          </group>
        ))}
      </group>
    )
  }

  if (decorationId === 'staccionata' || decorationId === 'panchina') {
    return (
      <group>
        <mesh position={[-0.25, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.16, 5]} />
          <meshStandardMaterial color="#8a6438" flatShading />
        </mesh>
        <mesh position={[0.25, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.16, 5]} />
          <meshStandardMaterial color="#8a6438" flatShading />
        </mesh>
        <mesh position={[0, 0.11, 0]} castShadow>
          <boxGeometry args={[0.55, 0.03, 0.03]} />
          <meshStandardMaterial color="#a9713d" flatShading />
        </mesh>
      </group>
    )
  }

  if (decorationId === 'fontana') {
    return (
      <group>
        <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.24, 0.26, 0.12, 12]} />
          <meshStandardMaterial color="#d9d2c4" roughness={0.7} flatShading />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.02, 12]} />
          <meshStandardMaterial color="#6fb8d6" roughness={0.3} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.28, 0]} castShadow>
          <coneGeometry args={[0.05, 0.28, 8]} />
          <meshStandardMaterial color="#d9d2c4" flatShading />
        </mesh>
      </group>
    )
  }

  if (decorationId === 'mulino_a_vento') {
    return (
      <group>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.08, 0.6, 8]} />
          <meshStandardMaterial color="#e8e2d4" flatShading />
        </mesh>
        <group position={[0, 0.58, 0.06]} rotation={[0, 0, 0]}>
          <SpinningBlades />
        </group>
      </group>
    )
  }

  return null
}

function SpinningBlades() {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 1.6
  })
  return (
    <group ref={ref}>
      {[0, 90, 180, 270].map((deg) => (
        <mesh key={deg} rotation={[0, 0, (deg * Math.PI) / 180]} position={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[0.06, 0.28, 0.015]} />
          <meshStandardMaterial color="#c65a4a" flatShading />
        </mesh>
      ))}
    </group>
  )
}
