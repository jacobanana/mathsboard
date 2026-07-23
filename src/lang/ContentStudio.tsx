// THE CONTENT-CREATION PAGE (language board only, burger menu → "Create
// content"). It turns "I want to teach a new language / add my own words" into
// a three-step flow that needs no code:
//
//   1. Grab the format — download the JSON Schema and/or an example pack, or
//      copy a ready-made LLM prompt that produces a valid pack.
//   2. Generate content with that prompt in any LLM (or hand-write it).
//   3. Add the finished file here — it's validated, saved on this device, and
//      every widget can immediately draw from it.
//
// This page only CREATES content. Seeing, loading, downloading and deleting
// what's already on the device lives on the Contents page (ContentLibrary),
// which this page links to. All of the actual format/merge logic lives in
// content/ (schema, registry, prompt); this file is just the view + the
// file-picker wiring. Packs only ADD to what the board can teach, so adding
// one never disturbs a saved or shared board.

import { useMemo, useRef, useState } from "react";
import { CONTENT_SCHEMA } from "@/lang/content/schema";
import {
  buildLlmPrompt,
  DEFAULT_OPTIONS,
  type PromptOptions,
} from "@/lang/content/prompt";
import { BASE_PACK } from "@/lang/content/registry";
import { downloadText, importPackFiles } from "@/lang/content/files";

type Feedback =
  | { kind: "ok"; message: string }
  | { kind: "error"; messages: string[] }
  | null;

export interface ContentStudioProps {
  /** Open the Contents page (the library of loaded packs). */
  onOpenLibrary?: () => void;
}

export function ContentStudio({ onOpenLibrary }: ContentStudioProps): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  // The prompt builder is tucked away in an accordion so it doesn't dominate the
  // page — it only appears when the user asks for it.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions>(DEFAULT_OPTIONS);
  // The prompt is generated live from the schema + the form, so it always
  // reflects both the current format and the choices below.
  const prompt = useMemo(() => buildLlmPrompt(options), [options]);
  const setOption = (key: keyof PromptOptions, value: string): void =>
    setOptions((o) => ({ ...o, [key]: value }));

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const { added, errors } = await importPackFiles(files);
    if (errors.length) setFeedback({ kind: "error", messages: errors });
    else
      setFeedback({
        kind: "ok",
        message: `Added ${added} pack${added === 1 ? "" : "s"} — the new content is ready to use.`,
      });
    if (fileRef.current) fileRef.current.value = "";
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
        The Language Board teaches from <strong>content packs</strong> —
        portable files of vocabulary, sentences and verb conjugations. Add a
        new language or your own themes by creating a pack. Packs only{" "}
        <em>add</em> to what the board can teach and are saved on this device,
        so adding one never changes a saved or shared board.
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
            downloadText(
              "language-content.schema.json",
              JSON.stringify(CONTENT_SCHEMA, null, 2),
            )
          }
        >
          ⬇ JSON schema
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadText(
              "language-content-example.json",
              JSON.stringify(BASE_PACK, null, 2),
            )
          }
        >
          ⬇ Example pack
        </button>
      </div>

      <h2>2. Generate content with an LLM</h2>
      <p>
        Build a prompt to paste into ChatGPT, Claude or any capable model — it
        will produce a ready-to-add pack. The prompt is generated from the
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
              onClick={() => downloadText("language-content-prompt.txt", prompt, "text/plain")}
            >
              ⬇ Download prompt
            </button>
          </div>
          <pre className="cs-prompt">{prompt}</pre>
        </div>
      )}

      <h2>3. Add your pack</h2>
      <p>
        Pick the file you made (or several). It's checked before anything is
        added, then managed from the Contents page.
      </p>
      <div className="cs-buttons">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          Add content file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {feedback?.kind === "ok" && <p className="cs-ok">{feedback.message}</p>}
      {feedback?.kind === "error" && (
        <div className="cs-errors">
          <strong>Couldn't add:</strong>
          <ul>
            {feedback.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {onOpenLibrary && (
        <>
          <hr />
          <p>
            Everything loaded on this device — including content a board brought
            with it — lives on the Contents page.
          </p>
          <button className="btn" onClick={onOpenLibrary}>
            Open Contents →
          </button>
        </>
      )}
    </div>
  );
}
