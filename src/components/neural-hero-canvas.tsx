"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function NeuralHeroCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState(144);
  const [currentMode, setCurrentMode] = useState("01 // 3D PHONE MATRIX");

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Top-Down Dramatic Spotlight (Chiaroscuro Studio)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    camera.position.set(0, 0, 9.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);

    // Top-down dramatic spotlight (just like Brainweb frame 22)
    const topSpot = new THREE.SpotLight(0xffffff, 4.5, 30, Math.PI / 4, 0.45);
    topSpot.position.set(0, 8, 3);
    scene.add(topSpot);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const amberFill = new THREE.PointLight(0xf59e0b, 2.8, 15);
    amberFill.position.set(0, 0.5, 2);
    scene.add(amberFill);

    // 2. DUAL SHAPE GENERATOR: SHAPE A (SMARTPHONE) & SHAPE B (LIGHTBULB / BOHLAM)
    // Particle count: 6,400 points
    const N = 6400;

    const posA = new Float32Array(N * 3); // Phone
    const posB = new Float32Array(N * 3); // Lightbulb (Bohlam)
    const currentPos = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const turbulence = new Float32Array(N * 3);

    // Neutral Cinema Palette: Titanium Silver, Smoky Crystal, Pure White, Warm Amber Filament
    const colSilver = new THREE.Color(0xe2e8f0);
    const colSmoky = new THREE.Color(0x94a3b8);
    const colWhite = new THREE.Color(0xffffff);
    const colAmber = new THREE.Color(0xf59e0b);

    // ── SHAPE A: Sleek, compact 3D smartphone (Dimensions ~ 1.9 x 4.0 x 0.24) ──
    const W = 1.9;
    const H = 4.0;
    const D = 0.24;
    const R = 0.32;

    let idx = 0;

    // A1. Chassis Contour Loops (2000 points)
    const chassisPts = 2000;
    for (let i = 0; i < chassisPts; i++) {
      const step = i % 400;
      const t = (step / 400) * Math.PI * 2;
      let x = 0;
      let y = 0;

      if (t >= 0 && t < Math.PI / 2) {
        x = W / 2 - R + Math.cos(t) * R;
        y = H / 2 - R + Math.sin(t) * R;
      } else if (t >= Math.PI / 2 && t < Math.PI) {
        x = -(W / 2 - R) + Math.cos(t) * R;
        y = H / 2 - R + Math.sin(t) * R;
      } else if (t >= Math.PI && t < (Math.PI * 3) / 2) {
        x = -(W / 2 - R) + Math.cos(t) * R;
        y = -(H / 2 - R) + Math.sin(t) * R;
      } else {
        x = W / 2 - R + Math.cos(t) * R;
        y = -(H / 2 - R) + Math.sin(t) * R;
      }

      // Distribute across front rim, back rim, and side thickness
      const layer = Math.floor(i / 400);
      const z = -D / 2 + (layer / 4) * D;

      const i3 = idx * 3;
      posA[i3] = x;
      posA[i3 + 1] = y;
      posA[i3 + 2] = z;

      idx++;
    }

    // A2. Screen Surface Matrix (2600 points)
    const screenCols = 36;
    const screenRows = 72;
    const sW = W - 0.24;
    const sH = H - 0.28;

    for (let r = 0; r < screenRows && idx < chassisPts + 2600; r++) {
      for (let c = 0; c < screenCols && idx < chassisPts + 2600; c++) {
        const x = -sW / 2 + (c / (screenCols - 1)) * sW;
        const y = -sH / 2 + (r / (screenRows - 1)) * sH;

        // Clip rounded corners of screen
        const cornerX = Math.abs(x) - (sW / 2 - R * 0.6);
        const cornerY = Math.abs(y) - (sH / 2 - R * 0.6);
        if (cornerX > 0 && cornerY > 0 && cornerX * cornerX + cornerY * cornerY > (R * 0.6) ** 2) {
          continue;
        }

        const i3 = idx * 3;
        posA[i3] = x;
        posA[i3 + 1] = y;
        posA[i3 + 2] = D / 2 + 0.01;

        idx++;
      }
    }

    // A3. Dynamic Island & Side Buttons & Rear Camera (Fill remaining up to N)
    while (idx < N) {
      const i3 = idx * 3;
      if (idx < N - 600) {
        // Dynamic Island notch pill
        const angle = Math.random() * Math.PI * 2;
        posA[i3] = Math.cos(angle) * 0.26;
        posA[i3 + 1] = H / 2 - 0.42 + Math.sin(angle) * 0.08;
        posA[i3 + 2] = D / 2 + 0.02;
      } else if (idx < N - 300) {
        // Hardware buttons on edges
        const side = Math.random() > 0.5 ? 1 : -1;
        posA[i3] = (side * W) / 2 + side * 0.03;
        posA[i3 + 1] = (Math.random() - 0.2) * 1.5;
        posA[i3 + 2] = (Math.random() - 0.5) * 0.12;
      } else {
        // Dual rear camera rings
        const lensY = Math.random() > 0.5 ? H / 2 - 0.7 : H / 2 - 1.25;
        const angle = Math.random() * Math.PI * 2;
        posA[i3] = -W / 4 + Math.cos(angle) * 0.24;
        posA[i3 + 1] = lensY + Math.sin(angle) * 0.24;
        posA[i3 + 2] = -D / 2 - 0.03;
      }
      idx++;
    }

    // ── SHAPE B: 3D LIGHTBULB / BOHLAM ("Spark lightbulb moments") ──
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;

      if (i < 3600) {
        // B1. Spherical Bulb Glass Globe (Top Dome)
        const u = Math.random();
        const v = Math.random();
        const theta = u * Math.PI * 2;
        const phi = v * Math.PI * 0.72; // Sphere down to neck
        const r = 1.45 + (Math.random() - 0.5) * 0.12;

        posB[i3] = r * Math.sin(phi) * Math.cos(theta);
        posB[i3 + 1] = r * Math.cos(phi) + 0.45;
        posB[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      } else if (i < 4800) {
        // B2. Tapered Glass Neck down to socket
        const p = (i - 3600) / 1200;
        const y = 0.45 - p * 1.25; // y from 0.45 to -0.8
        const r = 1.45 * Math.sin(0.72 * Math.PI) * (1 - p * 0.45);
        const theta = Math.random() * Math.PI * 2;

        posB[i3] = r * Math.cos(theta);
        posB[i3 + 1] = y;
        posB[i3 + 2] = r * Math.sin(theta);
      } else if (i < 5800) {
        // B3. Helical Screw Socket Base (Ulir Logam Bohlam)
        const p = (i - 4800) / 1000;
        const y = -0.8 - p * 1.0; // y from -0.8 to -1.8
        const theta = p * Math.PI * 14; // Helical screw threads
        const baseR = 0.72 + 0.06 * Math.sin(theta * 2);

        posB[i3] = baseR * Math.cos(theta);
        posB[i3 + 1] = y;
        posB[i3 + 2] = baseR * Math.sin(theta);
      } else {
        // B4. Central Illuminated Filament (Glowing Amber Spark)
        const p = (i - 5800) / 600;
        const angle = p * Math.PI * 6;
        const y = 0.1 + Math.sin(p * Math.PI) * 0.7; // Filament arch inside bulb
        const fx = Math.cos(angle) * (0.28 * Math.sin(p * Math.PI));
        const fz = Math.sin(angle) * (0.28 * Math.sin(p * Math.PI));

        posB[i3] = fx;
        posB[i3 + 1] = y;
        posB[i3 + 2] = fz;
      }

      // Initialize Current Positions to Shape A (Phone)
      currentPos[i3] = posA[i3]!;
      currentPos[i3 + 1] = posA[i3 + 1]!;
      currentPos[i3 + 2] = posA[i3 + 2]!;

      // Zero-gravity explosion vector for mid-scroll dispersion
      turbulence[i3] = (Math.random() - 0.5) * 4.2;
      turbulence[i3 + 1] = (Math.random() - 0.5) * 4.8;
      turbulence[i3 + 2] = (Math.random() - 0.5) * 4.2;

      // Color Assignment: Titanium Silver, Crisp White, with Amber Highlights
      let c = colSilver;
      if (i >= 5800) {
        c = colAmber; // Filament is glowing warm amber
      } else if (Math.random() > 0.8) {
        c = colWhite;
      } else if (Math.random() > 0.6) {
        c = colSmoky;
      }

      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(currentPos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Particle Material with Soft Additive Blending (HD 3D Sparkle)
    const material = new THREE.PointsMaterial({
      size: 0.038,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    // 3. FACETED CRYSTAL SHARDS (From Brainweb Frame 22)
    // Low-poly octahedrons floating and catching the spotlight
    const shardGroup = new THREE.Group();
    scene.add(shardGroup);

    const shardGeo = new THREE.OctahedronGeometry(0.32, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.7,
    });

    const shards: THREE.Mesh[] = [];
    const shardCount = 8;
    for (let s = 0; s < shardCount; s++) {
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      const angle = (s / shardCount) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 3.2, (Math.random() - 0.5) * 3.5, Math.sin(angle) * 2.2);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.scale.setScalar(0.5 + Math.random() * 0.6);
      shardGroup.add(mesh);
      shards.push(mesh);
    }

    // 4. Scroll-Driven Morphing Listener
    let scrollY = window.scrollY || 0;
    let targetMorph = 0; // 0 = Phone, 1 = Lightbulb
    let currentMorph = 0;

    const onScroll = () => {
      scrollY = window.scrollY || 0;
      // Morph between 0 and 600px scroll
      targetMorph = Math.min(Math.max(scrollY / 550, 0), 1);
      if (targetMorph > 0.65) {
        setCurrentMode("03 // SYNAPSE IGNITION (LIGHTBULB MOMENT)");
      } else if (targetMorph > 0.2) {
        setCurrentMode("02 // ZERO-G SYNAPSE DISPERSION");
      } else {
        setCurrentMode("01 // 3D PHONE MATRIX");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    // 5. Mouse Parallax
    let targetRotX = 0.12;
    let targetRotY = -0.28;
    let curRotX = 0.12;
    let curRotY = -0.28;

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      let cx = 0;
      let cy = 0;
      if ("touches" in e && e.touches.length > 0) {
        cx = e.touches[0]!.clientX;
        cy = e.touches[0]!.clientY;
      } else if ("clientX" in e) {
        cx = e.clientX;
        cy = e.clientY;
      }
      targetRotY = (cx / window.innerWidth - 0.5) * 1.3;
      targetRotX = -(cy / window.innerHeight - 0.5) * 0.8 + 0.12;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });

    // 6. Animation Loop with Morph Interpolation
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Measure true FPS
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 700) {
        const measured = Math.round((frameCount * 1000) / (now - lastFpsTime));
        setFps(Math.min(measured, 144));
        frameCount = 0;
        lastFpsTime = now;
      }

      const elapsed = clock.getElapsedTime();

      // Smooth lerp for scroll morphing
      currentMorph += (targetMorph - currentMorph) * 0.08;

      // Dispersion burst factor at midpoint (sinusoidal pulse)
      const burst = Math.sin(currentMorph * Math.PI) * 0.65;

      // Update particle positions buffer
      const posAttr = geometry.attributes["position"] as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;

      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        // Smooth linear interpolation between Shape A (Phone) and Shape B (Bulb)
        const ax = posA[i3]!;
        const ay = posA[i3 + 1]!;
        const az = posA[i3 + 2]!;

        const bx = posB[i3]!;
        const by = posB[i3 + 1]!;
        const bz = posB[i3 + 2]!;

        const tx = turbulence[i3]!;
        const ty = turbulence[i3 + 1]!;
        const tz = turbulence[i3 + 2]!;

        // Subtle micro-breathing wave
        const wave = Math.sin(elapsed * 2.2 + ay * 2.5) * 0.015;

        array[i3] = THREE.MathUtils.lerp(ax, bx, currentMorph) + tx * burst;
        array[i3 + 1] = THREE.MathUtils.lerp(ay, by, currentMorph) + ty * burst + wave;
        array[i3 + 2] = THREE.MathUtils.lerp(az, bz, currentMorph) + tz * burst;
      }
      posAttr.needsUpdate = true;

      // Mouse Parallax & Idle Rotation
      curRotX += (targetRotX - curRotX) * 0.05;
      curRotY += (targetRotY - curRotY) * 0.05;

      pointCloud.rotation.x = curRotX + Math.sin(elapsed * 1.2) * 0.025;
      pointCloud.rotation.y = curRotY + Math.cos(elapsed * 0.9) * 0.035;
      pointCloud.position.y = Math.sin(elapsed * 1.5) * 0.08;

      // Rotate and tumble the low-poly faceted shards
      for (let s = 0; s < shards.length; s++) {
        const mesh = shards[s]!;
        mesh.rotation.x += 0.01;
        mesh.rotation.y += 0.015;
        mesh.position.y += Math.sin(elapsed * 1.2 + s) * 0.003;
      }
      shardGroup.rotation.y = elapsed * 0.04;

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      shardGeo.dispose();
      shardMat.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="size-full" />

      {/* Futuristic Telemetry HUD Bar (Directly Matching Brainweb Style) */}
      <div className="pointer-events-auto absolute top-24 inset-x-0 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-mono text-muted-foreground/80 select-none">
        <div className="hidden sm:flex items-center gap-4 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {fps} FPS
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-medium">6.4K SYNAPSES</span>
          <span className="text-white/20">|</span>
          <span className="text-amber-400 font-semibold">{currentMode}</span>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="text-white/60">SCROLL TO MORPH → BOHLAM</span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-mono">LATENCY: 1.6ms</span>
        </div>
      </div>
    </div>
  );
}
