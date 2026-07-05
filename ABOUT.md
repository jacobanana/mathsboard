# About Maths Board

Maths Board is a free, open-source maths whiteboard for the classroom — an
infinite canvas with a pen, text, pictures and a growing toolbox of maths
widgets, plus real-time collaboration so a whole class can work on the same
board at once.

It stands on the shoulders of a lot of generous open-source work. This page
credits the people and projects behind it, explains exactly what happens to
your data, and tells you how you're free to use, study and modify Maths Board
yourself.

---

## Built on open source

Maths Board wouldn't exist without these projects. Huge thanks to everyone who
builds and maintains them. Follow any link to visit the source.

### In the app

The libraries that ship in Maths Board and run in your browser:

- **[React](https://react.dev)** — the UI framework (Meta, MIT)
- **[Yjs](https://yjs.dev)** — the CRDT engine that makes live collaboration
  merge cleanly (Kevin Jahns, MIT), together with its companions
  **[y-protocols](https://github.com/yjs/y-protocols)** and
  **[lib0](https://github.com/dmonad/lib0)** (Kevin Jahns, MIT)
- **[Y-Sweet](https://github.com/jamsocket/y-sweet)** — the client that syncs
  boards to the collaboration server (Jamsocket, MIT)
- **[KaTeX](https://katex.org)** — fast, beautiful maths typesetting
  (the KaTeX authors, MIT)
- **[MathLive](https://mathlive.io)** — the interactive maths-equation editor
  (Arno Gourdol, MIT)
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight state
  management (Poimandres, MIT)

### Behind the scenes

The tools that build and test Maths Board:

- **[Vite](https://vite.dev)** and **[@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react)**
  — the build tool and dev server (the Vite team, MIT)
- **[TypeScript](https://www.typescriptlang.org)** — the language
  (Microsoft, Apache-2.0)
- **[Vitest](https://vitest.dev)** — the unit-test runner (the Vitest team, MIT)
- **[Playwright](https://playwright.dev)** — end-to-end browser testing
  (Microsoft, Apache-2.0)

### Infrastructure we self-host

The services that run the shared/hosted version of Maths Board — all
self-hosted, no third-party SaaS in the data path:

- **[Y-Sweet server](https://github.com/jamsocket/y-sweet)** — the real-time
  sync server (Jamsocket, MIT)
- **[Umami](https://umami.is)** — privacy-first, cookieless analytics
  (Umami Software, MIT)
- **[PostgreSQL](https://www.postgresql.org)** — the database behind Umami
  (PostgreSQL Global Development Group, PostgreSQL License)
- **[Caddy](https://caddyserver.com)** — the web server, routing and automatic
  HTTPS (Matthew Holt & the Caddy authors, Apache-2.0)
- **[Let's Encrypt](https://letsencrypt.org)** — free TLS certificates (ISRG)
- **[Docker](https://www.docker.com)** and **[Node.js](https://nodejs.org)** —
  the runtime and packaging

> A full, machine-readable list of every dependency (including transitive ones)
> and its license lives in [`package.json`](https://github.com/jacobanana/mathsboard/blob/main/package.json)
> and the project's lockfile.

---

## Your data & your privacy

Maths Board is **privacy-first by design**. It's a tool for children and
classrooms, so we collect as little as possible and never sell or share it.

**Hosted in Switzerland.** The version we host runs on Swiss infrastructure,
under Swiss data-protection law (the revised FADP). Your data stays in
Switzerland and never passes through a US-hyperscaler cloud.

**No accounts, no tracking.** There is no sign-up. We don't ask for your name,
email address or a password, and we don't create a profile of you. There are no
advertising trackers and no third-party cookies.

**Where your boards live:**

- **Working on your own?** Your boards are saved *only in your own browser*
  (local storage on your device). They never leave your computer and we never
  see them.
- **Sharing a board?** When you press **Share**, that board — and any pictures
  you add to it — is stored on our Swiss server so your collaborators can sync
  to it. It's reachable only by people who have the short share code.
- **Display names & cursors** shown while collaborating are *live presence
  only*: they travel between browsers so you can see who's here, and are never
  written to disk on our server.

**Analytics without the tracking.** To understand which features are useful and
whether the app is working, we use **[Umami](https://umami.is)**, which we host
ourselves in Switzerland. It's cookieless and privacy-first: it records
anonymous, aggregate usage (page views and which tools get used) and **no
personally identifiable information**. Because nothing personal is collected,
there's no consent banner to click through. No data is ever sent to Google
Analytics or any other third party.

**Open for inspection.** Don't take our word for it — Maths Board is fully open
source, so anyone can read exactly what it does with your data:
<https://github.com/jacobanana/mathsboard>.

---

## License

Maths Board is **free and open-source software**, released under the
**[GNU Affero General Public License, version 3 (AGPL-3.0)](https://github.com/jacobanana/mathsboard/blob/main/LICENSE)**.

In plain terms, you are free to:

- **Use** Maths Board for anything — classrooms, tutoring, at home — at no cost.
- **Study** how it works; all the source code is public.
- **Modify** it and adapt it to your needs.
- **Share** your copies and your changes.

The one condition: because Maths Board is a networked app, if you run a modified
version — including hosting it as a website for others — you must make your
modified source code available to those users under the same license. That's
what keeps Maths Board, and every version built from it, free and open for
everyone.

The full legal text is in the [`LICENSE`](https://github.com/jacobanana/mathsboard/blob/main/LICENSE)
file, and the complete source code is at
<https://github.com/jacobanana/mathsboard>.

© 2026 Adrien Fauconnet and the Maths Board contributors.
