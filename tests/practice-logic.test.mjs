import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateProportionalPlans,
  mergeGroupSequences,
  selectCycleQuestions,
} from "../app/practice-logic.ts";

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeSection(id, count) {
  return {
    id,
    questions: Array.from({ length: count }, (_, index) => ({ canonicalId: `${id}-${index + 1}` })),
  };
}

test("allocates a 30-question comprehensive session by section size", () => {
  const sections = [
    makeSection("chengyu", 72),
    makeSection("ciyu", 54),
    makeSection("poetry-memory", 320),
    makeSection("gushi-compare", 50),
    makeSection("sentence-order", 61),
    makeSection("literature", 91),
    makeSection("ziyin-a", 102),
    makeSection("ziyin-b", 102),
    makeSection("grammar-comprehensive", 79),
    makeSection("moxie-100", 124),
  ];
  const plans = allocateProportionalPlans(sections, 30, seededRandom(7));
  const counts = new Map(plans.map((plan) => [plan.section.id, plan.count]));

  assert.equal(plans.reduce((sum, plan) => sum + plan.count, 0), 30);
  assert.deepEqual(Object.fromEntries(sections.map((section) => [section.id, counts.get(section.id) ?? 0])), {
    chengyu: 2,
    ciyu: 2,
    "poetry-memory": 9,
    "gushi-compare": 1,
    "sentence-order": 2,
    literature: 3,
    "ziyin-a": 3,
    "ziyin-b": 3,
    "grammar-comprehensive": 2,
    "moxie-100": 3,
  });
});

test("redistributes capacity and still returns the requested total", () => {
  const sections = [makeSection("tiny", 1), makeSection("small", 2), makeSection("large", 97)];
  const plans = allocateProportionalPlans(sections, 30, seededRandom(3));

  assert.equal(plans.reduce((sum, plan) => sum + plan.count, 0), 30);
  for (const plan of plans) assert.ok(plan.count <= plan.section.questions.length);
});

test("never repeats a question before the full cycle has appeared", () => {
  for (const size of [50, 54, 61, 72, 79, 91, 102, 124, 320]) {
    const questions = makeSection(`section-${size}`, size).questions;
    const universeIds = questions.map((question) => question.canonicalId);
    const random = seededRandom(size);
    let seenIds = [];
    const sequence = [];

    while (sequence.length < size * 2) {
      const result = selectCycleQuestions({
        questions,
        universeIds,
        seenIds,
        blockedIds: [],
        count: Math.min(20, size),
        random,
      });
      assert.equal(result.selection.length, Math.min(20, size));
      assert.equal(new Set(result.selection.map((question) => question.canonicalId)).size, result.selection.length);
      seenIds = result.seenIds;
      sequence.push(...result.selection.map((question) => question.canonicalId));
    }

    assert.equal(new Set(sequence.slice(0, size)).size, size, `first cycle failed for ${size}`);
    assert.equal(new Set(sequence.slice(size, size * 2)).size, size, `second cycle failed for ${size}`);
  }
});

test("mixed practice randomizes groups without reordering a group's cycle", () => {
  const groups = new Map([
    ["a", ["a1", "a2", "a3"]],
    ["b", ["b1", "b2"]],
    ["c", ["c1", "c2", "c3", "c4"]],
  ]);
  const merged = mergeGroupSequences(groups, seededRandom(9));

  assert.equal(merged.length, 9);
  assert.deepEqual(merged.filter((item) => item.startsWith("a")), groups.get("a"));
  assert.deepEqual(merged.filter((item) => item.startsWith("b")), groups.get("b"));
  assert.deepEqual(merged.filter((item) => item.startsWith("c")), groups.get("c"));
});
