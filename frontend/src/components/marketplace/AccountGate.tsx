"use client";

import { FormEvent, useSyncExternalStore, useState } from "react";

import { AccountOrders } from "./AccountOrders";
import styles from "./account.module.css";

const ACCOUNT_STORAGE_KEY = "faro-account";
const PROFILE_STORAGE_KEY = "faro-account-profile";

type Account = { email: string; name: string };
type Profile = Account & { password: string };

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function readAccount(): Account | null {
  const raw = readStorage(ACCOUNT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    removeStorage(ACCOUNT_STORAGE_KEY);
    return null;
  }
}

function subscribeToAccount(callback: () => void) {
  window.addEventListener("faro-account-updated", callback);
  return () => window.removeEventListener("faro-account-updated", callback);
}

function readProfile(): Profile | null {
  const raw = readStorage(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    removeStorage(PROFILE_STORAGE_KEY);
    return null;
  }
}

export function AccountGate() {
  const account = useSyncExternalStore(subscribeToAccount, readAccount, () => null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Пароль должен содержать минимум 6 символов.");
      return;
    }
    if (mode === "register") {
      if (!name.trim()) {
        setError("Введите имя.");
        return;
      }
      if (password !== passwordConfirmation) {
        setError("Пароли не совпадают.");
        return;
      }
      const profile = { email, name: name.trim(), password };
      if (!writeStorage(PROFILE_STORAGE_KEY, JSON.stringify(profile))) {
        setError("Не удалось сохранить регистрацию в этом браузере.");
        return;
      }
    }
    const profile = readProfile();
    if (!profile || profile.email !== email || profile.password !== password) {
      setError("Проверьте email и пароль или зарегистрируйтесь.");
      return;
    }
    const nextAccount = { email: profile.email, name: profile.name };
    if (!writeStorage(ACCOUNT_STORAGE_KEY, JSON.stringify(nextAccount))) {
      setError("Не удалось сохранить вход в этом браузере.");
      return;
    }
    window.dispatchEvent(new Event("faro-account-updated"));
    setError("");
  }

  function signOut() {
    removeStorage(ACCOUNT_STORAGE_KEY);
    window.dispatchEvent(new Event("faro-account-updated"));
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirmation("");
    setMode("login");
  }

  if (!account) {
    return (
      <div className={styles.accountLanding}>
        <section aria-labelledby="account-login-title" className={styles.loginCard}>
          <div className={styles.authTabs} role="tablist" aria-label="Авторизация">
            <button aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }} role="tab" type="button">Вход</button>
            <button aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }} role="tab" type="button">Регистрация</button>
          </div>
          <h2 id="account-login-title">{mode === "login" ? "С возвращением" : "Ваше место для поездок"}</h2>
          <p>Сохраняйте заказы, инструкции и всё необходимое для поездки в одном кабинете.</p>
          <form onSubmit={submit}>
            {mode === "register" && <label><span>Имя</span><input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></label>}
            <label><span>Email</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label><span>Пароль</span><input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {mode === "register" && <label><span>Повторите пароль</span><input autoComplete="new-password" minLength={6} required type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
            {error && <p className={styles.loginError}>{error}</p>}
            <button type="submit">{mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
          </form>
        </section>
        <aside className={styles.accountAside}>
          <p className={styles.eyebrow}>Всё под рукой</p>
          <h2>Поездка начинается с ясности.</h2>
          <ul>
            <li><span>01</span>Номер заказа и статус</li>
            <li><span>02</span>Даты, маршруты и контакты</li>
            <li><span>03</span>Инструкции и канал доставки</li>
          </ul>
        </aside>
      </div>
    );
  }

  return (
    <div className={styles.accountContent}>
      <div className={styles.accountToolbar}>
        <p>Ваш профиль · <strong>{account.email}</strong></p>
        <button onClick={signOut} type="button">Выйти</button>
      </div>
      <AccountOrders />
    </div>
  );
}
