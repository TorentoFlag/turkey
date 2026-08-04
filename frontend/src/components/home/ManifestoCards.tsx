"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { sitePath } from "@/lib/sitePath";

const cards = [
  {
    title: "Впечатления, которые остаются",
    label: "Впечатления и экскурсии",
    href: "/catalog?category=activities",
    alt: "Турецкие впечатления и прогулки",
    images: [
      "/images/turkish-coffee-sand.png",
      "/images/bosphorus-ferry.jpg",
      "/images/service-legends.jpg",
      "/images/spice-bazaar.jpg",
    ],
  },
  {
    title: "Места вне привычного списка",
    label: "Каппадокия · на рассвете",
    href: "/catalog?destination=cappadocia",
    alt: "Каппадокия на рассвете",
    images: [
      "/images/cappadocia-rocks.jpg",
      "/images/cappadocia-dawn.jpg",
      "/images/cappadocia-soft.jpg",
      "/images/home-canvas/cappadocia-cave-hotel.webp",
    ],
  },
] as const;

function ManifestoCard({ card, index }: { card: (typeof cards)[number]; index: number }) {
  const [isActive, setIsActive] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPreview = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    stopPreview();
    if (!isActive) return;

    timer.current = setInterval(() => {
      setImageIndex((current) => (current + 1) % card.images.length);
    }, 900);

    return () => {
      stopPreview();
    };
  }, [card.images.length, isActive]);

  const activate = () => {
    if (isActive) return;
    setIsActive(true);
    setImageIndex(0);
  };

  const deactivate = () => {
    stopPreview();
    setIsActive(false);
    setImageIndex(0);
  };

  return (
    <Link
      aria-label={`${card.title}: открыть каталог`}
      className="manifesto-card-link"
      data-reveal
      data-reveal-step={index + 2}
      href={card.href}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) deactivate();
      }}
      onFocus={activate}
      onMouseEnter={activate}
      onMouseLeave={deactivate}
    >
      <article>
        <div className="manifesto-card-image">
          {card.images.map((image, imageIndexForCard) => (
            <Image
              alt={imageIndexForCard === 0 ? card.alt : ""}
              aria-hidden={imageIndexForCard !== 0}
              className={imageIndexForCard === imageIndex ? "is-active" : ""}
              fill
              key={image}
              loading="eager"
              sizes="(max-width: 760px) 100vw, 15vw"
              src={sitePath(image)}
            />
          ))}
        </div>
        <strong>{card.title}</strong>
        <span>{card.label}</span>
      </article>
    </Link>
  );
}

export function ManifestoCards() {
  return (
    <div className="manifesto-cards">
      {cards.map((card, index) => (
        <ManifestoCard card={card} index={index} key={card.href} />
      ))}
    </div>
  );
}
