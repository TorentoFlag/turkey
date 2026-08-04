"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

import type { HeroFragment } from "@/data/home";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { sitePath } from "@/lib/sitePath";

import { createHeroScene } from "./motion/createHeroScene";
import { gsap, ScrollTrigger } from "./motion/gsap";
import type { HeroSceneController } from "./motion/types";

type HeroCanvasSceneProps = {
  fragments: HeroFragment[];
};

export function HeroCanvasScene({
  fragments,
}: HeroCanvasSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<HeroSceneController | null>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas || reducedMotion !== false) return;

    const root = document.documentElement;
    const forceFailure = new URLSearchParams(window.location.search).has(
      "forceWebglFailure",
    );
    let failed = false;

    const handleFailure = () => {
      failed = true;
      root.dataset.webgl = "failed";
      canvas.dataset.ready = "false";
    };

    root.dataset.webgl = "loading";

    if (forceFailure) {
      handleFailure();
      return () => {
        if (root.dataset.webgl === "failed") delete root.dataset.webgl;
      };
    }

    const maxDpr =
      root.dataset.saveData === "true" ? 1 : window.innerWidth <= 760 ? 1.25 : 1.5;
    const controller = createHeroScene(canvas, fragments, {
      maxDpr,
      onFailure: handleFailure,
    });
    controllerRef.current = controller;

    const readinessObserver = new MutationObserver(() => {
      if (canvas.dataset.ready === "true" && !failed) {
        root.dataset.webgl = "ready";
      }
    });
    readinessObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ["data-ready"],
    });
    if (canvas.dataset.ready === "true") root.dataset.webgl = "ready";

    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=100%",
        pin: true,
        pinSpacing: false,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => controller.setScrollVelocity(self.getVelocity()),
      });
    }, section);

    return () => {
      readinessObserver.disconnect();
      context.revert();
      controller.destroy();
      controllerRef.current = null;
      if (root.dataset.webgl === "ready" || root.dataset.webgl === "loading") {
        delete root.dataset.webgl;
      }
    };
  }, [fragments, reducedMotion]);

  return (
    <section
      className="hero-canvas-scene"
      data-header-tone="light"
      id="hero"
      ref={sectionRef}
    >
      <canvas
        aria-hidden="true"
        data-hero-canvas
        data-hero-fragments={fragments.length}
        ref={canvasRef}
      />
      <div aria-hidden="true" data-hero-fallback />
      <div aria-hidden="true" className="hero-static-fragments" data-hero-static>
        {fragments.map((fragment, index) => (
          <div
            className="hero-static-fragment"
            data-hero-static-fragment
            key={`${fragment.image}-${index}`}
            style={
              {
                "--hero-x": `${fragment.x * 100}%`,
                "--hero-y": `${fragment.y * 100}%`,
                "--hero-width": `${fragment.width * 100}%`,
                "--hero-dx": `${(0.5 - fragment.x) * 100}vw`,
                "--hero-dy": `${(0.5 - fragment.y) * 100}vh`,
                "--hero-delay": `${index * 90}ms`,
              } as CSSProperties
            }
          >
            <Image alt="" fill sizes="20vw" src={sitePath(fragment.image)} />
          </div>
        ))}
      </div>
      <div className="hero-canvas-copy">
        <h1>
          <span>Турция, собранная </span>
          <span>под ваш маршрут</span>
        </h1>
        <p>
          Экскурсии, трансферы, билеты, связь и полезные услуги — до поездки и уже на месте.
        </p>
        <Link className="hero-catalog-link" href="/catalog">
          Перейти в каталог
        </Link>
      </div>
    </section>
  );
}
