// A deliberately tiny Markdown renderer for the static in-app docs (currently
// just the About page, ui/About.tsx). It supports exactly the subset those
// files use — ATX headings (#..###), paragraphs, unordered lists (with wrapped
// continuation lines), block quotes, horizontal rules, and the inline markup
// **bold**, [text](url), <autolink> and `code` — and nothing else.
//
// It builds React nodes (never dangerouslySetInnerHTML), so there is no
// HTML-injection surface and links get the usual target/rel hardening. If a doc
// ever needs tables, images or nested lists, don't grow this — reach for a real
// Markdown library (react-markdown/marked) instead.

import type { ReactNode } from "react";

// The inline tokens, tried left-to-right at each position: `code`, **bold**,
// *emphasis*, [label](href), then <autolink>. exec() returns the leftmost
// match, so plain text between tokens is emitted verbatim. **bold** is listed
// before *em* so a `**` opener never mis-parses as an empty emphasis.
const INLINE =
  /(`[^`]+`)|(\*\*.+?\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))|(<(?:https?:\/\/|mailto:)[^>\s]+>)/;

/** Parse inline markup within one logical line into React nodes. Recurses into
 *  bold and link-label content so `**[x](y)**` and `[`code`](y)` both work. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = k++;
    if (token.startsWith("`")) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      out.push(<strong key={key}>{inline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
    } else if (token.startsWith("[")) {
      const cut = token.indexOf("](");
      const href = token.slice(cut + 2, -1);
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer noopener">
          {inline(token.slice(1, cut))}
        </a>,
      );
    } else {
      const href = token.slice(1, -1); // <autolink>
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer noopener">
          {href}
        </a>,
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

const isBlank = (s: string) => s.trim() === "";
const isHr = (s: string) => /^(---|\*\*\*|___)\s*$/.test(s.trim());
const isListItem = (s: string) => /^[-*]\s+/.test(s);
const startsBlock = (s: string) =>
  /^#{1,6}\s/.test(s) || isHr(s) || /^>\s?/.test(s) || isListItem(s);

/** Collapse runs of whitespace produced by joining wrapped source lines. */
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function Markdown({ source }: { source: string }): JSX.Element {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
    } else if (/^#{1,6}\s/.test(line)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line)!;
      const level = Math.min(m[1].length, 3);
      const body = inline(m[2].trim());
      const k = key++;
      blocks.push(
        level === 1 ? (
          <h1 key={k}>{body}</h1>
        ) : level === 2 ? (
          <h2 key={k}>{body}</h2>
        ) : (
          <h3 key={k}>{body}</h3>
        ),
      );
      i++;
    } else if (isHr(line)) {
      blocks.push(<hr key={key++} />);
      i++;
    } else if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(<blockquote key={key++}>{inline(tidy(buf.join(" ")))}</blockquote>);
    } else if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
        // Absorb indented continuation lines (soft-wrapped item text).
        while (i < lines.length && !isBlank(lines[i]) && /^\s+\S/.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
      }
      blocks.push(
        <ul key={key++}>
          {items.map((it, idx) => (
            <li key={idx}>{inline(tidy(it))}</li>
          ))}
        </ul>,
      );
    } else {
      const buf: string[] = [];
      while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push(<p key={key++}>{inline(tidy(buf.join(" ")))}</p>);
    }
  }

  return <>{blocks}</>;
}
