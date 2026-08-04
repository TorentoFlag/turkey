"use client";

import { useEffect, useState } from "react";

import { CART_UPDATED_EVENT, readCart } from "@/lib/marketplace/local-store";

type CartCountProps = {
  className?: string;
};

export function CartCount({ className }: CartCountProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => setCount(readCart().reduce((total, item) => total + item.quantity, 0));
    updateCount();
    window.addEventListener(CART_UPDATED_EVENT, updateCount);
    window.addEventListener("storage", updateCount);

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  if (count === 0) return null;

  return <span aria-label={`${count} ${count === 1 ? "товар" : "товара"} в корзине`} className={className}>{count}</span>;
}
