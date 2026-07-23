// The TTS locale matching — the pure core of lang/speech.ts. These are the
// functions the 🔊 buttons and the Voices settings rely on to turn an ISO 639-1
// content code ("pt") into the right device voice, INCLUDING surfacing both a
// Portugal and a Brazil voice for one Portuguese language. They take a voice
// list as an argument, so they're testable without a real speech engine (jsdom
// has none).

import { describe, expect, it } from "vitest";
import {
  chooseVoice,
  matchVoices,
  primarySubtag,
  regionSubtag,
  voiceLabel,
} from "@/lang/speech";

/** Build a minimal SpeechSynthesisVoice stand-in. */
const voice = (
  lang: string,
  name: string,
  voiceURI = name,
  isDefault = false,
): SpeechSynthesisVoice =>
  ({ lang, name, voiceURI, default: isDefault, localService: true } as SpeechSynthesisVoice);

const VOICES: SpeechSynthesisVoice[] = [
  voice("pt-BR", "Maria", "uri-br"),
  voice("pt-PT", "Joana", "uri-pt"),
  voice("fr-FR", "Thomas", "uri-fr"),
  voice("en-GB", "Daniel", "uri-gb"),
  voice("en-US", "Alex", "uri-us"),
];

describe("subtag parsing", () => {
  it("reads the primary subtag, lowercased", () => {
    expect(primarySubtag("pt-BR")).toBe("pt");
    expect(primarySubtag("en_GB")).toBe("en");
    expect(primarySubtag("FR")).toBe("fr");
  });

  it("reads the region subtag, uppercased, or empty when absent", () => {
    expect(regionSubtag("pt-BR")).toBe("BR");
    expect(regionSubtag("en_us")).toBe("US");
    expect(regionSubtag("pt")).toBe("");
  });
});

describe("matchVoices", () => {
  it("returns every voice sharing the primary subtag — both Portugals", () => {
    const pt = matchVoices(VOICES, "pt");
    expect(pt.map((v) => v.voiceURI)).toEqual(["uri-br", "uri-pt"]);
  });

  it("does not leak voices from other languages", () => {
    expect(matchVoices(VOICES, "fr").map((v) => v.name)).toEqual(["Thomas"]);
    expect(matchVoices(VOICES, "de")).toEqual([]);
  });

  it("puts an exact-region match first when the code carries a region", () => {
    // "pt-PT" should float the Portugal voice above the Brazil one.
    expect(matchVoices(VOICES, "pt-PT")[0].voiceURI).toBe("uri-pt");
    expect(matchVoices(VOICES, "pt-BR")[0].voiceURI).toBe("uri-br");
  });
});

describe("chooseVoice", () => {
  it("uses the chosen voice when it is still installed", () => {
    expect(chooseVoice(VOICES, "pt", "uri-pt")?.voiceURI).toBe("uri-pt");
  });

  it("falls back to the first matching voice when the chosen one is gone", () => {
    expect(chooseVoice(VOICES, "pt", "uri-missing")?.voiceURI).toBe("uri-br");
  });

  it("falls back to the first matching voice when nothing is chosen", () => {
    expect(chooseVoice(VOICES, "en")?.voiceURI).toBe("uri-gb");
  });

  it("returns undefined when no voice matches the language", () => {
    expect(chooseVoice(VOICES, "de")).toBeUndefined();
  });
});

describe("voiceLabel", () => {
  it("names the region so accents are distinguishable", () => {
    expect(voiceLabel(voice("pt-BR", "Maria"))).toContain("Brazil");
    expect(voiceLabel(voice("pt-PT", "Joana"))).toContain("Portugal");
  });

  it("falls back to just the name when there is no region", () => {
    expect(voiceLabel(voice("eo", "Esperanto Voice"))).toBe("Esperanto Voice");
  });
});
