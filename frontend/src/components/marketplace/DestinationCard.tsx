import Image from "next/image";
import Link from "next/link";

import { sitePath } from "@/lib/sitePath";
import type { MarketplaceDestination } from "@/types/marketplace";

import styles from "./destination.module.css";

type DestinationCardProps = {
  destination: MarketplaceDestination;
};

export function DestinationCard({ destination }: DestinationCardProps) {
  return (
    <article className={styles.destinationCard}>
      <Link className={styles.destinationCardLink} href={`/destinations/${destination.slug}`}>
        <div className={styles.destinationCardMedia}>
          <Image
            alt="Декоративная текстура травертина"
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 33vw"
            src={sitePath(destination.imagePath)}
          />
        </div>
        <div className={styles.destinationCardContent}>
          <p>{destination.region}</p>
          <h2>{destination.name}</h2>
          <span>{destination.description}</span>
        </div>
      </Link>
    </article>
  );
}
