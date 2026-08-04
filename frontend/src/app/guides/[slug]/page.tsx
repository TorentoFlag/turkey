import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getTravelGuide, travelGuides } from "@/data/guides";
import { sitePath } from "@/lib/sitePath";

import styles from "../guides.module.css";

export function generateStaticParams() {
  return travelGuides.map((guide) => ({ slug: guide.slug }));
}

type TravelGuidePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TravelGuidePage({ params }: TravelGuidePageProps) {
  const { slug } = await params;
  const guide = getTravelGuide(slug);

  if (!guide) notFound();

  return (
    <div className={styles.page}>
      <MarketplaceHeader currentPath="/guides" />
      <main className={styles.main}>
        <div className={styles.breadcrumbs}>
          <MarketplaceBreadcrumbs items={[{ label: "Советы", href: "/guides" }, { label: guide.title }]} />
        </div>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{guide.eyebrow}</p>
            <h1 className={styles.title}>{guide.title}</h1>
            <p className={styles.description}>{guide.description}</p>
          </div>
          <div className={styles.media}>
            <Image alt="" fill priority sizes="(max-width: 820px) 100vw, 58vw" src={sitePath(guide.imagePath)} />
          </div>
        </section>
        <section className={styles.content}>
          <p className={styles.contentLabel}>Что сделать заранее</p>
          <ol className={styles.steps}>
            {guide.steps.map((step) => (
              <li className={styles.step} key={step.label}>
                <span className={styles.stepNumber}>{step.label}</span>
                <h2 className={styles.stepTitle}>{step.title}</h2>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
            <li className={styles.actions}>
              {guide.actions.map((action) => (
                <Link className={styles.action} href={action.href} key={action.href}>
                  {action.label}
                </Link>
              ))}
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
