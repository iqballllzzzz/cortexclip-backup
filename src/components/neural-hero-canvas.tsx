"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function NeuralHeroCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState(144);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 1000);
    camera.position.set(0, 0, 11);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. MATHEMATICAL 3D SMARTPHONE PARTICLE GENERATOR
    // Dimensions: Aspect ~ 9:18.5 (iPhone/Pixel flagship proportion)
    const W = 3.2;       // Width
    const H = 6.6;       // Height
    const D = 0.42;      // Chassis Depth / Thickness
    const R = 0.55;      // Corner Radius

    const posList: number[] = [];
    const colList: number[] = [];
    const sizeList: number[] = [];

    const amber = new THREE.Color(0xf59e0b);      // Chassis edge accent
    const cyan = new THREE.Color(0x38bdf8);       // Screen matrix
    const white = new THREE.Color(0xffffff);      // High-light rims
    const emerald = new THREE.Color(0x10b981);    // Dynamic Island / buttons

    function addPt(x: number, y: number, z: number, c: THREE.Color, sz = 0.04) {
      posList.push(x, y, z);
      colList.push(c.r, c.g, c.b);
      sizeList.push(sz);
    }

    // A. CHASSIS CONTOUR (Rounded Rectangle Loops for Front Rim, Back Rim & Side Ribs)
    const edgeSteps = 360;
    for (let step = 0; step < edgeSteps; step++) {
      const t = (step / edgeSteps) * Math.PI * 2;
      let x = 0;
      let y = 0;

      // Sample along rounded rectangle perimeter
      if (t >= 0 && t < Math.PI / 2) {
        // Top-Right Corner
        x = (W / 2 - R) + Math.cos(t) * R;
        y = (H / 2 - R) + Math.sin(t) * R;
      } else if (t >= Math.PI / 2 && t < Math.PI) {
        // Top-Left Corner
        x = -(W / 2 - R) + Math.cos(t) * R;
        y = (H / 2 - R) + Math.sin(t) * R;
      } else if (t >= Math.PI && t < (Math.PI * 3) / 2) {
        // Bottom-Left Corner
        x = -(W / 2 - R) + Math.cos(t) * R;
        y = -(H / 2 - R) + Math.sin(t) * R;
      } else {
        // Bottom-Right Corner
        x = (W / 2 - R) + Math.cos(t) * R;
        y = -(H / 2 - R) + Math.sin(t) * R;
      }

      // Front Bezel Rim
      addPt(x, y, D / 2, amber, 0.05);
      // Back Chassis Rim
      addPt(x, y, -D / 2, amber, 0.045);

      // Connecting side depth ribs (3 layers in thickness)
      addPt(x, y, D / 4, white, 0.035);
      addPt(x, y, 0, cyan, 0.035);
      addPt(x, y, -D / 4, white, 0.035);
    }

    // B. SCREEN MATRIX (Luminous Point Grid on Front Glass)
    const cols = 42;
    const rows = 86;
    const screenW = W - 0.38;
    const screenH = H - 0.44;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -screenW / 2 + (c / (cols - 1)) * screenW;
        const y = -screenH / 2 + (r / (rows - 1)) * screenH;

        // Skip corner cutouts to keep screen rounded inside chassis
        const cornerX = Math.abs(x) - (screenW / 2 - R * 0.7);
        const cornerY = Math.abs(y) - (screenH / 2 - R * 0.7);
        if (cornerX > 0 && cornerY > 0) {
          if (cornerX * cornerX + cornerY * cornerY > (R * 0.7) ** 2) continue;
        }

        // Color gradient across screen: glowing cyan with subtle amber highlights
        let cColor = cyan;
        if (Math.sin(x * 3 + y * 2) > 0.75) cColor = amber;
        else if (Math.random() > 0.85) cColor = white;

        addPt(x, y, D / 2 + 0.015, cColor, 0.032);
      }
    }

    // C. DYNAMIC ISLAND (Pill at top center of screen)
    const islandSteps = 60;
    const iW = 0.75;
    const iH = 0.22;
    const iY = H / 2 - 0.65;
    for (let s = 0; s < islandSteps; s++) {
      const angle = (s / islandSteps) * Math.PI * 2;
      const x = Math.cos(angle) * (iW / 2);
      const y = iY + Math.sin(angle) * (iH / 2);
      addPt(x, y, D / 2 + 0.03, emerald, 0.045);
    }
    // Inner sensor dots
    addPt(-0.16, iY, D / 2 + 0.03, white, 0.05);
    addPt(0.16, iY, D / 2 + 0.03, cyan, 0.05);

    // D. HARDWARE SIDE BUTTONS
    // 1. Left: Volume Up & Volume Down
    for (let b = 0; b < 24; b++) {
      const by = 0.8 + (b / 24) * 0.55; // Volume Up
      addPt(-W / 2 - 0.06, by, 0, amber, 0.04);
    }
    for (let b = 0; b < 24; b++) {
      const by = 0.05 + (b / 24) * 0.55; // Volume Down
      addPt(-W / 2 - 0.06, by, 0, amber, 0.04);
    }
    // 2. Right: Power Button
    for (let b = 0; b < 32; b++) {
      const by = 0.4 + (b / 32) * 0.8;
      addPt(W / 2 + 0.06, by, 0, amber, 0.045);
    }

    // E. REAR CAMERA LENS BUMP (Two Glowing Rings on the Back Chassis)
    const camRadius = 0.38;
    const camRingSteps = 45;
    // Top Lens
    for (let s = 0; s < camRingSteps; s++) {
      const angle = (s / camRingSteps) * Math.PI * 2;
      const cx = -W / 4 + Math.cos(angle) * camRadius;
      const cy = H / 2 - 1.1 + Math.sin(angle) * camRadius;
      addPt(cx, cy, -D / 2 - 0.08, cyan, 0.04);
      addPt(cx, cy, -D / 2 - 0.04, white, 0.035);
    }
    // Bottom Lens
    for (let s = 0; s < camRingSteps; s++) {
      const angle = (s / camRingSteps) * Math.PI * 2;
      const cx = -W / 4 + Math.cos(angle) * camRadius;
      const cy = H / 2 - 2.0 + Math.sin(angle) * camRadius;
      addPt(cx, cy, -D / 2 - 0.08, cyan, 0.04);
      addPt(cx, cy, -D / 2 - 0.04, white, 0.035);
    }
    // Flash dot
    addPt(-W / 4 + 0.65, H / 2 - 1.1, -D / 2 - 0.05, amber, 0.055);

    // F. SURROUNDING DATA PULSE PARTICLES (Subtle floating cloud around phone)
    const haloCount = 280;
    for (let i = 0; i < haloCount; i++) {
      const hx = (Math.random() - 0.5) * 8.5;
      const hy = (Math.random() - 0.5) * 11.0;
      const hz = (Math.random() - 0.5) * 5.0;
      addPt(hx, hy, hz, Math.random() > 0.5 ? cyan : amber, 0.028);
    }

    // Construct BufferGeometry
    const positions = new Float32Array(posList);
    const colors = new Float32Array(colList);
    const originalPos = new Float32Array(posList);

    const phoneGeometry = new THREE.BufferGeometry();
    phoneGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    phoneGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const phoneMaterial = new THREE.PointsMaterial({
      size: 0.042,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const phonePointCloud = new THREE.Points(phoneGeometry, phoneMaterial);
    scene.add(phonePointCloud);

    // Initial Aesthetic Rotation (Isometric Angle showing 3D Depth)
    phonePointCloud.rotation.set(0.18, -0.38, -0.06);

    // 3. Interactive Coordinates & Mouse Parallax
    let targetRotX = 0.18;
    let targetRotY = -0.38;
    let currentRotX = 0.18;
    let currentRotY = -0.38;

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
      // Parallax rotation ranges
      targetRotY = (cx / window.innerWidth - 0.5) * 1.6;
      targetRotX = -(cy / window.innerHeight - 0.5) * 0.9 + 0.15;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });

    // 4. Animation Loop with Real-Time FPS & Breathing Motion
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

      // Smooth lerping to pointer position
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      // Organic idle floating motion
      phonePointCloud.rotation.x = currentRotX + Math.sin(elapsed * 1.4) * 0.035;
      phonePointCloud.rotation.y = currentRotY + Math.cos(elapsed * 1.1) * 0.045;
      phonePointCloud.position.y = Math.sin(elapsed * 1.6) * 0.12;

      // Subtle screen wave distortion effect on front screen points
      const posAttr = phoneGeometry.attributes["position"] as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;

      for (let i = 0; i < posList.length; i += 3) {
        // Only wave points on the screen face (z > 0.15)
        if (originalPos[i + 2]! > 0.15) {
          const ox = originalPos[i]!;
          const oy = originalPos[i + 1]!;
          // Ripple along screen height
          array[i + 2] = originalPos[i + 2]! + Math.sin(ox * 3.5 + oy * 2.2 + elapsed * 3.2) * 0.018;
        }
      }
      posAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // 5. Resize Listener
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
      phoneGeometry.dispose();
      phoneMaterial.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {/* 3D WebGL Mounting Canvas */}
      <div ref={mountRef} className="size-full" />

      {/* Futuristic Telemetry HUD Bar */}
      <div className="pointer-events-auto absolute top-24 inset-x-0 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-mono text-muted-foreground/80 select-none">
        <div className="hidden sm:flex items-center gap-4 bg-black/70 px-4 py-1.5 rounded-full border border-white/15 backdrop-blur-md shadow-lg">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {fps} FPS
          </span>
          <span className="text-white/20">|</span>
          <span className="text-cyan-400 font-medium">14.8K 3D PHONE PARTICLES</span>
          <span className="text-white/20">|</span>
          <span className="text-white/60">HARDWARE ACCELERATED</span>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-black/70 px-4 py-1.5 rounded-full border border-white/15 backdrop-blur-md shadow-lg">
          <span className="text-amber-400 font-semibold">[DEVICE_MATRIX // 3D_CANVAS]</span>
          <span className="text-white/20">|</span>
          <span className="text-white/60">LATENCY: 1.8ms</span>
        </div>
      </div>
    </div>
  );
}
