"use client";

import { useRouter } from "next/navigation";

import type { ProductType } from "@/lib/marketplace/api";

import styles from "./product-actions.module.css";

export function ProductActions({ productSlug, productType }: { productSlug: string; productType: ProductType }) {
  const router = useRouter();
  const label = productType === "booking" ? "Забронировать" : "Оформить";

  return <div className={styles.actions}><button className={styles.primary} onClick={() => router.push(`/checkout?product=${encodeURIComponent(productSlug)}`)} type="button">{label}</button></div>;
}
