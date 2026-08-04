import assert from "node:assert/strict";
import test from "node:test";

import { clamp01, sceneBlendAt, sceneIndexAt } from "../src/lib/homeMotion.ts";
import { createMotionLifecycle } from "../src/lib/motionLifecycle.ts";

test("clamp01 constrains values to the unit interval", () => {
  assert.equal(clamp01(-0.25), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(1.25), 1);
});

test("sceneIndexAt selects a bounded scene index", () => {
  assert.equal(sceneIndexAt(0.2, 5), 1);
  assert.equal(sceneIndexAt(1, 5), 4);
  assert.equal(sceneIndexAt(0.5, 0), 0);
});

test("sceneBlendAt reports the next scene and local blend", () => {
  assert.deepEqual(sceneBlendAt(0.3, 5), {
    index: 1,
    nextIndex: 2,
    blend: 0.5,
  });
  assert.deepEqual(sceneBlendAt(1, 5), {
    index: 4,
    nextIndex: 4,
    blend: 0,
  });
});

test("sceneBlendAt returns a safe first-scene state when no scenes exist", () => {
  assert.deepEqual(sceneBlendAt(0.5, 0), {
    index: 0,
    nextIndex: 0,
    blend: 0,
  });
});

test("live preference changes preserve independently owned ScrollTriggers", () => {
  let started = 0;
  let stopped = 0;
  let independentTriggerKilled = false;
  const motionStates = [];

  const lifecycle = createMotionLifecycle({
    startMotion() {
      started += 1;
      return () => {
        stopped += 1;
      };
    },
    setMotionState(reduced) {
      motionStates.push(reduced ? "reduced" : "full");
    },
    setReady() {},
    clearDocumentState() {},
    killAllScrollTriggers() {
      independentTriggerKilled = true;
    },
  });

  lifecycle.apply(false);
  lifecycle.apply(true);
  lifecycle.apply(false);

  assert.equal(independentTriggerKilled, false);
  assert.equal(started, 2);
  assert.equal(stopped, 1);
  assert.deepEqual(motionStates, ["full", "reduced", "full"]);

  lifecycle.destroy();

  assert.equal(stopped, 2);
  assert.equal(independentTriggerKilled, true);
});
