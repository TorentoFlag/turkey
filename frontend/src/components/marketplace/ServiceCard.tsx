"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { MarketplaceService } from "@/types/marketplace";
import { sitePath } from "@/lib/sitePath";

import styles from "./marketplace.module.css";

type ServiceCardProps = {
  service: MarketplaceService;
};

function formatDuration(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} мин`;
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const images = service.images?.length ? service.images : [service.imagePath];
  const [imageIndex, setImageIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  useEffect(() => {
    if (!isActive || images.length < 2) return;
    const timer = window.setInterval(() => setImageIndex((current) => (current + 1) % images.length), 1100);
    return () => window.clearInterval(timer);
  }, [images.length, isActive]);

  const duration = formatDuration(service.durationMinutes);
  const price = service.price > 0 ? new Intl.NumberFormat("ru-RU").format(service.price) : null;
  const categoryName = service.catalogSection === "Билеты в музеи и достопримечательности"
    ? "Билеты"
    : service.catalogSection;

  return (
    <article className={styles.serviceCard}>
      <Link
        aria-label={`Открыть ${service.title}`}
        className={styles.serviceCardLink}
        href={`/services/${service.slug}`}
        onFocus={() => setIsActive(true)}
        onMouseEnter={() => setIsActive(true)}
        onMouseLeave={() => { setIsActive(false); setImageIndex(0); }}
        onBlur={() => { setIsActive(false); setImageIndex(0); }}
      >
        <div className={styles.serviceCardMedia}>
          <Image
            alt={service.title}
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 33vw"
            src={sitePath(images[imageIndex])}
          />
          <span className={styles.serviceType}>{categoryName}</span>
          {images.length > 1 && (
            <span aria-hidden="true" className={styles.galleryDots}>
              {images.map((image, index) => <i className={index === imageIndex ? styles.galleryDotActive : ""} key={image} />)}
            </span>
          )}
        </div>
        <div className={styles.serviceCardContent}>
          <div>
            <h2>{service.title}</h2>
            <p>{service.description}</p>
          </div>
          <div className={styles.serviceMeta}>
            <span>{duration ?? service.deliveryMethod}</span>
            <strong>
              <span className={styles.priceLabel}>Цена</span>
              {service.priceLabel ?? (price ? <> от {price} ₽ <small>{service.priceUnit}</small></> : " по запросу")}
            </strong>
          </div>
          <span className={styles.cardAction}>Подробнее</span>
        </div>
      </Link>
    </article>
  );
}
