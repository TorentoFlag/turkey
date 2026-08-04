"use client";

import type { MarketplaceScenario } from "@/types/marketplace";
import { scenarioDescriptions, scenarioLabels } from "./marketplace-content";
import styles from "./catalog.module.css";

type ScenarioPickerProps = {
  value?: MarketplaceScenario;
  onChange: (scenario: MarketplaceScenario) => void;
};

const scenarios: MarketplaceScenario[] = ["experience", "transfer", "self-service", "shopping"];

export function ScenarioPicker({ onChange, value }: ScenarioPickerProps) {
  return (
    <div className={styles.scenarioPicker} aria-label="Что нужно организовать">
      <div className={styles.scenarioIntro}>
        <span className={styles.eyebrow}>С чего начнём</span>
        <p>Выберите задачу — каталог покажет подходящие варианты и следующий шаг.</p>
      </div>
      <div className={styles.scenarioOptions} role="list">
        {scenarios.map((scenario) => (
          <button
            aria-pressed={value === scenario}
            className={styles.scenarioOption}
            key={scenario}
            onClick={() => onChange(scenario)}
            type="button"
          >
            <span className={styles.scenarioOptionTitle}>{scenarioLabels[scenario]}</span>
            <span className={styles.scenarioOptionDescription}>{scenarioDescriptions[scenario]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
