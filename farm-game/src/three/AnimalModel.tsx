import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AnimalInstance } from '../game/types'
import { ANIMALS_BY_ID } from '../game/data/animals'
import { ANIMAL_COLORS } from './colors'

/** Animaletto low-poly procedurale: corpo + testa + orecchie/dettagli per specie. */
export default function AnimalModel({
  animal,
  position,
  onClick,
}: {
  animal: AnimalInstance
  position: [number, number, number]
  onClick: () => void
}) {
  const species = ANIMALS_BY_ID[animal.speciesId]
  const colors = ANIMAL_COLORS[animal.speciesId] ?? { body: '#eee', accent: '#999' }
  const isBaby = animal.stage === 'baby'
  const scale = isBaby ? 0.62 : 1
  const bodyColor = animal.isRare ? '#ffd76a' : colors.body

  const groupRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime * 2 + phase
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.abs(Math.sin(t)) * 0.02
    }
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.6) * 0.35
    }
  })

  const ready =
    animal.stage === 'adult' && animal.produceReadyAt != null && Date.now() >= animal.produceReadyAt

  return (
    <group
      ref={groupRef}
      position={position}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {/* corpo */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.11, 8, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} flatShading />
      </mesh>

      {/* testa + dettagli specie */}
      <group ref={headRef} position={[0, 0.15, 0.1]}>
        <mesh castShadow>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.75} flatShading />
        </mesh>

        {species?.id === 'gallina' && (
          <>
            <mesh position={[0, 0.06, 0.02]}>
              <coneGeometry args={[0.025, 0.05, 5]} />
              <meshStandardMaterial color={colors.accent} flatShading />
            </mesh>
            <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.02, 0.04, 5]} />
              <meshStandardMaterial color="#f2a33d" flatShading />
            </mesh>
          </>
        )}

        {species?.id === 'pecora' && (
          <>
            <mesh position={[0, 0.02, 0.05]}>
              <sphereGeometry args={[0.05, 6, 6]} />
              <meshStandardMaterial color={colors.accent} roughness={0.9} flatShading />
            </mesh>
          </>
        )}

        {species?.id === 'mucca' && (
          <>
            <mesh position={[-0.045, 0.05, 0]}>
              <coneGeometry args={[0.02, 0.05, 4]} />
              <meshStandardMaterial color="#e8dcc8" flatShading />
            </mesh>
            <mesh position={[0.045, 0.05, 0]}>
              <coneGeometry args={[0.02, 0.05, 4]} />
              <meshStandardMaterial color="#e8dcc8" flatShading />
            </mesh>
            <mesh position={[0.03, 0.01, 0.04]}>
              <sphereGeometry args={[0.025, 6, 6]} />
              <meshStandardMaterial color={colors.accent} flatShading />
            </mesh>
          </>
        )}

        {species?.id === 'maiale' && (
          <mesh position={[0, -0.01, 0.065]}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 8]} />
            <meshStandardMaterial color={colors.accent} flatShading />
          </mesh>
        )}
      </group>

      {/* zampe */}
      {[-0.06, 0.06].map((dx) =>
        [-0.06, 0.06].map((dz) => (
          <mesh key={`${dx}-${dz}`} position={[dx, 0.01, dz]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.06, 5]} />
            <meshStandardMaterial color={colors.accent} roughness={0.8} flatShading />
          </mesh>
        )),
      )}

      {ready && (
        <mesh position={[0, 0.32, 0]}>
          <octahedronGeometry args={[0.045, 0]} />
          <meshStandardMaterial color="#fff2a8" emissive="#ffe27a" emissiveIntensity={0.9} />
        </mesh>
      )}
    </group>
  )
}
