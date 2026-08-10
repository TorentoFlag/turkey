import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

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
