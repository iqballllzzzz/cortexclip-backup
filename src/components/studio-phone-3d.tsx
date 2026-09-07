"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function StudioPhone3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 380;
    let height = container.clientHeight || 520;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.5);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xf59e0b, 3.5); // Solar amber light
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.0); // Subtle blue-white rim light
    rimLight.position.set(-5, -3, 3);
    scene.add(rimLight);

    // 4. Phone Mesh (Rounded chassis)
    const phoneGroup = new THREE.Group();
    scene.add(phoneGroup);

    // Shape for rounded chassis
    const w = 2.4;
    const h = 4.8;
    const radius = 0.35;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + radius, -h / 2);
    shape.lineTo(w / 2 - radius, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
    shape.lineTo(w / 2, h / 2 - radius);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
    shape.lineTo(-w / 2 + radius, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
    shape.lineTo(-w / 2, -h / 2 + radius);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);

    const extrudeSettings = {
      depth: 0.18,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    };

    const phoneGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    phoneGeo.center();

    // Matte Titanium Obsidian Body
    const phoneMat = new THREE.MeshStandardMaterial({
      color: 0x121318,
      metalness: 0.85,
      roughness: 0.25,
    });
    const phoneMesh = new THREE.Mesh(phoneGeo, phoneMat);
    phoneGroup.add(phoneMesh);

    // Screen (Glossy glass)
    const screenGeo = new THREE.PlaneGeometry(2.28, 4.62);
    const screenMat = new THREE.MeshPhysicalMaterial({
      color: 0x050608,
      metalness: 0.1,
      roughness: 0.15,
      transmission: 0.1,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.z = 0.132;
    phoneGroup.add(screenMesh);

    // Dynamic Island / Top Speaker Notch
    const notchGeo = new THREE.PlaneGeometry(0.55, 0.14);
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const notchMesh = new THREE.Mesh(notchGeo, notchMat);
    notchMesh.position.set(0, 2.05, 0.134);
    phoneGroup.add(notchMesh);

    // Holographic Grid Particles around Phone
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 8;
      positions[i + 1] = (Math.random() - 0.5) * 8;
      positions[i + 2] = (Math.random() - 0.5) * 4;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.045,
      transparent: true,
      opacity: 0.45,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Initial slight rotation
    phoneGroup.rotation.set(0.12, -0.22, -0.04);

    // Mouse Interaction
    let targetRotX = 0.12;
    let targetRotY = -0.22;
    let currentRotX = 0.12;
    let currentRotY = -0.22;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotY = x * 0.45;
      targetRotX = -y * 0.35 + 0.1;
    };

    window.addEventListener("mousemove", handleMouseMove);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth lerp to mouse coordinates
      currentRotX += (targetRotX - currentRotX) * 0.06;
      currentRotY += (targetRotY - currentRotY) * 0.06;

      // Floating gentle breathing motion
      phoneGroup.rotation.x = currentRotX + Math.sin(elapsed * 1.5) * 0.03;
      phoneGroup.rotation.y = currentRotY + Math.cos(elapsed * 1.2) * 0.04;
      phoneGroup.position.y = Math.sin(elapsed * 1.8) * 0.08;

      // Rotate subtle particles
      particles.rotation.y = elapsed * 0.04;
      particles.rotation.x = elapsed * 0.02;

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || 380;
      height = container.clientHeight || 520;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      phoneGeo.dispose();
      screenGeo.dispose();
      notchGeo.dispose();
      particleGeo.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative size-full min-h-[460px] sm:min-h-[520px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
    >
      {/* Interactive Helper Cue */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-20">
        <span className="text-[11px] font-mono font-medium text-white/50 bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm">
          WebGL 3D Interactive · Geser Kursor
        </span>
      </div>
    </div>
  );
}
