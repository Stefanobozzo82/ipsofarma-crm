import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import type { CellContent } from '../game/types'
import { CROPS_BY_ID } from '../game/data/crops'
import { CROP_COLORS } from './colors'
import { formatDuration } from '../game/utils'

export default function CropPlant({
  content,
  onClick,
}: {
  content: Extract<CellContent, { kind: 'crop' }>
  onClick: () => void
}) {
  const crop = CROPS_BY_ID[content.cropId]
  const colors = CROP_COLORS[content.cropId] ?? { leaf: '#4caf50', fruit: '#e0433d' }

  const stemRef = useRef<Mesh>(null)
  const foliageRef = useRef<Group>(null)
  const sparkleRef = useRef<Group>(null)

  const fruitPositions = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, i) => {
        const a = (i / 4) * Math.PI * 2
        return [Math.cos(a) * 0.09, 0.03, Math.sin(a) * 0.09] as [number, number, number]
      }),
    [],
  )

  useFrame((state) => {
    const now = Date.now()
    const total = content.readyAt - content.plantedAt
    const progress = total > 0 ? Math.min(1, Math.max(0, (now - content.plantedAt) / total)) : 1
    const ready = now >= content.readyAt

    if (stemRef.current) {
      const h = 0.06 + progress * 0.22
      stemRef.current.scale.y = h / 0.28
      stemRef.current.position.y = h / 2
    }
    if (foliageRef.current) {
      const s = 0.35 + progress * (ready ? 0.85 : 0.55)
      const bob = ready ? 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.05 : 1
      foliageRef.current.scale.setScalar(s * bob)
      foliageRef.current.position.y = 0.1 + progress * 0.24
      foliageRef.current.rotation.y = state.clock.elapsedTime * (ready ? 0.6 : 0.15)
    }
    if (sparkleRef.current) {
      sparkleRef.current.visible = ready
      sparkleRef.current.rotation.y = state.clock.elapsedTime * 2
      sparkleRef.current.position.y = 0.55 + Math.sin(state.clock.elapsedTime * 3) * 0.03
    }
  })

  // forza il refresh dell'etichetta HTML del countdown ogni secondo
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = Date.now()
  const ready = now >= content.readyAt

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <mesh ref={stemRef} position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.03, 0.28, 5]} />
        <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
      </mesh>

      <group ref={foliageRef}>
        <mesh castShadow>
          <icosahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color={colors.leaf} roughness={0.7} flatShading />
        </mesh>
        {ready &&
          fruitPositions.map((p, i) => (
            <mesh key={i} position={p} castShadow>
              <sphereGeometry args={[0.055, 6, 6]} />
              <meshStandardMaterial color={colors.fruit} roughness={0.5} flatShading />
            </mesh>
          ))}
      </group>

      <group ref={sparkleRef} visible={false}>
        <mesh>
          <octahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial color="#fff2a8" emissive="#ffe27a" emissiveIntensity={0.8} />
        </mesh>
      </group>

      {!ready && (
        <Html center distanceFactor={9} position={[0, 0.55, 0]} pointerEvents="none">
          <div className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            {crop?.emoji} {formatDuration(content.readyAt - now)}
          </div>
        </Html>
      )}
    </group>
  )
}
