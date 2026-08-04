"use client";

import type { MarketplaceDemoDate, TransferSearchState, TransferServiceMode, TransferVehicleClass } from "@/types/marketplace";
import { useState } from "react";
import styles from "./catalog.module.css";

type TransferSearchFormProps = {
  value: TransferSearchState;
  onSubmit: (value: TransferSearchState) => void;
};

export function TransferSearchForm({ onSubmit, value }: TransferSearchFormProps) {
  const [draft, setDraft] = useState(value);

  function update(next: Partial<TransferSearchState>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  return (
    <form className={styles.contextForm} onSubmit={(event) => { event.preventDefault(); onSubmit(draft); }}>
      <div className={styles.contextFormIntro}>
        <span className={styles.eyebrow}>Трансфер</span>
        <p>Маршрут, время и детали поездки — чтобы сразу увидеть подходящие варианты.</p>
      </div>
      <div className={styles.formGrid}>
        <label><span>Откуда</span><input required value={draft.from} onChange={(event) => update({ from: event.target.value })} placeholder="Аэропорт или адрес" /></label>
        <label><span>Куда</span><input required value={draft.to} onChange={(event) => update({ to: event.target.value })} placeholder="Отель или адрес" /></label>
        <label><span>Дата</span><input required type="date" value={draft.date ?? ""} onChange={(event) => update({ date: (event.target.value || null) as MarketplaceDemoDate | null })} /></label>
        <label><span>Время</span><input required type="time" value={draft.time ?? ""} onChange={(event) => update({ time: event.target.value || null })} /></label>
        <label><span>Пассажиры</span><input min="1" type="number" value={draft.passengers ?? ""} onChange={(event) => update({ passengers: event.target.value ? Number(event.target.value) : null })} /></label>
        <label><span>Багаж</span><input min="0" type="number" value={draft.luggage ?? ""} onChange={(event) => update({ luggage: event.target.value ? Number(event.target.value) : null })} /></label>
        <label><span>Формат поездки</span><select value={draft.serviceMode} onChange={(event) => update({ serviceMode: event.target.value as TransferServiceMode })}><option value="private">Индивидуальный</option><option value="shared">С группой</option></select></label>
        <label><span>Автомобиль</span><select value={draft.vehicleClass} onChange={(event) => update({ vehicleClass: event.target.value as TransferVehicleClass })}><option value="standard">Стандарт</option><option value="comfort">Комфорт</option><option value="minivan">Минивэн</option></select></label>
        <label className={styles.formWide}><span>Номер рейса <small>если встречаем в аэропорту</small></span><input value={draft.flightNumber ?? ""} onChange={(event) => update({ flightNumber: event.target.value || null })} placeholder="Например, TK 401" /></label>
      </div>
      <div className={styles.formChecks}>
        <label><input checked={draft.childSeat} onChange={(event) => update({ childSeat: event.target.checked })} type="checkbox" /> Детское кресло</label>
        <label><input checked={draft.returnTrip} onChange={(event) => update({ returnTrip: event.target.checked })} type="checkbox" /> Обратный трансфер</label>
      </div>
      <button className={styles.primaryAction} type="submit">Показать трансферы</button>
    </form>
  );
}
