import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import styles from "@/components/marketplace/destination.module.css";
import { marketplaceDestinations } from "@/data/marketplace";
import { sitePath } from "@/lib/sitePath";

type DestinationPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return marketplaceDestinations.map(({ slug }) => ({ slug }));
}

export default async function DestinationPage({ params }: DestinationPageProps) {
  const { slug } = await params;
  const destination = marketplaceDestinations.find((item) => item.slug === slug);

  if (!destination) notFound();

  const catalogHref = "/catalog";

  return (
    <section className={styles.destinationDetail}>
      <MarketplaceBreadcrumbs
        items={[
          { label: "Направления", href: "/destinations" },
          { label: destination.name },
        ]}
      />

      <div className={styles.destinationHero}>
        <div className={styles.destinationHeroCopy}>
          <p>{destination.region}</p>
          <h2>{destination.name}</h2>
          <div>
            <p>{destination.description}</p>
            <p>Актуальные товары и услуги доступны в общем каталоге.</p>
          </div>
        </div>
        <div className={styles.destinationHeroImage}>
          <Image
            alt="Декоративная текстура травертина"
            fill
            priority
            sizes="(max-width: 960px) 100vw, 50vw"
            src={sitePath(destination.imagePath)}
          />
        </div>
      </div>

      <div className={styles.destinationServices}>
        <header className={styles.destinationServicesHeader}>
          <div>
            <p>Подборка для поездки</p>
            <h3>Услуги для поездки</h3>
          </div>
          <Link className={styles.catalogLink} href={catalogHref}>
            Открыть в каталоге
          </Link>
        </header>

        <p className={styles.emptyDestinationServices}>
          Каталог заполняется через админку. Выберите актуальный товар или услугу в общем каталоге.
        </p>
      </div>
    </section>
  );
}
