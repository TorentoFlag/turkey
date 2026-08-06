"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { sitePath } from "@/lib/sitePath";
import { ConnectedPillNav } from "./ConnectedPillNav";

type HeaderProps = {
  brandName: string;
};

const menuItems = [
  ["Категории", "/catalog"],
  ["Впечатления", "#ideas"],
  ["Транспорт", "#services"],
  ["Полезные услуги", "#affordable"],
  ["Наборы", "#bundles"],
  ["О сервисе", "#statement"],
] as const;

const headerItems = [
  ["Категории", "/catalog"],
  ["Впечатления", "#ideas"],
  ["Сервис", "#services"],
  ["Советы", "/guides/"],
] as const;

export function Header({ brandName }: HeaderProps) {
  const [panel, setPanel] = useState<"menu" | "search" | null>(null);
  const [status, setStatus] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = [
      document.querySelector<HTMLElement>("main"),
      document.querySelector<HTMLElement>("footer"),
      document.querySelector<HTMLElement>(".site-header"),
    ].filter((element): element is HTMLElement => Boolean(element));
    background.forEach((element) => element.setAttribute("inert", ""));
    const first = panelRef.current?.querySelector<HTMLElement>(
      "a, button, input, [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        window.setTimeout(() => openerRef.current?.focus(), 0);
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            "a, button, input, [tabindex]:not([tabindex='-1'])",
          ),
        ).filter((element) => !element.hasAttribute("disabled"));
        const firstItem = focusable[0];
        const lastItem = focusable.at(-1);
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem?.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element) => element.removeAttribute("inert"));
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);

  function openPanel(
    nextPanel: "menu" | "search",
    opener: HTMLElement,
  ) {
    if (!panel) openerRef.current = opener;
    setPanel(nextPanel);
  }

  function closePanel() {
    setPanel(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Готово. Подходящие предложения собраны по разделам главной.");
  }

  return (
    <>
      <header className="site-header" data-site-header>
        <div className="header-brand-cluster">
          <a className="wordmark" href="#hero" aria-label={`${brandName} — на начало главной`}>
            <Image alt="Faro" height={68} priority src={sitePath("/faro-logo.svg")} width={161} />
          </a>
          <span className="header-divider" aria-hidden="true" />
          <button
            aria-controls="global-menu"
            aria-expanded={panel === "search"}
            aria-label="Поиск"
            className="header-text-button header-search"
            onClick={(event) => openPanel("search", event.currentTarget)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m15.6 15.6 4.2 4.2" />
            </svg>
          </button>
        </div>
        <div className="header-main-cluster">
          <ConnectedPillNav items={headerItems} />
          <div className="header-tools">
          <a className="header-commerce-link" href={sitePath("/account/")}>Личный кабинет</a>
          <span className="locale-switch" aria-label="Русский язык, рубли">
            RU⌄
          </span>
          <button
            aria-expanded={panel === "menu"}
            aria-controls="global-menu"
            aria-label="Открыть меню"
            className="menu-trigger"
            onClick={(event) => openPanel("menu", event.currentTarget)}
          >
            Меню
          </button>
          </div>
        </div>
      </header>

      <div
        className="global-panel"
        data-mobile-menu
        data-open={panel ? "true" : "false"}
        id="global-menu"
        aria-hidden={!panel}
        aria-modal={panel ? "true" : undefined}
        role="dialog"
      >
        <div className="global-panel-inner" ref={panelRef}>
          <div className="panel-topline">
            <span>{panel === "search" ? "Поиск по главной" : "Вся Турция"}</span>
            <button onClick={closePanel} aria-label="Закрыть меню">
              Закрыть
            </button>
          </div>

          {panel === "search" ? (
            <form className="search-panel-form" onSubmit={submitSearch}>
              <label htmlFor="global-search">Что вы хотите найти?</label>
              <div className="search-input-row">
                <input
                  autoComplete="off"
                  id="global-search"
                  name="query"
                  placeholder="Босфор, трансфер, Каппадокия"
                  required
                />
                <button type="submit">Найти</button>
              </div>
            </form>
          ) : (
            <div className="menu-layout">
              <nav aria-label="Полное меню">
                {menuItems.map(([label, href], index) => (
                  <a href={sitePath(href)} key={href} onClick={closePanel}>
                    <span>0{index + 1}</span>
                    {label}
                  </a>
                ))}
              </nav>
              <div className="menu-utilities">
                <button onClick={(event) => openPanel("search", event.currentTarget)}>
                  <span>Поиск</span>
                  <span>Открыть</span>
                </button>
                <a href={sitePath("/account/")} onClick={closePanel}>
                  <span>Личный кабинет</span>
                  <span>Открыть</span>
                </a>
              </div>
            </div>
          )}
          <p className="panel-status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </>
  );
}
