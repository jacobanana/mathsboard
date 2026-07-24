// URL routing between the two app flavours: pathForSubject is the inverse of
// detectSubject (toggling the /language/ segment), and crossAppRedirect decides
// when a just-joined shared board must hand off to the other app. Both are pure
// — the store wires crossAppRedirect to window.location.replace, but the policy
// lives here where it can be asserted without navigating.

import { describe, expect, it } from "vitest";
import { pathForSubject, hostForSubject, crossAppRedirect } from "@/subject";

describe("pathForSubject", () => {
  it("maps to the language directory and back at the site root", () => {
    expect(pathForSubject("language", "/")).toBe("/language/");
    expect(pathForSubject("maths", "/language/")).toBe("/");
    // Round-trip is stable.
    expect(pathForSubject("maths", pathForSubject("language", "/"))).toBe("/");
  });

  it("preserves a deployment base (e.g. the GitHub Pages repo subpath)", () => {
    expect(pathForSubject("language", "/mathsboard/")).toBe("/mathsboard/language/");
    expect(pathForSubject("maths", "/mathsboard/language/")).toBe("/mathsboard/");
  });

  it("preserves a trailing index.html", () => {
    expect(pathForSubject("language", "/mathsboard/index.html")).toBe(
      "/mathsboard/language/index.html",
    );
    expect(pathForSubject("maths", "/mathsboard/language/index.html")).toBe(
      "/mathsboard/index.html",
    );
  });

  it("is idempotent when already on the target flavour's path", () => {
    expect(pathForSubject("language", "/language/")).toBe("/language/");
    expect(pathForSubject("maths", "/")).toBe("/");
  });
});

describe("crossAppRedirect", () => {
  it("bounces a language board opened in the maths app, keeping the board query", () => {
    const target = crossAppRedirect(
      "language",
      "https://host/mathsboard/?board=4f2a9c1b",
      "maths",
    );
    expect(target).toBe("https://host/mathsboard/language/?board=4f2a9c1b");
  });

  it("bounces a maths board opened in the language app", () => {
    const target = crossAppRedirect(
      "maths",
      "https://host/language/?board=abcd1234",
      "language",
    );
    expect(target).toBe("https://host/?board=abcd1234");
  });

  it("does not redirect when the board is already this flavour's subject", () => {
    expect(
      crossAppRedirect("maths", "https://host/?board=abcd1234", "maths"),
    ).toBeNull();
    expect(
      crossAppRedirect("language", "https://host/language/?board=abcd1234", "language"),
    ).toBeNull();
  });

  it("does not redirect a subject-less (legacy) shared board", () => {
    expect(
      crossAppRedirect(undefined, "https://host/language/?board=abcd1234", "language"),
    ).toBeNull();
  });
});

describe("multi-domain routing", () => {
  it("swaps the subdomain label, keeping the rest of the domain", () => {
    expect(hostForSubject("language", "mathsboard.mixedmode.ch")).toBe(
      "langsboard.mixedmode.ch",
    );
    expect(hostForSubject("maths", "langsboard.mixedmode.ch")).toBe(
      "mathsboard.mixedmode.ch",
    );
  });

  it("bounces across DOMAINS on a board host, resetting to the root", () => {
    // A language board opened on the maths domain -> the language domain.
    expect(
      crossAppRedirect(
        "language",
        "https://mathsboard.mixedmode.ch/?board=4f2a9c1b",
        "maths",
      ),
    ).toBe("https://langsboard.mixedmode.ch/?board=4f2a9c1b");
    // And the reverse.
    expect(
      crossAppRedirect(
        "maths",
        "https://langsboard.mixedmode.ch/?board=abcd1234",
        "language",
      ),
    ).toBe("https://mathsboard.mixedmode.ch/?board=abcd1234");
  });

  it("recognises a board host by PREFIX, so an in-family rename still routes", () => {
    // Host detection is prefix-based: a differently-named language subdomain
    // (here the older "languageboard") is still treated as a board host and
    // redirected to the canonical peer, no code change needed.
    expect(
      crossAppRedirect(
        "maths",
        "https://languageboard.mixedmode.ch/?board=abcd1234",
        "language",
      ),
    ).toBe("https://mathsboard.mixedmode.ch/?board=abcd1234");
  });

  it("still toggles the PATH on a non-board host (dev / GitHub Pages)", () => {
    expect(
      crossAppRedirect("language", "https://host/mathsboard/?board=42", "maths"),
    ).toBe("https://host/mathsboard/language/?board=42");
  });
});
