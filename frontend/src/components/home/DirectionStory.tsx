"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DirectionScene } from "@/data/home";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { sitePath } from "@/lib/sitePath";

import { gsap } from "./motion/gsap";
import { FloemaMetaRow } from "./FloemaMetaRow";

function DirectionIcon({ index }: { index: number }) {
  const paths = [
    <path d="M4 20V7l8-3 8 3v13M4 20h16M8 20v-5h4v5M16 9h.01" key="city" />,
    <path d="M3 15c2.5-4 5.5-4 8 0s5.5 4 8 0M3 10c2.5-4 5.5-4 8 0s5.5 4 8 0" key="sea" />,
    <path d="M12 4v16M8 9h8M9 20h6M6 9c0-2 2-3 6-3s6 1 6 3" key="balloon" />,
    <path d="M4 16h16l-1.5-6H7L4 16ZM7 16l-1 3M17 16l1 3M8 10l1-3h6l1 3" key="car" />,
    <path d="M12 3v18M4 8h16M4 16h16M7 4l-3 4 3 4M17 12l3 4-3 4" key="help" />,
  ];

  return (
    <svg aria-hidden="true" className="direction-icon" viewBox="0 0 24 24">
      {paths[index] ?? paths[0]}
    </svg>
  );
}

export function DirectionStory({ scenes }: { scenes: DirectionScene[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [directionsVisible, setDirectionsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const sceneRatios = useRef(new Map<Element, number>());
  const previousIndex = useRef(-1);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const directionMotionState =
    reducedMotion === true
      ? "reduced"
      : reducedMotion === false && directionsVisible
        ? "full"
        : "pending";

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setDirectionsVisible(entry?.isIntersecting ?? false),
      { threshold: 0.15 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          sceneRatios.current.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        const active = Array.from(sceneRatios.current.entries())
          .filter(([, ratio]) => ratio > 0)
          .sort((a, b) => b[1] - a[1])[0]?.[0] as HTMLElement | undefined;
        if (active) setActiveIndex(Number(active.dataset.index));
      },
      { rootMargin: "-32% 0px -32% 0px", threshold: [0, 0.2, 0.5] },
    );

    sceneRefs.current.forEach((scene) => scene && observer.observe(scene));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (reducedMotion === null || !directionsVisible) return;

    const activeScene = sceneRefs.current[activeIndex];
    if (!activeScene) return;

    const parts = Array.from(
      activeScene.querySelectorAll<HTMLElement>("[data-direction-part]"),
    );
    if (!parts.length) return;

    const previous = previousIndex.current;
    previousIndex.current = activeIndex;
    const section = sectionRef.current;
    section?.setAttribute("data-direction-animation", "active");

    const part = (name: string) =>
      activeScene.querySelector<HTMLElement>(`[data-direction-part="${name}"]`);

    const context = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(parts, { clearProps: "all" });
        return;
      }

      const direction = previous < 0 || activeIndex >= previous ? 1 : -1;
      const fromX = direction * 72;
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .fromTo(
          part("meta"),
          { x: fromX, y: 10, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.34 },
          0,
        )
        .fromTo(
          part("badge"),
          { x: fromX * 0.72, y: 8, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.38 },
          "-=0.24",
        )
        .fromTo(
          part("title"),
          { x: fromX * 0.52, y: 18, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.56 },
          "-=0.22",
        )
        .fromTo(
          part("description"),
          { x: fromX * 0.34, y: 12, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.42 },
          "-=0.3",
        )
        .fromTo(
          part("cta"),
          { x: fromX * 0.22, y: 8, opacity: 0 },
          { x: 0, y: 0, opacity: 1, duration: 0.34 },
          "-=0.24",
        );
    }, activeScene);

    return () => {
      context.revert();
      if (section?.dataset.directionAnimation === "active") {
        section.removeAttribute("data-direction-animation");
      }
    };
  }, [activeIndex, directionsVisible, reducedMotion]);

  return (
    <section
      className="directions-story"
      data-header-tone="dark"
      data-direction-motion={directionMotionState}
      id="directions"
      ref={sectionRef}
    >
      <div className="direction-media-stage" aria-hidden="true">
        {scenes.map((scene, index) => (
          <div
            className="direction-media-layer"
            data-active={activeIndex === index}
            key={scene.number}
          >
            <Image
              alt=""
              fill
              priority={index === 0}
              loading={index > 0 && index < 3 ? "eager" : undefined}
              sizes="100vw"
              src={sitePath(scene.image)}
              style={{ objectPosition: scene.focalPoint }}
            />
          </div>
        ))}
        <div className="direction-stage-shade" />
        <div className="direction-progress" aria-hidden="true">
          <span style={{ transform: `scaleY(${(activeIndex + 1) / scenes.length})` }} />
        </div>
      </div>

      <div className="direction-scenes">
        {scenes.map((scene, index) => (
          <article
            className="direction-scene"
            data-direction-scene
            data-index={index}
            data-active={activeIndex === index}
            key={scene.number}
            ref={(element) => {
              sceneRefs.current[index] = element;
            }}
          >
            <div className="direction-mobile-media">
              <Image
                alt={scene.imageAlt}
                fill
                sizes="(max-width: 760px) 100vw, 1px"
                src={sitePath(scene.image)}
                style={{ objectPosition: scene.focalPoint }}
              />
            </div>
            <div className="direction-copy">
              <div className="direction-meta">
                <span data-direction-part="meta">{scene.number}</span>
                <span className="direction-badge" data-direction-part="badge">
                  <DirectionIcon index={index} />
                  {scene.label}
                </span>
              </div>
              <h2 data-direction-part="title">
                {scene.titleLines
                  ? scene.titleLines.map((line) => (
                      <span className="direction-title-line" key={line}>
                        {line}
                      </span>
                    ))
                  : scene.title}
              </h2>
              <p data-direction-part="description">{scene.description}</p>
              <a className="text-link light-link" data-direction-part="cta" href={sitePath(scene.href)}>
                <FloemaMetaRow
                  icon={<DirectionIcon index={index} />}
                  label={scene.cta}
                />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
