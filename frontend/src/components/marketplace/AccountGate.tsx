"use client";

import { FormEvent, useEffect, useState } from "react";

import { MarketplaceApiError, marketplaceApi } from "@/lib/marketplace/api";

import { AccountOrders } from "./AccountOrders";
import styles from "./account.module.css";

export function AccountGate() {
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    marketplaceApi.me()
      .then((current) => active && setAccount(current))
      .catch((requestError: unknown) => {
        if (active && !(requestError instanceof MarketplaceApiError && requestError.status === 401)) {
          setError("Не удалось проверить сессию. Попробуйте обновить страницу.");
        }
      })
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) {
      setError("Пароль должен содержать минимум 12 символов.");
      return;
    }
    if (mode === "register" && password !== passwordConfirmation) {
      setError("Пароли не совпадают.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const current = mode === "login"
        ? await marketplaceApi.login({ email, password })
        : await marketplaceApi.register({ email, password });
      setAccount(current);
      setPassword("");
      setPasswordConfirmation("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось войти в аккаунт.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    setIsSubmitting(true);
    try {
      await marketplaceApi.logout();
      setAccount(null);
      setEmail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось завершить сессию.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <p role="status">Проверяем сессию…</p>;

  if (!account) {
    return (
      <div className={styles.accountLanding}>
        <section aria-labelledby="account-login-title" className={styles.loginCard}>
          <div className={styles.authTabs} role="tablist" aria-label="Авторизация">
            <button aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }} role="tab" type="button">Вход</button>
            <button aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }} role="tab" type="button">Регистрация</button>
          </div>
          <h2 id="account-login-title">{mode === "login" ? "С возвращением" : "Ваше место для поездок"}</h2>
          <p>Сохраняйте заказы и всё необходимое для поездки в одном кабинете.</p>
          <form onSubmit={submit}>
            <label><span>Email</span><input autoComplete="email" disabled={isSubmitting} required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label><span>Пароль</span><input autoComplete={mode === "login" ? "current-password" : "new-password"} disabled={isSubmitting} minLength={12} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {mode === "register" && <label><span>Повторите пароль</span><input autoComplete="new-password" disabled={isSubmitting} minLength={12} required type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
            {error && <p className={styles.loginError}>{error}</p>}
            <button disabled={isSubmitting} type="submit">{isSubmitting ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
          </form>
        </section>
        <aside className={styles.accountAside}>
          <p className={styles.eyebrow}>Всё под рукой</p>
          <h2>Поездка начинается с ясности.</h2>
          <ul><li><span>01</span>История заявок</li><li><span>02</span>Статус обработки</li><li><span>03</span>Безопасная серверная сессия</li></ul>
        </aside>
      </div>
    );
  }

  return <div className={styles.accountContent}><div className={styles.accountToolbar}><p>Ваш профиль · <strong>{account.email}</strong></p><button disabled={isSubmitting} onClick={signOut} type="button">Выйти</button></div><AccountOrders /></div>;
}
