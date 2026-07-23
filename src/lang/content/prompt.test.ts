import { describe, expect, it } from "vitest";
import { buildLlmPrompt, DEFAULT_OPTIONS, LLM_PROMPT, SUGGESTED_CATEGORIES } from "./prompt";
import { CONTENT_SCHEMA, LEVELS, STORED_TENSES } from "./schema";
import baseJson from "./base.json";

describe("content prompt generation", () => {
  it("embeds the current JSON Schema verbatim, so it can't drift", () => {
    // The whole point: the prompt is generated from the schema. If the schema
    // changes, the prompt carries the change automatically.
    expect(LLM_PROMPT).toContain(JSON.stringify(CONTENT_SCHEMA, null, 2));
  });

  it("derives the levels and stored tenses from the schema constants", () => {
    for (const level of LEVELS) expect(LLM_PROMPT).toContain(`"${level}"`);
    for (const tense of STORED_TENSES) expect(LLM_PROMPT).toContain(tense);
  });

  it("suggests the built-in themes as a starting point (not a fixed set)", () => {
    // Sourced from the base pack so the suggestion tracks the real themes.
    expect(SUGGESTED_CATEGORIES).toEqual(baseJson.categories.map((c) => c.id));
    for (const id of SUGGESTED_CATEGORIES) expect(LLM_PROMPT).toContain(id);
    // Framed as a suggestion, not a prescription.
    expect(LLM_PROMPT).toMatch(/THESE ARE YOURS TO CHOOSE/);
  });

  it("asks for at least 75 sentences that build on the pack", () => {
    expect(LLM_PROMPT).toMatch(/75\+ sentences/);
    expect(LLM_PROMPT).toMatch(/vocabulary and verbs you put in THIS pack/);
  });

  it("weaves the form options into the prompt", () => {
    const prompt = buildLlmPrompt({
      knownLanguage: "French",
      targetLanguage: "Japanese",
      ageTarget: "12–14",
      theme: "space exploration",
      specialInstructions: "Use hiragana only, no kanji.",
    });
    expect(prompt).toContain("Language to teach: Japanese");
    expect(prompt).toContain("Language the learner already knows: French");
    expect(prompt).toContain("Target age: 12–14");
    expect(prompt).toContain("space exploration");
    expect(prompt).toContain("Use hiragana only, no kanji.");
  });

  it("leaves sensible placeholders when the form is untouched", () => {
    const prompt = buildLlmPrompt(DEFAULT_OPTIONS);
    expect(prompt).toContain("Language to teach: <the language you want to teach>");
    expect(prompt).toContain("Language the learner already knows: English");
    // No special-instructions section when the field is empty.
    expect(prompt).not.toContain("## Special instructions");
  });
});
