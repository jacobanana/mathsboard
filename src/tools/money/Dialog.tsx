// Settings dialog for the Money tool.
//
// Conventions (see src/tools/dice/Dialog.tsx): props are
// ToolDialogProps<MoneyParams>; the dialog renders only the card body; EDIT vs
// CREATE is decided by `initial` (Save/Cancel vs Add to board/Back). Only the
// three config fields are read from `initial`; the live state (round, ans,
// placed pieces) is left untouched, so changing settings never disturbs a pile
// mid-play — the component reseeds when the game/currency/difficulty changes.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { CURRENCY_CODES, type CurrencyCode, type Difficulty } from "@/tools/money/currencies";
import { GAMES, GAME_META, type MoneyGame } from "@/tools/money/games";
import { DEFAULT_MONEY, type MoneyParams } from "@/tools/money";

const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  USD: "$ USD",
  GBP: "£ GBP",
  EUR: "€ EUR",
  CHF: "Fr CHF",
};

const DIFFICULTIES: [Difficulty, string][] = [
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
];

export function MoneyDialog({ initial, onSubmit, onCancel }: ToolDialogProps<MoneyParams>) {
  const editing = initial != null;
  const [currency, setCurrency] = useState<CurrencyCode>(initial?.currency ?? DEFAULT_MONEY.currency);
  const [game, setGame] = useState<MoneyGame>(initial?.game ?? DEFAULT_MONEY.game);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? DEFAULT_MONEY.difficulty);

  return (
    <>
      <h2>Money</h2>
      <p className="hint">
        Learn to count coins and notes. Pick a currency and a game, then place it
        on the board. Everyone sees the same problem, and answers are shared.
      </p>

      <div className="field">
        <label>Currency</label>
        <div className="money-opts">
          {CURRENCY_CODES.map((c) => (
            <button
              key={c}
              type="button"
              className={"money-opt" + (currency === c ? " active" : "")}
              onClick={() => setCurrency(c)}
            >
              {CURRENCY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Game</label>
        <div className="money-opts">
          {GAMES.map((g) => (
            <button
              key={g}
              type="button"
              className={"money-opt" + (game === g ? " active" : "")}
              onClick={() => setGame(g)}
            >
              {GAME_META[g].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Difficulty</label>
        <div className="money-opts">
          {DIFFICULTIES.map(([d, label]) => (
            <button
              key={d}
              type="button"
              className={"money-opt" + (difficulty === d ? " active" : "")}
              onClick={() => setDifficulty(d)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" onClick={() => onSubmit({ currency, game, difficulty })}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
