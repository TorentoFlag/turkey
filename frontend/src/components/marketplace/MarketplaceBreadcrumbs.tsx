import Link from "next/link";

import styles from "./marketplace.module.css";

export type MarketplaceBreadcrumb = {
  label: string;
  href?: string;
};

type MarketplaceBreadcrumbsProps = {
  items: MarketplaceBreadcrumb[];
};

export function MarketplaceBreadcrumbs({ items }: MarketplaceBreadcrumbsProps) {
  return (
    <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li key={`${item.label}-${item.href ?? "current"}`}>
              {isCurrent || !item.href ? (
                <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
