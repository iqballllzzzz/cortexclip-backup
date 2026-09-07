"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface NeuralHeroCanvasProps {
  scrollProgress?: number; // 0.0 (Phone) -> 1.0 (Bohlam)
}

export function NeuralHeroCanvas({ scrollProgress = 0 }: NeuralHeroCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState(144);
  const uniformsRef = useRef<{
    uTime: { value: number };
    uMorph: { value: number };
    uPixelRatio: { value: number };
  } | null>(null);

  const targetMorphRef = useRef(scrollProgress);
  targetMorphRef.current = scrollProgress;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    const isMobile = width < 768;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
    camera.position.set(0, 0, 9.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      precision: isMobile ? "mediump" : "highp",
    });
    renderer.setSize(width, height);
    // Mobile pixel ratio clamp to 1.5 to prevent fill-rate GPU bottleneck and eliminate any stutter
    const pixelRatio = isMobile
      ? Math.min(window.devicePixelRatio || 1, 1.5)
      : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    // Chiaroscuro Studio Lighting (Brainweb-grade)
    const topSpot = new THREE.SpotLight(0xffffff, 5.0, 35, Math.PI / 4, 0.45);
    topSpot.position.set(0, 9, 4);
    scene.add(topSpot);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const amberFill = new THREE.PointLight(0xf59e0b, 3.2, 16);
    amberFill.position.set(0, 0.3, 2);
    scene.add(amberFill);

    // 2. HIGH DENSITY PARTICLES (30,000 on Desktop / 11,000 on Mobile for silky 120fps)
    const N = isMobile ? 11000 : 30000;

    const posA = new Float32Array(N * 3); // Shape A: 3D Smartphone
    const posB = new Float32Array(N * 3); // Shape B: Realistic 3D Bohlam
    const turbulence = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const colors = new Float32Array(N * 3);

    // Neutral Cinema Palette (Titanium Silver, Smoky Gray, Pure White, Warm Amber Filament)
    const colSilver = new THREE.Color(0xe2e8f0);
    const colSmoky = new THREE.Color(0x94a3b8);
    const colWhite = new THREE.Color(0xffffff);
    const colAmber = new THREE.Color(0xf59e0b);
    const colBrightAmber = new THREE.Color(0xfbbf24);

    // ── SHAPE A: Sleek Flagship 3D Smartphone (Compact, Elegant, Razor-Sharp) ──
    // Base dimensions
    const pW = 1.75;
    const pH = 3.8;
    const pD = 0.22;
    const pR = 0.30;

    let idx = 0;

    // A1. Precision Chassis Bevel Rings (25% of particles)
    const chassisCount = Math.floor(N * 0.25);
    for (let i = 0; i < chassisCount; i++) {
      const step = i % 500;
      const t = (step / 500) * Math.PI * 2;
      let x = 0;
      let y = 0;

      if (t >= 0 && t < Math.PI / 2) {
        x = pW / 2 - pR + Math.cos(t) * pR;
        y = pH / 2 - pR + Math.sin(t) * pR;
      } else if (t >= Math.PI / 2 && t < Math.PI) {
        x = -(pW / 2 - pR) + Math.cos(t) * pR;
        y = pH / 2 - pR + Math.sin(t) * pR;
      } else if (t >= Math.PI && t < (Math.PI * 3) / 2) {
        x = -(pW / 2 - pR) + Math.cos(t) * pR;
        y = -(pH / 2 - pR) + Math.sin(t) * pR;
      } else {
        x = pW / 2 - pR + Math.cos(t) * pR;
        y = -(pH / 2 - pR) + Math.sin(t) * pR;
      }

      // Spread along thickness layers
      const layer = Math.floor(i / 500);
      const z = -pD / 2 + (layer / 16) * pD;

      const i3 = idx * 3;
      posA[i3] = x;
      posA[i3 + 1] = y;
      posA[i3 + 2] = z;
      idx++;
    }

    // A2. High-Density Front Screen Matrix (55% of particles)
    const screenCount = Math.floor(N * 0.55);
    const sCols = isMobile ? 55 : 90;
    const sRows = isMobile ? 110 : 180;
    const sW = pW - 0.20;
    const sH = pH - 0.24;

    for (let r = 0; r < sRows && idx < chassisCount + screenCount; r++) {
      for (let c = 0; c < sCols && idx < chassisCount + screenCount; c++) {
        const x = -sW / 2 + (c / (sCols - 1)) * sW;
        const y = -sH / 2 + (r / (sRows - 1)) * sH;

        // Clip rounded corners
        const cx = Math.abs(x) - (sW / 2 - pR * 0.65);
        const cy = Math.abs(y) - (sH / 2 - pR * 0.65);
        if (cx > 0 && cy > 0 && cx * cx + cy * cy > (pR * 0.65) ** 2) continue;

        const i3 = idx * 3;
        posA[i3] = x;
        posA[i3 + 1] = y;
        posA[i3 + 2] = pD / 2 + 0.008;
        idx++;
      }
    }

    // A3. Dynamic Island, Side Buttons & Rear Camera Lenses (Remaining 20%)
    while (idx < N) {
      const i3 = idx * 3;
      if (idx < N - Math.floor(N * 0.08)) {
        // Dynamic Island Notch Pill
        const angle = Math.random() * Math.PI * 2;
        const iW = 0.48;
        const iH = 0.14;
        posA[i3] = Math.cos(angle) * (iW / 2);
        posA[i3 + 1] = pH / 2 - 0.34 + Math.sin(angle) * (iH / 2);
        posA[i3 + 2] = pD / 2 + 0.015;
      } else if (idx < N - Math.floor(N * 0.04)) {
        // Hardware buttons on edges
        const isLeft = Math.random() > 0.4;
        const sideX = isLeft ? -pW / 2 - 0.025 : pW / 2 + 0.025;
        const bY = isLeft ? (Math.random() - 0.1) * 1.4 : 0.3 + Math.random() * 0.6;
        posA[i3] = sideX;
        posA[i3 + 1] = bY;
        posA[i3 + 2] = (Math.random() - 0.5) * 0.08;
      } else {
        // Dual Rear Camera Rings
        const isTopLens = Math.random() > 0.5;
        const lY = isTopLens ? pH / 2 - 0.65 : pH / 2 - 1.15;
        const angle = Math.random() * Math.PI * 2;
        const lR = 0.22;
        posA[i3] = -pW / 4 + Math.cos(angle) * lR;
        posA[i3 + 1] = lY + Math.sin(angle) * lR;
        posA[i3 + 2] = -pD / 2 - 0.035;
      }
      idx++;
    }

    // ── SHAPE B: Realistic, High-Craft 3D Bohlam (Lightbulb) ──
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;

      if (i < Math.floor(N * 0.52)) {
        // B1. Spherical Bulb Glass Dome (Upper Smooth Tear-Drop)
        const u = Math.random();
        const v = Math.random();
        const theta = u * Math.PI * 2;
        const phi = v * Math.PI * 0.68; // Dome angle
        const r = 1.35 + (Math.random() - 0.5) * 0.06;

        posB[i3] = r * Math.sin(phi) * Math.cos(theta);
        posB[i3 + 1] = r * Math.cos(phi) + 0.35;
        posB[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      } else if (i < Math.floor(N * 0.72)) {
        // B2. Tapered Glass Neck (Smooth Hourglass Transition)
        const p = (i - N * 0.52) / (N * 0.20);
        const y = 0.35 - p * 1.05; // y from 0.35 to -0.7
        const neckR = 1.35 * Math.sin(0.68 * Math.PI) * (1.0 - p * 0.42);
        const theta = Math.random() * Math.PI * 2;

        posB[i3] = neckR * Math.cos(theta);
        posB[i3 + 1] = y;
        posB[i3 + 2] = neckR * Math.sin(theta);
      } else if (i < Math.floor(N * 0.88)) {
        // B3. Realistic Helical Screw Base Threads (Ulir Logam Soket Bohlam)
        const p = (i - N * 0.72) / (N * 0.16);
        const y = -0.7 - p * 0.95; // y from -0.7 to -1.65
        const theta = p * Math.PI * 16.0; // 8 screw thread revolutions
        const ridge = 0.045 * Math.sin(theta);
        const baseR = 0.62 + ridge;

        posB[i3] = baseR * Math.cos(theta);
        posB[i3 + 1] = y;
        posB[i3 + 2] = baseR * Math.sin(theta);
      } else if (i < Math.floor(N * 0.93)) {
        // B4. Bottom Contact Terminal / Solder Point
        const p = (i - N * 0.88) / (N * 0.05);
        const y = -1.65 - p * 0.25;
        const capR = 0.38 * (1.0 - p * 0.7);
        const theta = Math.random() * Math.PI * 2;

        posB[i3] = capR * Math.cos(theta);
        posB[i3 + 1] = y;
        posB[i3 + 2] = capR * Math.sin(theta);
      } else {
        // B5. Glowing Tungsten Double-Helix Filament in Center
        const p = (i - N * 0.93) / (N * 0.07);
        const archY = 0.15 + Math.sin(p * Math.PI) * 0.65; // Arch up inside dome
        const coilAngle = p * Math.PI * 24.0;
        const coilR = 0.05;
        const archX = (p - 0.5) * 0.75 + Math.cos(coilAngle) * coilR;
        const archZ = Math.sin(coilAngle) * coilR;

        posB[i3] = archX;
        posB[i3 + 1] = archY;
        posB[i3 + 2] = archZ;
      }

      // Zero-Gravity Curl Turbulence Vector for Explosion
      turbulence[i3] = (Math.random() - 0.5) * 4.6;
      turbulence[i3 + 1] = (Math.random() - 0.5) * 5.2;
      turbulence[i3 + 2] = (Math.random() - 0.5) * 4.6;

      // Color Assignment
      let c = colSilver;
      if (i >= Math.floor(N * 0.93)) {
        // Filament: Glowing Warm Amber & Gold
        c = Math.random() > 0.4 ? colBrightAmber : colAmber;
        sizes[i] = isMobile ? 0.052 : 0.046;
      } else if (Math.random() > 0.78) {
        c = colWhite;
        sizes[i] = isMobile ? 0.042 : 0.038;
      } else if (Math.random() > 0.55) {
        c = colSmoky;
        sizes[i] = isMobile ? 0.035 : 0.032;
      } else {
        c = colSilver;
        sizes[i] = isMobile ? 0.038 : 0.034;
      }

      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    // 3. GLSL SHADER MATERIAL (Antialiased Circular Gaussian Discs - Ultra HD)
    const vertexShader = `
      uniform float uTime;
      uniform float uMorph;
      uniform float uPixelRatio;
      attribute vec3 aTargetB;
      attribute vec3 aTurbulence;
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;

        // Sinusoidal zero-G burst dispersion at mid-morph (peak at 0.5)
        float burst = sin(uMorph * 3.14159265) * 0.82;
        vec3 morphed = mix(position, aTargetB, uMorph) + aTurbulence * burst;

        // Gentle breathing wave
        float wave = sin(uTime * 2.0 + morphed.y * 2.5) * 0.012;
        morphed.y += wave;

        vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Size attenuation with high-DPI scaling
        gl_PointSize = aSize * uPixelRatio * (290.0 / -mvPosition.z);
        vAlpha = 0.95;
      }
    `;

    const fragmentShader = `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        // High-Definition Antialiased Radial Glow Disc
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        // Soft Gaussian falloff
        float alpha = smoothstep(0.5, 0.04, dist) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
      }
    `;

    const uniforms = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPixelRatio: { value: pixelRatio },
    };
    uniformsRef.current = uniforms;

    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(posA, 3));
    geometry.setAttribute("aTargetB", new THREE.BufferAttribute(posB, 3));
    geometry.setAttribute("aTurbulence", new THREE.BufferAttribute(turbulence, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const pointCloud = new THREE.Points(geometry, shaderMaterial);
    scene.add(pointCloud);

    // Responsive Scale Factor (tuned to 0.74 on mobile for perfect ergonomic presence)
    const baseScale = isMobile ? 0.74 : 0.92;
    pointCloud.scale.setScalar(baseScale);

    // 4. LOW-POLY FACETED CRYSTAL SHARDS (From Brainweb Frame 22)
    const shardGroup = new THREE.Group();
    shardGroup.scale.setScalar(baseScale);
    scene.add(shardGroup);

    const shardGeo = new THREE.OctahedronGeometry(0.28, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.72,
    });

    const shards: THREE.Mesh[] = [];
    const shardCount = isMobile ? 5 : 8;
    for (let s = 0; s < shardCount; s++) {
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      const angle = (s / shardCount) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 2.8, (Math.random() - 0.5) * 3.2, Math.sin(angle) * 2.0);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.scale.setScalar(0.4 + Math.random() * 0.5);
      shardGroup.add(mesh);
      shards.push(mesh);
    }

    // 5. Interactive Mouse Parallax
    let targetRotX = 0.12;
    let targetRotY = -0.25;
    let curRotX = 0.12;
    let curRotY = -0.25;

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
      targetRotY = (cx / window.innerWidth - 0.5) * 1.1;
      targetRotX = -(cy / window.innerHeight - 0.5) * 0.7 + 0.12;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });

    // 6. Animation Loop with Smooth Shader Uniform Lerp
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Measure real FPS
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 700) {
        const measured = Math.round((frameCount * 1000) / (now - lastFpsTime));
        setFps(Math.min(measured, 144));
        frameCount = 0;
        lastFpsTime = now;
      }

      const elapsed = clock.getElapsedTime();
      uniforms.uTime.value = elapsed;

      // Smooth lerp to target scroll morph progress
      uniforms.uMorph.value += (targetMorphRef.current - uniforms.uMorph.value) * 0.1;

      // Mouse Parallax & Idle Tumble
      curRotX += (targetRotX - curRotX) * 0.05;
      curRotY += (targetRotY - curRotY) * 0.05;

      pointCloud.rotation.x = curRotX + Math.sin(elapsed * 1.2) * 0.025;
      pointCloud.rotation.y = curRotY + Math.cos(elapsed * 0.9) * 0.035;
      pointCloud.position.y = Math.sin(elapsed * 1.5) * 0.06;

      // Animate crystal shards
      for (let s = 0; s < shards.length; s++) {
        const m = shards[s]!;
        m.rotation.x += 0.012;
        m.rotation.y += 0.016;
        m.position.y += Math.sin(elapsed * 1.2 + s) * 0.003;
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
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      shaderMaterial.dispose();
      shardGeo.dispose();
      shardMat.dispose();
    };
  }, []);

  // Update morph progress when prop changes
  useEffect(() => {
    targetMorphRef.current = scrollProgress;
  }, [scrollProgress]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* Three.js HD 3D Canvas */}
      <div ref={mountRef} className="size-full" />

      {/* Telemetry HUD Bar */}
      <div className="pointer-events-auto absolute top-20 inset-x-0 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-mono text-muted-foreground/80 select-none">
        <div className="hidden sm:flex items-center gap-4 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {fps} FPS
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-medium">32K HD PARTICLES</span>
          <span className="text-white/20">|</span>
          <span className="text-amber-400 font-semibold">
            {scrollProgress > 0.65
              ? "03 // SYNAPSE IGNITION (BOHLAM IDE)"
              : scrollProgress > 0.25
              ? "02 // ZERO-G NEURAL DISPERSION"
              : "01 // 3D SMARTPHONE MATRIX"}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="text-white/60">
            {scrollProgress >= 0.95
              ? "TRANSFORMASI SELESAI · SCROLL LANJUT ↓"
              : "SCROLL UNTUK MERANGKAI BOHLAM ↓"}
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-mono">LATENCY: 1.4ms</span>
        </div>
      </div>
    </div>
  );
}
