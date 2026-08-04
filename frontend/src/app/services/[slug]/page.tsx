import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductActions } from "@/components/marketplace/ProductActions";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { marketplaceServices } from "@/data/marketplace";
import { sitePath } from "@/lib/sitePath";

import styles from "./product.module.css";

type ServicePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return marketplaceServices.map(({ slug }) => ({ slug }));
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = marketplaceServices.find((item) => item.slug === slug);

  if (!service) notFound();

  const price = service.price > 0 ? new Intl.NumberFormat("ru-RU").format(service.price) : null;
  const durationLabels: Record<string, string> = {
    "up-to-2-hours": "до 2 часов",
    "half-day": "полдня",
    "full-day": "полный день",
    "multi-day": "несколько дней",
  };

  return (
    <div className={styles.productPage}>
      <MarketplaceHeader currentPath="/catalog" />
      <div className={styles.productBreadcrumbs}>
        <MarketplaceBreadcrumbs
          items={[
            { label: "Каталог", href: "/catalog" },
            { label: service.title },
          ]}
        />
      </div>
      <div className={styles.productGrid}>
        <div className={styles.productMedia}>
          <Image
            alt={service.title}
            fill
            priority
            sizes="(max-width: 760px) 100vw, 55vw"
            src={sitePath(service.imagePath)}
          />
        </div>
        <article className={styles.productCopy}>
          <p className={styles.productEyebrow}>{service.catalogSection}</p>
          <h1>{service.title}</h1>
          <p className={styles.productDescription}>{service.description}</p>
          <dl className={styles.productMeta}>
            <div><dt>Формат</dt><dd>{service.deliveryMethod}</dd></div>
            <div><dt>Срок</dt><dd>{service.duration ? durationLabels[service.duration] ?? service.duration : "по запросу"}</dd></div>
            <div><dt>В стоимость входит</dt><dd>{service.included.join(" · ")}</dd></div>
          </dl>
          <div className={styles.productPurchase}>
            <div>
              <span>Цена</span>
              <strong>{service.priceLabel ?? (price ? `от ${price} ₽` : "Цена по запросу")}</strong>
            </div>
            <ProductActions serviceId={service.id} serviceTitle={service.title} />
          </div>
          <Link className={styles.backLink} href="/catalog">Вернуться в каталог</Link>
        </article>
      </div>
    </div>
  );
}
