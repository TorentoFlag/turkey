"use client";

import * as THREE from "three";

import type { HeroFragment } from "@/data/home";
import { sitePath } from "@/lib/sitePath";

import type { HeroSceneController, RendererOptions } from "./types";

type FragmentState = {
  fragment: HeroFragment;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.Texture | null;
  angle: number;
  progress: number;
  phase: number;
  drift: number;
  displayAspect: number;
};

const fragmentAspects = [0.72, 1.36, 0.82, 1.08, 0.68, 0.9, 0.76, 1.3];

export function createHeroScene(
  canvas: HTMLCanvasElement,
  fragments: HeroFragment[],
  options: RendererOptions,
): HeroSceneController {
  let renderer: THREE.WebGLRenderer;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    options.onFailure();
    return {
      setScrollVelocity() {},
      resize() {},
      destroy() {},
    };
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const loader = new THREE.TextureLoader();
  const textures = new Set<THREE.Texture>();
  let loadedTextures = 0;
  let destroyed = false;
  let failed = false;
  let rafId = 0;
  let lastTime = performance.now();
  let lastSampleTime = 0;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let scrollVelocity = 0;
  let isIntersecting = true;
  let isDocumentVisible = document.visibilityState === "visible";
  let releaseResources = () => {};
  let releaseRuntime = () => {};

  const fail = () => {
    if (failed || destroyed) return;
    failed = true;
    canvas.dataset.ready = "false";
    cancelAnimationFrame(rafId);
    rafId = 0;
    releaseRuntime();
    releaseResources();
    options.onFailure();
  };

  const states: FragmentState[] = fragments.map((fragment, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      transparent: true,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = Math.round(fragment.depth * 100);
    scene.add(mesh);

    const state: FragmentState = {
      fragment,
      material,
      mesh,
      texture: null,
      angle: Math.atan2(0.5 - fragment.y, fragment.x - 0.5),
      progress: (index / fragments.length + fragment.y * 0.23) % 1,
      phase: index * 1.61803398875,
      drift: 4 + fragment.depth * 14,
      displayAspect: fragmentAspects[index % fragmentAspects.length],
    };

    const texture = loader.load(
      sitePath(fragment.image),
      (loadedTexture) => {
        if (destroyed || failed) return;
        const image = loadedTexture.image as { width?: number; height?: number };
        const imageAspect = (image.width ?? 1) / Math.max(1, image.height ?? 1);
        const displayAspect = fragment.image.includes("/home-kits/")
          ? imageAspect
          : state.displayAspect;
        state.displayAspect = displayAspect;

        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;

        if (imageAspect > displayAspect) {
          const visibleWidth = displayAspect / imageAspect;
          loadedTexture.repeat.set(visibleWidth, 1);
          loadedTexture.offset.set((1 - visibleWidth) * fragment.crop[0], 0);
        } else {
          const visibleHeight = imageAspect / displayAspect;
          loadedTexture.repeat.set(1, visibleHeight);
          loadedTexture.offset.set(0, (1 - visibleHeight) * (1 - fragment.crop[1]));
        }

        loadedTexture.needsUpdate = true;
        state.texture = loadedTexture;
        material.map = loadedTexture;
        material.opacity = 0.16 + fragment.depth * 0.84;
        material.needsUpdate = true;
        loadedTextures += 1;

        if (loadedTextures >= Math.min(6, fragments.length)) {
          canvas.dataset.ready = "true";
        }
      },
      undefined,
      fail,
    );
    textures.add(texture);

    return state;
  });

  let resourcesReleased = false;
  releaseResources = () => {
    if (resourcesReleased) return;
    resourcesReleased = true;
    states.forEach(({ material, mesh }) => {
      scene.remove(mesh);
      material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    geometry.dispose();
    renderer.dispose();
  };

  const resize = () => {
    if (destroyed || failed) return;
    const rect = canvas.getBoundingClientRect();
    viewportWidth = Math.max(1, rect.width);
    viewportHeight = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr);

    renderer.setPixelRatio(dpr);
    renderer.setSize(viewportWidth, viewportHeight, false);
    canvas.dataset.dpr = dpr.toFixed(2);
    camera.left = -viewportWidth / 2;
    camera.right = viewportWidth / 2;
    camera.top = viewportHeight / 2;
    camera.bottom = -viewportHeight / 2;
    camera.updateProjectionMatrix();
  };

  const renderFrame = (time: number) => {
    rafId = 0;
    if (destroyed || failed || !isIntersecting || !isDocumentVisible) return;

    const deltaSeconds = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
    const elapsed = time / 1000;
    lastTime = time;

    const maximumRadius = Math.hypot(viewportWidth, viewportHeight) * 0.58;

    for (const state of states) {
      const { depth, width } = state.fragment;
      const depthSpeed = 0.032 + depth * 0.038;
      const velocityLift = Math.min(0.035, Math.abs(scrollVelocity) * 0.000025);
      state.progress =
        (state.progress + deltaSeconds * (depthSpeed + velocityLift)) % 1;

      const radius = maximumRadius * (0.035 + state.progress * 0.965);
      const tangentDrift =
        Math.sin(elapsed * 0.2 + state.phase) * state.drift;
      const cos = Math.cos(state.angle);
      const sin = Math.sin(state.angle);

      state.mesh.position.x = cos * radius - sin * tangentDrift;
      state.mesh.position.y = sin * radius + cos * tangentDrift;

      const fadeIn = THREE.MathUtils.smoothstep(state.progress, 0.03, 0.17);
      const fadeOut =
        1 - THREE.MathUtils.smoothstep(state.progress, 0.86, 1);
      state.material.opacity =
        (0.14 + depth * 0.86) * fadeIn * fadeOut;

      const depthScale = 0.52 + depth * 0.66;
      const perspectiveScale = 0.2 + state.progress * 0.7;
      const fragmentWidth =
        viewportWidth * width * depthScale * perspectiveScale;
      state.mesh.scale.set(fragmentWidth, fragmentWidth / state.displayAspect, 1);
    }

    scrollVelocity *= 0.9;

    if (time - lastSampleTime >= 250) {
      canvas.dataset.streamSample = states
        .slice(0, 4)
        .map((state) => state.progress.toFixed(5))
        .join(",");
      lastSampleTime = time;
    }

    try {
      renderer.render(scene, camera);
    } catch {
      fail();
      return;
    }

    rafId = requestAnimationFrame(renderFrame);
  };

  const start = () => {
    if (rafId || destroyed || failed || !isIntersecting || !isDocumentVisible) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(renderFrame);
  };

  const stop = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isIntersecting = entry?.isIntersecting ?? false;
      if (isIntersecting) start();
      else stop();
    },
    { rootMargin: "12% 0px", threshold: 0.01 },
  );
  intersectionObserver.observe(canvas);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const onVisibilityChange = () => {
    isDocumentVisible = document.visibilityState === "visible";
    if (isDocumentVisible) start();
    else stop();
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    fail();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  releaseRuntime = () => {
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    canvas.removeEventListener("webglcontextlost", onContextLost);
  };
  resize();
  start();

  return {
    setScrollVelocity(velocity) {
      scrollVelocity = velocity;
    },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      releaseRuntime();
      releaseResources();
      delete canvas.dataset.streamSample;
      delete canvas.dataset.ready;
      delete canvas.dataset.dpr;
    },
  };
}
