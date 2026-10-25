import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../lib/config';
import type { Attitude } from '../lib/derive';

interface Props {
  /** Smoothed roll/pitch from the accelerometer. */
  attitude: Attitude | null;
  /** 0..1+ payload fraction of the maximum limit. */
  loadFraction: number;
  overloaded: boolean;
  /** Rolling vibration RMS in g. */
  vibration: number;
}

const HOME_POSITION = new THREE.Vector3(5.1, 3.3, 5.9);
const HOME_TARGET = new THREE.Vector3(0, 1.0, 0);
const DEG = Math.PI / 180;

export function WagonScene({ attitude, loadFraction, overloaded, vibration }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const attitudeRef = useRef<Attitude | null>(attitude);
  const vibrationRef = useRef(vibration);
  const loadRef = useRef(loadFraction);
  const overloadRef = useRef(overloaded);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  attitudeRef.current = attitude;
  vibrationRef.current = vibration;
  loadRef.current = loadFraction;
  overloadRef.current = overloaded;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    camera.position.copy(HOME_POSITION);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 15;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = 1.42;
    controls.target.copy(HOME_TARGET);
    controls.update();

    // ----- environment -----------------------------------------------------
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.5;

    const hemi = new THREE.HemisphereLight(0xa8c8ff, 0x070b10, 0.55);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xf3f7ff, 2.1);
    key.position.set(6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    const rimCool = new THREE.PointLight(0x2fe3b8, 30, 18, 2);
    rimCool.position.set(-5.5, 2.4, -4.5);
    scene.add(rimCool);

    const rimWarm = new THREE.PointLight(0xf6a723, 26, 18, 2);
    rimWarm.position.set(-4.5, 1.6, 5.2);
    scene.add(rimWarm);

    // ----- ground ----------------------------------------------------------
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 64),
      new THREE.MeshStandardMaterial({ color: 0x0a1119, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(26, 52, 0x2a3a4b, 0x16202b);
    grid.position.y = 0.002;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.55;
    scene.add(grid);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xf6a723,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.3, 72), haloMaterial);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.004;
    scene.add(halo);

    // ----- wagon -----------------------------------------------------------
    const pivot = new THREE.Group();
    const holder = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.add(pivot);
    scene.add(tilt);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.load(
      CONFIG.model.url,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        // GLTFLoader sanitises node names (spaces become underscores), so match loosely.
        const normalise = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
        for (const name of CONFIG.model.hiddenNodes) {
          const wanted = normalise(name);
          const matches: THREE.Object3D[] = [];
          root.traverse((object) => {
            if (normalise(object.name) === wanted) matches.push(object);
          });
          matches.forEach((object) => object.removeFromParent());
        }

        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
            | THREE.MeshStandardMaterial
            | undefined;
          const base = source?.color?.clone() ?? new THREE.Color('#9fb4c9');
          mesh.material = new THREE.MeshStandardMaterial({
            color: base.multiplyScalar(0.92),
            metalness: 0.5,
            roughness: 0.4,
            side: THREE.DoubleSide,
            envMapIntensity: 1.1,
          });
        });

        holder.add(root);
        // The CAD export is Z-up; bring it into three.js' Y-up space.
        holder.rotation.x = -Math.PI / 2;

        const rawBox = new THREE.Box3().setFromObject(holder);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const scale = CONFIG.model.lengthInScene / Math.max(rawSize.x, rawSize.z);
        holder.scale.multiplyScalar(scale);

        const box = new THREE.Box3().setFromObject(holder);
        const center = box.getCenter(new THREE.Vector3());
        const modelHeight = box.max.y - box.min.y;
        holder.position.x -= center.x;
        holder.position.z -= center.z;
        holder.position.y -= box.min.y;

        // Tilt around a point part-way up the body, not the wheel treads.
        const pivotHeight = modelHeight * 0.4;
        pivot.position.y = pivotHeight;
        holder.position.y -= pivotHeight;

        pivot.add(holder);
        tilt.rotation.order = 'XZY';

        setStatus('ready');
      },
      undefined,
      (err) => {
        setError(err instanceof Error ? err.message : 'Could not load the wagon model.');
        setStatus('error');
      },
    );

    // ----- resize ----------------------------------------------------------
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // ----- animation -------------------------------------------------------
    const startedAt = performance.now();
    let previousFrame = startedAt;
    let smoothRoll = 0;
    let smoothPitch = 0;
    let homeBlend: number | null = null;
    const homeFrom = new THREE.Vector3();
    const homeTargetFrom = new THREE.Vector3();

    resetRef.current = () => {
      homeFrom.copy(camera.position);
      homeTargetFrom.copy(controls.target);
      homeBlend = 0;
      controls.enabled = false;
    };

    const animate = () => {
      const frameNow = performance.now();
      const delta = Math.min(0.05, (frameNow - previousFrame) / 1000);
      const elapsed = (frameNow - startedAt) / 1000;
      previousFrame = frameNow;

      const att = attitudeRef.current;
      const targetRoll = THREE.MathUtils.clamp((att?.roll ?? 0) * DEG, -24 * DEG, 24 * DEG);
      const targetPitch = THREE.MathUtils.clamp((att?.pitch ?? 0) * DEG, -24 * DEG, 24 * DEG);

      smoothRoll += (targetRoll - smoothRoll) * Math.min(1, delta * 4.5);
      smoothPitch += (targetPitch - smoothPitch) * Math.min(1, delta * 4.5);

      // Only shake on real vibration above the stationary sensor noise floor (> 0.02 g).
      const vibActive = Math.max(0, vibrationRef.current - 0.02);
      const amplitude = Math.min(0.03, vibActive * 0.4);
      const jitter = amplitude > 0 ? Math.sin(elapsed * 46) * amplitude : 0;
      const jitter2 = amplitude > 0 ? Math.cos(elapsed * 61) * amplitude * 0.7 : 0;

      tilt.rotation.z = smoothRoll + jitter;
      tilt.rotation.x = smoothPitch + jitter2;

      // Keep the wagon wheels planted solidly on the ground
      tilt.position.y = 0;

      const isOver = overloadRef.current;
      const warmTarget = new THREE.Color(isOver ? 0xff3b53 : 0xf6a723);
      rimWarm.color.lerp(warmTarget, Math.min(1, delta * 4));
      rimWarm.intensity = (26 + Math.sin(elapsed * 1.7) * 4) * (isOver ? 1.5 : 1);
      haloMaterial.opacity =
        0.06 + Math.min(0.16, loadRef.current * 0.14) + (isOver ? 0.08 : 0);
      halo.scale.setScalar(1 + Math.sin(elapsed * 0.8) * 0.015);

      if (homeBlend !== null) {
        homeBlend = Math.min(1, homeBlend + delta * 3.2);
        const ease = 1 - Math.pow(1 - homeBlend, 3);
        camera.position.lerpVectors(homeFrom, HOME_POSITION, ease);
        controls.target.lerpVectors(homeTargetFrom, HOME_TARGET, ease);
        camera.lookAt(controls.target);
        if (homeBlend >= 1) {
          homeBlend = null;
          controls.enabled = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    let raf = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="scene">
      <div ref={hostRef} className="scene__canvas" />

      {status === 'loading' && (
        <div className="scene__overlay">
          <span className="scene__spinner" />
          <p>Loading wagon assembly…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="scene__overlay scene__overlay--error">
          <p>3D model unavailable</p>
          <span>{error ?? 'Check public/models/wagon.glb'}</span>
        </div>
      )}

      <button type="button" className="scene__reset" onClick={() => resetRef.current()}>
        Reset view
      </button>

      <div className="scene__readout">
        <Readout label="Roll" value={attitude?.roll ?? null} />
        <Readout label="Pitch" value={attitude?.pitch ?? null} />
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="scene__readout-item">
      <span>{label}</span>
      <strong>{value === null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}°`}</strong>
    </div>
  );
}
