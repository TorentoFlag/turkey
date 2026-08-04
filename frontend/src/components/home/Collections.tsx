"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { collectionItems } from "@/data/home";
import { sitePath } from "@/lib/sitePath";

function CollectionIcon({ index }: { index: number }) {
  const paths = [
    "M4 20V7l8-3 8 3v13M4 20h16M8 20v-5h4v5M16 9h.01",
    "M3 15c2.5-4 5.5-4 8 0s5.5 4 8 0M3 10c2.5-4 5.5-4 8 0s5.5 4 8 0",
    "M12 4v16M8 9h8M9 20h6M6 9c0-2 2-3 6-3s6 1 6 3",
    "M4 17l8-13 8 13M7 17h10M9 13h6",
    "M12 3v18M4 8h16M4 16h16M7 4l-3 4 3 4M17 12l3 4-3 4",
  ];

  return (
    <svg aria-hidden="true" className="collection-icon" viewBox="0 0 24 24">
      <path d={paths[index] ?? paths[0]} />
    </svg>
  );
}

export function Collections() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const activateCollection = (index: number) => {
    if (activeIndex !== index) setActivePreviewIndex(0);
    setActiveIndex(index);
    setIsInteracting(true);
  };

  const deactivateCollection = () => {
    setIsInteracting(false);
    setActiveIndex(null);
  };

  useEffect(() => {
    if (activeIndex === null) return;

    previewTimer.current = setInterval(() => {
      setActivePreviewIndex((current) => (current + 1) % collectionItems[activeIndex].images.length);
    }, 750);

    return () => {
      if (previewTimer.current) {
        clearInterval(previewTimer.current);
        previewTimer.current = null;
      }
    };
  }, [activeIndex]);

  return (
    <section
      className="collections-section"
      data-interaction={isInteracting ? "open" : "list"}
      id="collections"
      data-header-tone="light"
      data-reveal
      onMouseLeave={deactivateCollection}
    >
      <div className="collections-atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="collections-intro">
        <p>The Collections</p>
      </div>
      <div className="collection-list">
        {collectionItems.map((item, index) => (
          <Link
            className={`collection-row collection-row-${index + 1}`}
            data-active={isInteracting && activeIndex === index}
            data-reveal
            data-reveal-step={String((index % 4) + 1)}
            href={item.href}
            key={item.name}
            onClick={() => activateCollection(index)}
            onFocus={() => activateCollection(index)}
            onMouseEnter={() => activateCollection(index)}
          >
            <span className="collection-index">0{index + 1}</span>
            <span className="collection-content">
              {index === 3 && <CollectionThumb item={item} index={index} activeIndex={activeIndex} activePreviewIndex={activePreviewIndex} />}
              <span className="collection-icon-wrap"><CollectionIcon index={index} /></span>
              {index === 1 && <CollectionThumb item={item} index={index} activeIndex={activeIndex} activePreviewIndex={activePreviewIndex} />}
              <span className="collection-name-main">{item.name}</span>
              {index !== 3 && index !== 2 && index !== 1 && <CollectionThumb item={item} index={index} activeIndex={activeIndex} activePreviewIndex={activePreviewIndex} />}
              <span className="collection-count">({item.count.replace(/ .*/, "")})</span>
              {index === 2 && <CollectionThumb item={item} index={index} activeIndex={activeIndex} activePreviewIndex={activePreviewIndex} />}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CollectionThumb({
  item,
  index,
  activeIndex,
  activePreviewIndex,
}: {
  item: (typeof collectionItems)[number];
  index: number;
  activeIndex: number | null;
  activePreviewIndex: number;
}) {
  const isActive = activeIndex === index;

  return (
    <span className="collection-thumb">
      <Image
        alt={item.alt}
        fill
        key={`${item.name}-${isActive ? activePreviewIndex : 0}`}
        sizes="(max-width: 760px) 7rem, 16rem"
        src={sitePath(item.images[isActive ? activePreviewIndex : 0])}
      />
    </span>
  );
}
