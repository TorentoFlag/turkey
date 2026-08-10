import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const typescript = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const { legalDocuments, findLegalDocument } = require("../src/config/legal.ts");

function documentText(id) {
  const document = findLegalDocument(id);
  return [
    document.title,
    ...document.intro,
    ...document.sections.flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => block.type === "list" ? block.items : [block.text]),
    ]),
  ].join("\n");
}

assert.deepEqual(legalDocuments.map(({ id, href }) => [id, href]), [
  ["terms", "/legal/terms"],
  ["privacy", "/legal/privacy"],
]);

const terms = documentText("terms");
const privacy = documentText("privacy");

assert.match(terms, /SMART DEVELOPMENT AND TOURISM COMPANY LIMITED/);
assert.match(terms, /Регистрационный номер:\s*0205563015465/);
assert.match(terms, /17\. КОНТАКТНАЯ ИНФОРМАЦИЯ/);
assert.match(privacy, /Personal Data Protection Act B\.E\. 2562 \(2019\) \(PDPA\)/);
assert.match(privacy, /14\. КОНТАКТНАЯ ИНФОРМАЦИЯ/);
assert.match(privacy, /supp@turkeyplanners\.com/);

const legalRoutes = [
  ["src/app/legal/terms/page.tsx", "terms"],
  ["src/app/legal/privacy/page.tsx", "privacy"],
  ["src/app/privacy/page.tsx", "privacy alias"],
];

for (const [path, label] of legalRoutes) {
  const absolutePath = resolve(process.cwd(), path);
  assert.ok(existsSync(absolutePath), `${label} route must exist at ${path}`);
}

const marketplaceFooter = readFileSync(resolve(process.cwd(), "src/components/marketplace/MarketplaceFooter.tsx"), "utf8");
const homePage = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");

for (const [source, label] of [
  [marketplaceFooter, "marketplace footer"],
  [homePage, "home footer"],
]) {
  assert.match(source, /legal\/terms/, `${label} must link to the User Agreement`);
  assert.match(source, /legal\/privacy/, `${label} must link to the Privacy Policy`);
  assert.match(source, /siteConfig\.legalCompanyName/, `${label} must render the company name from shared config`);
  assert.match(source, /siteConfig\.registrationNumber/, `${label} must render the registration number from shared config`);
  assert.match(source, /siteConfig\.legalAddress/, `${label} must render the legal address from shared config`);
  assert.match(source, /mailto:/, `${label} must expose the support email link`);
}
