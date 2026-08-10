import Image from "next/image";
import Link from "next/link";

import type { ApiDestination } from "@/lib/marketplace/api";

import styles from "./destination.module.css";

type DestinationCardProps = {
  destination: ApiDestination;
};

export function DestinationCard({ destination }: DestinationCardProps) {
  return (
    <article className={styles.destinationCard}>
      <Link
        className={styles.destinationCardLink}
        href={`/destinations/${destination.slug}`}
      >
        <div className={styles.destinationCardMedia}>
          {destination.imageUrl ? (
            <Image
              alt={`Обложка направления ${destination.name}`}
              fill
              sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 33vw"
              src={destination.imageUrl}
              unoptimized
            />
          ) : null}
        </div>
        <div className={styles.destinationCardContent}>
          <p>{destination.region}</p>
          <h2>{destination.name}</h2>
          <span>{destination.description}</span>
          <small>
            {destination.productCount}{" "}
            {destination.productCount === 1 ? "товар" : "товаров"}
          </small>
        </div>
      </Link>
    </article>
  );
}
