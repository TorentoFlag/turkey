import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { useMediaQuery } from "../src/hooks/useMediaQuery.ts";

function MediaQueryProbe() {
  return createElement("span", null, String(useMediaQuery("(max-width: 760px)")));
}

test("useMediaQuery keeps the SSR fallback unset", () => {
  assert.equal(renderToStaticMarkup(createElement(MediaQueryProbe)), "<span>null</span>");
});
