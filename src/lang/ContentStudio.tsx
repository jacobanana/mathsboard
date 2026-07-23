// THE CONTENT-CREATION HELP PAGE (language board only, burger menu → "Create
// content"). It turns "I want to teach a new language / add my own words" into
// a three-step flow that needs no code:
//
//   1. Grab the format — download the JSON Schema and/or an example pack, or
//      copy a ready-made LLM prompt that produces a valid pack.
//   2. Generate content with that prompt in any LLM (or hand-write it).
//   3. Import the .json here — it's validated, saved on this device, and every
//      widget can immediately draw from it.
//
// All of the actual format/merge logic lives in content/ (schema, registry,
// prompt); this file is just the view + the file-picker wiring. Imported packs
// are per-device and only ADD to what the board can teach, so importing never
// disturbs a saved or shared board.

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CONTENT_SCHEMA } from "@/lang/content/schema";
import {
  buildLlmPrompt,
  DEFAULT_OPTIONS,
  type PromptOptions,
} from "@/lang/content/prompt";
import {
  BASE_PACK,
  boardPacksNow,
  currentContent,
  importPackJson,
  importedPacks,
  isPackActive,
  removeImportedPack,
  setPackActive,
  subscribeContent,
} from "@/lang/content/registry";
import { ContentReview, type ReviewSource } from "@/lang/ContentReview";

/** Trigger a browser download of `text` as a file named `filename`. */
function download(filename: string, text: string, type = "application/json"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Feedback =
  | { kind: "ok"; message: string }
  | { kind: "error"; messages: string[] }
  | null;

export function ContentStudio(): JSX.Element {
  // Re-render whenever content is imported / removed / toggled so the list,
  // counts and checkboxes stay live (registry drives the external store). The
  // signature folds in each pack's active state, not just the count, so ticking
  // a checkbox re-renders too.
  useSyncExternalStore(subscribeContent, () =>
    importedPacks()
      .map((p) => `${p.id}:${isPackActive(p.id) ? 1 : 0}`)
      .join(","),
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<{ source: ReviewSource; title: string } | null>(null);
  // The prompt builder is tucked away in an accordion so it doesn't dominate the
  // page — it only appears when the user asks for it.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions>(DEFAULT_OPTIONS);
  // The prompt is generated live from the schema + the form, so it always
  // reflects both the current format and the choices below.
  const prompt = useMemo(() => buildLlmPrompt(options), [options]);
  const setOption = (key: keyof PromptOptions, value: string): void =>
    setOptions((o) => ({ ...o, [key]: value }));

  const content = currentContent();
  const packs = importedPacks();
  // Packs that arrived with the OPEN board (a shared board or one you opened on
  // another device) but that you haven't added to your own library yet.
  const fromBoard = boardPacksNow().filter((bp) => !packs.some((p) => p.id === bp.id));

  // Reviewing a pack's actual content takes over the whole page (with a Back
  // button) so the listing is easy to read.
  if (review) {
    return (
      <ContentReview
        source={review.source}
        title={review.title}
        onBack={() => setReview(null)}
      />
    );
  }

  function handleFiles(files: FileList | null): void {
    if (!files || files.length === 0) return;
    const errors: string[] = [];
    let added = 0;
    let remaining = files.length;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = importPackJson(String(reader.result ?? ""));
        if (result.ok) added += 1;
        else errors.push(`${file.name}: ${result.errors.join(" ")}`);
        if (--remaining === 0) finish();
      };
      reader.onerror = () => {
        errors.push(`${file.name}: could not read the file.`);
        if (--remaining === 0) finish();
      };
      reader.readAsText(file);
    });

    function finish(): void {
      if (errors.length) setFeedback({ kind: "error", messages: errors });
      else
        setFeedback({
          kind: "ok",
          message: `Imported ${added} pack${added === 1 ? "" : "s"}. New content is ready to use.`,
        });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function copyPrompt(): void {
    void navigator.clipboard?.writeText(prompt).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => {
        /* clipboard blocked — the download button is the fallback */
      },
    );
  }

  return (
    <div className="about content-studio">
      <h1>Create your own content</h1>
      <p>
        The Language Board teaches from <strong>content packs</strong> — portable
        JSON files of vocabulary, sentences and verb conjugations. Add a new
        language or your own themes by importing a pack. Packs only <em>add</em>{" "}
        to what the board can teach and are saved on this device, so importing
        never changes a saved or shared board.
      </p>

      <h2>1. Get the format</h2>
      <p>
        Download the schema to see (or validate against) every field, or grab
        the built-in pack as a worked example to copy.
      </p>
      <div className="cs-buttons">
        <button
          className="btn"
          onClick={() =>
            download("language-content.schema.json", JSON.stringify(CONTENT_SCHEMA, null, 2))
          }
        >
          ⬇ JSON schema
        </button>
        <button
          className="btn"
          onClick={() =>
            download("language-content-example.json", JSON.stringify(BASE_PACK, null, 2))
          }
        >
          ⬇ Example pack
        </button>
      </div>

      <h2>2. Generate content with an LLM</h2>
      <p>
        Build a prompt to paste into ChatGPT, Claude or any capable model — it
        will produce a ready-to-import pack. The prompt is generated from the
        current format, so it always matches what the app accepts.
      </p>
      <button
        className="btn cs-accordion"
        aria-expanded={builderOpen}
        onClick={() => setBuilderOpen((v) => !v)}
      >
        <span className="cs-accordion-caret">{builderOpen ? "▾" : "▸"}</span>
        Prompt builder
      </button>

      {builderOpen && (
        <div className="cs-builder">
          <p className="hint">
            Fill in what you want to teach. Anything left blank just stays open
            for the model to decide.
          </p>
          <div className="cs-form">
            <label className="cs-field">
              <span>Known language</span>
              <input
                type="text"
                value={options.knownLanguage}
                placeholder="English"
                onChange={(e) => setOption("knownLanguage", e.target.value)}
              />
            </label>
            <label className="cs-field">
              <span>Language to learn</span>
              <input
                type="text"
                value={options.targetLanguage}
                placeholder="e.g. Spanish"
                onChange={(e) => setOption("targetLanguage", e.target.value)}
              />
            </label>
            <label className="cs-field">
              <span>Target age</span>
              <input
                type="text"
                value={options.ageTarget}
                placeholder="e.g. 8–11"
                onChange={(e) => setOption("ageTarget", e.target.value)}
              />
            </label>
            <label className="cs-field">
              <span>Theme</span>
              <input
                type="text"
                value={options.theme}
                placeholder="e.g. space, football (optional)"
                onChange={(e) => setOption("theme", e.target.value)}
              />
            </label>
            <label className="cs-field cs-field-wide">
              <span>Special instructions</span>
              <textarea
                value={options.specialInstructions}
                placeholder="Anything else to steer the content (optional)"
                rows={2}
                onChange={(e) => setOption("specialInstructions", e.target.value)}
              />
            </label>
          </div>

          <div className="cs-buttons">
            <button className="btn primary" onClick={copyPrompt}>
              {copied ? "✓ Copied" : "Copy prompt"}
            </button>
            <button
              className="btn"
              onClick={() => download("language-content-prompt.txt", prompt, "text/plain")}
            >
              ⬇ Download prompt
            </button>
          </div>
          <pre className="cs-prompt">{prompt}</pre>
        </div>
      )}

      <h2>3. Import your pack</h2>
      <p>Select the JSON file (or several). It's checked before anything is added.</p>
      <div className="cs-buttons">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {feedback?.kind === "ok" && <p className="cs-ok">{feedback.message}</p>}
      {feedback?.kind === "error" && (
        <div className="cs-errors">
          <strong>Couldn't import:</strong>
          <ul>
            {feedback.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <hr />

      <h2>Loaded content</h2>
      <p className="cs-counts">
        {content.languages.length} languages · {content.categories.length} themes ·{" "}
        {content.vocab.length} words · {content.sentences.length} sentences ·{" "}
        {content.verbs.length} verbs
      </p>
      <button
        className="btn cs-browse-all"
        onClick={() => setReview({ source: content, title: "All loaded content" })}
      >
        Browse every word, sentence &amp; verb →
      </button>

      {packs.length > 0 && (
        <p className="hint cs-active-hint">
          Tick the packs you want active. The catalogue is built from the
          built-in content plus whichever packs are ticked — so you can focus on
          one pack or combine several.
        </p>
      )}

      <ul className="cs-packs">
        {/* The built-in content is always active and reviewable. */}
        <li>
          <label className="cs-pack-name">
            <input type="checkbox" checked disabled title="Built-in content is always active" />
            {BASE_PACK.name} <span className="cs-badge">always on</span>
          </label>
          <span className="cs-pack-actions">
            <button
              className="btn small"
              onClick={() => setReview({ source: BASE_PACK, title: BASE_PACK.name })}
            >
              View content
            </button>
          </span>
        </li>
        {packs.map((p) => (
          <li key={p.id} className={isPackActive(p.id) ? undefined : "cs-pack-off"}>
            <label className="cs-pack-name">
              <input
                type="checkbox"
                checked={isPackActive(p.id)}
                onChange={(e) => setPackActive(p.id, e.target.checked)}
              />
              {p.name} <code>{p.id}</code>
            </label>
            <span className="cs-pack-actions">
              <button
                className="btn small"
                onClick={() => setReview({ source: p, title: p.name })}
              >
                View content
              </button>
              <button
                className="btn small cs-remove"
                onClick={() => {
                  removeImportedPack(p.id);
                  setFeedback(null);
                }}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      {fromBoard.length > 0 && (
        <>
          <h2>Content in this board</h2>
          <p className="hint">
            This board brought its own content. Save a pack to your library to
            reuse it in other boards.
          </p>
          <ul className="cs-packs">
            {fromBoard.map((p) => (
              <li key={p.id}>
                <span className="cs-pack-name">
                  {p.name} <span className="cs-badge">from board</span>
                </span>
                <span className="cs-pack-actions">
                  <button
                    className="btn small"
                    onClick={() => setReview({ source: p, title: p.name })}
                  >
                    View content
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      const r = importPackJson(JSON.stringify(p));
                      setFeedback(
                        r.ok
                          ? { kind: "ok", message: `Saved "${p.name}" to your library.` }
                          : { kind: "error", messages: r.errors },
                      );
                    }}
                  >
                    Save to my library
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
