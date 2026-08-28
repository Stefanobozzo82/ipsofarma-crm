import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Html } from '@react-three/drei'
import type { Group } from 'three'
import type { CellContent } from '../game/types'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { BUILDING_COLORS } from './colors'
import { formatDuration } from '../game/utils'

export default function BuildingModel({
  content,
  onClick,
}: {
  content: Extract<CellContent, { kind: 'building' }>
  onClick: () => void
}) {
  const def = BUILDINGS_BY_ID[content.buildingId]
  const colors = BUILDING_COLORS[content.buildingId] ?? { wall: '#d8cbb0', roof: '#8a6a4a' }
  const roofRef = useRef<Group>(null)
  const sparkleRef = useRef<Group>(null)

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const job = content.job
  const now = Date.now()
  const jobReady = job != null && now >= job.endsAt

  useFrame((state) => {
    const bob = Math.sin(state.clock.elapsedTime * 1.5) * 0.01
    if (roofRef.current) roofRef.current.position.y = 0.5 + bob
    if (sparkleRef.current) {
      sparkleRef.current.visible = jobReady
      sparkleRef.current.rotation.y = state.clock.elapsedTime * 2.4
    }
  })

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <RoundedBox args={[0.62, 0.4, 0.62]} radius={0.04} position={[0, 0.2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={colors.wall} roughness={0.8} flatShading />
      </RoundedBox>
      <group ref={roofRef}>
        <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.52, 0.36, 4]} />
          <meshStandardMaterial color={colors.roof} roughness={0.7} flatShading />
        </mesh>
      </group>

      <group ref={sparkleRef} visible={false} position={[0, 0.95, 0]}>
        <mesh>
          <octahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#fff2a8" emissive="#ffe27a" emissiveIntensity={0.9} />
        </mesh>
      </group>

      {job && !jobReady && (
        <Html center distanceFactor={9} position={[0, 1.05, 0]} pointerEvents="none">
          <div className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            ⏳ {formatDuration(job.endsAt - now)}
          </div>
        </Html>
      )}
      <Html center distanceFactor={11} position={[0, -0.25, 0]} pointerEvents="none">
        <div className="rounded-full bg-white/85 px-1.5 py-0.5 text-[9px] font-bold text-purple-900 shadow">
          {def?.name}
        </div>
      </Html>
    </group>
  )
}
