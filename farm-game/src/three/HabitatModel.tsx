import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Html } from '@react-three/drei'
import type { Group } from 'three'
import type { CellContent } from '../game/types'
import { BUILDINGS_BY_ID } from '../game/data/buildings'
import { ANIMALS_BY_HABITAT } from '../game/data/animals'
import { BUILDING_COLORS } from './colors'
import { useGameStore } from '../game/store'
import { formatDuration } from '../game/utils'
import AnimalModel from './AnimalModel'

export default function HabitatModel({
  cellId,
  content,
  onClick,
}: {
  cellId: string
  content: Extract<CellContent, { kind: 'habitat' }>
  onClick: () => void
}) {
  const def = BUILDINGS_BY_ID[content.habitatId]
  const species = ANIMALS_BY_HABITAT[content.habitatId]
  const colors = BUILDING_COLORS[content.habitatId] ?? { wall: '#d8cbb0', roof: '#8a6a4a' }
  const allAnimals = useGameStore((s) => s.animals)
  const animals = allAnimals.filter((a) => a.habitatCellId === cellId)

  const roofRef = useRef<Group>(null)
  const sparkleRef = useRef<Group>(null)

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const now = Date.now()
  const anyReady = animals.some(
    (a) => a.stage === 'adult' && a.produceReadyAt != null && now >= a.produceReadyAt,
  )
  const breeding = content.breeding
  const breedingActive = breeding != null && now < breeding.readyAt

  useFrame((state) => {
    const bob = Math.sin(state.clock.elapsedTime * 1.5) * 0.01
    if (roofRef.current) roofRef.current.position.y = 0.34 + bob
    if (sparkleRef.current) {
      sparkleRef.current.visible = anyReady
      sparkleRef.current.rotation.y = state.clock.elapsedTime * 2.4
    }
  })

  // posizioni fisse per un massimo di 4 animali dentro il recinto
  const slots = useMemo<[number, number, number][]>(
    () => [
      [-0.24, 0, -0.24],
      [0.24, 0, -0.24],
      [-0.24, 0, 0.24],
      [0.24, 0, 0.24],
    ],
    [],
  )

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {/* recinto */}
      {[-0.42, 0.42].map((dx) =>
        [-0.42, 0.42].map((dz) => (
          <mesh key={`${dx}-${dz}`} position={[dx, 0.07, dz]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.14, 5]} />
            <meshStandardMaterial color="#8a6438" roughness={0.9} flatShading />
          </mesh>
        )),
      )}

      {/* casetta */}
      <group position={[-0.2, 0, -0.2]}>
        <RoundedBox args={[0.3, 0.22, 0.3]} radius={0.03} position={[0, 0.11, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={colors.wall} roughness={0.8} flatShading />
        </RoundedBox>
        <group ref={roofRef}>
          <mesh rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.26, 0.2, 4]} />
            <meshStandardMaterial color={colors.roof} roughness={0.7} flatShading />
          </mesh>
        </group>
      </group>

      {animals.slice(0, 4).map((animal, i) => (
        <AnimalModel key={animal.id} animal={animal} position={slots[i]} onClick={onClick} />
      ))}

      <group ref={sparkleRef} visible={false} position={[0, 0.6, 0]}>
        <mesh>
          <octahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#fff2a8" emissive="#ffe27a" emissiveIntensity={0.9} />
        </mesh>
      </group>

      <Html center distanceFactor={9} position={[0, 0.75, 0]} pointerEvents="none">
        <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          {def?.emoji} {animals.length}/{def?.capacity ?? 0}
          {breedingActive && <span>💞 {formatDuration(breeding!.readyAt - now)}</span>}
        </div>
      </Html>
      {species && animals.length === 0 && (
        <Html center distanceFactor={9} position={[0, 0.3, 0]} pointerEvents="none">
          <div className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white shadow">
            +
          </div>
        </Html>
      )}
    </group>
  )
}
