import Image from "next/image";
import Link from "next/link";

import { sitePath } from "@/lib/sitePath";

import styles from "./marketplace.module.css";

type MarketplaceHeaderProps = {
  currentPath?: string;
};

const navigation = [
  { label: "Каталог", href: "/catalog" },
  { label: "Направления", href: "/destinations" },
] as const;

export function MarketplaceHeader({ currentPath }: MarketplaceHeaderProps) {
  return (
    <header className={styles.marketplaceHeader}>
      <div className={styles.headerInner}>
        <Link aria-label="Faro — главная страница" className={styles.brand} href="/">
          <Image alt="Faro" height={46} priority src={sitePath("/faro-logo.svg")} width={109} />
        </Link>
        <nav aria-label="Основная навигация" className={styles.primaryNav}>
          {navigation.map((item) => (
            <Link
              aria-current={currentPath === item.href ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          <Link aria-current={currentPath === "/search" ? "page" : undefined} href="/search">
            Поиск
          </Link>
          <a aria-current={currentPath === "/account" ? "page" : undefined} href={sitePath("/account/")}>
            Личный кабинет
          </a>
        </nav>
      </div>
    </header>
  );
}
