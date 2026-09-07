"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function NeuralHeroCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState(144);
  const [synapses, setSynapses] = useState("38.4K");

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Neural Swarm / Synaptic Point Cloud (Brainweb-style)
    const isMobile = width < 768;
    const particleCount = isMobile ? 8000 : 28000;
    setSynapses(isMobile ? "8.2K" : "28.4K");

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    // Color palette: Cyan-teal electric (#06b6d4 / #38bdf8) mixed with Solar Amber (#f59e0b)
    const colorTeal = new THREE.Color(0x06b6d4);
    const colorAmber = new THREE.Color(0xf59e0b);
    const colorWhite = new THREE.Color(0xf8fafc);

    for (let i = 0; i < particleCount; i++) {
      // Golden spiral sphere distribution
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 5.2 + (Math.random() - 0.5) * 2.8;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      originalPositions[i3] = x;
      originalPositions[i3 + 1] = y;
      originalPositions[i3 + 2] = z;

      // Assign color gradient
      const choice = Math.random();
      let pColor = colorTeal;
      if (choice > 0.82) pColor = colorAmber;
      else if (choice > 0.65) pColor = colorWhite;

      colors[i3] = pColor.r;
      colors[i3 + 1] = pColor.g;
      colors[i3 + 2] = pColor.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Particle Material with Soft Glow Sprite
    const particleMaterial = new THREE.PointsMaterial({
      size: isMobile ? 0.045 : 0.038,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(geometry, particleMaterial);
    scene.add(particleSystem);

    // 3. Central Wireframe Crystal Core (Polyhedral Synapse)
    const coreGeo = new THREE.IcosahedronGeometry(2.4, 1);
    const coreWireMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreWireMat);
    scene.add(coreMesh);

    // Concentric Equatorial Orbit Rings
    const ringGeo = new THREE.RingGeometry(6.2, 6.24, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2.3;
    scene.add(ringMesh);

    // 4. Mouse / Touch Parallax Coordinates
    let targetX = 0;
    let targetY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;
      if ("touches" in e && e.touches.length > 0) {
        clientX = e.touches[0]!.clientX;
        clientY = e.touches[0]!.clientY;
      } else if ("clientX" in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      targetX = (clientX / window.innerWidth - 0.5) * 1.8;
      targetY = (clientY / window.innerHeight - 0.5) * 1.4;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });

    // 5. FPS & Telemetry Measurement
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // FPS Measurement
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 800) {
        const measuredFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        setFps(Math.min(measuredFps, 144));
        frameCount = 0;
        lastFpsTime = now;
      }

      const elapsed = clock.getElapsedTime();

      // Smooth camera / group lerp
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;

      particleSystem.rotation.y = elapsed * 0.08 + mouseX * 0.6;
      particleSystem.rotation.x = Math.sin(elapsed * 0.12) * 0.15 - mouseY * 0.4;

      coreMesh.rotation.y = -elapsed * 0.15;
      coreMesh.rotation.x = elapsed * 0.1;

      ringMesh.rotation.z = elapsed * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    // 6. Responsive Resize
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
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      particleMaterial.dispose();
      coreGeo.dispose();
      coreWireMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* 3D WebGL Mounting Surface */}
      <div ref={mountRef} className="size-full" />

      {/* Futuristic Telemetry HUD Bar (Inspired by Brainweb Video) */}
      <div className="pointer-events-auto absolute top-24 inset-x-0 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-mono text-muted-foreground/80 select-none">
        <div className="hidden sm:flex items-center gap-4 bg-black/60 px-3.5 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {fps} FPS
          </span>
          <span className="text-white/20">|</span>
          <span className="text-cyan-400 font-medium">{synapses} SYNAPSES</span>
          <span className="text-white/20">|</span>
          <span className="text-white/60">GPU ACCELERATED</span>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-black/60 px-3.5 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
          <span className="text-amber-400 font-semibold">[SYS_INIT // v4.2.2]</span>
          <span className="text-white/20">|</span>
          <span className="text-white/60">LATENCY: 1.8ms</span>
        </div>
      </div>
    </div>
  );
}
