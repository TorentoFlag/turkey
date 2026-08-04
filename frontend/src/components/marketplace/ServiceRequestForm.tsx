"use client";

import { useState } from "react";
import { marketplaceDestinations } from "@/data/marketplace";
import type { CatalogFilters, MarketplaceDemoDate, MarketplaceServiceType, MarketplaceScenario } from "@/types/marketplace";
import styles from "./catalog.module.css";

type ServiceRequestFormProps = { scenario: Extract<MarketplaceScenario, "self-service" | "support">; value: CatalogFilters; onSubmit: (value: CatalogFilters) => void };

const selfServiceOptions: { label: string; category: MarketplaceServiceType }[] = [
  { label: "Связь и eSIM", category: "connectivity" },
  { label: "Готовый маршрут или аудиогид", category: "digital" },
  { label: "Страхование поездки", category: "insurance" },
  { label: "Аренда авто", category: "rental" },
];
const supportOptions: { label: string; category: MarketplaceServiceType }[] = [
  { label: "Документы и проверка", category: "visa" },
  { label: "Переводчик и помощь на месте", category: "services" },
  { label: "Страхование", category: "insurance" },
  { label: "Подбор авиабилета", category: "airline-tickets" },
];

export function ServiceRequestForm({ onSubmit, scenario, value }: ServiceRequestFormProps) {
  const [draft, setDraft] = useState(value);
  const options = scenario === "self-service" ? selfServiceOptions : supportOptions;

  return (
    <form className={styles.contextForm} onSubmit={(event) => { event.preventDefault(); onSubmit({ ...draft, scenario }); }}>
      <div className={styles.contextFormIntro}>
        <span className={styles.eyebrow}>{scenario === "self-service" ? "Самостоятельная поездка" : "Помощь в поездке"}</span>
        <p>{scenario === "self-service" ? "Выберите, что подготовить для поездки, — покажем подходящие цифровые и практические решения." : "Выберите задачу и город — покажем подходящий сервис и следующий шаг."}</p>
      </div>
      <div className={styles.formGrid}>
        <label><span>Что нужно</span><select required value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: event.target.value as MarketplaceServiceType })}><option value="">Выберите задачу</option>{options.map((option) => <option key={option.category} value={option.category}>{option.label}</option>)}</select></label>
        <label><span>Город или направление</span><select value={draft.destination ?? ""} onChange={(event) => setDraft({ ...draft, destination: event.target.value || undefined })}><option value="">Вся Турция</option>{marketplaceDestinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>
        <label><span>Дата поездки</span><input type="date" value={draft.date ?? ""} onChange={(event) => setDraft({ ...draft, date: (event.target.value || undefined) as MarketplaceDemoDate | undefined })} /></label>
      </div>
      <button className={styles.primaryAction} type="submit">Показать подходящие варианты</button>
    </form>
  );
}
