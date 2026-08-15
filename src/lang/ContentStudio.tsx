// THE "CREATE" TAB of the content manager. It turns "I want to teach a new
// language / add my own words" into a three-step flow that needs no code:
//
//   1. Grab the format — download the JSON Schema and/or an example pack, or
//      copy a ready-made LLM prompt that produces a valid pack.
//   2. Generate content with that prompt in any LLM (or hand-write it).
//   3. Load the finished file — validated, saved on this device, and ready to
//      tick onto a board from the "This board" tab.
//
// This tab only CREATES content; the manager's other tabs own the library and
// what the open board teaches (see ContentManager). Loading a file goes through
// the manager's shared picker so there is one "Load content…" everywhere. All of
// the actual format/merge logic lives in content/ (schema, registry, prompt);
// this file is just the view.

import { useMemo, useState } from "react";
import { CONTENT_SCHEMA } from "@/lang/content/schema";
import {
  buildLlmPrompt,
  DEFAULT_OPTIONS,
  type PromptOptions,
} from "@/lang/content/prompt";
import { BASE_PACK } from "@/lang/content/registry";
import { downloadText } from "@/lang/content/files";

export interface ContentStudioProps {
  /** Open the manager's shared file picker (one "Load content…" for every tab). */
  onLoad(): void;
}

export function ContentStudio({ onLoad }: ContentStudioProps): JSX.Element {
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
    <div className="content-studio">
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

      <h2>3. Load your pack</h2>
      <p>
        Pick the file you made (or several). It&rsquo;s checked before anything
        is added, then joins your <b>Library</b> — tick it under{" "}
        <b>This board</b> to teach from it.
      </p>
      <div className="cs-buttons">
        <button className="btn primary" onClick={onLoad}>
          Load content…
        </button>
      </div>
    </div>
  );
}
