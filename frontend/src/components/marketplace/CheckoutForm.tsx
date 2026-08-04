"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { MarketplaceBookingDetails, MarketplaceDeliveryChannel, MarketplaceOrder, MarketplaceService } from "@/types/marketplace";
import { createOrderId, readCart, readOrders, writeCart, writeOrders } from "@/lib/marketplace/local-store";
import { sitePath } from "@/lib/sitePath";
import { canAccessCheckout } from "@/lib/marketplace/checkout-access";
import styles from "@/app/checkout/checkout.module.css";

const money = new Intl.NumberFormat("ru-RU");
const channels: { value: MarketplaceDeliveryChannel; label: string; hint: string }[] = [
  { value: "email", label: "Email", hint: "Билеты и инструкции придут на почту." },
  { value: "whatsapp", label: "WhatsApp", hint: "Отправим подтверждение и детали в WhatsApp." },
  { value: "phone", label: "Телефон", hint: "Свяжемся по телефону для подтверждения." },
];
const languages = ["Русский", "Английский", "Турецкий"] as const;
const initialBookingDetails: MarketplaceBookingDetails = { date: "", time: "", participants: 1, language: "Русский", pickup: "", routeFrom: "", routeTo: "", activationDate: "" };

type Step = "cart" | "details" | "payment";
type Account = { email: string; name: string };

function readAccount(): Account | null {
  const raw = window.localStorage.getItem("faro-account");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

function subscribeToAccount(callback: () => void) {
  window.addEventListener("faro-account-updated", callback);
  return () => window.removeEventListener("faro-account-updated", callback);
}

function stepFromQuery(value: string | null): Step {
  return value === "details" || value === "payment" ? value : "cart";
}

export function CheckoutForm({ services }: { services: MarketplaceService[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const requestedId = params.get("service");
  const orderQuery = params.get("order");
  const step = stepFromQuery(params.get("step"));
  const [cart, setCart] = useState(readCart);
  const account = useSyncExternalStore(subscribeToAccount, readAccount, () => null);
  const [order, setOrder] = useState<MarketplaceOrder | null>(() => orderQuery ? readOrders().find(({ id }) => id === orderQuery) ?? null : null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState<MarketplaceDeliveryChannel>("email");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [comment, setComment] = useState("");
  const [bookingDetails, setBookingDetails] = useState<MarketplaceBookingDetails>(initialBookingDetails);
  const [cardholder, setCardholder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  useEffect(() => {
    const sync = () => setCart(readCart());
    window.addEventListener("faro-cart-updated", sync);
    return () => window.removeEventListener("faro-cart-updated", sync);
  }, []);

  // Старые ссылки с ?service= не должны возвращать товар после удаления.
  // Один раз переносим его в корзину и очищаем URL — дальше корзина является
  // единственным источником выбранных товаров.
  useEffect(() => {
    if (!requestedId) return;
    const current = readCart();
    if (!current.some(({ serviceId }) => serviceId === requestedId)) {
      writeCart([...current, { serviceId: requestedId, quantity: 1 }]);
    }
    router.replace("/checkout");
  }, [requestedId, router]);

  const selected = useMemo(() => {
    const ids = new Set(cart.map(({ serviceId }) => serviceId));
    return services.filter((service) => ids.has(service.id));
  }, [cart, services]);

  const quantityFor = (serviceId: string) => cart.find((item) => item.serviceId === serviceId)?.quantity ?? 1;
  const total = selected.reduce((sum, service) => sum + service.price * quantityFor(service.id), 0);
  const deliveryHint = channels.find(({ value }) => value === deliveryChannel)?.hint;

  function navigateTo(nextStep: Step) {
    setError("");
    router.replace(`/checkout?step=${nextStep}`);
  }

  function updateQuantity(serviceId: string, quantity: number) {
    const next = readCart()
      .map((item) => item.serviceId === serviceId ? { ...item, quantity } : item)
      .filter(({ quantity: nextQuantity }) => nextQuantity > 0);
    setCart(next);
    writeCart(next);
  }

  function removeFromCart(serviceId: string) {
    const next = readCart().filter((item) => item.serviceId !== serviceId);
    setCart(next);
    writeCart(next);
  }

  function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAccessCheckout(account)) {
      window.location.href = sitePath("/account/");
      return;
    }
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length !== 16 || !/^\d{2}\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvc)) {
      setError("Проверьте номер карты, срок действия и CVC.");
      return;
    }
    const nextOrder: MarketplaceOrder = {
      id: createOrderId(),
      createdAt: new Date().toISOString(),
      status: "paid",
      customer: { name, email, phone, deliveryChannel, deliveryAddress: deliveryChannel === "email" ? email : deliveryAddress, comment },
      items: selected.map((service) => ({ serviceId: service.id, title: service.title, price: service.price, currency: service.currency, priceUnit: service.priceUnit, quantity: quantityFor(service.id), bookingDetails })),
      total,
      currency: "RUB",
    };
    writeOrders([nextOrder, ...readOrders()]);
    writeCart([]);
    setOrder(nextOrder);
    router.replace(`/checkout?order=${nextOrder.id}`);
  }

  if (order) {
    return (
      <section className={styles.confirmation}>
        <p className={styles.eyebrow}>Оплата прошла</p>
        <h2>Заказ оформлен</h2>
        <p className={styles.orderNumber}>Номер заказа: <strong>{order.id}</strong></p>
        <div className={styles.confirmationItems}>
          {order.items.map((item) => <div className={styles.selectionRow} key={item.serviceId}><span>{item.title}<small>{item.quantity} шт. · {item.bookingDetails.date ? `дата ${item.bookingDetails.date}` : "цифровая доставка"}{item.bookingDetails.time ? ` · ${item.bookingDetails.time}` : ""}</small></span><strong>{money.format(item.price * item.quantity)} ₽</strong></div>)}
        </div>
        <p><strong>Итого: {money.format(order.total)} ₽</strong></p>
        <p>Детали заказа доставим через {channels.find(({ value }) => value === order.customer.deliveryChannel)?.label}.</p>
        <div className={styles.confirmationActions}><a href={sitePath("/account/")}>Открыть личный кабинет</a><Link href="/catalog">Вернуться в каталог</Link></div>
      </section>
    );
  }

  if (!selected.length) {
    return <section className={styles.confirmation}><p className={styles.eyebrow}>Корзина пуста</p><h2>Добавьте товар, чтобы продолжить</h2><p>Выберите eSIM, билет, тур или другую услугу в каталоге.</p><Link href="/catalog">Перейти в каталог</Link></section>;
  }

  if (!canAccessCheckout(account) && step !== "cart") {
    return (
      <section className={styles.confirmation}>
        <p className={styles.eyebrow}>Вход обязателен</p>
        <h2>Войдите, чтобы оформить заказ</h2>
        <p>После входа сохранятся настройки поездки, номер заказа и инструкции по доставке.</p>
        <a href={sitePath("/account/")}>Войти или зарегистрироваться</a>
      </section>
    );
  }

  return (
    <div className={styles.checkoutFlow}>
      <div className={styles.steps} aria-label="Шаги оформления">
        {["cart", "details", "payment"].map((item, index) => <span className={step === item ? styles.activeStep : ""} key={item}>{index + 1}. {item === "cart" ? "Корзина" : item === "details" ? "Данные" : "Оплата"}</span>)}
      </div>
      {step === "cart" && <section className={styles.selection}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Шаг 1</p><h2>Ваша корзина</h2></div><Link href="/catalog">Добавить ещё</Link></div>{selected.map((service) => <div className={styles.selectionRow} key={service.id}><span><strong>{service.title}</strong><small>{service.priceUnit}</small></span><div className={styles.lineActions}><div className={styles.quantity}><button aria-label={`Уменьшить количество: ${service.title}`} onClick={() => updateQuantity(service.id, quantityFor(service.id) - 1)} type="button">−</button><b>{quantityFor(service.id)}</b><button aria-label={`Увеличить количество: ${service.title}`} onClick={() => updateQuantity(service.id, quantityFor(service.id) + 1)} type="button">+</button></div><strong>{money.format(service.price * quantityFor(service.id))} ₽</strong><button className={styles.removeButton} onClick={() => removeFromCart(service.id)} type="button">Удалить</button></div></div>)}<div className={styles.totalRow}><span>Итого</span><strong>{money.format(total)} ₽</strong></div>{canAccessCheckout(account) ? <button className={styles.nextButton} onClick={() => navigateTo("details")} type="button">Продолжить</button> : <Link className={styles.nextButton} href="/account">Войти, чтобы продолжить</Link>}</section>}
      {step === "details" && <form className={styles.checkoutCard} onSubmit={(event) => { event.preventDefault(); const needsDate = selected.some((service) => service.type !== "connectivity"); const needsTime = selected.some((service) => ["transfers", "restaurants", "yachts"].includes(service.type)); const needsPickup = selected.some((service) => service.type === "transfers"); if (needsDate && !bookingDetails.date) { setError("Выберите дату поездки или посещения."); return; } if (needsTime && !bookingDetails.time) { setError("Выберите время для выбранной услуги."); return; } if (needsPickup && (!bookingDetails.routeFrom.trim() || !bookingDetails.routeTo.trim())) { setError("Укажите маршрут трансфера."); return; } if (deliveryChannel !== "email" && !deliveryAddress.trim()) { setError("Укажите контакт для выбранного канала доставки."); return; } navigateTo("payment"); }}><p className={styles.eyebrow}>Шаг 2</p><h2>Настройки поездки</h2><p className={styles.sectionNote}>Эти параметры проверяются до оплаты и попадут в заказ.</p><div className={styles.bookingPanel}><div className={styles.formGrid}><label><span>Дата поездки или посещения</span><input required={selected.some((service) => service.type !== "connectivity")} type="date" min={new Date().toISOString().slice(0, 10)} value={bookingDetails.date} onChange={(event) => setBookingDetails({ ...bookingDetails, date: event.target.value })} /></label><label><span>Участники</span><input required min={1} type="number" value={bookingDetails.participants} onChange={(event) => setBookingDetails({ ...bookingDetails, participants: Math.max(1, Number(event.target.value)) })} /></label><label><span>Язык сопровождения</span><select value={bookingDetails.language} onChange={(event) => setBookingDetails({ ...bookingDetails, language: event.target.value as MarketplaceBookingDetails["language"] })}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label>{selected.some((service) => ["transfers", "restaurants", "yachts"].includes(service.type)) && <label><span>Время</span><input required type="time" value={bookingDetails.time} onChange={(event) => setBookingDetails({ ...bookingDetails, time: event.target.value })} /></label>}</div>{selected.some((service) => service.type === "transfers") && <div className={styles.formGrid}><label><span>Откуда</span><input required value={bookingDetails.routeFrom} onChange={(event) => setBookingDetails({ ...bookingDetails, routeFrom: event.target.value })} placeholder="Аэропорт или адрес" /></label><label><span>Куда</span><input required value={bookingDetails.routeTo} onChange={(event) => setBookingDetails({ ...bookingDetails, routeTo: event.target.value })} placeholder="Отель или адрес" /></label></div>}{selected.some((service) => service.type === "connectivity") && <label><span>Дата активации eSIM <small>(необязательно)</small></span><input type="date" min={new Date().toISOString().slice(0, 10)} value={bookingDetails.activationDate} onChange={(event) => setBookingDetails({ ...bookingDetails, activationDate: event.target.value })} /></label>}</div><div className={styles.contactDivider}><p className={styles.eyebrow}>Контакты и доставка</p><div className={styles.formGrid}><label><span>Имя</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Телефон</span><input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+90 ..." /></label><label><span>Канал доставки</span><select value={deliveryChannel} onChange={(event) => setDeliveryChannel(event.target.value as MarketplaceDeliveryChannel)}>{channels.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div>{deliveryChannel !== "email" ? <label><span>Контакт для {deliveryChannel === "whatsapp" ? "WhatsApp" : "телефона"}</span><input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="+90 ..." /><small>{deliveryHint}</small></label> : <p className={styles.deliveryHint}>Билеты и инструкции придут на указанный email.</p>}<label><span>Комментарий к заказу <small>(необязательно)</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Дополнительные пожелания" /></label></div>{error && <p className={styles.formError}>{error}</p>}<div className={styles.formActions}><button className={styles.backButton} onClick={() => navigateTo("cart")} type="button">Назад</button><button className={styles.nextButton} type="submit">К оплате</button></div></form>}
      {step === "payment" && <form className={styles.checkoutCard} onSubmit={submitPayment}><p className={styles.eyebrow}>Шаг 3</p><h2>Оплата заказа</h2><p className={styles.paymentNotice}>Введите данные карты для оплаты заказа.</p><label><span>Имя на карте</span><input required value={cardholder} onChange={(event) => setCardholder(event.target.value)} /></label><label><span>Номер карты</span><input required inputMode="numeric" maxLength={19} value={cardNumber} onChange={(event) => setCardNumber(event.target.value.replace(/[^\d ]/g, ""))} placeholder="0000 0000 0000 0000" /></label><div className={styles.formGrid}><label><span>Срок действия</span><input required maxLength={5} value={expiry} onChange={(event) => setExpiry(event.target.value.replace(/[^\d/]/g, ""))} placeholder="MM/YY" /></label><label><span>CVC</span><input required inputMode="numeric" maxLength={4} value={cvc} onChange={(event) => setCvc(event.target.value.replace(/\D/g, ""))} placeholder="000" /></label></div>{error && <p className={styles.formError}>{error}</p>}<div className={styles.paymentSummary}><span>К оплате</span><strong>{money.format(total)} ₽</strong></div><div className={styles.formActions}><button className={styles.backButton} onClick={() => navigateTo("details")} type="button">Назад</button><button className={styles.nextButton} type="submit">Оплатить {money.format(total)} ₽</button></div></form>}
    </div>
  );
}
