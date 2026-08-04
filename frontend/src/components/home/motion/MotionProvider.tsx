"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import { createMotionLifecycle } from "@/lib/motionLifecycle";

import { gsap, ScrollTrigger } from "./gsap";

export function MotionProvider() {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const saveData = Boolean(connection?.saveData);
    const root = document.documentElement;
    const lifecycle = createMotionLifecycle({
      startMotion() {
        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        const update = (time: number) => lenis.raf(time * 1000);
        let active = true;
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(update);
        gsap.ticker.lagSmoothing(0);

        document.fonts.ready.then(() => {
          if (active) ScrollTrigger.refresh();
        });

        return () => {
          active = false;
          gsap.ticker.remove(update);
          lenis.destroy();
        };
      },
      setMotionState(reduced) {
        root.dataset.motion = reduced ? "reduced" : "full";
      },
      setReady(ready) {
        if (ready) root.dataset.motionReady = "true";
        else delete root.dataset.motionReady;
      },
      clearDocumentState() {
        delete root.dataset.motion;
        delete root.dataset.saveData;
      },
      killAllScrollTriggers() {
        ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      },
    });

    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      lifecycle.apply(event.matches);
    };

    root.dataset.saveData = saveData ? "true" : "false";
    lifecycle.apply(media.matches);
    media.addEventListener("change", handlePreferenceChange);

    return () => {
      media.removeEventListener("change", handlePreferenceChange);
      lifecycle.destroy();
    };
  }, []);

  return <span data-motion-provider hidden />;
}
