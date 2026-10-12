const THREE_MODULE = "https://esm.sh/three@0.180.0";
const DESKTOP_MOTION_QUERY =
  "(min-width: 1034px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const heroes = [...document.querySelectorAll(".dgh-copy-hero")];

  if (!heroes.length) return;

  const exitQuery = window.matchMedia(DESKTOP_MOTION_QUERY);
  const readExit = (hero) => {
    const wrap = hero.parentElement;
    if (!exitQuery.matches || !wrap?.classList.contains("dgh-hero-scroll")) return 0;
    const bounds = wrap.getBoundingClientRect();
    const travel = bounds.height - window.innerHeight;
    return travel > 0 ? Math.min(Math.max(-bounds.top / travel, 0), 1) : 0;
  };

  const floodLevel = (exit) => {
    const progress = Math.min(exit / 0.78, 1);
    return progress * progress * (3 - 2 * progress) * 1.12;
  };

  const updateFlood = (hero, exit, time) => {
    const flood = hero.querySelector(".dgh-copy-hero__flood");
    if (!flood) return;
    const level = floodLevel(exit);
    if (level <= 0) {
      flood.style.clipPath = "inset(100% 0 0 0)";
      return;
    }
    const surface = (1 - level) * 100;
    const swell = 2.4 * (1 - Math.min(Math.max((level - 0.9) / 0.2, 0), 1));
    const points = ["0% 100%"];
    for (let x = 0; x <= 100; x += 5) {
      const y = surface + Math.sin(x * 0.09 + time * 1.6) * swell + Math.sin(x * 0.23 - time * 1.1) * swell * 0.5;
      points.push(`${x}% ${y.toFixed(2)}%`);
    }
    points.push("100% 100%");
    flood.style.clipPath = `polygon(${points.join(",")})`;
    flood.style.setProperty("--dgh-flood-top", `${(surface - swell).toFixed(2)}%`);
  };

  const titleFontsReady = document.fonts
    ? Promise.allSettled([
        document.fonts.load('500 46px "Noto Sans Display"', "A BRAND, DIGITAL & MOTION STUDIO"),
        document.fonts.load('italic 220px "GFS Didot"', "ΔΗΜΙΟΥΡΓΟΥΜΕ ΤΟ"),
        document.fonts.load('500 240px "Noto Sans Display"', "ΑΠΡΟΒΛΕΠΤΟ")
      ])
    : Promise.resolve();

  Promise.all([import(THREE_MODULE), titleFontsReady])
    .then(([THREE]) => {
      heroes.forEach((hero) => {
        initializeFlowBackground(hero, THREE);
        initializeInteractiveTitle(hero, THREE);
      });
    })
    .catch((error) => {
      console.warn("DigiGlow hero WebGL could not start", error);
    });

  function initializeFlowBackground(hero, THREE) {
    if (hero.dataset.dghFlowInitialized === "true") return;

    const stage = hero.querySelector(".dgh-copy-hero__flow-stage");
    const canvas = hero.querySelector(".dgh-copy-hero__flow-canvas");
    if (!stage || !canvas) return;

    hero.dataset.dghFlowInitialized = "true";

    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: true,
        powerPreference: "high-performance"
      });
    } catch {
      return;
    }

    const reduced = reduceMotion.matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const compact = window.matchMedia("(max-width: 1033px)").matches;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    const waveWorld = new THREE.Group();
    waveWorld.position.y = -0.72;
    scene.add(waveWorld);

    const columns = mobile ? 66 : compact ? 86 : 114;
    const rows = mobile ? 40 : compact ? 50 : 64;
    const pointPositions = [];
    const pointRandomness = [];

    for (let row = 0; row < rows; row += 1) {
      const rowProgress = row / Math.max(rows - 1, 1);
      const z = THREE.MathUtils.lerp(-8.8, 4.6, rowProgress);

      for (let column = 0; column < columns; column += 1) {
        const columnProgress = column / Math.max(columns - 1, 1);
        const x = THREE.MathUtils.lerp(-10.5, 10.5, columnProgress);
        const random = Math.abs(Math.sin((row * columns + column + 1) * 12.9898) * 43758.5453) % 1;

        pointPositions.push(x, 0, z);
        pointRandomness.push(random);
      }
    }

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pointPositions, 3)
    );
    pointGeometry.setAttribute(
      "aRandom",
      new THREE.Float32BufferAttribute(pointRandomness, 1)
    );
    pointGeometry.computeBoundingSphere();

    const linePositions = [];
    const lineRandomness = [];

    const appendLinePoint = (pointIndex) => {
      const positionIndex = pointIndex * 3;
      linePositions.push(
        pointPositions[positionIndex],
        pointPositions[positionIndex + 1],
        pointPositions[positionIndex + 2]
      );
      lineRandomness.push(pointRandomness[pointIndex]);
    };

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const current = row * columns + column;
        appendLinePoint(current);
        appendLinePoint(current + 1);
      }
    }

    for (let column = 0; column < columns; column += 4) {
      for (let row = 0; row < rows - 1; row += 1) {
        const current = row * columns + column;
        appendLinePoint(current);
        appendLinePoint(current + columns);
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    lineGeometry.setAttribute(
      "aRandom",
      new THREE.Float32BufferAttribute(lineRandomness, 1)
    );
    lineGeometry.computeBoundingSphere();

    const waveVertexShader = `
      precision highp float;

      attribute float aRandom;
      uniform float uTime;
      uniform float uLayer;
      uniform float uPointScale;
      uniform float uPointerStrength;
      uniform vec2 uPointer;
      uniform vec4 uSplashes[4];
      varying float vCrest;
      varying float vDepth;
      varying float vRandom;
      varying float vSunGlow;

      void main() {
        vec3 transformed = position;
        float waveA = sin(
          transformed.x * 0.72 +
          transformed.z * 0.16 +
          uTime * 0.52 +
          uLayer
        ) * 0.44;
        float waveB = sin(
          transformed.z * 1.05 -
          uTime * 0.38 +
          transformed.x * 0.2 +
          uLayer * 0.7
        ) * 0.28;
        float waveC = sin(
          (transformed.x + transformed.z) * 1.55 +
          uTime * 0.22 +
          uLayer * 1.3
        ) * 0.1;
        float diagonalWave = sin(
          transformed.x * 0.35 -
          transformed.z * 0.58 -
          uTime * 0.18 +
          uLayer * 0.45
        ) * 0.14;

        vec2 pointerCenter = vec2(
          uPointer.x * 8.5,
          mix(-6.4, 3.6, (uPointer.y + 1.0) * 0.5)
        );
        float pointerDistance = distance(transformed.xz, pointerCenter);
        float pointerWave = sin(pointerDistance * 2.6 - uTime * 1.15);
        pointerWave *= exp(-pointerDistance * 0.72) * uPointerStrength * 0.24;

        float splash = 0.0;
        for (int index = 0; index < 4; index++) {
          vec4 drop = uSplashes[index];
          float dropDistance = distance(transformed.xz, drop.xy);

          if (drop.z < 0.0) {
            float rise = 1.0 - clamp(-drop.z / 0.9, 0.0, 1.0);
            splash += exp(-dropDistance * dropDistance * 3.2) * rise * rise * 0.2 * drop.w;
          } else {
            float front = drop.z * 1.55;
            float ring = exp(-pow((dropDistance - front) * 2.4, 2.0)) *
              sin((dropDistance - front) * 7.5 - 1.2);
            float bulge = exp(-dropDistance * dropDistance * 6.0) * exp(-drop.z * 5.0) * 0.35;
            splash += (ring * 0.2 + bulge) * exp(-drop.z * 0.85) * drop.w;
          }
        }

        transformed.y = -0.82 + waveA + waveB + waveC + diagonalWave + pointerWave + splash;
        vCrest = smoothstep(-1.18, 0.18, transformed.y);
        vDepth = smoothstep(-9.0, -5.4, transformed.z);
        vDepth *= 1.0 - smoothstep(3.2, 4.65, transformed.z);
        vec2 sunClearingDelta = vec2(
          transformed.x / 3.5,
          (transformed.z + 5.7) / 3.0
        );
        float sunClearing = 1.0 - exp(-dot(sunClearingDelta, sunClearingDelta) * 1.35);
        vDepth *= smoothstep(0.04, 0.88, sunClearing);
        vRandom = aRandom;
        float reflectionProgress = smoothstep(-8.8, 4.6, transformed.z);
        float reflectionCenter = 0.0;
        float reflectionWidth = mix(0.62, 2.05, reflectionProgress);
        float reflectionDistance = (transformed.x - reflectionCenter) / reflectionWidth;
        float reflectionPulse = 0.72 + 0.28 * sin(
          transformed.z * 1.4 - uTime * 0.9 + transformed.x * 0.45
        );
        vSunGlow = exp(-reflectionDistance * reflectionDistance);
        vSunGlow *= (0.22 + vCrest * 0.78) * reflectionPulse * vDepth;
        vSunGlow += min(abs(splash) * 2.4, 0.85) * vDepth;

        vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(
          (0.22 + aRandom * 0.15 + vCrest * 0.13) *
          uPointScale * 148.0 / max(1.0, -viewPosition.z),
          1.25,
          6.2
        );
      }
    `;

    const pointFragmentShader = `
      precision highp float;

      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uCrestColor;
      uniform vec3 uSunColor;
      uniform float uOpacity;
      varying float vCrest;
      varying float vDepth;
      varying float vRandom;
      varying float vSunGlow;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceToCenter = length(point);
        float core = 1.0 - smoothstep(0.12, 0.46, distanceToCenter);
        float halo = 1.0 - smoothstep(0.08, 0.5, distanceToCenter);
        vec3 color = mix(uDeepColor, uMidColor, smoothstep(0.04, 0.72, vCrest));
        color = mix(color, uCrestColor, pow(vCrest, 4.0) * 0.62);
        color = mix(color, uSunColor, clamp(vSunGlow * 0.82, 0.0, 0.9));
        float shimmer = 0.72 + vRandom * 0.28;
        float alpha = (core * 0.92 + halo * 0.34) * uOpacity * vDepth * shimmer;
        alpha *= 1.0 + vSunGlow * 0.7;

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const lineFragmentShader = `
      precision highp float;

      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uCrestColor;
      uniform vec3 uSunColor;
      uniform float uOpacity;
      varying float vCrest;
      varying float vDepth;
      varying float vRandom;
      varying float vSunGlow;

      void main() {
        vec3 color = mix(uDeepColor, uMidColor, smoothstep(0.08, 0.76, vCrest));
        color = mix(color, uCrestColor, pow(vCrest, 5.0) * 0.48);
        color = mix(color, uSunColor, clamp(vSunGlow * 0.7, 0.0, 0.84));
        float alpha = uOpacity * vDepth * (0.44 + vCrest * 0.56);
        alpha *= 0.82 + vRandom * 0.18;
        alpha *= 1.0 + vSunGlow * 0.55;

        if (alpha < 0.008) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const materials = [];

    const createSplashSlots = () =>
      Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 99, 0));

    const createUniforms = (layer, opacity, splashes) => ({
      uTime: { value: 0 },
      uLayer: { value: layer },
      uPointScale: { value: renderer.getPixelRatio() },
      uPointerStrength: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uSplashes: { value: splashes },
      uDeepColor: { value: new THREE.Color(0xb00069) },
      uMidColor: { value: new THREE.Color(0xff0785) },
      uCrestColor: { value: new THREE.Color(0xffe4f3) },
      uSunColor: { value: new THREE.Color(0xfff4df) },
      uOpacity: { value: opacity }
    });

    const createWaveLayer = (settings) => {
      const splashes = createSplashSlots();
      const pointMaterial = new THREE.ShaderMaterial({
        uniforms: createUniforms(settings.phase, settings.pointOpacity, splashes),
        vertexShader: waveVertexShader,
        fragmentShader: pointFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const lineMaterial = new THREE.ShaderMaterial({
        uniforms: createUniforms(settings.phase, settings.lineOpacity, splashes),
        vertexShader: waveVertexShader,
        fragmentShader: lineFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const layer = new THREE.Group();
      const points = new THREE.Points(pointGeometry, pointMaterial);
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);

      layer.add(lines, points);
      layer.position.set(settings.x, settings.y, settings.z);
      layer.scale.setScalar(settings.scale);
      layer.rotation.y = settings.rotation;
      waveWorld.add(layer);
      materials.push(pointMaterial, lineMaterial);
      return { layer, splashes };
    };

    const frontWave = createWaveLayer({
      phase: 0,
      pointOpacity: 1,
      lineOpacity: 0.82,
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      rotation: -0.025
    });
    createWaveLayer({
      phase: 2.45,
      pointOpacity: 0.62,
      lineOpacity: 0.36,
      x: -0.35,
      y: 0.62,
      z: -2.4,
      scale: 1.08,
      rotation: 0.045
    });

    const sunTextures = [];
    const sunMaterials = [];

    const createSunTexture = (type, size) => {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = size;
      textureCanvas.height = size;
      const context = textureCanvas.getContext("2d");
      const center = size * 0.5;

      context.clearRect(0, 0, size, size);
      context.globalCompositeOperation = "lighter";

      if (type === "rays") {
        const aura = context.createRadialGradient(center, center, 0, center, center, center);
        aura.addColorStop(0, "rgba(255,255,255,0.62)");
        aura.addColorStop(0.08, "rgba(255,249,218,0.36)");
        aura.addColorStop(0.25, "rgba(255,194,91,0.11)");
        aura.addColorStop(1, "rgba(255,151,44,0)");
        context.fillStyle = aura;
        context.fillRect(0, 0, size, size);

        for (let rayIndex = 0; rayIndex < 112; rayIndex += 1) {
          const random = Math.abs(Math.sin((rayIndex + 1) * 91.731) * 43758.5453) % 1;
          const angle = (rayIndex / 112) * Math.PI * 2 + (random - 0.5) * 0.035;
          const innerRadius = size * (0.032 + random * 0.018);
          const outerRadius = size * (0.14 + random * 0.34);
          const startX = center + Math.cos(angle) * innerRadius;
          const startY = center + Math.sin(angle) * innerRadius;
          const endX = center + Math.cos(angle) * outerRadius;
          const endY = center + Math.sin(angle) * outerRadius;
          const rayGradient = context.createLinearGradient(startX, startY, endX, endY);

          rayGradient.addColorStop(0, `rgba(255,255,255,${0.18 + random * 0.2})`);
          rayGradient.addColorStop(0.22, `rgba(255,238,190,${0.1 + random * 0.12})`);
          rayGradient.addColorStop(1, "rgba(255,159,48,0)");
          context.beginPath();
          context.moveTo(startX, startY);
          context.lineTo(endX, endY);
          context.strokeStyle = rayGradient;
          context.lineWidth = 0.45 + random * 1.2;
          context.stroke();
        }

        [0, Math.PI * 0.5, Math.PI * 0.25, Math.PI * 0.75].forEach((angle, index) => {
          const length = size * (index < 2 ? 0.46 : 0.32);
          const startX = center - Math.cos(angle) * length;
          const startY = center - Math.sin(angle) * length;
          const endX = center + Math.cos(angle) * length;
          const endY = center + Math.sin(angle) * length;
          const beamGradient = context.createLinearGradient(startX, startY, endX, endY);

          beamGradient.addColorStop(0, "rgba(255,159,48,0)");
          beamGradient.addColorStop(0.46, "rgba(255,238,190,0.08)");
          beamGradient.addColorStop(0.5, "rgba(255,255,255,0.5)");
          beamGradient.addColorStop(0.54, "rgba(255,238,190,0.08)");
          beamGradient.addColorStop(1, "rgba(255,159,48,0)");
          context.beginPath();
          context.moveTo(startX, startY);
          context.lineTo(endX, endY);
          context.strokeStyle = beamGradient;
          context.lineWidth = index < 2 ? 1.8 : 0.9;
          context.stroke();
        });
      } else {
        const gradient = context.createRadialGradient(center, center, 0, center, center, center);

        if (type === "core") {
          gradient.addColorStop(0, "rgba(255,255,255,1)");
          gradient.addColorStop(0.12, "rgba(255,255,255,1)");
          gradient.addColorStop(0.28, "rgba(255,249,224,0.98)");
          gradient.addColorStop(0.52, "rgba(255,214,130,0.72)");
          gradient.addColorStop(0.78, "rgba(255,156,45,0.2)");
          gradient.addColorStop(1, "rgba(255,122,22,0)");
        } else {
          gradient.addColorStop(0, "rgba(255,255,255,0.58)");
          gradient.addColorStop(0.12, "rgba(255,244,204,0.46)");
          gradient.addColorStop(0.4, "rgba(255,187,75,0.18)");
          gradient.addColorStop(0.72, "rgba(255,126,27,0.055)");
          gradient.addColorStop(1, "rgba(0,0,0,0)");
        }

        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
      }

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      sunTextures.push(texture);
      return texture;
    };

    const coreTexture = createSunTexture("core", 512);
    const haloTexture = createSunTexture("halo", 512);
    const rayTexture = createSunTexture("rays", 1024);
    const sunGroup = new THREE.Group();
    const flareSprites = [];
    const sunBasePosition = new THREE.Vector3();
    let sunBaseScale = 1;

    const createSunSprite = (texture, scale, opacity, color = 0xffffff) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color,
        opacity,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(scale);
      sprite.renderOrder = 5;
      sunMaterials.push(material);
      return sprite;
    };

    const sunGlareSprite = createSunSprite(rayTexture, 13.2, 0.16, 0xffe7b0);
    const sunRaySprite = createSunSprite(rayTexture, 9.2, 0.64);
    const sunHaloSprite = createSunSprite(haloTexture, 5.6, 0.54, 0xffd08a);
    const sunCoreSprite = createSunSprite(coreTexture, 3, 1);
    sunGroup.add(sunGlareSprite, sunRaySprite, sunHaloSprite, sunCoreSprite);
    scene.add(camera);
    camera.add(sunGroup);

    [
      { factor: 0.5, scale: 0.18, opacity: 0.16, color: 0xfff5cf },
      { factor: 0.12, scale: 0.1, opacity: 0.2, color: 0xffd87a },
      { factor: -0.2, scale: 0.34, opacity: 0.09, color: 0x8edcff },
      { factor: -0.54, scale: 0.54, opacity: 0.06, color: 0x78a8ff }
    ].forEach((definition) => {
      const sprite = createSunSprite(
        haloTexture,
        definition.scale,
        definition.opacity,
        definition.color
      );
      sprite.userData.factor = definition.factor;
      sprite.userData.baseScale = definition.scale;
      flareSprites.push(sprite);
      camera.add(sprite);
    });

    const updateLensArtifacts = () => {
      flareSprites.forEach((sprite) => {
        const factor = sprite.userData.factor;
        sprite.position.set(
          sunGroup.position.x * factor,
          sunGroup.position.y * factor,
          -7.92
        );
      });
    };

    const starCount = mobile ? 40 : 70;
    const starDistance = 9.2;
    const starPositions = new Float32Array(starCount * 3);
    const starSeeds = Float32Array.from({ length: starCount }, (_, index) =>
      Math.abs(Math.sin((index + 1) * 78.233) * 43758.5453) % 1
    );
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("aSeed", new THREE.BufferAttribute(starSeeds, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vLight;
        varying float vBright;
        varying float vSeed;

        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vBright = step(0.9, aSeed);
          gl_PointSize = (3.0 + aSeed * 2.8 + vBright * 8.0) * uPixelRatio;
          vLight = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed * 1.8) + aSeed * 60.0);
          vSeed = aSeed;
        }
      `,
      fragmentShader: `
        varying float vLight;
        varying float vBright;
        varying float vSeed;

        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float core = 1.0 - smoothstep(0.05, 0.5, length(point));
          float glint = max(1.0 - smoothstep(0.0, 0.05, abs(point.x)), 1.0 - smoothstep(0.0, 0.05, abs(point.y)));
          float alpha = (core * core * 1.4 + glint * core * vBright * 0.9) * (0.4 + vLight * 0.6);
          vec3 color = mix(vec3(1.0, 0.84, 0.93), vec3(1.0, 0.97, 0.9), vSeed);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, min(alpha, 1.0));
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.frustumCulled = false;
    stars.renderOrder = 1;
    camera.add(stars);

    const placeStars = (halfWidth, halfHeight, sunY) => {
      const random = (index, salt) => Math.abs(Math.sin((index + 1) * 12.9898 + salt * 4.1414) * 43758.5453) % 1;
      for (let index = 0; index < starCount; index += 1) {
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          x = (random(index, attempt) * 2 - 1) * halfWidth * 0.98;
          y = halfHeight * (0.45 + random(index, attempt + 20) * 0.53);
          if (Math.hypot(x, y - sunY) > halfHeight * 0.34) break;
        }
        starPositions.set([x, y, -starDistance], index * 3);
      }
      starGeometry.attributes.position.needsUpdate = true;
    };

    const meteorTextures = [];
    const meteorMaterials = [];
    const meteorGeometry = new THREE.PlaneGeometry(1, 1);
    const meteorGroup = new THREE.Group();
    const meteorViewport = { halfWidth: 1, halfHeight: 1 };
    let meteorsInitialized = false;

    const createMeteorTexture = () => {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 1024;
      textureCanvas.height = 128;
      const context = textureCanvas.getContext("2d");
      const width = textureCanvas.width;
      const height = textureCanvas.height;
      const headX = width * 0.9;
      const centerY = height * 0.5;

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      const softTail = context.createLinearGradient(0, 0, width, 0);
      softTail.addColorStop(0, "rgba(255,0,126,0)");
      softTail.addColorStop(0.3, "rgba(255,0,126,0.05)");
      softTail.addColorStop(0.72, "rgba(255,35,148,0.3)");
      softTail.addColorStop(0.9, "rgba(255,220,166,0.7)");
      softTail.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = softTail;
      context.fillRect(0, centerY - 15, headX, 30);

      const brightTail = context.createLinearGradient(0, 0, width, 0);
      brightTail.addColorStop(0, "rgba(255,28,150,0)");
      brightTail.addColorStop(0.42, "rgba(255,28,150,0.12)");
      brightTail.addColorStop(0.82, "rgba(255,190,147,0.74)");
      brightTail.addColorStop(0.96, "rgba(255,255,238,0.98)");
      brightTail.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = brightTail;
      context.fillRect(0, centerY - 3, headX, 6);

      const headGlow = context.createRadialGradient(
        headX,
        centerY,
        0,
        headX,
        centerY,
        height * 0.46
      );
      headGlow.addColorStop(0, "rgba(255,255,255,1)");
      headGlow.addColorStop(0.15, "rgba(255,255,237,1)");
      headGlow.addColorStop(0.38, "rgba(255,223,163,0.72)");
      headGlow.addColorStop(0.72, "rgba(255,80,165,0.17)");
      headGlow.addColorStop(1, "rgba(255,0,126,0)");
      context.fillStyle = headGlow;
      context.fillRect(
        headX - height * 0.5,
        0,
        height,
        height
      );

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      meteorTextures.push(texture);
      return texture;
    };

    const meteorTexture = createMeteorTexture();
    const meteorCount = mobile ? 2 : 3;
    const meteors = Array.from({ length: meteorCount }, () => {
      const material = new THREE.MeshBasicMaterial({
        map: meteorTexture,
        color: 0xffffff,
        opacity: 0,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const meteor = new THREE.Mesh(meteorGeometry, material);
      meteor.visible = false;
      meteor.renderOrder = 4;
      meteor.frustumCulled = false;
      meteorGroup.add(meteor);
      meteorMaterials.push(material);
      return meteor;
    });
    camera.add(meteorGroup);

    const resetMeteor = (meteor, delay) => {
      meteor.visible = false;
      meteor.material.opacity = 0;
      meteor.userData.active = false;
      meteor.userData.delay = delay;
    };

    const spawnMeteor = (meteor) => {
      const halfWidth = meteorViewport.halfWidth;
      const halfHeight = meteorViewport.halfHeight;
      const heroMeteor = !mobile && Math.random() < 0.14;
      const startX = -halfWidth * (1.06 + Math.random() * 0.2);
      const startY = halfHeight * (0.42 + Math.random() * 0.7);
      const endX = halfWidth * (1.05 + Math.random() * 0.3);
      const endY = -halfHeight * (0.45 + Math.random() * 0.68);
      const length = (heroMeteor ? 2.45 : 1.35 + Math.random() * 0.9) *
        (mobile ? 0.78 : 1);
      const angle = Math.atan2(endY - startY, endX - startX);

      meteor.position.set(startX, startY, -7.82);
      meteor.rotation.z = angle;
      meteor.scale.set(length, length * (heroMeteor ? 0.16 : 0.13), 1);
      meteor.material.color.setHex(heroMeteor ? 0xffffff : 0xfff7e8);
      meteor.userData.startX = startX;
      meteor.userData.startY = startY;
      meteor.userData.endX = endX;
      meteor.userData.endY = endY;
      meteor.userData.arc = (Math.random() - 0.5) * halfHeight * 0.09;
      meteor.userData.duration = heroMeteor
        ? 1.25 + Math.random() * 0.35
        : 1.75 + Math.random() * 0.85;
      meteor.userData.maxOpacity = heroMeteor
        ? 0.96
        : 0.5 + Math.random() * 0.2;
      meteor.userData.age = 0;
      meteor.userData.active = true;
      meteor.visible = true;
    };

    const updateMeteors = (delta) => {
      meteors.forEach((meteor) => {
        if (!meteor.userData.active) {
          meteor.userData.delay -= delta;
          if (meteor.userData.delay <= 0) {
            if (dolphinShow.busy || exitProgress > 0.02) meteor.userData.delay = 0.6 + Math.random() * 0.8;
            else spawnMeteor(meteor);
          }
          return;
        }

        meteor.userData.age += delta;
        const progress = Math.min(
          meteor.userData.age / meteor.userData.duration,
          1
        );
        const fadeIn = Math.min(progress / 0.1, 1);
        const fadeOut = Math.min((1 - progress) / 0.24, 1);
        const arcOffset = Math.sin(progress * Math.PI) * meteor.userData.arc;

        meteor.position.x = THREE.MathUtils.lerp(
          meteor.userData.startX,
          meteor.userData.endX,
          progress
        );
        meteor.position.y = THREE.MathUtils.lerp(
          meteor.userData.startY,
          meteor.userData.endY,
          progress
        ) + arcOffset;
        meteor.material.opacity = meteor.userData.maxOpacity *
          Math.max(0, Math.min(fadeIn, fadeOut));

        if (progress >= 1) {
          resetMeteor(
            meteor,
            mobile
              ? 1.6 + Math.random() * 2.2
              : 0.55 + Math.random() * 1.9
          );
        }
      });
    };

    const dolphinShow = { enabled: finePointer && !compact && !reduced, busy: false };
    const dolphinMaterials = [];
    const dolphinGeometries = [];
    const dolphinSwimmers = [];
    let dolphinSpray = null;

    const waveHeightAt = (x, z, time) =>
      -0.82 +
      Math.sin(x * 0.72 + z * 0.16 + time * 0.52) * 0.44 +
      Math.sin(z * 1.05 - time * 0.38 + x * 0.2) * 0.28 +
      Math.sin((x + z) * 1.55 + time * 0.22) * 0.1 +
      Math.sin(x * 0.35 - z * 0.58 - time * 0.18) * 0.14;

    const addSplash = (x, z, age, strength) => {
      const slots = frontWave.splashes;
      const slot = slots.reduce((oldest, item) => (item.z > oldest.z ? item : oldest), slots[0]);
      slot.set(x, z, age, strength);
    };

    if (dolphinShow.enabled) {
      const outlineKeys = [
        [0.5, 0], [0.47, 0.012], [0.42, 0.02], [0.39, 0.032], [0.36, 0.062], [0.31, 0.092],
        [0.24, 0.112], [0.14, 0.124], [0.05, 0.126], [0, 0.13], [-0.04, 0.16], [-0.075, 0.205],
        [-0.115, 0.25], [-0.108, 0.205], [-0.11, 0.16], [-0.13, 0.118], [-0.22, 0.088],
        [-0.31, 0.056], [-0.38, 0.034], [-0.425, 0.026], [-0.46, 0.05], [-0.505, 0.084],
        [-0.55, 0.098], [-0.538, 0.058], [-0.505, 0.012], [-0.538, -0.034], [-0.55, -0.074],
        [-0.505, -0.062], [-0.46, -0.032], [-0.425, -0.014], [-0.32, -0.034], [-0.2, -0.064],
        [-0.08, -0.084], [0.04, -0.092], [0.12, -0.094], [0.07, -0.16], [0.035, -0.195],
        [0.08, -0.18], [0.15, -0.13], [0.19, -0.084], [0.27, -0.064], [0.34, -0.04],
        [0.4, -0.018], [0.45, -0.008]
      ];
      const outline = [];
      outlineKeys.forEach((_, index) => {
        const count = outlineKeys.length;
        const p0 = outlineKeys[(index - 1 + count) % count];
        const p1 = outlineKeys[index];
        const p2 = outlineKeys[(index + 1) % count];
        const p3 = outlineKeys[(index + 2) % count];
        for (let step = 0; step < 10; step += 1) {
          const t = step / 10;
          const t2 = t * t;
          const t3 = t2 * t;
          outline.push([0, 1].map((axis) => 0.5 * (
            2 * p1[axis] +
            (p2[axis] - p0[axis]) * t +
            (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
            (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t3
          )));
        }
      });

      const isInside = (x, y) => {
        let inside = false;
        for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
          const [xi, yi] = outline[i];
          const [xj, yj] = outline[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      };

      let seed = 7;
      const seeded = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const positions = [];
      const edges = [];
      const randoms = [];

      for (let filled = 0; filled < 1300;) {
        const x = -0.56 + seeded() * 1.07;
        const y = -0.2 + seeded() * 0.46;
        if (!isInside(x, y)) continue;
        const onFin = y > 0.13 || y < -0.098 || x < -0.43;
        const halfDepth = onFin ? 0.008 : 0.075 * Math.max(0.12, 1 - Math.pow(Math.abs(x + 0.02) / 0.5, 2));
        positions.push(x, y, (seeded() * 2 - 1) * halfDepth);
        edges.push(0);
        randoms.push(seeded());
        filled += 1;
      }

      for (let index = 0; index < outline.length; index += 1) {
        const [x0, y0] = outline[index];
        const [x1, y1] = outline[(index + 1) % outline.length];
        const pieces = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.0045));
        for (let piece = 0; piece < pieces; piece += 1) {
          const t = piece / pieces;
          positions.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0);
          edges.push(1);
          randoms.push(seeded());
        }
      }

      const dolphinGeometry = new THREE.BufferGeometry();
      dolphinGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      dolphinGeometry.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
      dolphinGeometry.setAttribute("aRandom", new THREE.Float32BufferAttribute(randoms, 1));
      dolphinGeometry.computeBoundingSphere();
      dolphinGeometries.push(dolphinGeometry);

      const createDolphin = () => {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uPointScale: { value: renderer.getPixelRatio() },
            uFlex: { value: 0 },
            uWaterY: { value: -10 },
            uGlint: { value: 0 },
            uOpacity: { value: 1 }
          },
          vertexShader: `
            attribute float aEdge;
            attribute float aRandom;
            uniform float uPointScale;
            uniform float uFlex;
            varying float vEdge;
            varying float vTop;
            varying float vRandom;
            varying float vWorldY;

            void main() {
              vec3 body = position;
              float tail = max(-body.x - 0.05, 0.0);
              body.y += uFlex * tail * tail * 0.55;
              vec4 world = modelMatrix * vec4(body, 1.0);
              vec4 view = viewMatrix * world;
              gl_Position = projectionMatrix * view;
              gl_PointSize = clamp(
                (0.15 + aRandom * 0.08 + aEdge * 0.03) * uPointScale * 148.0 / max(1.35, -view.z),
                1.35,
                4.2
              );
              vEdge = aEdge;
              vTop = smoothstep(-0.03, 0.12, position.y);
              vRandom = aRandom;
              vWorldY = world.y;
            }
          `,
          fragmentShader: `
            uniform float uWaterY;
            uniform float uGlint;
            uniform float uOpacity;
            varying float vEdge;
            varying float vTop;
            varying float vRandom;
            varying float vWorldY;

            void main() {
              float core = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
              float aboveWater = smoothstep(uWaterY - 0.03, uWaterY + 0.1, vWorldY);
              vec3 color = mix(vec3(0.69, 0.0, 0.41), vec3(1.0, 0.03, 0.52), vTop);
              color = mix(color, vec3(1.0, 0.62, 0.84), vEdge * 0.55);
              color = mix(color, vec3(1.0, 0.96, 0.87), uGlint * vTop * 0.8);
              float alpha = core * uOpacity * aboveWater * mix(0.34 + vRandom * 0.18, 0.62, vEdge);
              alpha *= 1.0 + uGlint * vTop * 0.6;

              if (alpha < 0.01) discard;
              gl_FragColor = vec4(color, alpha);
            }
          `,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const dolphin = new THREE.Points(dolphinGeometry, material);
        dolphin.visible = false;
        dolphin.frustumCulled = false;
        dolphin.renderOrder = 3;
        frontWave.layer.add(dolphin);
        dolphinMaterials.push(material);
        dolphinSwimmers.push({ dolphin, material, active: false });
      };

      createDolphin();
      createDolphin();

      const sprayCount = 180;
      const sprayPositions = new Float32Array(sprayCount * 3);
      const sprayLife = new Float32Array(sprayCount);
      const sprayVelocity = new Float32Array(sprayCount * 3);
      const sprayMaxLife = new Float32Array(sprayCount);
      const sprayGeometry = new THREE.BufferGeometry();
      sprayGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(sprayPositions, 3).setUsage(THREE.DynamicDrawUsage)
      );
      sprayGeometry.setAttribute(
        "aLife",
        new THREE.BufferAttribute(sprayLife, 1).setUsage(THREE.DynamicDrawUsage)
      );
      dolphinGeometries.push(sprayGeometry);
      const sprayMaterial = new THREE.ShaderMaterial({
        uniforms: { uPointScale: { value: renderer.getPixelRatio() } },
        vertexShader: `
          attribute float aLife;
          uniform float uPointScale;
          varying float vLife;

          void main() {
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp((0.2 + aLife * 0.2) * uPointScale * 148.0 / max(1.0, -view.z), 1.0, 4.8);
            vLife = aLife;
          }
        `,
        fragmentShader: `
          varying float vLife;

          void main() {
            float core = 1.0 - smoothstep(0.08, 0.5, length(gl_PointCoord - 0.5));
            vec3 color = mix(vec3(1.0, 0.16, 0.6), vec3(1.0, 0.95, 0.9), vLife);
            float alpha = core * vLife * 0.9;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const sprayPoints = new THREE.Points(sprayGeometry, sprayMaterial);
      sprayPoints.frustumCulled = false;
      sprayPoints.renderOrder = 4;
      frontWave.layer.add(sprayPoints);
      dolphinMaterials.push(sprayMaterial);
      let sprayCursor = 0;

      dolphinSpray = {
        emit(x, y, z, direction, amount, power) {
          for (let index = 0; index < amount; index += 1) {
            const slot = sprayCursor;
            sprayCursor = (sprayCursor + 1) % sprayCount;
            const angle = Math.random() * Math.PI * 2;
            const spread = Math.random() * 0.22;
            sprayPositions.set([x + Math.cos(angle) * spread, y, z + Math.sin(angle) * spread], slot * 3);
            sprayVelocity.set([
              (Math.random() - 0.5) * 1.5 + direction * 0.7 * power,
              (1.3 + Math.random() * 2.1) * power,
              (Math.random() - 0.5) * 1.1
            ], slot * 3);
            sprayMaxLife[slot] = 0.7 + Math.random() * 0.7;
            sprayLife[slot] = 1;
          }
        },
        update(delta) {
          for (let index = 0; index < sprayCount; index += 1) {
            if (sprayLife[index] <= 0) continue;
            const offset = index * 3;
            sprayVelocity[offset + 1] -= 6.2 * delta;
            sprayPositions[offset] += sprayVelocity[offset] * delta;
            sprayPositions[offset + 1] += sprayVelocity[offset + 1] * delta;
            sprayPositions[offset + 2] += sprayVelocity[offset + 2] * delta;
            sprayLife[index] = Math.max(0, sprayLife[index] - delta / sprayMaxLife[index]);
          }
          sprayGeometry.attributes.position.needsUpdate = true;
          sprayGeometry.attributes.aLife.needsUpdate = true;
        }
      };
    }

    const dolphinLeap = { next: 2.2 + Math.random() * 1.5, end: 0 };

    const projected = new THREE.Vector3();
    const toScreen = (x, y, z) => {
      projected.set(x, y, z);
      frontWave.layer.localToWorld(projected);
      return projected.project(camera);
    };

    const pickLeapDepth = () => {
      const zone = Math.random();
      if (zone < 0.6) return -7.8 + Math.random() * 3.2;
      if (zone < 0.85) return -4.4 + Math.random() * 3.6;
      return -0.6 + Math.random() * 2.6;
    };

    const createLeapPlan = (pair) => {
      const z = pickLeapDepth();
      const distance = (2.2 - z) / 10;
      const grow = 1 + distance * 0.35;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const reach = 5.2 + distance * 7;
      const minimumOffset = z < -4.4 ? 3.4 / reach : 0.22;
      const plan = {
        direction,
        z,
        x: side * (minimumOffset + (1 - minimumOffset) * Math.sqrt(Math.random())) * reach,
        drift: (Math.random() - 0.5) * 0.7,
        span: (3.1 + Math.random() * 0.7) * grow,
        height: (0.75 + Math.random() * 0.35) * (1 + distance * 0.6),
        duration: (2.0 + Math.random() * 0.35) * (1 + distance * 0.25),
        scale: 1.45 * (1 + distance * 1.5),
        brightness: 1 + distance * 0.9
      };
      plan.swimmers = [0, 1].slice(0, pair ? 2 : 1).map((index) => ({
        x: plan.x - direction * index * 0.75 * grow,
        z: plan.z + index * 0.5,
        height: plan.height * (index ? 0.86 : 1),
        scale: plan.scale * (index ? 0.84 : 1)
      }));
      return plan;
    };

    const planFitsScreen = (plan) => plan.swimmers.every((swimmer) =>
      [0.1, 0.3, 0.5, 0.7, 0.9].every((progress) => {
        const x = swimmer.x + plan.direction * plan.span * (progress - 0.5);
        const z = swimmer.z + plan.drift * (progress - 0.5);
        const lift = (swimmer.height + 0.6) * Math.sin(Math.PI * progress) - 0.6;
        const y = waveHeightAt(x, z, elapsed) + Math.max(lift, 0);
        const halfLength = swimmer.scale * 0.55;
        return [-halfLength, halfLength].every((offset) => {
          const point = toScreen(x + offset, y + swimmer.scale * 0.15, z);
          return Math.abs(point.x) < 0.94 && Math.abs(point.y) < 0.94;
        });
      })
    );

    const scheduleLeap = () => {
      const pair = Math.random() < 0.38;
      let plan = null;
      for (let attempt = 0; attempt < 24 && !plan; attempt += 1) {
        const candidate = createLeapPlan(pair);
        if (planFitsScreen(candidate)) plan = candidate;
      }
      if (!plan) {
        dolphinLeap.next = elapsed + 1;
        return;
      }

      const { direction, span, duration, drift } = plan;
      const start = elapsed + 0.8;

      dolphinSwimmers.forEach((swimmer, index) => {
        const route = plan.swimmers[index];
        swimmer.active = Boolean(route);
        if (!route) return;
        Object.assign(swimmer, {
          start: start + index * 0.32,
          duration,
          direction,
          span,
          height: route.height,
          x: route.x,
          z: route.z,
          drift,
          scale: route.scale,
          brightness: plan.brightness,
          lift: -1
        });
        const entryX = swimmer.x + direction * span * -0.4;
        addSplash(entryX, swimmer.z - swimmer.drift * 0.4, -0.95 - index * 0.32, 1);
      });

      dolphinShow.busy = true;
      dolphinLeap.end = start + duration + 1.2;
      dolphinLeap.next = dolphinLeap.end + 4.5 + Math.random() * 4;
    };

    const updateDolphins = (delta) => {
      if (!dolphinShow.enabled) return;

      frontWave.splashes.forEach((slot) => {
        if (slot.z < 20) slot.z += delta;
      });
      dolphinSpray.update(delta);

      if (elapsed >= dolphinLeap.next) {
        if (exitProgress > 0.02) dolphinLeap.next = elapsed + 1;
        else scheduleLeap();
      }
      if (dolphinShow.busy && elapsed > dolphinLeap.end) dolphinShow.busy = false;

      dolphinSwimmers.forEach((swimmer) => {
        const { dolphin, material } = swimmer;
        if (!swimmer.active) {
          dolphin.visible = false;
          return;
        }

        const progress = (elapsed - swimmer.start) / swimmer.duration;
        if (progress < 0 || progress > 1) {
          dolphin.visible = false;
          if (progress > 1) swimmer.active = false;
          return;
        }

        const arc = swimmer.height + 0.6;
        const x = swimmer.x + swimmer.direction * swimmer.span * (progress - 0.5);
        const z = swimmer.z + swimmer.drift * (progress - 0.5);
        const water = waveHeightAt(x, z, elapsed);
        const lift = arc * Math.sin(Math.PI * progress) - 0.6;

        dolphin.visible = true;
        dolphin.position.set(x, water + lift, z);
        dolphin.rotation.set(
          0,
          swimmer.direction < 0 ? Math.PI : 0,
          Math.atan2(arc * Math.PI * Math.cos(Math.PI * progress), swimmer.span)
        );
        dolphin.scale.setScalar(swimmer.scale);
        material.uniforms.uWaterY.value = water + waveWorld.position.y;
        material.uniforms.uOpacity.value = swimmer.brightness;
        material.uniforms.uFlex.value = Math.sin(progress * Math.PI * 2) * 0.55;
        material.uniforms.uGlint.value = Math.exp(-Math.pow((progress - 0.5) / 0.17, 2));

        if (swimmer.lift < 0 && lift >= 0) {
          dolphinSpray.emit(x, water, z, swimmer.direction, 26, 0.85);
        } else if (swimmer.lift >= 0 && lift < 0) {
          dolphinSpray.emit(x, water, z, swimmer.direction, 44, 1);
          addSplash(x, z, 0, 1.15);
        }
        swimmer.lift = lift;
      });
    };

    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerCurrent = new THREE.Vector2(0, 0);
    let pointerInside = false;
    let pointerStrength = 0;
    let isVisible = true;
    let isDisposed = false;
    let elapsed = 0;
    let lastFrame = performance.now();
    const cameraLookAt = new THREE.Vector3(0, -1.02, -2.2);
    let exitProgress = 0;

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      const portrait = bounds.width / bounds.height < 0.82;
      camera.aspect = bounds.width / bounds.height;
      camera.fov = portrait ? 57 : 50;
      camera.position.set(0, portrait ? 4.2 : 3.85, portrait ? 10.2 : 7.8);
      camera.lookAt(cameraLookAt);
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);

      const sunDistance = 8;
      const visibleHalfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * sunDistance;
      const visibleHalfWidth = visibleHalfHeight * camera.aspect;
      sunBasePosition.set(
        0,
        visibleHalfHeight * (portrait ? 0.9 : 0.84),
        -sunDistance
      );
      sunBaseScale = portrait ? 0.72 : compact ? 1.05 : 1.38;
      sunGroup.position.copy(sunBasePosition);
      sunGroup.scale.setScalar(sunBaseScale);
      const starScale = starDistance / sunDistance;
      placeStars(visibleHalfWidth * starScale, visibleHalfHeight * starScale, sunBasePosition.y * starScale);
      starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      meteorViewport.halfWidth = visibleHalfWidth * 0.98;
      meteorViewport.halfHeight = visibleHalfHeight * 0.98;
      if (!meteorsInitialized) {
        meteors.forEach((meteor, index) => {
          resetMeteor(
            meteor,
            index === 0
              ? 0
              : (mobile ? 1.7 : 0.85) * index + Math.random() * 0.65
          );
        });
        meteorsInitialized = true;
      }
      flareSprites.forEach((sprite) => {
        sprite.scale.setScalar(sprite.userData.baseScale * sunBaseScale);
      });
      updateLensArtifacts();

      [...materials, ...dolphinMaterials].forEach((material) => {
        material.uniforms.uPointScale.value = renderer.getPixelRatio();
      });

      renderer.render(scene, camera);
    };

    const onPointerEnter = () => {
      if (!finePointer || reduced) return;
      pointerInside = true;
    };

    const onPointerMove = (event) => {
      if (!finePointer || reduced) return;
      pointerInside = true;
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
      pointerTarget.set(
        THREE.MathUtils.clamp(x * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(y * 2 - 1, -1, 1)
      );
    };

    const onPointerLeave = () => {
      pointerInside = false;
    };

    if (finePointer && !reduced) {
      hero.addEventListener("pointerenter", onPointerEnter);
      hero.addEventListener("pointermove", onPointerMove, { passive: true });
      hero.addEventListener("pointerleave", onPointerLeave);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    const visibilityObserver = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
          isVisible = entry.isIntersecting;
          lastFrame = performance.now();
        }, { threshold: 0.01 })
      : null;

    if (visibilityObserver) visibilityObserver.observe(hero);
    hero.classList.add("dgh-flow-ready");

    if (reduced) {
      materials.forEach((material) => {
        material.uniforms.uTime.value = 1.8;
      });
      renderer.render(scene, camera);
    } else {
      renderer.setAnimationLoop(render);
    }

    window.addEventListener("pagehide", dispose, { once: true });

    function render(time) {
      if (isDisposed) return;
      if (!hero.isConnected) {
        dispose();
        return;
      }
      if (!isVisible) return;

      const delta = Math.min(Math.max((time - lastFrame) / 1000, 0), 0.05);
      lastFrame = time;
      elapsed += delta;
      pointerCurrent.lerp(pointerTarget, 0.035);
      pointerStrength = THREE.MathUtils.lerp(
        pointerStrength,
        pointerInside ? 1 : 0,
        0.035
      );

      materials.forEach((material) => {
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uPointer.value.copy(pointerCurrent);
        material.uniforms.uPointerStrength.value = pointerStrength;
      });

      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        pointerCurrent.x * 0.18 * pointerStrength,
        0.025
      );
      sunGroup.position.x = THREE.MathUtils.lerp(
        sunGroup.position.x,
        sunBasePosition.x + pointerCurrent.x * 0.16 * pointerStrength,
        0.035
      );
      sunGroup.position.y = THREE.MathUtils.lerp(
        sunGroup.position.y,
        sunBasePosition.y - pointerCurrent.y * 0.1 * pointerStrength,
        0.035
      );
      const sunPulse = 1 + Math.sin(elapsed * 0.72) * 0.018;
      sunGroup.scale.setScalar(sunBaseScale * sunPulse);
      sunGlareSprite.material.rotation = -Math.sin(elapsed * 0.09) * 0.012;
      sunGlareSprite.material.opacity = 0.14 + Math.sin(elapsed * 0.52 + 0.4) * 0.022;
      sunRaySprite.material.rotation = Math.sin(elapsed * 0.12) * 0.018;
      sunRaySprite.material.opacity = 0.58 + Math.sin(elapsed * 0.66) * 0.035;
      sunHaloSprite.material.opacity = 0.48 + Math.sin(elapsed * 0.84 + 0.8) * 0.045;
      sunCoreSprite.material.opacity = 0.97 + Math.sin(elapsed * 0.92) * 0.025;
      flareSprites.forEach((sprite, index) => {
        const flarePulse = 1 + Math.sin(elapsed * 0.48 + index * 1.7) * 0.045;
        sprite.scale.setScalar(sprite.userData.baseScale * sunBaseScale * flarePulse);
      });
      exitProgress = readExit(hero);
      hero.style.setProperty("--dgh-exit", exitProgress.toFixed(3));
      updateFlood(hero, exitProgress, elapsed);

      starMaterial.uniforms.uTime.value = elapsed;
      updateMeteors(delta);
      updateDolphins(delta);
      updateLensArtifacts();
      camera.lookAt(cameraLookAt);
      renderer.render(scene, camera);
    }

    function dispose() {
      if (isDisposed) return;
      isDisposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      if (visibilityObserver) visibilityObserver.disconnect();
      hero.removeEventListener("pointerenter", onPointerEnter);
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      materials.forEach((material) => material.dispose());
      sunMaterials.forEach((material) => material.dispose());
      sunTextures.forEach((texture) => texture.dispose());
      meteorMaterials.forEach((material) => material.dispose());
      meteorTextures.forEach((texture) => texture.dispose());
      meteorGeometry.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      dolphinMaterials.forEach((material) => material.dispose());
      dolphinGeometries.forEach((geometry) => geometry.dispose());
      pointGeometry.dispose();
      lineGeometry.dispose();
      renderer.dispose();
    }
  }

  function initializeInteractiveTitle(hero, THREE) {
    if (hero.dataset.dghTitleInitialized === "true") return;

    const stage = hero.querySelector(".dgh-copy-hero__title-stage");
    const canvas = hero.querySelector(".dgh-copy-hero__title-canvas");
    const cursor = hero.querySelector(".dgh-copy-hero__wave-cursor");
    if (!stage || !canvas || !cursor) return;

    hero.dataset.dghTitleInitialized = "true";

    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        premultipliedAlpha: true
      });
    } catch {
      return;
    }

    const reduced = reduceMotion.matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const titleTexture = createTitleTexture();
    const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0.5, 0.5, 99, 0));
    const uniforms = {
      uTexture: { value: titleTexture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uVelocity: { value: new THREE.Vector2() },
      uActive: { value: 0 },
      uTime: { value: 0 },
      uRipples: { value: ripples },
      uFlood: { value: -1 }
    };
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform vec2 uVelocity;
        uniform float uActive;
        uniform float uTime;
        uniform vec4 uRipples[8];
        uniform float uFlood;

        void main() {
          float depth = uFlood - vUv.y;
          float submerged = smoothstep(-0.006, 0.006, depth);
          float wobble = sin(vUv.y * 42.0 + uTime * 2.4) * 0.012 + sin(vUv.x * 7.0 - uTime * 1.5) * 0.008;
          vec2 mirrorUv = vec2(vUv.x + wobble, uFlood + depth * 1.25 + wobble * 0.5);
          vec2 uv = mix(vUv, mirrorUv, submerged);
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          vec2 totalOffset = vec2(0.0);
          float distortion = 0.0;

          for (int index = 0; index < 8; index++) {
            vec4 ripple = uRipples[index];
            float life = 1.0 - smoothstep(0.0, 4.2, ripple.z);
            vec2 delta = uv - ripple.xy;
            delta.x *= aspect;
            float distanceFromOrigin = length(delta);
            float radius = 0.01 + ripple.z * 0.064;
            float band = exp(-pow((distanceFromOrigin - radius) * 18.0, 2.0));
            float wave = sin((distanceFromOrigin - radius) * 28.0 - ripple.z * 0.9);
            float energy = band * wave * life * ripple.w;
            vec2 direction = delta / max(distanceFromOrigin, 0.001);

            totalOffset += vec2(direction.x / aspect, direction.y) * energy * 0.034;
            distortion += abs(energy);
          }

          vec2 mouseDelta = uv - uMouse;
          mouseDelta.x *= aspect;
          float mouseDistance = length(mouseDelta);
          float lens = exp(-mouseDistance * mouseDistance * 40.0) * uActive;
          float cursorEnvelope = smoothstep(0.42, 0.0, mouseDistance) * uActive;
          float cursorWave = sin(mouseDistance * 23.0 - uTime * 1.15) * cursorEnvelope;
          vec2 mouseDirection = mouseDelta / max(mouseDistance, 0.001);
          vec2 radialDirection = vec2(mouseDirection.x / aspect, mouseDirection.y);
          totalOffset += radialDirection * lens * 0.043;
          totalOffset += radialDirection * cursorWave * 0.035;
          totalOffset += uVelocity * cursorEnvelope * 0.72;
          distortion += lens * 1.6 + abs(cursorWave) * 1.35;

          vec2 redUv = clamp(uv + totalOffset * 1.08, 0.0, 1.0);
          vec2 greenUv = clamp(uv + totalOffset, 0.0, 1.0);
          vec2 blueUv = clamp(uv + totalOffset * 0.92, 0.0, 1.0);
          vec4 redSample = texture2D(uTexture, redUv);
          vec4 greenSample = texture2D(uTexture, greenUv);
          vec4 blueSample = texture2D(uTexture, blueUv);
          vec4 baseSample = texture2D(uTexture, uv);
          float split = smoothstep(0.14, 0.92, distortion) * 0.18;
          float effectMix = smoothstep(0.01, 0.36, distortion);
          vec3 displacedColor = mix(
            greenSample.rgb,
            vec3(redSample.r, greenSample.g, blueSample.b),
            split
          );
          vec3 color = mix(baseSample.rgb, displacedColor, effectMix);
          float displacedAlpha = max(redSample.a, max(greenSample.a, blueSample.a));
          float alpha = max(baseSample.a, displacedAlpha * effectMix);
          color = mix(color, vec3(0.2, 0.19, 0.21), submerged * 0.8);
          alpha *= mix(1.0, 0.6 * (1.0 - smoothstep(0.0, 0.5, depth)), submerged);

          gl_FragColor = vec4(color, alpha);
        }
      `
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    const pointerTarget = new THREE.Vector2(-100, -100);
    const pointerCurrent = new THREE.Vector2(-100, -100);
    const wavePointerTarget = new THREE.Vector2(0.5, 0.5);
    const wavePointerCurrent = new THREE.Vector2(0.5, 0.5);
    const velocityTarget = new THREE.Vector2();
    let nextRipple = 0;
    let lastRippleAt = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let hasPointer = false;
    let pointerInside = false;
    let isVisible = true;
    let isDisposed = false;
    let lastFrame = performance.now();

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      renderer.setSize(bounds.width, bounds.height, false);
      uniforms.uResolution.value.set(bounds.width, bounds.height);
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    const visibilityObserver = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => {
          isVisible = entry.isIntersecting;
          lastFrame = performance.now();
        }, { threshold: 0.01 })
      : null;

    if (visibilityObserver) visibilityObserver.observe(hero);

    const onPointerEnter = (event) => {
      if (!finePointer || reduced) return;
      pointerInside = true;
      hasPointer = false;
      updatePointer(event, false);
      pointerCurrent.copy(pointerTarget);
      wavePointerCurrent.copy(wavePointerTarget);
      uniforms.uMouse.value.copy(wavePointerCurrent);
      hero.classList.add("dgh-wave-active");
    };

    const onPointerMove = (event) => {
      if (!finePointer || reduced) return;
      if (!pointerInside) {
        onPointerEnter(event);
        return;
      }
      updatePointer(event, true);
    };

    const onPointerLeave = () => {
      pointerInside = false;
      hasPointer = false;
      velocityTarget.set(0, 0);
      hero.classList.remove("dgh-wave-active");
    };

    if (finePointer && !reduced) {
      hero.addEventListener("pointerenter", onPointerEnter);
      hero.addEventListener("pointermove", onPointerMove, { passive: true });
      hero.addEventListener("pointerleave", onPointerLeave);
    }

    hero.classList.add("dgh-title-webgl-ready");

    if (reduced) {
      renderer.render(scene, camera);
    } else {
      renderer.setAnimationLoop(render);
    }

    window.addEventListener("pagehide", dispose, { once: true });

    function createTitleTexture() {
      const textureCanvas = document.createElement("canvas");
      const width = 2560;
      const height = 760;
      textureCanvas.width = width;
      textureCanvas.height = height;

      const context = textureCanvas.getContext("2d");
      const introTitle = stage.dataset.introTitle || "";
      const editorialTitle = stage.dataset.editorialTitle || "ΔΗΜΙΟΥΡΓΟΥΜΕ ΤΟ";
      const modernTitle = stage.dataset.modernTitle || "ΑΠΡΟΒΛΕΠΤΟ";
      context.letterSpacing = "3px";
      const introSize = fitText(
        context,
        introTitle,
        '500 {size}px "Noto Sans Display", "Manrope", sans-serif',
        2300,
        46
      );
      context.letterSpacing = "0px";
      const editorialSize = fitText(
        context,
        editorialTitle,
        'italic 400 {size}px "GFS Didot", Georgia, serif',
        2260,
        290
      );
      const modernSize = fitText(
        context,
        modernTitle,
        '500 {size}px "Noto Sans Display", "Manrope", sans-serif',
        2320,
        350
      );

      context.clearRect(0, 0, width, height);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.letterSpacing = "3px";
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.font = `500 ${introSize}px "Noto Sans Display", "Manrope", sans-serif`;
      context.fillText(introTitle, width * 0.5, 72);

      context.letterSpacing = "0px";
      context.fillStyle = "#fff";
      context.font = `italic 400 ${editorialSize}px "GFS Didot", Georgia, serif`;
      context.fillText(editorialTitle, width * 0.5, 305);

      const modernGradient = context.createLinearGradient(width * 0.12, 0, width * 0.88, 0);
      modernGradient.addColorStop(0, "#ffffff");
      modernGradient.addColorStop(0.72, "#ffffff");
      modernGradient.addColorStop(1, "#ff9bd0");
      context.fillStyle = modernGradient;
      context.font = `500 ${modernSize}px "Noto Sans Display", "Manrope", sans-serif`;
      context.fillText(modernTitle, width * 0.5, 570);

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      return texture;
    }

    function fitText(context, text, fontTemplate, maximumWidth, startingSize) {
      let size = startingSize;

      while (size > 30) {
        context.font = fontTemplate.replace("{size}", size);
        if (context.measureText(text).width <= maximumWidth) return size;
        size -= 2;
      }

      return size;
    }

    function updatePointer(event, createRipple) {
      const heroBounds = hero.getBoundingClientRect();
      const stageBounds = stage.getBoundingClientRect();
      const localX = event.clientX - heroBounds.left;
      const localY = event.clientY - heroBounds.top;
      const uvX = (event.clientX - stageBounds.left) / Math.max(stageBounds.width, 1);
      const uvY = 1 - (event.clientY - stageBounds.top) / Math.max(stageBounds.height, 1);

      pointerTarget.set(localX, localY);
      wavePointerTarget.set(uvX, uvY);

      if (hasPointer) {
        const deltaX = (event.clientX - lastPointerX) / Math.max(stageBounds.width, 1);
        const deltaY = -(event.clientY - lastPointerY) / Math.max(stageBounds.height, 1);
        const speed = Math.min(Math.hypot(deltaX, deltaY) * 38, 1);

        velocityTarget.set(
          THREE.MathUtils.clamp(deltaX * 1.65, -0.045, 0.045),
          THREE.MathUtils.clamp(deltaY * 1.65, -0.045, 0.045)
        );

        if (
          createRipple &&
          speed > 0.018 &&
          performance.now() - lastRippleAt > 112 &&
          uvX > -0.12 && uvX < 1.12 && uvY > -0.18 && uvY < 1.18
        ) {
          ripples[nextRipple].set(uvX, uvY, 0, 0.72 + speed * 1.05);
          nextRipple = (nextRipple + 1) % ripples.length;
          lastRippleAt = performance.now();
        }
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      hasPointer = true;
    }

    function render(time) {
      if (isDisposed) return;
      if (!hero.isConnected) {
        dispose();
        return;
      }
      if (!isVisible) return;

      const delta = Math.min(Math.max((time - lastFrame) / 1000, 0), 0.05);
      lastFrame = time;
      uniforms.uTime.value = time / 1000;
      const floodBounds = hero.getBoundingClientRect();
      const titleBounds = stage.getBoundingClientRect();
      const floodLine = floodBounds.bottom - floodLevel(readExit(hero)) * floodBounds.height;
      uniforms.uFlood.value = (titleBounds.bottom - floodLine) / Math.max(titleBounds.height, 1);
      uniforms.uActive.value = THREE.MathUtils.lerp(
        uniforms.uActive.value,
        pointerInside ? 1 : 0,
        0.055
      );
      uniforms.uVelocity.value.lerp(velocityTarget, 0.1);
      velocityTarget.multiplyScalar(0.9);

      ripples.forEach((ripple) => {
        if (ripple.z < 5) ripple.z += delta;
      });

      wavePointerCurrent.lerp(wavePointerTarget, 0.085);
      uniforms.uMouse.value.copy(wavePointerCurrent);
      pointerCurrent.lerp(pointerTarget, 0.16);
      const lagX = pointerTarget.x - pointerCurrent.x;
      const lagY = pointerTarget.y - pointerCurrent.y;
      const stretch = Math.min(Math.hypot(lagX, lagY) / 60, 0.55);
      cursor.style.transform = `translate3d(${pointerCurrent.x - 15}px, ${pointerCurrent.y - 15}px, 0) rotate(${Math.atan2(lagY, lagX)}rad) scale(${1 + stretch}, ${1 - stretch * 0.45})`;
      renderer.render(scene, camera);
    }

    function dispose() {
      if (isDisposed) return;
      isDisposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      if (visibilityObserver) visibilityObserver.disconnect();
      hero.removeEventListener("pointerenter", onPointerEnter);
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      titleTexture.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
    }
  }
})();

(() => {
  const sections = [...document.querySelectorAll(".dgs-services")];
  if (!sections.length) return;

  const filmQuery = window.matchMedia(DESKTOP_MOTION_QUERY);
  const controllers = new Map();
  const imageCache = new Map();
  let moduleReady;
  let modeRevision = 0;

  const loadImage = (source) => {
    if (!source) return Promise.resolve(null);
    if (!imageCache.has(source)) {
      imageCache.set(source, new Promise((resolve) => {
        const image = new Image();
        const timeout = window.setTimeout(() => finish(null), 10000);
        const finish = (value) => {
          window.clearTimeout(timeout);
          image.onload = image.onerror = null;
          resolve(value);
        };
        image.crossOrigin = "anonymous";
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = source;
      }));
    }
    return imageCache.get(source);
  };

  sections.forEach((section) => {
    const cards = [...section.querySelectorAll(".dgs-card")];
    cards.forEach((card) => {
      const photo = card.querySelector(".dgs-card__photo");
      if (photo && card.dataset.image) {
        photo.style.backgroundImage = "url(" + JSON.stringify(card.dataset.image) + ")";
      }
    });

    const buttons = [...section.querySelectorAll(".dgs-services__filter")];
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter;
        buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        cards.forEach((card) => {
          card.hidden = filter !== "all" && card.dataset.category !== filter;
        });
        section.dispatchEvent(new CustomEvent("dgs:filter"));
      });
    });
  });

  const updateMode = async () => {
    const revision = ++modeRevision;
    if (!filmQuery.matches) {
      controllers.forEach((controller) => controller.dispose());
      controllers.clear();
      return;
    }
    try {
      moduleReady ||= import(THREE_MODULE);
      const [THREE] = await Promise.all([
        moduleReady,
        document.fonts ? document.fonts.ready : Promise.resolve()
      ]);
      if (revision !== modeRevision || !filmQuery.matches) return;
      sections.forEach((section) => {
        if (controllers.has(section)) return;
        const controller = initializeFilm(section, THREE);
        if (controller) controllers.set(section, controller);
      });
    } catch {
      moduleReady = null;
      console.warn("DigiGlow services: showing the accessible card layout", error);
    }
  };
  filmQuery.addEventListener("change", updateMode);
  updateMode();

  function initializeFilm(section, THREE) {
    const stage = section.querySelector(".dgs-services__stage");
    const canvas = stage?.querySelector("canvas");
    const headInner = section.querySelector(".dgs-services__head-inner");
    const grid = section.querySelector(".dgs-services__grid");
    const cards = [...section.querySelectorAll(".dgs-card")];
    if (!canvas || !headInner || !grid || !cards.length) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (error) {
      return null;
    }
    section.classList.add("dgs-film");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 12000);
    const geometry = new THREE.PlaneGeometry(1, 1, 48, 96);
    const uniforms = {
      uTime: { value: 0 },
      uBoundary: { value: 0 },
      uBendLength: { value: 400 },
      uDrop: { value: 400 },
      uRetreat: { value: 900 },
      uCameraDistance: { value: 1600 },
      uColumnWidth: { value: 500 },
      uPointer: { value: new THREE.Vector2(10000, 10000) },
      uPointerMove: { value: new THREE.Vector2() },
      uPointerStrength: { value: 0 }
    };

    const vertexShader = `
      uniform float uTime;
      uniform float uBoundary;
      uniform float uBendLength;
      uniform float uDrop;
      uniform float uRetreat;
      uniform float uCameraDistance;
      uniform float uColumnWidth;
      uniform vec2 uPointer;
      uniform vec2 uPointerMove;
      uniform float uPointerStrength;
      varying vec2 vUv;
      varying float vTravel;
      varying float vDepth;
      varying float vLight;

      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        float sourceY = world.y;
        float travel = max(sourceY - uBoundary, 0.0) / uBendLength;
        float recession = smoothstep(0.0, 1.0, travel);
        float pull = smoothstep(0.06, 0.82, travel);
        float across = uv.x - 0.5;
        float wave = sin(across * 5.4 - uTime * 0.78 + sourceY * 0.0014);
        float drift = sin(uTime * 0.57 + sourceY * 0.0017);

        world.y -= uDrop * (1.0 + wave * 0.22) * pull;
        world.z -= uRetreat * recession;
        float perspectiveOffset = uRetreat * recession / uCameraDistance;
        world.x += modelMatrix[3].x * perspectiveOffset;
        world.y += uBoundary * perspectiveOffset;
        world.z += sin(across * 7.0 + sourceY * 0.013 - uTime * 1.2)
          * (9.0 + recession * 22.0);
        world.y += sin(across * 4.2 + sourceY * 0.003 - uTime * 0.6) * 3.5;
        world.x += drift * min(uColumnWidth * 0.018, 10.0);

        vec2 toPointer = vec2(world.x, sourceY) - uPointer;
        float influence = exp(-dot(toPointer, toPointer) / 26000.0)
          * uPointerStrength * (1.0 - recession);
        world.xy += uPointerMove * influence * 0.4;
        world.z += influence * 18.0;

        vTravel = travel;
        vDepth = recession;
        vLight = sin(across * 7.0 + sourceY * 0.013 - uTime * 1.2) * 0.025;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `;
    const fragmentShader = `
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vTravel;
      varying float vDepth;
      varying float vLight;

      void main() {
        vec4 surface = texture2D(uMap, vUv);
        float fade = 1.0 - smoothstep(0.82, 1.3, vTravel);
        float alpha = surface.a * fade;
        if (alpha < 0.008) discard;
        surface.rgb *= 1.0 + vLight;
        surface.rgb = mix(surface.rgb, vec3(0.86), vDepth * vDepth * 0.1);
        gl_FragColor = vec4(surface.rgb, alpha);
        #include <colorspace_fragment>
      }
    `;

    const films = cards.map((card, index) => {
      const material = new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uMap: { value: null } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = index;
      scene.add(mesh);
      return { card, mesh, material, texture: null, height: 0 };
    });

    let disposed = false;
    let failed = false;
    let visible = false;
    let ready = false;
    let paintRevision = 0;
    let repaintTimer = 0;
    let lastGridWidth = 0;
    let lastFrame = performance.now();
    let elapsed = 0;
    const pointerTarget = new THREE.Vector2(10000, 10000);
    const pointerMove = new THREE.Vector2();
    let pointerActive = 0;

    const fallback = (error) => {
      failed = true;
      section.classList.remove("dgs-canvas-live");
      renderer.setAnimationLoop(null);
      if (error) console.warn("DigiGlow services: showing the accessible card layout", error);
    };
    renderer.debug.onShaderError = () => fallback(new Error("Film shader did not compile"));

    const localBox = (element, origin) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
    };
    const drawText = (context, element, box) => {
      const style = getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
      let text = element.textContent.replace(/\s+/g, " ").trim();
      if (style.textTransform === "uppercase") text = text.toUpperCase();
      context.font = style.fontStyle + " " + style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
      context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      context.fillStyle = "#000";
      context.textBaseline = "middle";
      let line = "";
      let lineIndex = 0;
      text.split(" ").forEach((word) => {
        const next = line ? line + " " + word : word;
        if (line && context.measureText(next).width > box.w + 1) {
          context.fillText(line, box.x, box.y + lineHeight * (lineIndex + 0.5));
          lineIndex += 1;
          line = word;
        } else {
          line = next;
        }
      });
      if (line) context.fillText(line, box.x, box.y + lineHeight * (lineIndex + 0.5));
      context.letterSpacing = "0px";
    };

    const paintCard = (film, photo) => {
      const rect = film.card.getBoundingClientRect();
      const link = film.card.querySelector(".dgs-card__link");
      const height = link.getBoundingClientRect().height;
      if (!rect.width || !height) return;
      const maxSize = renderer.capabilities.maxTextureSize;
      const scale = Math.min(window.devicePixelRatio || 1, 2, maxSize / rect.width, maxSize / height);
      const paint = document.createElement("canvas");
      paint.width = Math.max(1, Math.ceil(rect.width * scale));
      paint.height = Math.max(1, Math.ceil(height * scale));
      const context = paint.getContext("2d");
      if (!context) throw new Error("Film texture could not be created");
      context.scale(scale, scale);
      const media = localBox(film.card.querySelector(".dgs-card__media"), rect);
      context.save();
      context.beginPath();
      context.rect(media.x, media.y, media.w, media.h);
      context.clip();
      if (photo) {
        const cover = Math.max(media.w / photo.naturalWidth, media.h / photo.naturalHeight);
        const width = photo.naturalWidth * cover;
        const imageHeight = photo.naturalHeight * cover;
        context.drawImage(photo, media.x + (media.w - width) / 2, media.y + (media.h - imageHeight) / 2, width, imageHeight);
      } else {
        const gradient = context.createLinearGradient(0, 0, media.w, media.h);
        gradient.addColorStop(0, "#f8e5f0");
        gradient.addColorStop(0.5, "#e9e5f5");
        gradient.addColorStop(1, "#cedfe7");
        context.fillStyle = gradient;
        context.fillRect(media.x, media.y, media.w, media.h);
      }
      context.restore();
      [".dgs-card__title", ".dgs-card__text", ".dgs-card__arrow"].forEach((selector) => {
        const element = film.card.querySelector(selector);
        if (element) drawText(context, element, localBox(element, rect));
      });
      const caption = localBox(film.card.querySelector(".dgs-card__caption"), rect);
      context.fillStyle = "#000";
      context.fillRect(caption.x, caption.y + caption.h - 1, caption.w, 1);

      const texture = new THREE.CanvasTexture(paint);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      film.texture?.dispose();
      film.texture = texture;
      film.material.uniforms.uMap.value = texture;
      film.height = height;
    };

    const paintAll = async () => {
      const revision = ++paintRevision;
      try {
        const activeFilms = films.filter((film) => !film.card.hidden);
        const photos = await Promise.all(activeFilms.map((film) => loadImage(film.card.dataset.image)));
        if (disposed || failed || revision !== paintRevision) return;
        activeFilms.forEach((film, index) => paintCard(film, photos[index]));
        ready = activeFilms.length > 0 && activeFilms.every((film) => film.texture);
        if (!ready) section.classList.remove("dgs-canvas-live");
      } catch (error) {
        fallback(error);
      }
    };

    const resize = () => {
      if (disposed) return;
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      camera.aspect = bounds.width / bounds.height;
      camera.position.z = bounds.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.far = camera.position.z * 5;
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
      uniforms.uRetreat.value = camera.position.z * 0.86;
      uniforms.uCameraDistance.value = camera.position.z;
      const firstCard = cards.find((card) => !card.hidden);
      const photoHeight = firstCard?.querySelector(".dgs-card__media").getBoundingClientRect().height || 0;
      const headHeight = section.querySelector(".dgs-services__head").getBoundingClientRect().height;
      const tail = Math.ceil(bounds.height - headHeight + photoHeight * 1.38 * 1.3);
      section.style.setProperty("--dgs-film-tail", Math.max(bounds.height * 0.22, tail) + "px");
      const gridWidth = grid.getBoundingClientRect().width;
      if (lastGridWidth && Math.abs(lastGridWidth - gridWidth) > 1) {
        section.classList.remove("dgs-canvas-live");
        ready = false;
        window.clearTimeout(repaintTimer);
        repaintTimer = window.setTimeout(paintAll, 140);
      }
      lastGridWidth = gridWidth;
    };
    const onFilter = () => {
      section.classList.remove("dgs-canvas-live");
      ready = false;
      resize();
      paintAll();
    };
    const onPointerMove = (event) => {
      const bounds = stage.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = bounds.height / 2 - (event.clientY - bounds.top);
      if (pointerActive) {
        pointerMove.set(
          THREE.MathUtils.clamp(x - pointerTarget.x, -28, 28),
          THREE.MathUtils.clamp(y - pointerTarget.y, -28, 28)
        );
      }
      pointerTarget.set(x, y);
      pointerActive = 1;
    };
    const onPointerLeave = () => { pointerActive = 0; };
    const onContextLost = (event) => {
      event.preventDefault();
      fallback(new Error("WebGL context was lost"));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resizeObserver.observe(grid);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      lastFrame = performance.now();
    }, { rootMargin: "10% 0px" });
    visibilityObserver.observe(section);
    section.addEventListener("dgs:filter", onFilter);
    section.addEventListener("pointermove", onPointerMove, { passive: true });
    section.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("webglcontextlost", onContextLost);
    resize();
    paintAll();

    const render = (time) => {
      if (disposed || failed) return;
      if (!section.isConnected) { dispose(); return; }
      const delta = Math.min(Math.max((time - lastFrame) / 1000, 0), 0.05);
      lastFrame = time;
      if (!visible || document.hidden || !ready) return;
      elapsed += delta;
      uniforms.uTime.value = elapsed;
      const damping = 1 - Math.exp(-delta * 10);
      uniforms.uPointer.value.lerp(pointerTarget, damping);
      uniforms.uPointerMove.value.lerp(pointerMove, damping);
      pointerMove.multiplyScalar(Math.exp(-delta * 7));
      uniforms.uPointerStrength.value = THREE.MathUtils.lerp(
        uniforms.uPointerStrength.value, pointerActive, damping
      );

      const stageBounds = stage.getBoundingClientRect();
      const boundary = headInner.getBoundingClientRect().bottom - stageBounds.top + 34;
      uniforms.uBoundary.value = stageBounds.height / 2 - boundary;
      const first = films.find((film) => !film.card.hidden && film.texture);
      if (first) {
        const photoHeight = first.card.querySelector(".dgs-card__media").getBoundingClientRect().height;
        uniforms.uColumnWidth.value = first.card.getBoundingClientRect().width;
        uniforms.uBendLength.value = photoHeight * 1.38;
        uniforms.uDrop.value = photoHeight * 1.32;
      }
      films.forEach((film) => {
        const rect = film.card.getBoundingClientRect();
        const top = rect.top - stageBounds.top;
        const filmVisible = !film.card.hidden && Boolean(film.texture)
          && top < stageBounds.height + 100
          && top + film.height > boundary - uniforms.uBendLength.value * 1.35;
        film.mesh.visible = filmVisible;
        if (!filmVisible) return;
        film.mesh.scale.set(rect.width, film.height, 1);
        film.mesh.position.set(
          rect.left - stageBounds.left + rect.width / 2 - stageBounds.width / 2,
          stageBounds.height / 2 - top - film.height / 2,
          0
        );
      });
      try {
        renderer.render(scene, camera);
        if (!failed) section.classList.add("dgs-canvas-live");
      } catch (error) {
        fallback(error);
      }
    };
    renderer.setAnimationLoop(render);

    function dispose() {
      if (disposed) return;
      disposed = true;
      paintRevision += 1;
      window.clearTimeout(repaintTimer);
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      section.removeEventListener("dgs:filter", onFilter);
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      films.forEach((film) => { film.texture?.dispose(); film.material.dispose(); });
      geometry.dispose();
      renderer.dispose();
      section.classList.remove("dgs-film", "dgs-canvas-live");
      section.style.removeProperty("--dgs-film-tail");
    }
    return { dispose };
  }
})();
