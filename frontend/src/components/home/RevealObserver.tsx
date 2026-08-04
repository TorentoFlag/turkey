"use client";

import { useEffect } from "react";

export function RevealObserver() {
  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const firstFold = window.innerHeight * 0.92;
    revealItems.forEach((item) => {
      if (item.getBoundingClientRect().top <= firstFold) {
        item.dataset.visible = "true";
      }
    });
    document.documentElement.dataset.revealReady = "true";

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.setAttribute("data-visible", "true");
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    revealItems.forEach((item) => revealObserver.observe(item));

    const toneItems = Array.from(document.querySelectorAll<HTMLElement>("[data-header-tone]"));
    let toneFrame = 0;
    const updateHeaderTone = () => {
      cancelAnimationFrame(toneFrame);
      toneFrame = requestAnimationFrame(() => {
        const focusX = window.innerWidth * 0.5;
        const focusY = window.innerHeight * 0.32;
        const pointTarget = document.elementFromPoint(focusX, focusY);
        const pointSection = pointTarget?.closest<HTMLElement>("[data-header-tone]");
        const candidates = toneItems.filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.top <= focusY && rect.bottom >= focusY;
        });
        const visible = pointSection ?? candidates
          .sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.width * aRect.height - bRect.width * bRect.height;
          })[0];
        if (visible) {
          document.documentElement.dataset.headerTone = visible.dataset.headerTone ?? "light";
        }
      });
    };

    updateHeaderTone();
    window.addEventListener("scroll", updateHeaderTone, { passive: true });
    window.addEventListener("resize", updateHeaderTone);

    const hero = document.getElementById("hero");
    const headerObserver = new IntersectionObserver(
      ([entry]) => {
        document.documentElement.dataset.headerCondensed = entry.isIntersecting
          ? "false"
          : "true";
      },
      { threshold: 0.18 },
    );
    if (hero) headerObserver.observe(hero);

    return () => {
      revealObserver.disconnect();
      cancelAnimationFrame(toneFrame);
      window.removeEventListener("scroll", updateHeaderTone);
      window.removeEventListener("resize", updateHeaderTone);
      headerObserver.disconnect();
      delete document.documentElement.dataset.revealReady;
    };
  }, []);

  return null;
}
