"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";
import { ADDITION, SUBTRACTION, Evaluator, Brush } from "three-bvh-csg";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CutResult {
  leftVolumePct: number;
  rightVolumePct: number;
}

interface AppleSceneProps {
  phase: "idle" | "drawing" | "cut" | "scored";
  onCut: (result: CutResult) => void;
  onInvalidCut: () => void;
}

// ── Volume helper ─────────────────────────────────────────────────────────────
function meshVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position;
  if (!pos) return 0;
  let vol = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i),   ay = pos.getY(i),   az = pos.getZ(i);
    const bx = pos.getX(i+1), by = pos.getY(i+1), bz = pos.getZ(i+1);
    const cx = pos.getX(i+2), cy = pos.getY(i+2), cz = pos.getZ(i+2);
    vol += (ax * (by * cz - bz * cy)
          + bx * (cy * az - cz * ay)
          + cx * (ay * bz - az * by)) / 6;
  }
  return Math.abs(vol);
}

// ── Apple mesh ────────────────────────────────────────────────────────────────
function AppleMesh({ visible }: { visible: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current && visible) {
      meshRef.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <mesh ref={meshRef} visible={visible} castShadow>
      {/* Slightly squashed sphere for apple shape */}
      <sphereGeometry args={[1.15, 64, 64]} />
      <meshStandardMaterial
        color="#bf4730"
        roughness={0.35}
        metalness={0.05}
      />
    </mesh>
  );
}

// ── Cut halves ────────────────────────────────────────────────────────────────
interface HalfProps {
  geometry: THREE.BufferGeometry;
  direction: THREE.Vector3;
  splitting: boolean;
}

function CutHalf({ geometry, direction, splitting }: HalfProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetPos = direction.clone().multiplyScalar(splitting ? 0.55 : 0);
  const currentPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    currentPos.current.lerp(targetPos, 1 - Math.pow(0.01, delta * 4));
    meshRef.current.position.copy(currentPos.current);
  });

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshStandardMaterial color="#bf4730" roughness={0.35} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Cut plane visualiser (the blade preview while dragging) ───────────────────
function CutPlanePreview({
  planeNormal,
  planePoint,
  visible,
}: {
  planeNormal: THREE.Vector3;
  planePoint: THREE.Vector3;
  visible: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!meshRef.current || !visible) return;
    // Orient the blade plane to match the cut normal
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planeNormal);
    meshRef.current.quaternion.copy(quaternion);
    meshRef.current.position.copy(planePoint);
  }, [planeNormal, planePoint, visible]);

  if (!visible) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial
        color="#b8f04a"
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Main scene ────────────────────────────────────────────────────────────────
function Scene({ phase, onCut, onInvalidCut }: AppleSceneProps) {
  const { camera, gl, size } = useThree();
  const [halves, setHalves] = useState<{
    left: THREE.BufferGeometry;
    right: THREE.BufferGeometry;
    leftDir: THREE.Vector3;
    rightDir: THREE.Vector3;
  } | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector2 | null>(null);
  const [dragEnd, setDragEnd] = useState<THREE.Vector2 | null>(null);

  // Convert NDC to a world-space cut plane
  const buildCutPlane = useCallback((
    startNDC: THREE.Vector2,
    endNDC: THREE.Vector2,
  ): { normal: THREE.Vector3; point: THREE.Vector3 } => {
    // Unproject both endpoints at z=0 (near) and z=0.5 (mid) to get world rays
    const toWorld = (ndc: THREE.Vector2, z: number) => {
      const v = new THREE.Vector3(ndc.x, ndc.y, z).unproject(camera);
      return v;
    };

    const s0 = toWorld(startNDC, 0);
    const e0 = toWorld(endNDC, 0);
    const s1 = toWorld(startNDC, 0.5);

    // Cut plane: defined by the line direction and the camera depth direction
    const lineDir = new THREE.Vector3().subVectors(e0, s0).normalize();
    const depthDir = new THREE.Vector3().subVectors(s1, s0).normalize();
    const normal = new THREE.Vector3().crossVectors(lineDir, depthDir).normalize();

    // Point on plane = midpoint of the line at z=0
    const mid = new THREE.Vector3().addVectors(s0, e0).multiplyScalar(0.5);

    return { normal, point: mid };
  }, [camera]);

  const performCut = useCallback((
    startNDC: THREE.Vector2,
    endNDC: THREE.Vector2,
  ) => {
    const { normal, point } = buildCutPlane(startNDC, endNDC);

    // Check the line is long enough on screen
    const screenLen = startNDC.distanceTo(endNDC);
    if (screenLen < 0.15) return; // too short

    try {
      const evaluator = new Evaluator();
      const appleGeo = new THREE.SphereGeometry(1.15, 64, 64);
      const appleMesh = new Brush(appleGeo);

      // Huge box as the cutting tool — one side of the plane
      const boxSize = 6;
      const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
      const boxMesh = new Brush(boxGeo);

      // Position the cutting box: offset it along the normal so it covers one side
      boxMesh.position.copy(point).addScaledVector(normal, boxSize / 2);
      // Align box with the cut plane normal
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal,
      );
      boxMesh.quaternion.copy(quat);
      boxMesh.updateMatrixWorld();
      appleMesh.updateMatrixWorld();

      const leftHalf = evaluator.evaluate(appleMesh, boxMesh, SUBTRACTION);
      const rightHalf = evaluator.evaluate(appleMesh, boxMesh, ADDITION);

      const leftGeo = (leftHalf as THREE.Mesh).geometry;
      const rightGeo = (rightHalf as THREE.Mesh).geometry;

      const leftVol = meshVolume(leftGeo);
      const rightVol = meshVolume(rightGeo);
      const total = leftVol + rightVol;

      if (total < 0.01) {
        onInvalidCut();
        return;
      }

      const leftPct = (leftVol / total) * 100;
      const rightPct = (rightVol / total) * 100;

      // Direction for splitting: perpendicular to the cut in screen space
      setHalves({
        left: leftGeo,
        right: rightGeo,
        leftDir: normal.clone().negate(),
        rightDir: normal.clone(),
      });

      setTimeout(() => setSplitting(true), 80);

      onCut({ leftVolumePct: leftPct, rightVolumePct: rightPct });
    } catch {
      onInvalidCut();
    }
  }, [buildCutPlane, onCut, onInvalidCut]);

  // Pointer events on the canvas
  const toNDC = useCallback((clientX: number, clientY: number): THREE.Vector2 => {
    const rect = gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }, [gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (phase !== "idle" && phase !== "drawing") return;

    const onDown = (e: PointerEvent) => {
      if (phase !== "idle") return;
      canvas.setPointerCapture(e.pointerId);
      setDragStart(toNDC(e.clientX, e.clientY));
      setDragEnd(toNDC(e.clientX, e.clientY));
    };
    const onMove = (e: PointerEvent) => {
      if (!dragStart) return;
      setDragEnd(toNDC(e.clientX, e.clientY));
    };
    const onUp = () => {
      if (dragStart && dragEnd) {
        performCut(dragStart, dragEnd);
      }
      setDragStart(null);
      setDragEnd(null);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [phase, dragStart, dragEnd, toNDC, performCut, gl]);

  // Preview plane while dragging
  const previewPlane =
    dragStart && dragEnd && dragStart.distanceTo(dragEnd) > 0.05
      ? buildCutPlane(dragStart, dragEnd)
      : null;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.8} castShadow />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} />
      <Environment preset="city" />

      {/* Uncut apple */}
      <AppleMesh visible={phase === "idle" || phase === "drawing"} />

      {/* Cut halves */}
      {halves && (
        <>
          <CutHalf geometry={halves.left} direction={halves.leftDir} splitting={splitting} />
          <CutHalf geometry={halves.right} direction={halves.rightDir} splitting={splitting} />
        </>
      )}

      {/* Cut plane preview */}
      {previewPlane && (
        <CutPlanePreview
          planeNormal={previewPlane.normal}
          planePoint={previewPlane.point}
          visible
        />
      )}
    </>
  );
}

// ── Exported canvas wrapper ───────────────────────────────────────────────────
export default function AppleScene(props: AppleSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 4.5], fov: 38 }}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "24px",
        background: "#111",
        border: "1px solid #2a2a2a",
        cursor: props.phase === "idle" || props.phase === "drawing" ? "crosshair" : "default",
        touchAction: "none",
      }}
      gl={{ antialias: true }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
