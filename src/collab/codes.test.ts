// Join-code parsing/formatting and the board-id <-> URL round trip. These run
// with COLLAB_ENABLED on (the default test env), matching the self-hosted
// build; the codes themselves are pure string logic used by solo UI too
// (the Join form accepts them before any network is involved).

import { afterEach, describe, expect, it } from "vitest";
import {
  boardIdFromUrl,
  clearBoardIdFromUrl,
  formatBoardCode,
  isShortCode,
  newBoardCode,
  normalizeBoardCode,
  putBoardIdInUrl,
} from "@/collab/session";

afterEach(() => {
  clearBoardIdFromUrl();
});

describe("normalizeBoardCode", () => {
  it("accepts a bare code in any case, with dashes or spaces", () => {
    expect(normalizeBoardCode("4f2a9c1b")).toBe("4f2a9c1b");
    expect(normalizeBoardCode("4F2A-9C1B")).toBe("4f2a9c1b");
    expect(normalizeBoardCode("  4f2a 9c1b  ")).toBe("4f2a9c1b");
  });

  it("extracts the code from a pasted share link", () => {
    expect(
      normalizeBoardCode("https://board.example.com/?board=4f2a9c1b"),
    ).toBe("4f2a9c1b");
  });

  it("accepts a legacy long board id verbatim", () => {
    expect(normalizeBoardCode("AbCdEf123456_-")).toBe("AbCdEf123456_-");
  });

  it("rejects garbage", () => {
    expect(normalizeBoardCode("")).toBeNull();
    expect(normalizeBoardCode("zz!")).toBeNull();
    expect(normalizeBoardCode("abc")).toBeNull(); // too short
  });
});

describe("code format helpers", () => {
  it("formatBoardCode groups by 4 in upper case", () => {
    expect(formatBoardCode("4f2a9c1b")).toBe("4F2A-9C1B");
    expect(formatBoardCode("abcdef")).toBe("ABCD-EF");
  });

  it("isShortCode matches lower-case hex of 6-12 chars", () => {
    expect(isShortCode("4f2a9c1b")).toBe(true);
    expect(isShortCode("abcdef")).toBe(true);
    expect(isShortCode("4F2A9C1B")).toBe(false); // display form, not canonical
    expect(isShortCode("abcdefabcdef0")).toBe(false); // too long
  });

  it("newBoardCode mints 8-hex codes that round-trip through the parser", () => {
    const code = newBoardCode();
    expect(code).toMatch(/^[0-9a-f]{8}$/);
    expect(isShortCode(code)).toBe(true);
    expect(normalizeBoardCode(formatBoardCode(code))).toBe(code);
  });
});

describe("board id <-> URL", () => {
  it("put / read / clear round-trips through the address bar", () => {
    expect(boardIdFromUrl()).toBeNull();

    putBoardIdInUrl("4f2a9c1b");
    expect(boardIdFromUrl()).toBe("4f2a9c1b");
    expect(window.location.search).toContain("board=4f2a9c1b");

    clearBoardIdFromUrl();
    expect(boardIdFromUrl()).toBeNull();
  });

  it("ignores a malformed ?board= value", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("board", "b@d!");
    window.history.pushState({}, "", url);
    expect(boardIdFromUrl()).toBeNull();
  });
});
