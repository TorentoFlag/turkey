import assert from "node:assert/strict";
import test from "node:test";
import { displayProductPrice } from "./product-price.js";

test("formats a stored booking price", () => {
  assert.equal(
    displayProductPrice({ priceMinor: 367_500, currency: "RUB" }),
    "3 675,00 ₽",
  );
});

test("keeps the fallback when a product has no price", () => {
  assert.equal(
    displayProductPrice({ priceMinor: null, currency: null }),
    "Цена уточняется",
  );
});
