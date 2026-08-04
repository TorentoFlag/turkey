import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const types = readFileSync(resolve(root, "src/types/marketplace.ts"), "utf8");
const data = readFileSync(resolve(root, "src/data/marketplace.ts"), "utf8");
const content = readFileSync(resolve(root, "src/components/marketplace/marketplace-content.ts"), "utf8");

test("marketplace exposes intent-first booking contracts", () => {
  assert.match(types, /MarketplaceScenario/);
  assert.match(types, /TransferSearchState/);
  assert.match(types, /BookingIntent/);
  assert.match(data, /categoryId: "transfers"/);
  assert.doesNotMatch(data, /status: "demo"/);
  assert.match(content, /Заказать трансфер/);
  assert.match(content, /Выбрать дату/);
});
