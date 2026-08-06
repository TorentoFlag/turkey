"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { MarketplaceApiError, marketplaceApi, type ApiProduct } from "@/lib/marketplace/api";

import styles from "@/app/checkout/checkout.module.css";

const money = new Intl.NumberFormat("ru-RU");

function productTypeLabel(type: ApiProduct["type"]) {
  if (type === "booking") return "Бронирование";
  if (type === "physical") return "Товар с доставкой";
  return "Автовыдача";
}

function formatPrice(product: ApiProduct) {
  if (product.priceMinor === null || product.currency === null) return "Цена уточняется менеджером";
  const currency = product.currency === "RUB" ? "₽" : product.currency;
  return `${money.format(product.priceMinor / 100)} ${currency}`;
}

export function CheckoutForm() {
  const params = useSearchParams();
  const productId = params.get("product");
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [bookingStartDate, setBookingStartDate] = useState("");
  const [bookingEndDate, setBookingEndDate] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [bookingCreated, setBookingCreated] = useState(false);
  const idempotencyKey = useRef(globalThis.crypto.randomUUID());
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!productId) return () => { active = false; };

    marketplaceApi.product(productId)
      .then((item) => active && setProduct(item))
      .catch((requestError: unknown) => active && setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить товар."))
      .finally(() => active && setIsLoading(false));

    marketplaceApi.me()
      .then((account) => {
        if (!active) return;
        setEmail(account.email);
        setIsAuthenticated(true);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof MarketplaceApiError && requestError.status === 401) {
          setIsAuthenticated(false);
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Не удалось проверить сессию.");
      });

    return () => { active = false; };
  }, [productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;

    setError("");
    setIsSubmitting(true);
    try {
      const orderId = createdOrderId ?? (await marketplaceApi.createOrder({
        productId: product.id,
        email,
        phone,
        ...(product.type === "physical" ? { deliveryAddress } : {}),
        ...(product.type === "booking" ? { bookingStartDate, bookingEndDate } : {}),
        idempotencyKey: idempotencyKey.current,
      })).id;
      setCreatedOrderId(orderId);

      if (product.type === "booking") {
        setBookingCreated(true);
        return;
      }

      const { checkoutUrl } = await marketplaceApi.checkout(orderId);
      globalThis.location.assign(checkoutUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось оформить заказ.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!productId) {
    return <section className={styles.confirmation}><p className={styles.eyebrow}>Товар не выбран</p><h2>Сначала выберите товар в каталоге</h2><Link href="/catalog">Перейти в каталог</Link></section>;
  }

  if (isLoading) return <p role="status">Загружаем товар…</p>;
  if (error && !product) return <section className={styles.confirmation}><p className={styles.formError}>{error}</p><Link href="/catalog">Вернуться в каталог</Link></section>;
  if (!product) return null;

  if (bookingCreated) {
    return <section className={styles.confirmation}><p className={styles.eyebrow}>Заявка принята</p><h2>Мы взяли ваш заказ в работу</h2><p>Менеджер свяжется с вами по указанному телефону, чтобы обсудить детали бронирования.</p><div className={styles.confirmationActions}><Link href="/account">Открыть личный кабинет</Link><Link href="/catalog">Вернуться в каталог</Link></div></section>;
  }

  if (isAuthenticated === false) {
    return <section className={styles.confirmation}><p className={styles.eyebrow}>Вход обязателен</p><h2>Войдите, чтобы продолжить</h2><p>Регистрация нужна для оформления и истории ваших заказов.</p><Link href="/account">Войти или зарегистрироваться</Link></section>;
  }

  return (
    <div className={styles.checkoutFlow}>
      <section className={styles.selection}>
        <p className={styles.eyebrow}>{productTypeLabel(product.type)}</p>
        <h2>{product.title}</h2>
        <p>{product.description}</p>
        <div className={styles.totalRow}><span>{product.type === "booking" ? "Оплата" : "К оплате"}</span><strong>{product.type === "booking" ? "Не требуется" : formatPrice(product)}</strong></div>
      </section>
      <form className={styles.checkoutCard} onSubmit={submit}>
        <p className={styles.eyebrow}>Контактные данные</p>
        <h2>{product.type === "booking" ? "Оставьте заявку" : "Перейти к оплате"}</h2>
        <p className={styles.sectionNote}>{product.type === "booking" ? "Онлайн-оплата для брони не производится. После заявки с вами свяжется менеджер." : "После создания заказа вы будете перенаправлены в защищённую форму оплаты Arc Pay."}</p>
        <div className={styles.formGrid}>
          <label><span>Email</span><input autoComplete="email" disabled={isSubmitting} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label><span>Телефон</span><input autoComplete="tel" disabled={isSubmitting} onChange={(event) => setPhone(event.target.value)} required type="tel" value={phone} /></label>
        </div>
        {product.type === "physical" && <label><span>Адрес доставки</span><textarea disabled={isSubmitting} onChange={(event) => setDeliveryAddress(event.target.value)} required rows={3} value={deliveryAddress} /></label>}
        {product.type === "booking" && <div className={styles.formGrid}><label><span>Дата начала</span><input disabled={isSubmitting} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setBookingStartDate(event.target.value)} required type="date" value={bookingStartDate} /></label><label><span>Дата окончания</span><input disabled={isSubmitting} min={bookingStartDate || new Date().toISOString().slice(0, 10)} onChange={(event) => setBookingEndDate(event.target.value)} required type="date" value={bookingEndDate} /></label></div>}
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formActions}><Link className={styles.backButton} href={`/services/${product.slug}`}>Назад к товару</Link><button className={styles.nextButton} disabled={isSubmitting || isAuthenticated !== true} type="submit">{isSubmitting ? "Подождите…" : product.type === "booking" ? "Забронировать" : "Перейти к оплате"}</button></div>
      </form>
    </div>
  );
}
