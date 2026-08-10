import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const servicePagePath = fileURLToPath(
  new URL("../src/app/services/[slug]/page.tsx", import.meta.url),
);
const source = await readFile(servicePagePath, "utf8");

assert.match(
  source,
  /product\.type === "booking" \? "Заявка без оплаты на сайте" : "Оплата онлайн рублями"/,
  "service page must retain the booking branch and show the online-ruble label for payable products",
);
