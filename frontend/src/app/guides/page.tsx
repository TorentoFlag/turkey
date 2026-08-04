import Image from "next/image";
import Link from "next/link";

import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { travelGuides } from "@/data/guides";
import { sitePath } from "@/lib/sitePath";

import styles from "./guides.module.css";

export default function GuidesPage() {
  return (
    <div className={styles.page}>
      <MarketplaceHeader currentPath="/guides" />
      <main className={styles.main}>
        <div className={styles.breadcrumbs}>
          <MarketplaceBreadcrumbs items={[{ label: "Советы" }]} />
        </div>
        <section className={styles.hubIntro}>
          <h1 className={styles.hubTitle}>Готовые решения для поездки</h1>
          <p className={styles.hubDescription}>
            Бесплатные планы и подсказки по городам — чтобы понять следующий шаг,
            а потом при желании заказать нужную услугу в Faro.
          </p>
        </section>
        <section aria-label="Советы по городам" className={styles.guideGrid}>
          {travelGuides.map((guide) => (
            <Link className={styles.guideCard} href={`/guides/${guide.slug}`} key={guide.slug}>
              <div className={styles.guideCardMedia}>
                <Image alt="" fill sizes="(max-width: 820px) 100vw, 33vw" src={sitePath(guide.imagePath)} />
              </div>
              <div className={styles.guideCardCopy}>
                <span>{guide.eyebrow}</span>
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
