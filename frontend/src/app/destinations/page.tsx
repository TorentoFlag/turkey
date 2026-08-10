import { DestinationCard } from "@/components/marketplace/DestinationCard";
import styles from "@/components/marketplace/destination.module.css";
import { marketplaceApi } from "@/lib/marketplace/api";

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const destinations = await marketplaceApi.destinations().catch(() => []);
  return (
    <section aria-label="Все направления" className={styles.destinationIndex}>
      <p className={styles.destinationIndexLead}>
        Выберите направление, чтобы посмотреть подборку услуг и перейти к
        каталогу с нужным фильтром.
      </p>
      <div className={styles.destinationGrid}>
        {destinations.map((destination) => (
          <DestinationCard destination={destination} key={destination.id} />
        ))}
      </div>
      {destinations.length === 0 ? (
        <p className={styles.emptyDestinationServices}>
          Направления появятся здесь после публикации товаров в подборках.
        </p>
      ) : null}
    </section>
  );
}
