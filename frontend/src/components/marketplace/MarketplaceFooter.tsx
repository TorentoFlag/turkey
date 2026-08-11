import Link from "next/link";
import Image from "next/image";

import { siteConfig } from "@/config/site";
import { sitePath } from "@/lib/sitePath";

import styles from "./marketplace.module.css";

export function MarketplaceFooter() {
  return (
    <footer className={styles.marketplaceFooter}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <p className={styles.footerNote}>
            Выберите маршрут и оформите заказ в удобном формате.
          </p>
          <section
            aria-label="Способы оплаты"
            className={styles.footerPayments}
          >
            <p>Оплата онлайн</p>
            <div className={styles.paymentBadges}>
              <Image
                alt="Система быстрых платежей"
                className={styles.sbpBadge}
                height={120}
                src={sitePath("/payment/sbp-logo.svg")}
                width={98}
              />
              <Image
                alt="Платёжная система Мир"
                className={styles.mirBadge}
                height={120}
                src={sitePath("/payment/mir-logo.svg")}
                width={400}
              />
            </div>
          </section>
        </div>
        <div className={styles.footerSections}>
          <nav aria-label="Навигация в подвале" className={styles.footerNav}>
            <Link href="/catalog">Каталог</Link>
            <Link href="/destinations">Направления</Link>
            <Link href="/search">Поиск</Link>
            <a href={sitePath("/account/")}>Личный кабинет</a>
          </nav>
          <nav aria-label="Документы" className={styles.footerNav}>
            <Link href="/legal/terms">Пользовательское соглашение</Link>
            <Link href="/legal/privacy">Политика конфиденциальности</Link>
          </nav>
          <section aria-label="Реквизиты компании" className={styles.footerCompany}>
            <p>{siteConfig.legalCompanyName}</p>
            <p>Регистрационный номер: {siteConfig.registrationNumber}</p>
            <p>{siteConfig.legalAddress}</p>
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          </section>
        </div>
      </div>
    </footer>
  );
}
