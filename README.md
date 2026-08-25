# heckler

Adversarial analysis of prose meant for public consumption. A stylometric
linter plus a register-trajectory plotter: it flags the statistical tells of
machine writing and measures distance from a baseline built from your own
prose. It is heuristics, not a detector — its job is to point a human editor
at the paragraphs that need a human.

Born from a real observation: Substack's AI detector separates Anselm's
writing from Claude's with 100% accuracy at paragraph level. The goal here is
not to beat detectors; it is prose that isn't robotic. House rule: machine
drafts, human voices.

No dependencies. Node ≥ 20.

```sh
node bin/heckler.mjs baseline corpus/*.md          # derive the voice baseline
node bin/heckler.mjs report draft.md               # heckle a draft against it
node bin/heckler.mjs report draft.md --json        # machine-readable
node bin/heckler.mjs arc essay.md                  # emotional-register arc by ## section
```

## What it measures

- **Rhythm** — sentence-length burstiness, per paragraph and per document,
  as *distance from the corpus*, not an assumed direction. (First lesson
  learned: the folk wisdom "AI prose is too uniform" failed here — the
  reference corpus is steadier than the machine text. Distance is the signal.)
- **Tics** — stock constructions ("not just X, but Y", "serves as",
  "testament to", paragraph bows, dramatic em-dash asides, formal
  connectives, empty intensifiers). Severity-ranked; excerpted in place.
- **Fingerprint** — function-word frequency profile, cosine similarity to
  the corpus; punctuation rates per 1000 words. Em-dash rate alone separated
  Claude drafts (16–24/1000w) from the reference corpus (0.0) on day one.
- **Voice markers** — features of the owner's register whose *presence* is
  good: question volleys aimed at the reader, first-person grounding,
  concrete numbers. Question volleys suppress the rhythm flag: uniform
  question runs are voice, not metronome.
- **Arc** (`arc`) — distress / agency / hope / question density per section,
  as terminal sparklines. Crude transparent lexicons, deliberately: this is
  for checking that a piece's emotional score — e.g. distress → powers →
  hopeful close — actually shows up in the text.

## Corpus

`corpus/` holds only text Anselm wrote unassisted (see its README — Claude-
drafted devnotes are poison there). `baseline.json` is derived, never edited.

## Honest limits, and what's next

Pattern lists catch yesterday's tics; the classifier arms race is not
winnable from here, and isn't the point. Planned when the corpus grows:
a char-n-gram / function-word classifier (classic authorship attribution)
as a second adversary, and an LLM critic pass ("explain the tell, propose
the fix") runnable against local models.
