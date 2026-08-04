"use client";

import { FormEvent, useState } from "react";

export function Newsletter() {
  const [status, setStatus] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Спасибо! Проверьте почту — мы отправили письмо для подтверждения.");
    event.currentTarget.reset();
  }

  return (
    <form className="newsletter-form" onSubmit={submit}>
      <label htmlFor="newsletter-email">Ваш email</label>
      <div className="newsletter-input-row">
        <input
          aria-describedby="newsletter-status"
          autoComplete="email"
          id="newsletter-email"
          name="email"
          type="email"
          required
        />
        <button type="submit">Подписаться</button>
      </div>
      <p className="form-status" id="newsletter-status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
