import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import styles from "@/components/marketplace/destination.module.css";
import { marketplaceApi } from "@/lib/marketplace/api";
import { displayProductPrice } from "@/lib/marketplace/product-price";

type DestinationPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function DestinationPage({
  params,
}: DestinationPageProps) {
  const { slug } = await params;
  const detail = await marketplaceApi.destination(slug).catch(() => null);

  if (!detail) notFound();
  const { destination, products } = detail;

  const catalogHref = `/catalog?destination=${encodeURIComponent(destination.slug)}`;

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
          {destination.imageUrl ? (
            <Image
              alt={`Обложка направления ${destination.name}`}
              fill
              priority
              sizes="(max-width: 960px) 100vw, 50vw"
              src={destination.imageUrl}
              unoptimized
            />
          ) : null}
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

        <div className={styles.destinationServiceList}>
          {products.map((product) => (
            <article className={styles.destinationService} key={product.id}>
              <Link href={`/services/${product.slug}`}>
                <div>
                  {product.imageUrl ? (
                    <Image
                      alt=""
                      fill
                      sizes="(max-width: 720px) 100vw, (max-width: 960px) 50vw, 33vw"
                      src={product.imageUrl}
                      unoptimized
                    />
                  ) : null}
                </div>
                <p>
                  {product.type === "booking"
                    ? "Бронирование"
                    : "Оплата онлайн"}
                </p>
                <h4>{product.title}</h4>
                <span>{product.description}</span>
                <strong>{displayProductPrice(product)}</strong>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
