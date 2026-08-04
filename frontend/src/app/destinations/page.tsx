import { DestinationCard } from "@/components/marketplace/DestinationCard";
import styles from "@/components/marketplace/destination.module.css";
import { marketplaceDestinations } from "@/data/marketplace";

export default function DestinationsPage() {
  return (
    <section aria-label="Все направления" className={styles.destinationIndex}>
      <p className={styles.destinationIndexLead}>
        Выберите направление, чтобы посмотреть подборку услуг и перейти к каталогу с нужным фильтром.
      </p>
      <div className={styles.destinationGrid}>
        {marketplaceDestinations.map((destination) => (
          <DestinationCard destination={destination} key={destination.id} />
        ))}
      </div>
    </section>
  );
}
