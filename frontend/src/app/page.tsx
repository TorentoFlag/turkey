import Image from "next/image";
import Link from "next/link";

import { Collections } from "@/components/home/Collections";
import { DirectionStory } from "@/components/home/DirectionStory";
import { Header } from "@/components/home/Header";
import { HeroCanvasScene } from "@/components/home/HeroCanvasScene";
import { MotionProvider } from "@/components/home/motion/MotionProvider";
import { ManifestoCards } from "@/components/home/ManifestoCards";
import { RevealObserver } from "@/components/home/RevealObserver";
import { siteConfig } from "@/config/site";
import { affordableItems, directionScenes, heroFragments } from "@/data/home";
import { sitePath } from "@/lib/sitePath";

const brandName = siteConfig.publicBrandName ?? "Türkiye";

const services = [
  { name: "Ужин на Босфоре с шоу", place: "Стамбул", price: "от 3 675 ₽", href: "/services/bosphorus-dinner-cruise" },
  { name: "Шаттл из аэропорта", place: "Стамбул", price: "от 1 045 ₽", href: "/services/istanbul-shuttle-aksaray" },
  { name: "Абонемент в Каппадокию", place: "Каппадокия", price: "от 31 500 ₽", href: "/services/cappadocia-pass" },
  { name: "eSIM Турция: 1 ГБ", place: "Вся Турция", price: "от 104 ₽", href: "/services/trasst-esim-1gb" },
] as const;

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержанию
      </a>
      <Header brandName={brandName} />
      <MotionProvider />
      <RevealObserver />

      <main id="main-content">
        <HeroCanvasScene
          fragments={heroFragments}
        />

        <DirectionStory scenes={directionScenes} />

        <section
          className="manifesto-section"
          id="manifesto"
          data-header-tone="light"
          data-reveal
        >
          <h2 className="visually-hidden">О сервисе путешествий по Турции</h2>
          <div className="manifesto-heading" data-reveal>
            <p>Один сервис для всей поездки</p>
            <span>От 50 ₽ до маршрута, который меняет всё</span>
          </div>
          <div className="manifesto-layout">
            <div className="manifesto-aside" data-reveal data-reveal-step="1">
              <p>Türkiye</p>
              <strong>Est. 2026</strong>
              <div className="manifesto-aside-image">
                <Image
                  alt="Солнечная турецкая улица с тёплой архитектурой"
                  fill
                  sizes="(max-width: 760px) 34vw, 12vw"
                  src={sitePath("/images/istanbul-support-neighborhood.webp")}
                />
              </div>
            </div>
            <ManifestoCards />
            <div className="manifesto-main" data-reveal data-reveal-step="2">
              <p className="manifesto-copy">
                Планируйте поездку целиком: находите интересные места, бронируйте
                услуги и собирайте всё необходимое в одном заказе.
              </p>
            </div>
          </div>
          <div className="manifesto-signature" data-reveal>
            <span data-reveal data-reveal-step="1">Один сервис</span>
            <span data-reveal data-reveal-step="2">Вся Турция</span>
            <span data-reveal data-reveal-step="3">Любой масштаб</span>
          </div>
        </section>

        <section className="ideas-section" id="ideas" data-header-tone="light">
          <div className="section-heading ideas-heading" data-reveal>
            <p>Три способа начать</p>
            <h2>С чего начать поездку</h2>
          </div>
          <div className="ideas-composition">
            <article className="idea idea-lead" data-reveal>
              <Link href="/guides/istanbul-first-trip" aria-label="Стамбул впервые: бесплатный маршрут на три дня">
                <div className="idea-media">
                  <Image
                    alt="Тёплый свод и ритм арок стамбульского базара"
                    fill
                    sizes="(max-width: 760px) 100vw, 58vw"
                src={sitePath("/images/spice-bazaar.jpg")}
                  />
                </div>
                <div className="idea-copy">
                  <span>Маршрут · 3 дня</span>
                  <h3>Стамбул впервые</h3>
                  <p>Город не по списку достопримечательностей, а по смене света и районов.</p>
                </div>
              </Link>
            </article>
            <article className="idea idea-offset" data-reveal>
              <Link href="/guides/antalya-without-rush" aria-label="Анталья без суеты: пять решений до прилёта">
                <div className="idea-media">
                  <Image
                    alt="Белые минеральные террасы Памуккале"
                    fill
                    sizes="(max-width: 760px) 100vw, 30vw"
                src={sitePath("/images/pamukkale.jpg")}
                  />
                </div>
                <div className="idea-copy">
                  <span>До прилёта · 5 решений</span>
                  <h3>Анталья без суеты</h3>
                </div>
              </Link>
            </article>
            <article className="idea idea-note" data-reveal>
              <Link href="/guides/cappadocia-without-car" aria-label="Каппадокия без автомобиля: бесплатный план поездки">
                <div className="idea-media">
                  <Image
                    alt="Воздушные шары над мягкими утренними долинами Каппадокии"
                    fill
                    sizes="(max-width: 760px) 100vw, 22vw"
                src={sitePath("/images/cappadocia-soft.jpg")}
                  />
                </div>
                <div className="idea-copy">
                  <span>Самостоятельно · 2 дня</span>
                  <h3>Каппадокия без автомобиля</h3>
                </div>
              </Link>
            </article>
          </div>
        </section>

        <section className="services-section" id="services" data-header-tone="dark">
          <div className="services-stage" data-reveal>
            <div className="services-image" data-reveal>
              <Image
                alt="Паром на Босфоре в золотом вечернем свете"
                fill
                sizes="(max-width: 760px) 100vw, 52vw"
                src={sitePath("/images/bosphorus-ferry.jpg")}
              />
              <span>Сейчас выбирают</span>
            </div>
            <div className="services-intro" data-reveal>
              <p>Выберите первый шаг</p>
              <h2>Услуги для ближайшей поездки</h2>
            </div>
          </div>
          <div className="service-index">
            {services.map(({ name, place, price }, index) => (
              <a href={sitePath("/catalog")} key={name} data-reveal>
                <span className="service-number">0{index + 1}</span>
                <span className="service-name">{name}</span>
                <span className="service-place">{place}</span>
                <span className="service-price">{price}</span>
              </a>
            ))}
          </div>
        </section>

        <Collections />

        <section
          className="affordable-section"
          id="affordable"
          data-header-tone="light"
          data-reveal
        >
          <div className="affordable-title" data-reveal>
            <h2>Полезные вещи, которые лучше купить заранее</h2>
          </div>
          <div className="affordable-list">
            {affordableItems.map(({ name, price }, index) => (
              <a href={sitePath("/catalog")} key={name} data-reveal data-reveal-step={String((index % 4) + 1)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{name}</strong>
                <b>{price}</b>
              </a>
            ))}
          </div>
        </section>

        <section className="bundles-section" id="bundles" data-header-tone="dark" data-reveal>
          <div className="bundle-visual bundle-visual-left" data-reveal>
            <Image
              alt="Современная архитектура Стамбула в вечернем свете"
              fill
              sizes="(max-width: 760px) 70vw, 16vw"
              src={sitePath("/images/istanbul-modern.jpg")}
            />
          </div>
          <div className="bundle-visual bundle-visual-right" data-reveal>
            <Image
              alt="Тихая бухта Эгейского побережья Турции"
              fill
              sizes="(max-width: 760px) 92vw, 42vw"
              src={sitePath("/images/aegean-bodrum.jpg")}
            />
          </div>
          <div className="bundles-copy" data-reveal>
            <div className="bundles-intro">
              <p>Соберите поездку без пяти чатов и вкладок</p>
              <h2>Основное — уже собрано</h2>
            </div>
            <div className="bundle-links">
              {[
                { bundle: "Спокойный прилёт", details: "трансфер · связь", href: "/catalog?category=transfers" },
                { bundle: "Стамбул впервые", details: "3 дня · маршрут · Босфор", href: "/catalog?destination=istanbul" },
                { bundle: "Городской ритм", details: "рестораны · впечатления", href: "/catalog?category=restaurants" },
                { bundle: "Каппадокия без забот", details: "проездной · связь", href: "/catalog?destination=cappadocia" },
              ].map(({ bundle, details, href }) => (
                <a href={sitePath(href)} key={bundle}>
                  <span className="bundle-name">
                    <strong>{bundle}</strong>
                    <small>{details}</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section
          className="statement-section"
          id="statement"
          data-header-tone="dark"
          data-reveal
        >
          <h2 className="visually-hidden">Наша позиция</h2>
          <p className="statement-label">Наша позиция</p>
          <blockquote>
            Хорошая поездка начинается с понятного плана.
          </blockquote>
          <p className="statement-signature">Команда сервиса путешествий по Турции</p>
        </section>

        <section className="principles-section" id="principles" data-header-tone="light">
          <h2 data-reveal>Выбирайте проще. Планируйте яснее. Путешествуйте спокойнее.</h2>
          <ol>
            <li className="principle-one" data-reveal>
              <span>01</span>
              <strong>Вы выбираете</strong>
              <p>Направление, впечатление или маленькую полезную деталь.</p>
            </li>
            <li className="principle-two" data-reveal>
              <span>02</span>
              <strong>Мы подтверждаем</strong>
              <p>Фиксируем детали и оставляем только ясный план.</p>
            </li>
            <li className="principle-three" data-reveal>
              <span>03</span>
              <strong>Вы путешествуете</strong>
              <p>Без лишних вкладок, звонков и организационного шума.</p>
            </li>
          </ol>
        </section>

        <section className="final-cta-section" id="final-cta" data-header-tone="dark">
          <Image
            alt="Ночная панорама Галатской башни и огней Стамбула"
            fill
            sizes="100vw"
            src={sitePath("/images/galata-night.jpg")}
          />
          <div className="final-cta-shade" />
          <div className="final-cta-copy" data-reveal>
            <span>Ваше следующее место</span>
            <h2>С чего начнём вашу Турцию?</h2>
            <p>Выберите город, услугу или готовый план — остальное соберём по шагам.</p>
            <a className="primary-action light-action" href={sitePath("/catalog")}>
              Начать путешествие
            </a>
          </div>
        </section>

      </main>

      <footer className="page-footer" id="page-footer" data-header-tone="dark">
        <div className="footer-wordmark">
          <Image alt="Faro" height={68} src={sitePath("/faro-logo.svg")} width={161} />
        </div>
        <div className="footer-grid">
          <div className="footer-category-group" data-reveal>
            <span>Каталог</span>
            <div className="footer-category-columns">
              <nav aria-label="Каталог товаров и услуг">
                <a href={sitePath("/catalog")}>Все товары и услуги</a>
              </nav>
            </div>
          </div>
          <nav aria-label="Сервис" data-reveal>
            <span>Сервис</span>
            <a href={sitePath("/catalog")}>Каталог</a>
            <a href={sitePath("/account/")}>Личный кабинет</a>
            <a href={sitePath("/search")}>Поиск</a>
          </nav>
          <nav aria-label="Информация о сервисе" data-reveal>
            <span>О FARO</span>
            <a href="#statement">О подходе</a>
            <a href="#principles">Как это работает</a>
          </nav>
          <nav aria-label="Документы" data-reveal>
            <span>Документы</span>
            <Link href="/legal/terms">Пользовательское соглашение</Link>
            <Link href="/legal/privacy">Политика конфиденциальности</Link>
          </nav>
          <div className="footer-meta footer-company" data-reveal>
            <span>Реквизиты компании</span>
            <strong>{siteConfig.legalCompanyName}</strong>
            <p>Регистрационный номер: {siteConfig.registrationNumber}</p>
            <p>{siteConfig.legalAddress}</p>
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          </div>
          <div className="footer-meta" data-reveal>
            <span>Язык и валюта</span>
            <strong>Русский · RUB</strong>
            <small>Поддержка ежедневно · 09:00–21:00</small>
          </div>
          <div className="footer-meta footer-payments" data-reveal>
            <span>Оплата онлайн</span>
            <div className="footer-payment-badges">
              <Image
                alt="Система быстрых платежей"
                className="footer-sbp-badge"
                height={120}
                src={sitePath("/payment/sbp-logo.svg")}
                width={98}
              />
              <Image
                alt="Платёжная система Мир"
                className="footer-mir-badge"
                height={120}
                src={sitePath("/payment/mir-logo.svg")}
                width={400}
              />
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026</span>
          <span>Главная о путешествиях по Турции</span>
          <span>Все права защищены</span>
        </div>
      </footer>
    </>
  );
}
