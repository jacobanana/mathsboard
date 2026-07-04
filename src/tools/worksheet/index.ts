// WIDGET TOOL — the interactive quiz / worksheet.
//
// Unlike canvas tools, this renders as an interactive React overlay (the
// .iworksheet card) positioned by the WidgetLayer. The component reads/updates
// its object through the store. The generated `questions`, the typed answers
// and the marks all live on the object, so they sync to collaborators and
// persist with the document (answers/marks as per-question "ans:<qid>" /
// "mark:<qid>" fields — see Worksheet.tsx).
//
// Ported from maths-whiteboard.html: genQuestions, widgetTitle, addWorksheet /
// updateWorksheet and worksheetDialog (lines 578-604).

import { defineWidgetTool } from "@/tools/registry";
import { Worksheet } from "@/tools/worksheet/Worksheet";
import { WorksheetDialog } from "@/tools/worksheet/Dialog";
import { id as newId } from "@/board/types";

export interface Question {
  /**
   * Stable id: typed answers and marks live on the object as per-question
   * fields keyed by it ("ans:<id>" / "mark:<id>"), so they sync per-field
   * between collaborators and a fresh question set starts blank everywhere
   * without any clearing pass. Absent on documents saved before ids existed
   * (the Worksheet falls back to the question's index).
   */
  id: string;
  a: number;
  op: string;
  b: number;
  ans: number;
}

export interface WorksheetParams {
  mode: "times" | "ops";
  // times-table config
  k?: number;
  rows?: number;
  // mixed-operations config
  op?: string;
  n?: number;
  max?: number;
  questions: Question[];
}

const rnd = (a: number, b: number): number =>
  a + Math.floor(Math.random() * (b - a + 1));

/** Generate the question set for a worksheet config. Ported from genQuestions. */
export function genQuestions(cfg: WorksheetParams): Question[] {
  const q: Question[] = [];
  if (cfg.mode === "times") {
    const k = cfg.k ?? 7;
    const rows = cfg.rows ?? 12;
    for (let i = 1; i <= rows; i++)
      q.push({ id: newId(), a: i, op: "×", b: k, ans: i * k });
    return q;
  }
  const max = cfg.max ?? 12;
  const n = cfg.n ?? 10;
  const m = Math.min(max, 12);
  for (let i = 0; i < n; i++) {
    const op =
      cfg.op === "mixed"
        ? (["+", "−", "×", "÷"] as const)[rnd(0, 3)]
        : (cfg.op ?? "+");
    let a: number, b: number, ans: number;
    if (op === "+") {
      a = rnd(1, max);
      b = rnd(1, max);
      ans = a + b;
    } else if (op === "−") {
      a = rnd(1, max);
      b = rnd(0, a);
      ans = a - b;
    } else if (op === "×") {
      a = rnd(2, m);
      b = rnd(2, m);
      ans = a * b;
    } else {
      b = rnd(2, m);
      const qq = rnd(2, m);
      a = b * qq;
      ans = qq;
    }
    q.push({ id: newId(), a, op, b, ans });
  }
  return q;
}

/** Header title for a worksheet config. Ported from widgetTitle. */
export function widgetTitle(cfg: WorksheetParams): string {
  if (cfg.mode === "times") return (cfg.k ?? 7) + " × table";
  const names: Record<string, string> = {
    "+": "Addition",
    "−": "Subtraction",
    "×": "Multiplication",
    "÷": "Division",
    mixed: "Mixed",
  };
  return names[cfg.op ?? "+"] + " • " + (cfg.n ?? 10) + " questions";
}

const defaults = (): WorksheetParams => {
  const cfg: WorksheetParams = { mode: "times", k: 7, rows: 12, questions: [] };
  cfg.questions = genQuestions(cfg);
  return cfg;
};

export default defineWidgetTool<WorksheetParams>({
  kind: "widget",
  type: "worksheet",
  name: "Quiz / worksheet",
  blurb: "type answers, get marked",
  category: "practice",
  defaults,
  defaultSize: { w: 300, h: 200 },
  Component: Worksheet,
  Dialog: WorksheetDialog,
});
