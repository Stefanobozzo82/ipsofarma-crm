import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Cell } from '../game/types'
import { TILE_SIZE } from './FarmScene'
import PineTree from './PineTree'

const GRASS = new THREE.Color('#7bd455')
const SOIL = new THREE.Color('#a9713d')
const READY = new THREE.Color('#ffcf3d')
const LOCKED = new THREE.Color('#2d5c34')

export default function Tile({ cell, onClick }: { cell: Cell; onClick: () => void }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!matRef.current) return
    let target = GRASS
    if (cell.locked) target = LOCKED
    else if (cell.content?.kind === 'crop') {
      target = Date.now() >= cell.content.readyAt ? READY : SOIL
    }
    matRef.current.color.lerp(target, 0.15)

    // leggero respiro sulla tile "pronta" per farla notare
    if (groupRef.current) {
      const bump =
        !cell.locked && cell.content?.kind === 'crop' && Date.now() >= cell.content.readyAt
          ? 1 + Math.sin(state.clock.elapsedTime * 3) * 0.015
          : 1
      groupRef.current.scale.setScalar(bump)
    }
  })

  return (
    <group ref={groupRef}>
      <RoundedBox
        args={[TILE_SIZE, 0.18, TILE_SIZE]}
        radius={0.06}
        smoothness={2}
        position={[0, -0.09, 0]}
        receiveShadow
        castShadow
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <meshStandardMaterial ref={matRef} roughness={0.9} />
      </RoundedBox>

      {cell.locked && (
        <>
          <PineTree scale={0.55} />
          <Html center distanceFactor={9} position={[0, 0.5, 0]} pointerEvents="none">
            <div className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-extrabold text-white shadow">
              🪙 {cell.unlockCost}
            </div>
          </Html>
        </>
      )}
    </group>
  )
}
