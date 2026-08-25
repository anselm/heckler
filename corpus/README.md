# corpus

Reference samples of Anselm's own writing. The baseline is derived from these
(`node bin/heckler.mjs baseline corpus/*.md`) — never hand-edit
`baseline.json`.

Rules for adding samples:

- Only text Anselm actually wrote, unassisted. Devnotes and devlogs that were
  drafted by Claude are poison here — they would drag the baseline toward the
  thing we are trying to detect. When in doubt, leave it out and ask.
- Note provenance at the top of each file.
- Fast unselfconscious writing (emails, notes) and polished public writing
  are both wanted; mark which is which.

Current contents:

- `simulate-world-about.md` — the simulate.world "about" essay, pre-AI era
  (~2015), recovered 2026-08-25 from the site's data/*.js files, HTML
  stripped, section order follows the site's arc. Polished public writing;
  he "worked hard on that text." Deliberately built emotional-register-first:
  distress → growing powers → hopeful closure.
