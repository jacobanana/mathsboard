# Security Policy

Maths Board is used by children and educators, so security and privacy matter.
Thank you for helping keep it safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately through GitHub's private vulnerability reporting:

➡️ **[Report a vulnerability](https://github.com/jacobanana/mathboard/security/advisories/new)**
&nbsp;(or use the repository's **Security** tab → **Report a vulnerability**).

This opens a confidential advisory visible only to you and the maintainers.

Please include, as far as you can:

- the affected version, commit, or URL (the hosted site vs a self-hosted build);
- steps to reproduce, and a proof of concept if you have one;
- the impact you believe it has.

**What to expect:** we aim to acknowledge a report within a few days, keep you
updated as we investigate, and credit you in the fix if you'd like. Please give
us a reasonable window to ship a fix before any public disclosure.

## Supported versions

Maths Board is continuously deployed from `main`; that branch and the live
deployment receive security fixes. There are no separate long-term-support
releases — fixes ship forward from `main`.

## Scope

In scope:

- the web app and its `server/` API (per-board token minting, image
  upload/serving);
- authentication/authorization of board access and minted tokens;
- injection, XSS, SSRF, and similar web vulnerabilities;
- accidental exposure of board content or credentials.

Out of scope (or report elsewhere):

- vulnerabilities in third-party dependencies — report them upstream; we'll pick
  up the patched release;
- issues that require an already-compromised device, or a self-hosted
  misconfiguration outside the documented setup;
- volumetric denial-of-service.

For how data is handled and stored (Swiss hosting, no accounts, solo boards that
never leave the browser), see
[ABOUT.md → Your data & your privacy](ABOUT.md#your-data--your-privacy).
