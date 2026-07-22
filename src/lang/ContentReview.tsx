// A browser for the ACTUAL content of a pack — the real words, sentences and
// verb conjugations — so you can read exactly what a pack (built-in or just
// imported) will teach before using it. Not a chart: a searchable, theme-
// grouped listing.
//
//   • Words / Sentences / Verbs tabs (with counts), so each content type reads
//     in its natural shape — parallel term columns for words & sentences, an
//     expandable conjugation table for verbs.
//   • A level filter and a free-text search that matches any language's term,
//     to zero in on part of a large pack.
//
// It takes anything shaped like a pack (a ContentPack or the registry's merged
// catalogue), so the same view serves the included content and imported packs.

import { useMemo, useState } from "react";
import type { Level } from "@/lang/content/schema";

interface ReviewLanguage {
  code: string;
  name: string;
  flag: string;
}
interface ReviewItem {
  category: string;
  level: Level;
  emoji?: string;
  terms: Record<string, string>;
}
interface ReviewVerb {
  id: string;
  level: Level;
  infinitive: Record<string, string>;
  forms: Record<string, Record<string, string[]>>;
}
export interface ReviewSource {
  languages: ReviewLanguage[];
  categories: { id: string; label: string; emoji: string }[];
  pronouns: Record<string, string[]>;
  vocab: ReviewItem[];
  sentences: ReviewItem[];
  verbs: ReviewVerb[];
}

type Tab = "words" | "sentences" | "verbs";
type LevelFilter = Level | "all";

const LEVEL_LABEL: Record<Level, string> = { basic: "Basic", medium: "Medium", advanced: "Advanced" };
const STORED_TENSES: { id: string; label: string }[] = [
  { id: "present", label: "Present" },
  { id: "past", label: "Past" },
  { id: "imperfect", label: "Imperfect" },
  { id: "futureSimple", label: "Future" },
];

const LevelChip = ({ level }: { level: Level }): JSX.Element => (
  <span className={`cr-lvl cr-lvl-${level}`}>{LEVEL_LABEL[level]}</span>
);

export function ContentReview({
  source,
  title,
  onBack,
}: {
  source: ReviewSource;
  title: string;
  onBack: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<Tab>("words");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [openVerb, setOpenVerb] = useState<string | null>(null);

  const catOf = useMemo(
    () => new Map(source.categories.map((c) => [c.id, c] as const)),
    [source.categories],
  );
  const catLabel = (id: string) => catOf.get(id)?.label ?? id;
  const catEmoji = (id: string) => catOf.get(id)?.emoji ?? "🏷️";
  const catOrder = useMemo(() => {
    const order = new Map(source.categories.map((c, i) => [c.id, i] as const));
    return (id: string) => order.get(id) ?? 999;
  }, [source.categories]);

  const q = query.trim().toLowerCase();
  const matchLevel = (l: Level) => level === "all" || l === level;
  const matchTerms = (terms: Record<string, string>) =>
    q === "" || Object.values(terms).some((t) => t.toLowerCase().includes(q));

  // Group vocab / sentences by theme (only themes that have matching items).
  const grouped = (items: ReviewItem[]) => {
    const keep = items.filter((it) => matchLevel(it.level) && matchTerms(it.terms));
    const byCat = new Map<string, ReviewItem[]>();
    for (const it of keep) {
      const arr = byCat.get(it.category) ?? [];
      arr.push(it);
      byCat.set(it.category, arr);
    }
    return [...byCat.entries()].sort((a, b) => catOrder(a[0]) - catOrder(b[0]));
  };

  const words = useMemo(() => grouped(source.vocab), [source.vocab, q, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentences = useMemo(() => grouped(source.sentences), [source.sentences, q, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const verbs = useMemo(
    () =>
      source.verbs.filter(
        (v) =>
          matchLevel(v.level) &&
          (q === "" ||
            Object.values(v.infinitive).some((t) => t.toLowerCase().includes(q)) ||
            v.id.toLowerCase().includes(q)),
      ),
    [source.verbs, q, level], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const langs = source.languages;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "words", label: "Words", count: source.vocab.length },
    { id: "sentences", label: "Sentences", count: source.sentences.length },
    { id: "verbs", label: "Verbs", count: source.verbs.length },
  ];

  return (
    <div className="about content-review">
      <button className="cr-back" onClick={onBack}>
        ← Back
      </button>
      <h1>{title}</h1>
      <p className="cr-sub">
        {langs.map((l) => `${l.flag} ${l.name}`).join("  ·  ")}
      </p>

      <div className="cr-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={"cr-tab" + (tab === t.id ? " active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="cr-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="cr-controls">
        <input
          className="cr-search"
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cr-levels">
          {(["all", "basic", "medium", "advanced"] as LevelFilter[]).map((l) => (
            <button
              key={l}
              className={"cr-level" + (level === l ? " active" : "")}
              onClick={() => setLevel(l)}
            >
              {l === "all" ? "All" : LEVEL_LABEL[l as Level]}
            </button>
          ))}
        </div>
      </div>

      {/* --- Words / Sentences: parallel term columns, grouped by theme --- */}
      {(tab === "words" || tab === "sentences") &&
        (() => {
          const groups = tab === "words" ? words : sentences;
          if (groups.length === 0) return <p className="cr-empty">No matching {tab}.</p>;
          return groups.map(([cat, items]) => (
            <div className="cr-group" key={cat}>
              <h2 className="cr-group-head">
                {catEmoji(cat)} {catLabel(cat)} <span className="cr-count">{items.length}</span>
              </h2>
              <ul className="cr-rows">
                {items.map((it, i) => (
                  <li className="cr-row" key={i}>
                    {tab === "words" && <span className="cr-emoji">{it.emoji ?? ""}</span>}
                    <span className="cr-terms">
                      {langs.map((l, j) => (
                        <span className="cr-term" key={l.code}>
                          {j > 0 && <span className="cr-sep">—</span>}
                          {it.terms[l.code] ? (
                            it.terms[l.code]
                          ) : (
                            <span className="cr-missing" title={`No ${l.name} term`}>
                              ·
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    <LevelChip level={it.level} />
                  </li>
                ))}
              </ul>
            </div>
          ));
        })()}

      {/* --- Verbs: infinitives + expandable conjugation tables --- */}
      {tab === "verbs" &&
        (verbs.length === 0 ? (
          <p className="cr-empty">No matching verbs.</p>
        ) : (
          <ul className="cr-verbs">
            {verbs.map((v) => {
              const open = openVerb === v.id;
              const formLangs = langs.filter((l) => v.forms[l.code]);
              return (
                <li className="cr-verb" key={v.id}>
                  <button
                    className={"cr-verb-head" + (open ? " open" : "")}
                    onClick={() => setOpenVerb(open ? null : v.id)}
                  >
                    <span className="cr-caret">{open ? "▾" : "▸"}</span>
                    <span className="cr-terms">
                      {langs.map((l, j) => (
                        <span className="cr-term" key={l.code}>
                          {j > 0 && <span className="cr-sep">—</span>}
                          {v.infinitive[l.code] ?? <span className="cr-missing">·</span>}
                        </span>
                      ))}
                    </span>
                    <LevelChip level={v.level} />
                  </button>
                  {open && (
                    <div className="cr-conj">
                      {formLangs.map((l) => {
                        const pron = source.pronouns[l.code] ?? ["", "", "", "", "", ""];
                        return (
                          <div className="cr-conj-lang" key={l.code}>
                            <div className="cr-conj-flag">
                              {l.flag} {l.name}
                            </div>
                            <div className="cr-conj-scroll">
                              <table className="cr-table">
                                <thead>
                                  <tr>
                                    <th />
                                    {STORED_TENSES.map((t) => (
                                      <th key={t.id}>{t.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {pron.map((p, r) => (
                                    <tr key={r}>
                                      <th className="cr-pron">{p}</th>
                                      {STORED_TENSES.map((t) => (
                                        <td key={t.id}>{v.forms[l.code]?.[t.id]?.[r] ?? ""}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
