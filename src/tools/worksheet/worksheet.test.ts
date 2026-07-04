// Worksheet domain logic: question generation (property-based — the generator
// is random), marking, and the per-question shared-state field keys.

import { describe, expect, it } from "vitest";
import {
  ansField,
  genQuestions,
  markAnswers,
  markField,
  qKey,
  widgetTitle,
  type Question,
  type WorksheetParams,
} from "@/tools/worksheet";

const q = (over: Partial<Question> = {}): Question => ({
  id: "q1",
  a: 3,
  op: "×",
  b: 7,
  ans: 21,
  ...over,
});

describe("genQuestions", () => {
  it("times mode: one ascending row per multiplier, all consistent", () => {
    const qs = genQuestions({ mode: "times", k: 7, rows: 12, questions: [] });
    expect(qs).toHaveLength(12);
    qs.forEach((question, i) => {
      expect(question.a).toBe(i + 1);
      expect(question.op).toBe("×");
      expect(question.b).toBe(7);
      expect(question.ans).toBe((i + 1) * 7);
    });
    expect(new Set(qs.map((x) => x.id)).size).toBe(12);
  });

  it("ops mode: every question's answer is consistent with its operands", () => {
    const check: Record<string, (a: number, b: number) => number> = {
      "+": (a, b) => a + b,
      "−": (a, b) => a - b,
      "×": (a, b) => a * b,
    };
    for (const op of ["+", "−", "×"]) {
      const qs = genQuestions({
        mode: "ops",
        op,
        n: 50,
        max: 12,
        questions: [],
      });
      expect(qs).toHaveLength(50);
      for (const question of qs) {
        expect(question.op).toBe(op);
        expect(question.ans).toBe(check[op](question.a, question.b));
      }
    }
  });

  it("subtraction never goes negative; division is always exact", () => {
    const subs = genQuestions({ mode: "ops", op: "−", n: 100, max: 12, questions: [] });
    for (const s of subs) expect(s.ans).toBeGreaterThanOrEqual(0);

    const divs = genQuestions({ mode: "ops", op: "÷", n: 100, max: 12, questions: [] });
    for (const d of divs) {
      expect(d.a).toBe(d.b * d.ans);
      expect(Number.isInteger(d.ans)).toBe(true);
    }
  });

  it("mixed mode draws from the four operations only", () => {
    const qs = genQuestions({ mode: "ops", op: "mixed", n: 100, max: 12, questions: [] });
    for (const question of qs) {
      expect(["+", "−", "×", "÷"]).toContain(question.op);
    }
  });
});

describe("markAnswers", () => {
  it("marks correct, wrong (showing the answer) and blank (unmarked)", () => {
    const questions = [
      q({ id: "a", ans: 21 }),
      q({ id: "b", ans: 21 }),
      q({ id: "c", ans: 21 }),
    ];
    const patch = markAnswers(questions, ["21", "99", ""]);
    expect(patch["mark:a"]).toEqual({ kind: "ok", text: "✓" });
    expect(patch["mark:b"]).toEqual({ kind: "no", text: "✗ 21" });
    expect(patch["mark:c"]).toBeNull();
  });

  it("trims whitespace before judging", () => {
    const patch = markAnswers([q({ id: "a", ans: 21 })], [" 21 "]);
    expect(patch["mark:a"]).toEqual({ kind: "ok", text: "✓" });
    expect(markAnswers([q({ id: "a" })], ["   "])["mark:a"]).toBeNull();
  });

  it("keys marks by question id, falling back to the index for legacy documents", () => {
    const legacy = { a: 1, op: "×", b: 7, ans: 7 } as Question; // no id
    expect(qKey(legacy, 4)).toBe("4");
    expect(ansField(q({ id: "xyz" }), 0)).toBe("ans:xyz");
    expect(markField(legacy, 4)).toBe("mark:4");
    // Inside markAnswers the question's own array position keys the fallback.
    expect(markAnswers([legacy], ["7"])["mark:0"]).toEqual({
      kind: "ok",
      text: "✓",
    });
  });
});

describe("widgetTitle", () => {
  it("names both worksheet modes", () => {
    expect(
      widgetTitle({ mode: "times", k: 9, questions: [] } as WorksheetParams),
    ).toBe("9 × table");
    expect(
      widgetTitle({ mode: "ops", op: "+", n: 10, questions: [] } as WorksheetParams),
    ).toBe("Addition • 10 questions");
  });
});
