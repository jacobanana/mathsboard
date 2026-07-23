// The voice-profile store: per-language voice choices, speaking rate and the
// master toggle persist to localStorage and clamp sanely — mirrors the checks
// on the language-pair store.

import { beforeEach, describe, expect, it } from "vitest";
import {
  clampRate,
  currentVoicePrefs,
  DEFAULT_RATE,
  MAX_RATE,
  MIN_RATE,
  useVoiceStore,
} from "@/lang/voiceStore";

const KEY = "langboard.voices.v1";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "{}");

beforeEach(() => {
  localStorage.clear();
  useVoiceStore.setState({ byLang: {}, rate: DEFAULT_RATE, enabled: true });
});

describe("defaults", () => {
  it("starts enabled at the default rate with no voices chosen", () => {
    const prefs = currentVoicePrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.rate).toBe(DEFAULT_RATE);
    expect(prefs.byLang).toEqual({});
  });
});

describe("setVoice", () => {
  it("records and persists a per-language voice choice", () => {
    useVoiceStore.getState().setVoice("pt", "uri-br");
    expect(currentVoicePrefs().byLang.pt).toBe("uri-br");
    expect(stored().byLang.pt).toBe("uri-br");
  });

  it("clears a choice back to the device default with an empty uri", () => {
    useVoiceStore.getState().setVoice("pt", "uri-br");
    useVoiceStore.getState().setVoice("pt", "");
    expect(currentVoicePrefs().byLang.pt).toBeUndefined();
    expect(stored().byLang.pt).toBeUndefined();
  });
});

describe("setRate", () => {
  it("clamps above and below the allowed range", () => {
    useVoiceStore.getState().setRate(9);
    expect(currentVoicePrefs().rate).toBe(MAX_RATE);
    useVoiceStore.getState().setRate(0.01);
    expect(currentVoicePrefs().rate).toBe(MIN_RATE);
    expect(stored().rate).toBe(MIN_RATE);
  });

  it("clampRate is a pure clamp", () => {
    expect(clampRate(1)).toBe(1);
    expect(clampRate(99)).toBe(MAX_RATE);
    expect(clampRate(-1)).toBe(MIN_RATE);
  });
});

describe("setEnabled", () => {
  it("persists the master toggle", () => {
    useVoiceStore.getState().setEnabled(false);
    expect(currentVoicePrefs().enabled).toBe(false);
    expect(stored().enabled).toBe(false);
  });
});
