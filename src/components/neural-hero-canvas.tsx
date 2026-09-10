"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface NeuralHeroCanvasProps {
  scrollProgress?: number;
}

export function NeuralHeroCanvas({ scrollProgress = 0 }: NeuralHeroCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const targetRotY = useRef(0);
  const isVisible = useRef(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    const isMobile = width < 768;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8);

    // KUNCI OPTIMASI: MATIKAN ANTIALIAS DAN BATASI PIXEL RATIO = 1 DI MOBILE
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    // 2. Lighting (Sederhana)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xf59e0b, 1.5);
    keyLight.position.set(5, 5, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
    fillLight.position.set(-5, -5, 2);
    scene.add(fillLight);

    // 3. Lightweight Geometry (Abstract Polyhedron)
    const group = new THREE.Group();
    scene.add(group);

    // Solid core (MeshLambertMaterial JAUH lebih enteng dari MeshPhysical)
    const coreGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const coreMat = new THREE.MeshLambertMaterial({
      color: 0x141414,
      emissive: 0x221100,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // Outer wireframe cage
    const wireGeo = new THREE.IcosahedronGeometry(2.0, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    group.add(wireMesh);

    // Inner glowing nodes (points)
    const pointsGeo = new THREE.IcosahedronGeometry(1.8, 1);
    const pointsMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
    });
    const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
    group.add(pointsMesh);

    group.position.y = 0.5;

    // 4. Animation Loop dengan Pausing (Intersection Observer)
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // KUNCI OPTIMASI 2: Jangan render jika elemen di luar layar!
      if (!isVisible.current) return;

      const time = clock.getElapsedTime();

      // Base idle rotation
      group.rotation.x = Math.sin(time * 0.3) * 0.2;
      
      // Smooth interpolation for scroll rotation
      const diff = targetRotY.current - group.rotation.y;
      group.rotation.y += diff * 0.05 + 0.003; // Slowly rotating

      // Simplifikasi efek pulse
      const pulse = (Math.sin(time * 2.0) + 1.0) * 0.5;
      wireMat.opacity = 0.1 + pulse * 0.15;
      pointsMat.opacity = 0.3 + pulse * 0.3;

      renderer.render(scene, camera);
    };
    animate();

    // 5. Intersection Observer untuk mematikan render saat di scroll ke bawah
    const observer = new IntersectionObserver(
      (entries) => {
        isVisible.current = entries[0].isIntersecting;
      },
      { threshold: 0 }
    );
    observer.observe(container);

    // 6. Resize Handling
    const handleResize = () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
      
      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      pointsGeo.dispose();
      pointsMat.dispose();
      
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update target rotation based on scroll progress from parent
  useEffect(() => {
    targetRotY.current = scrollProgress * Math.PI * 2;
  }, [scrollProgress]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 z-0 flex items-center justify-center opacity-70 mix-blend-screen transition-opacity duration-1000"
      aria-hidden="true"
    />
  );
}
