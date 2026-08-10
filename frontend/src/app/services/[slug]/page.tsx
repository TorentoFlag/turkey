"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MarketplaceBreadcrumbs } from "@/components/marketplace/MarketplaceBreadcrumbs";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { ProductActions } from "@/components/marketplace/ProductActions";
import { marketplaceApi, type ApiProduct } from "@/lib/marketplace/api";
import { displayProductPrice } from "@/lib/marketplace/product-price";

import styles from "./product.module.css";

function typeLabel(type: ApiProduct["type"]) {
  if (type === "booking") return "Бронирование";
  if (type === "physical") return "Товар с доставкой";
  return "Автовыдача";
}

function priceLabel(product: ApiProduct) {
  return displayProductPrice(product);
}

export default function ServicePage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    marketplaceApi.product(slug)
      .then((item) => active && setProduct(item))
      .catch((requestError: unknown) => active && setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить товар."));
    return () => { active = false; };
  }, [slug]);

  if (error) return <div className={styles.productPage}><MarketplaceHeader currentPath="/catalog" /><main className={styles.productGrid}><section className={styles.productCopy}><h1>Товар недоступен</h1><p className={styles.productDescription}>{error}</p><Link className={styles.backLink} href="/catalog">Вернуться в каталог</Link></section></main></div>;
  if (!product) return <div className={styles.productPage}><MarketplaceHeader currentPath="/catalog" /><main className={styles.productGrid}><p role="status">Загружаем товар…</p></main></div>;

  return (
    <div className={styles.productPage}>
      <MarketplaceHeader currentPath="/catalog" />
      <div className={styles.productBreadcrumbs}><MarketplaceBreadcrumbs items={[{ label: "Каталог", href: "/catalog" }, { label: product.title }]} /></div>
      <main className={styles.productGrid}>
        <div aria-label={product.title} className={styles.productMedia} role="img" style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} />
        <article className={styles.productCopy}>
          <p className={styles.productEyebrow}>{typeLabel(product.type)}</p>
          <h1>{product.title}</h1>
          <p className={styles.productDescription}>{product.description}</p>
          <dl className={styles.productMeta}><div><dt>Формат</dt><dd>{typeLabel(product.type)}</dd></div><div><dt>Оформление</dt><dd>{product.type === "booking" ? "Заявка без оплаты на сайте" : "Оплата через Arc Pay"}</dd></div></dl>
          <div className={styles.productPurchase}><div><span>Цена</span><strong>{priceLabel(product)}</strong></div><ProductActions productSlug={product.slug} productType={product.type} /></div>
          <Link className={styles.backLink} href="/catalog">Вернуться в каталог</Link>
        </article>
      </main>
    </div>
  );
}
