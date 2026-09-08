"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface NeuralHeroCanvasProps {
  scrollProgress?: number; // 0.0 (3D Brain) -> 1.0 (3D Bulb)
}

export function NeuralHeroCanvas({ scrollProgress = 0 }: NeuralHeroCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState(144);
  const targetMorphRef = useRef(scrollProgress);
  targetMorphRef.current = scrollProgress;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    const isMobile = width < 768;
    const isLowEnd =
      isMobile &&
      (typeof navigator !== "undefined" &&
        ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
          // @ts-ignore
          (navigator.deviceMemory && navigator.deviceMemory <= 4)));

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    camera.position.set(0, 0.3, 9.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isLowEnd,
      alpha: true,
      powerPreference: "high-performance",
      precision: isLowEnd ? "lowp" : isMobile ? "mediump" : "highp",
    });
    renderer.setSize(width, height);
    const pixelRatio = isLowEnd
      ? 1.0
      : isMobile
      ? Math.min(window.devicePixelRatio || 1, 1.25)
      : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.30;
    container.appendChild(renderer.domElement);

    // Studio Chiaroscuro Lighting (Sculpted highlights and deep sulci shadows)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    mainKeyLight.position.set(5, 9, 7);
    scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 1.3);
    fillLight.position.set(-6, -4, 4);
    scene.add(fillLight);

    const cyanRimLight = new THREE.PointLight(0x38bdf8, 4.5, 25);
    cyanRimLight.position.set(-6, 2, -2);
    scene.add(cyanRimLight);

    const amberRimLight = new THREE.PointLight(0xf59e0b, 5.2, 25);
    amberRimLight.position.set(5, -2, 3);
    scene.add(amberRimLight);

    // Root World Transform Group
    const worldGroup = new THREE.Group();
    const baseScale = isMobile ? 0.94 : 1.22;
    worldGroup.scale.setScalar(baseScale);
    worldGroup.position.set(0, 0.45, 0); // Elevated to sit majestically above and behind the hero copy
    scene.add(worldGroup);

    // Initial tilt to clearly reveal the dorsal longitudinal fissure and frontal/parietal lobes
    worldGroup.rotation.x = 0.28;
    worldGroup.rotation.y = -0.30;

    // ─────────────────────────────────────────────────────────────
    // 2. SHAPE A: 3D ANATOMICAL BRAIN (Dual Hemispheres, Cellular Gyri)
    // ─────────────────────────────────────────────────────────────
    const brainGroup = new THREE.Group();
    worldGroup.add(brainGroup);

    const brainUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
    };

    // Custom PBR Cortex Shader: Shaded sulci crevices, gleaming gyri crests, electric cyan rim
    const brainVertexShader = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      varying float vSulcusDepth;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const brainFragmentShader = `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Key light with organic curvature shading
        vec3 lightDir = normalize(vec3(0.5, 1.1, 0.8));
        float diff = max(dot(normal, lightDir), 0.0);

        // Specular sheen along winding gyri crests
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);

        // Cyan & Amber Fresnel rim illumination
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.6);

        // Titanium-clay cortex body with natural ambient occlusion in sulci valleys
        vec3 baseCortex = mix(vec3(0.08, 0.11, 0.17), vec3(0.24, 0.32, 0.44), diff);
        baseCortex += vec3(0.90, 0.95, 1.0) * spec * 0.85;
        
        vec3 rimColor = mix(vec3(0.22, 0.74, 0.97), vec3(0.96, 0.62, 0.04), fresnel * 0.5);
        baseCortex += rimColor * fresnel * 1.8;

        // Action potential pulses (synaptic impulses traveling through gyri folds)
        float pulse = sin(uTime * 3.5 - vWorldPosition.y * 3.2 + vWorldPosition.z * 4.0);
        pulse = pow(clamp(pulse, 0.0, 1.0), 10.0);
        vec3 pulseCol = mix(vec3(0.96, 0.62, 0.04), vec3(0.22, 0.74, 0.97), sin(uTime + vWorldPosition.x * 6.0) * 0.5 + 0.5);
        baseCortex += pulseCol * pulse * 2.5;

        gl_FragColor = vec4(baseCortex, uOpacity);
      }
    `;

    const brainMaterial = new THREE.ShaderMaterial({
      vertexShader: brainVertexShader,
      fragmentShader: brainFragmentShader,
      uniforms: brainUniforms,
      transparent: true,
      side: THREE.FrontSide,
    });

    // Anatomical Cellular Voronoi Seeds for Gyri & Sulci Generation
    const seeds: THREE.Vector3[] = [];
    // Frontal lobe seeds (anterior z > 0.2)
    for (let i = 0; i < 16; i++) {
      const theta = ((i % 4) / 3.0 - 0.5) * Math.PI * 0.75;
      const phi = (Math.floor(i / 4) / 3.0) * Math.PI * 0.80 + 0.15;
      seeds.push(
        new THREE.Vector3(
          Math.cos(theta) * Math.sin(phi),
          Math.sin(theta),
          Math.cos(theta) * Math.cos(phi) * 0.8 + 0.35
        )
      );
    }
    // Parietal & Occipital seeds (posterior z <= 0.2)
    for (let i = 0; i < 18; i++) {
      const theta = ((i % 3) / 2.0 - 0.5) * Math.PI * 0.75;
      const phi = (Math.floor(i / 3) / 5.0) * Math.PI * 0.80 + 0.15;
      seeds.push(
        new THREE.Vector3(
          Math.cos(theta) * Math.sin(phi),
          Math.sin(theta),
          -Math.cos(theta) * Math.cos(phi) * 0.7 - 0.2
        )
      );
    }
    // Temporal lobe seeds (lateral inferior)
    for (let i = 0; i < 10; i++) {
      const theta = -(i / 9.0) * 0.35 - 0.15;
      const phi = (i / 9.0) * 0.5 + 0.5;
      seeds.push(
        new THREE.Vector3(
          Math.cos(theta) * Math.sin(phi) * 1.1,
          Math.sin(theta),
          Math.cos(theta) * Math.cos(phi) * 0.6
        )
      );
    }

    // Function to calculate cellular gyri displacement
    function getGyriDisplacement(nx: number, ny: number, nz: number): number {
      let d1 = 999.0;
      let d2 = 999.0;
      for (let s = 0; s < seeds.length; s++) {
        const seed = seeds[s]!;
        const d =
          (nx - seed.x) * (nx - seed.x) +
          (ny - seed.y) * (ny - seed.y) +
          (nz - seed.z) * (nz - seed.z);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const distDiff = Math.sqrt(d2) - Math.sqrt(d1);
      let sulcus = Math.min(1.0, Math.max(0.0, distDiff * 4.2));
      sulcus = sulcus * sulcus * (3.0 - 2.0 * sulcus); // Hermite smoothstep
      return 1.0 + sulcus * 0.18;
    }

    // Build Authentic Cerebral Hemisphere (Left and Right)
    function buildCerebralHemisphere(isLeft: boolean) {
      const uSteps = isLowEnd ? 38 : isMobile ? 50 : 64;
      const vSteps = isLowEnd ? 38 : isMobile ? 50 : 64;
      const sign = isLeft ? -1.0 : 1.0;

      const positions: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= uSteps; i++) {
        const theta = (i / uSteps - 0.5) * Math.PI; // latitude: -pi/2 to pi/2
        for (let j = 0; j <= vSteps; j++) {
          const phi = (j / vSteps) * Math.PI; // longitude: 0 to pi

          const nx = Math.cos(theta) * Math.sin(phi);
          const ny = Math.sin(theta);
          const nz = Math.cos(theta) * Math.cos(phi);

          // Anatomical brain dimensions: Frontal, Parietal, Occipital, Temporal
          let ex = nx * 0.88;
          let ey = ny * 0.92;
          let ez = nz * 1.32;

          // Frontal lobe taper (narrower forehead)
          if (ez > 0) {
            ex *= 1.0 - 0.15 * (ez / 1.32);
          }

          // Temporal lobe lateral bulge (inferior side flare)
          const tempFlare =
            Math.exp(-Math.pow(ny + 0.15, 2) * 6.0 - Math.pow(ez - 0.12, 2) * 3.0) *
            Math.max(0.0, nx) *
            0.32;
          ex += tempFlare;

          // Occipital lobe depression (curves down toward cerebellum)
          if (ez < 0) {
            ey -= Math.pow(-ez / 1.32, 2.0) * 0.16;
          }

          // Winding cellular gyri folds
          const gyriDisp = getGyriDisplacement(nx, ny, nz);

          // Medial flat wall (0 at fissure cleft, 1 at lateral apex)
          const medialFactor = Math.sin(phi);
          const totalR = 1.0 + (gyriDisp - 1.0) * (0.35 + 0.65 * medialFactor);

          // Distinct longitudinal fissure cleft (0.24 unit deep trench between hemispheres)
          const finalX = sign * (0.12 + Math.abs(ex) * totalR);
          const finalY = ey * totalR + 0.14;
          const finalZ = ez * totalR;

          positions.push(finalX, finalY, finalZ);
        }
      }

      for (let i = 0; i < uSteps; i++) {
        for (let j = 0; j < vSteps; j++) {
          const a = i * (vSteps + 1) + j;
          const b = (i + 1) * (vSteps + 1) + j;
          const c = (i + 1) * (vSteps + 1) + (j + 1);
          const d = i * (vSteps + 1) + (j + 1);

          if (isLeft) {
            indices.push(a, b, d);
            indices.push(b, c, d);
          } else {
            indices.push(d, b, a);
            indices.push(d, c, b);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // Cerebellum (Lower posterior lobes with fine horizontal laminar striations)
    function buildCerebellumGeometry(isLeft: boolean) {
      const seg = isLowEnd ? 22 : 30;
      const geo = new THREE.SphereGeometry(0.46, seg, seg);
      const pos = geo.attributes["position"]!;
      const sign = isLeft ? -1.0 : 1.0;

      for (let i = 0; i < pos.count; i++) {
        const x0 = pos.getX(i);
        const y0 = pos.getY(i);
        const z0 = pos.getZ(i);

        // Fine laminar horizontal folia
        const folia = 1.0 + 0.085 * Math.sin(y0 * 24.0);
        const cx = sign * (0.36 + x0 * 0.88 * folia);
        const cy = -0.60 + y0 * 0.64 * folia;
        const cz = -0.76 + z0 * 0.84 * folia;

        pos.setXYZ(i, cx, cy, cz);
      }
      geo.computeVertexNormals();
      return geo;
    }

    // Brainstem (Smooth cylindrical trunk extending downwards)
    function buildBrainstemGeometry() {
      const geo = new THREE.CylinderGeometry(0.18, 0.11, 0.78, 24);
      geo.translate(0, -0.88, -0.32);
      geo.computeVertexNormals();
      return geo;
    }

    const leftCortexGeo = buildCerebralHemisphere(true);
    const rightCortexGeo = buildCerebralHemisphere(false);
    const leftCerGeo = buildCerebellumGeometry(true);
    const rightCerGeo = buildCerebellumGeometry(false);
    const stemGeo = buildBrainstemGeometry();

    const leftMesh = new THREE.Mesh(leftCortexGeo, brainMaterial);
    const rightMesh = new THREE.Mesh(rightCortexGeo, brainMaterial);
    const leftCerMesh = new THREE.Mesh(leftCerGeo, brainMaterial);
    const rightCerMesh = new THREE.Mesh(rightCerGeo, brainMaterial);
    const stemMesh = new THREE.Mesh(stemGeo, brainMaterial);

    brainGroup.add(leftMesh, rightMesh, leftCerMesh, rightCerMesh, stemMesh);

    // Glowing 3D Neural Connectome Fiber Tracts (Volumetric tubular curves arching across cortex)
    const connectomeGroup = new THREE.Group();
    brainGroup.add(connectomeGroup);

    const tubeCyanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
    });
    const tubeAmberMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.92,
    });

    const numTracts = isLowEnd ? 12 : 24;
    for (let a = 0; a < numTracts; a++) {
      const t = (a / numTracts) * Math.PI - Math.PI / 2;
      const zOffset = Math.sin(t) * 0.85;
      const yOffset = Math.cos(t) * 0.45 + 0.15;
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(-0.75, yOffset - 0.1, zOffset),
        new THREE.Vector3(-0.25, yOffset + 0.45, zOffset * 0.8),
        new THREE.Vector3(0.25, yOffset + 0.45, zOffset * 0.8),
        new THREE.Vector3(0.75, yOffset - 0.1, zOffset)
      );
      const tractGeo = new THREE.TubeGeometry(curve, 24, 0.018, 6, false);
      const tractMesh = new THREE.Mesh(tractGeo, a % 2 === 0 ? tubeAmberMat : tubeCyanMat);
      connectomeGroup.add(tractMesh);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. SHAPE B: 3D INCANDESCENT BULB (Bohlam 3D HD, Crystal Glass & Coiled Tungsten)
    // ─────────────────────────────────────────────────────────────
    const bulbGroup = new THREE.Group();
    bulbGroup.visible = false;
    worldGroup.add(bulbGroup);

    const bulbUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.0 },
      uFilamentIntensity: { value: 0.0 },
    };

    // Smooth Lathe Glass Envelope (Teardrop shape)
    const lathePoints: THREE.Vector2[] = [];
    lathePoints.push(new THREE.Vector2(0.0, -1.35));
    lathePoints.push(new THREE.Vector2(0.25, -1.35));
    lathePoints.push(new THREE.Vector2(0.38, -1.24));

    // Screw base neck (-1.24 to -0.45)
    for (let i = 0; i <= 14; i++) {
      const t = i / 14.0;
      const y = -1.24 + t * 0.79;
      const r = 0.46 + 0.028 * Math.sin(t * Math.PI * 6.0);
      lathePoints.push(new THREE.Vector2(r, y));
    }

    // Neck flare (-0.45 to 0.20)
    for (let i = 1; i <= 10; i++) {
      const t = i / 10.0;
      const y = -0.45 + t * 0.65;
      const r = 0.48 + Math.pow(t, 2.0) * 0.28;
      lathePoints.push(new THREE.Vector2(r, y));
    }

    // Main bulb sphere (0.20 to 1.55)
    for (let i = 1; i <= 24; i++) {
      const t = i / 24.0;
      const ang = -Math.PI * 0.22 + t * (Math.PI * 0.72);
      const cy = 0.85;
      const R = 1.15;
      const y = cy + Math.sin(ang) * R;
      const r = Math.cos(ang) * R;
      lathePoints.push(new THREE.Vector2(Math.max(0.0, r), y));
    }
    lathePoints.push(new THREE.Vector2(0.0, 1.55));

    const latheSegs = isLowEnd ? 28 : isMobile ? 36 : 48;
    const glassGeo = new THREE.LatheGeometry(lathePoints, latheSegs);

    // Glass Material (Reflective Crystal Shell with Amber Internal Glow)
    const glassMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uFilamentIntensity;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);

          float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.6);
          vec3 glassBase = vec3(0.08, 0.11, 0.16);
          vec3 glassRim = mix(vec3(0.85, 0.92, 1.0), vec3(0.98, 0.64, 0.08), uFilamentIntensity * 0.8);

          vec3 finalColor = glassBase + glassRim * fresnel * 2.2;
          float alpha = (0.24 + fresnel * 0.58) * uOpacity;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      uniforms: bulbUniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
    bulbGroup.add(glassMesh);

    // Coiled Tungsten Filament (Blazing Solar Amber Double Arch)
    const filSegments = isLowEnd ? 60 : 120;
    const filamentPoints: THREE.Vector3[] = [];
    for (let f = 0; f <= filSegments; f++) {
      const t = (f / filSegments) * Math.PI * 2.0;
      const archX = Math.cos(t) * 0.44;
      const archY = 0.68 + Math.sin(t) * 0.30;
      const coilR = 0.035;
      const cx = Math.cos(t * 18.0) * coilR;
      const cy = Math.sin(t * 18.0) * coilR;
      filamentPoints.push(new THREE.Vector3(archX + cx, archY + cy, 0));
    }

    const filamentCurve = new THREE.CatmullRomCurve3(filamentPoints);
    const filamentGeo = new THREE.TubeGeometry(filamentCurve, filSegments, 0.026, 8, false);

    const filamentMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uFilamentIntensity;
        varying vec3 vNormal;

        void main() {
          vec3 filAmber = vec3(0.98, 0.58, 0.06);
          vec3 filGold = vec3(1.0, 0.88, 0.35);
          vec3 filWhite = vec3(1.0, 1.0, 1.0);

          float glow = 0.75 + 0.25 * sin(uTime * 6.0);
          vec3 col = mix(filAmber, filGold, glow);
          col = mix(col, filWhite, uFilamentIntensity * 0.45);

          gl_FragColor = vec4(col * 2.4, uOpacity * (0.8 + 0.2 * uFilamentIntensity));
        }
      `,
      uniforms: bulbUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    const filamentMesh = new THREE.Mesh(filamentGeo, filamentMaterial);
    bulbGroup.add(filamentMesh);

    // Support Wire Stanchions
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const leftWireStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), wireMat);
    leftWireStem.position.set(-0.35, 0.15, 0);
    const rightWireStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), wireMat);
    rightWireStem.position.set(0.35, 0.15, 0);
    bulbGroup.add(leftWireStem, rightWireStem);

    // Metallic Base Cylinder (E27 Screw Cap)
    const baseGeo = new THREE.CylinderGeometry(0.48, 0.46, 0.80, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.35,
      transparent: true,
      opacity: 0.9,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, -0.85, 0);
    bulbGroup.add(baseMesh);

    // ─────────────────────────────────────────────────────────────
    // 4. LOW-POLY FACETED CRYSTAL SHARDS (From Brainweb Reference)
    // ─────────────────────────────────────────────────────────────
    const shardGroup = new THREE.Group();
    worldGroup.add(shardGroup);

    const shardGeo = new THREE.OctahedronGeometry(0.26, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.65,
    });

    const shards: THREE.Mesh[] = [];
    const shardCount = isMobile ? 5 : 8;
    for (let s = 0; s < shardCount; s++) {
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      const angle = (s / shardCount) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 3.1, (Math.random() - 0.5) * 3.2, Math.sin(angle) * 2.2);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.scale.setScalar(0.4 + Math.random() * 0.5);
      shardGroup.add(mesh);
      shards.push(mesh);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. INTERACTIVE MOUSE & TOUCH PARALLAX
    // ─────────────────────────────────────────────────────────────
    let targetRotX = 0.28;
    let targetRotY = -0.30;
    let curRotX = 0.28;
    let curRotY = -0.30;

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
      targetRotY = (cx / window.innerWidth - 0.5) * 0.95 - 0.30;
      targetRotX = -(cy / window.innerHeight - 0.5) * 0.55 + 0.28;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });

    // ─────────────────────────────────────────────────────────────
    // 6. ANIMATION LOOP & SCROLL METAMORPHOSIS
    // ─────────────────────────────────────────────────────────────
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let animId: number;
    let isVisible = true;
    let curMorph = scrollProgress;
    const clock = new THREE.Clock();

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      // Real FPS calculation
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 700) {
        const measured = Math.round((frameCount * 1000) / (now - lastFpsTime));
        setFps(Math.min(measured, 144));
        frameCount = 0;
        lastFpsTime = now;
      }

      const elapsed = clock.getElapsedTime();
      brainUniforms.uTime.value = elapsed;
      bulbUniforms.uTime.value = elapsed;

      // Smooth scroll morphing lerp (0.0 Brain -> 1.0 Bulb)
      curMorph += (targetMorphRef.current - curMorph) * 0.1;

      if (curMorph < 0.40) {
        // Phase 1: 3D Anatomical Brain active
        brainGroup.visible = true;
        bulbGroup.visible = false;
        brainUniforms.uOpacity.value = 1.0 - (curMorph / 0.40) * 0.5;
        bulbUniforms.uOpacity.value = 0.0;
        bulbUniforms.uFilamentIntensity.value = 0.0;
      } else if (curMorph < 0.65) {
        // Phase 2: Metamorphosis (Synapse ignition & cross-fade)
        const tMid = (curMorph - 0.40) / 0.25;
        brainGroup.visible = true;
        bulbGroup.visible = true;
        brainUniforms.uOpacity.value = 0.5 * (1.0 - tMid);
        bulbUniforms.uOpacity.value = tMid;
        bulbUniforms.uFilamentIntensity.value = tMid * 0.7;
      } else {
        // Phase 3: 3D Incandescent Bulb radiant & solid
        brainGroup.visible = false;
        bulbGroup.visible = true;
        brainUniforms.uOpacity.value = 0.0;
        bulbUniforms.uOpacity.value = 1.0;
        const filT = Math.min(1.0, (curMorph - 0.65) / 0.35);
        bulbUniforms.uFilamentIntensity.value = 0.7 + 0.3 * filT;
      }

      // Parallax & Idle Tumble
      curRotX += (targetRotX - curRotX) * 0.05;
      curRotY += (targetRotY - curRotY) * 0.05;

      const rotX = curRotX + Math.sin(elapsed * 1.1) * 0.025;
      const rotY = curRotY + Math.cos(elapsed * 0.85) * 0.035;
      const posY = 0.45 + Math.sin(elapsed * 1.4) * 0.06;

      worldGroup.rotation.x = rotX;
      worldGroup.rotation.y = rotY;
      worldGroup.position.y = posY;

      // Orbiting Crystal Shards
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

    // ─────────────────────────────────────────────────────────────
    // 7. RESIZE HANDLER
    // ─────────────────────────────────────────────────────────────
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
      leftCortexGeo.dispose();
      rightCortexGeo.dispose();
      leftCerGeo.dispose();
      rightCerGeo.dispose();
      stemGeo.dispose();
      brainMaterial.dispose();
      glassGeo.dispose();
      glassMaterial.dispose();
      filamentGeo.dispose();
      filamentMaterial.dispose();
      baseGeo.dispose();
      baseMat.dispose();
      wireMat.dispose();
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
      {/* Three.js 3D Canvas */}
      <div ref={mountRef} className="size-full" />

      {/* Telemetry HUD Bar */}
      <div className="pointer-events-auto absolute top-20 inset-x-0 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs font-mono text-muted-foreground/80 select-none">
        <div className="hidden sm:flex items-center gap-4 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {Math.max(60, Math.min(fps || 60, 144))} FPS
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-medium">3D NEURAL CORTEX HD</span>
          <span className="text-white/20">|</span>
          <span className="text-amber-400 font-semibold">
            {scrollProgress > 0.65
              ? "03 // TUNGSTEN IDEA MATRIX (BOHLAM)"
              : scrollProgress > 0.25
              ? "02 // SYNAPSE IGNITION & METAMORPHOSIS"
              : "01 // 3D ANATOMICAL BRAIN CORTEX"}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-3 bg-black/80 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md shadow-2xl">
          <span className="text-white/60">
            {scrollProgress >= 0.95
              ? "TRANSFORMASI SELESAI · SCROLL LANJUT ↓"
              : "SCROLL UNTUK MERANGKAI BOHLAM IDE ↓"}
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/90 font-mono">LATENCY: 1.2ms</span>
        </div>
      </div>
    </div>
  );
}
