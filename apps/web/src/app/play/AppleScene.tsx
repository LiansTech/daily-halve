"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SUBTRACTION, Evaluator, Brush } from "three-bvh-csg";

// ── Public types ──────────────────────────────────────────────────────────────
export interface CutResult {
  leftVolumePct: number;
  rightVolumePct: number;
}

interface Props {
  phase: "idle" | "cut" | "scored";
  onCut: (result: CutResult) => void;
  onInvalidCut: () => void;
}

// ── Blob geometry — irregular sphere with layered sine displacement ───────────
function makeBlobGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1.1, 80, 80);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len === 0) continue;
    const nx = x / len, ny = y / len, nz = z / len;
    // Multiple frequencies for an organic, uneven look
    const d =
      0.20 * Math.sin(nx * 3.1 + ny * 2.4) +
      0.14 * Math.sin(ny * 5.7 + nz * 3.8 + 1.2) +
      0.10 * Math.sin(nz * 4.3 + nx * 6.1 + 2.5) +
      0.07 * Math.cos(nx * 8.2 + ny * 5.9 + nz * 4.1) +
      0.04 * Math.sin(nx * 11.0 + nz * 9.3 + ny * 7.6);
    const r = len + d;
    pos.setXYZ(i, nx * r, ny * r, nz * r);
  }
  geo.computeVertexNormals();
  return geo;
}

// ── Signed-tetrahedra volume (works on indexed geometry) ──────────────────────
function meshVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const idx = geo.getIndex();
  if (!pos) return 0;
  let v = 0;
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ai = idx ? idx.getX(i)     : i;
    const bi = idx ? idx.getX(i + 1) : i + 1;
    const ci = idx ? idx.getX(i + 2) : i + 2;
    const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
    const bx = pos.getX(bi), by = pos.getY(bi), bz = pos.getZ(bi);
    const cx = pos.getX(ci), cy = pos.getY(ci), cz = pos.getZ(ci);
    v += ax * (by * cz - bz * cy)
       + bx * (cy * az - cz * ay)
       + cx * (ay * bz - az * by);
  }
  return Math.abs(v) / 6;
}

// ── Blob mesh ─────────────────────────────────────────────────────────────────
const blobGeo = makeBlobGeometry(); // shared — created once

function BlobMesh({ visible }: { visible: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && visible) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <mesh ref={ref} geometry={blobGeo} visible={visible}>
      <meshStandardMaterial color="#c47a3a" roughness={0.55} metalness={0.04} />
    </mesh>
  );
}

// ── One cut half ──────────────────────────────────────────────────────────────
function Half({
  geometry,
  direction,
  go,
}: {
  geometry: THREE.BufferGeometry;
  direction: THREE.Vector3;
  go: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const cur = useRef(new THREE.Vector3());
  const tgt = direction.clone().multiplyScalar(go ? 0.65 : 0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    cur.current.lerp(tgt, 1 - Math.pow(0.004, dt));
    ref.current.position.copy(cur.current);
  });

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshStandardMaterial
        color="#c47a3a"
        roughness={0.55}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Main scene ────────────────────────────────────────────────────────────────
function Scene({ phase, onCut, onInvalidCut }: Props) {
  const { camera, gl } = useThree();

  const [halves, setHalves] = useState<{
    geoA: THREE.BufferGeometry;
    geoB: THREE.BufferGeometry;
    dirA: THREE.Vector3;
    dirB: THREE.Vector3;
  } | null>(null);
  const [splitting, setSplitting] = useState(false);

  // Drag state in refs — no re-renders while dragging
  const drag = useRef<{ start: THREE.Vector2; end: THREE.Vector2 } | null>(null);
  const previewRef = useRef<THREE.Mesh>(null);

  // Helpers (safe to call inside effect — camera/gl refs are stable)
  function toNDC(clientX: number, clientY: number) {
    const rect = gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function getCutPlane(a: THREE.Vector2, b: THREE.Vector2) {
    // Use near (-1) and far (1) NDC z for accurate world-space directions
    const nearPt = (ndc: THREE.Vector2) => new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
    const farPt  = (ndc: THREE.Vector2) => new THREE.Vector3(ndc.x, ndc.y,  1).unproject(camera);

    // Line direction in world space
    const lineDir = new THREE.Vector3().subVectors(nearPt(b), nearPt(a)).normalize();
    // Camera look direction
    const camDir  = new THREE.Vector3().subVectors(farPt(a), nearPt(a)).normalize();
    // Cutting plane normal
    const normal  = new THREE.Vector3().crossVectors(lineDir, camDir).normalize();

    // Project the midpoint ray onto z=0 (the apple's world-space centre plane)
    const midNDC  = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
    const midNear = nearPt(midNDC);
    const midDir  = new THREE.Vector3().subVectors(farPt(midNDC), midNear).normalize();
    // Ray: midNear + t * midDir, solve for P.z = 0
    const t = (0 - midNear.z) / midDir.z;
    const point = midNear.clone().addScaledVector(midDir, t);

    return { normal, point };
  }

  // Update preview blade each frame from drag ref (no state updates)
  useFrame(() => {
    if (!previewRef.current) return;
    const d = drag.current;
    if (!d || d.start.distanceTo(d.end) < 0.08) {
      previewRef.current.visible = false;
      return;
    }
    const { normal, point } = getCutPlane(d.start, d.end);
    previewRef.current.visible = true;
    previewRef.current.position.copy(point);
    previewRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
  });

  // Pointer events — only active when phase === "idle"
  useEffect(() => {
    if (phase !== "idle") return;
    const canvas = gl.domElement;
    let active = false;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const ndc = toNDC(e.clientX, e.clientY);
      drag.current = { start: ndc, end: ndc.clone() };
      active = true;
    };

    const onMove = (e: PointerEvent) => {
      if (!active || !drag.current) return;
      drag.current.end = toNDC(e.clientX, e.clientY);
    };

    const onUp = () => {
      if (!active || !drag.current) return;
      active = false;
      const { start, end } = drag.current;
      drag.current = null;
      if (previewRef.current) previewRef.current.visible = false;

      if (start.distanceTo(end) < 0.12) return; // too short — ignore

      try {
        const { normal, point } = getCutPlane(start, end);
        const evaluator = new Evaluator();
        const BOX = 8;
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal,
        );

        // Half A: object minus the box on the +normal side
        const brushA = new Brush(makeBlobGeometry());
        const cuttingBoxA = new Brush(new THREE.BoxGeometry(BOX, BOX, BOX));
        cuttingBoxA.position.copy(point).addScaledVector(normal, BOX / 2);
        cuttingBoxA.quaternion.copy(quat);
        brushA.updateMatrixWorld();
        cuttingBoxA.updateMatrixWorld();
        const resultA = evaluator.evaluate(brushA, cuttingBoxA, SUBTRACTION);

        // Half B: object minus the box on the -normal side
        const brushB = new Brush(makeBlobGeometry());
        const cuttingBoxB = new Brush(new THREE.BoxGeometry(BOX, BOX, BOX));
        cuttingBoxB.position.copy(point).addScaledVector(normal, -BOX / 2);
        cuttingBoxB.quaternion.copy(quat);
        brushB.updateMatrixWorld();
        cuttingBoxB.updateMatrixWorld();
        const resultB = evaluator.evaluate(brushB, cuttingBoxB, SUBTRACTION);

        const geoA = (resultA as THREE.Mesh).geometry;
        const geoB = (resultB as THREE.Mesh).geometry;
        const volA = meshVolume(geoA);
        const volB = meshVolume(geoB);
        const total = volA + volB;

        if (total < 0.01) { onInvalidCut(); return; }

        setHalves({
          geoA, geoB,
          dirA: normal.clone().negate(),
          dirB: normal.clone(),
        });
        setTimeout(() => setSplitting(true), 80);
        onCut({
          leftVolumePct:  (volA / total) * 100,
          rightVolumePct: (volB / total) * 100,
        });
      } catch (err) {
        console.error("CSG cut failed:", err);
        onInvalidCut();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup",   onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup",   onUp);
    };
  }, [phase, gl]); // only re-run when phase or gl changes

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={2} castShadow />
      <directionalLight position={[-3, -2, -3]} intensity={0.4} />

      {/* Uncut blob */}
      <BlobMesh visible={!halves} />

      {/* Cut halves */}
      {halves && (
        <>
          <Half geometry={halves.geoA} direction={halves.dirA} go={splitting} />
          <Half geometry={halves.geoB} direction={halves.dirB} go={splitting} />
        </>
      )}

      {/* Drag preview blade */}
      <mesh ref={previewRef} visible={false}>
        <planeGeometry args={[5, 5]} />
        <meshBasicMaterial
          color="#b8f04a"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

// ── Canvas wrapper ────────────────────────────────────────────────────────────
export default function AppleScene(props: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 38 }}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "24px",
        background: "radial-gradient(ellipse at center, #1a1a1a 0%, #0d0d0d 100%)",
        border: "1px solid #2a2a2a",
        cursor: props.phase === "idle" ? "crosshair" : "default",
        touchAction: "none",
        display: "block",
      }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
