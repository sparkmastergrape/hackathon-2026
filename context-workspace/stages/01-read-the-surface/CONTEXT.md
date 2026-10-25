# Stage 01 — read the surface

One job: capture what the sponsor actually published, word for word.

## Inputs

| File | Layer | Which sections matter |
|---|---|---|
| `../../_config/sponsor-targets.md` | 3 | The target page URL and what that track rewards |
| the live page or served config | 3 | Only the section the defect is in |

## Process

1. Fetch the page, the docs section, or the served config. Fetch it; do not recall it.
2. Copy the relevant sentence **verbatim** into `output/quotes.md`, with its URL and
   the section heading it sits under.
3. Write down what the quote says and nothing more. If you find yourself writing
   "so", "which means", or "therefore", stop — that belongs in stage 04 and only
   after stage 02 has a receipt.
4. Note the date. Pages change, and a filing that cites a changed page is refused.
5. If the quote is a bullet under a heading like "Example directions", say so. A
   bullet's authority is not a specification's.

## Outputs

| File | Format | Location |
|---|---|---|
| Verbatim quotes with URL, heading, date | md | `output/quotes.md` |
| What is claimed vs what is merely adjacent | md | `output/reading.md` |

## Audits (run BEFORE writing output)

- [ ] Every quote is copy-pasted, not retyped from memory.
- [ ] Every quote carries its URL and its heading.
- [ ] `reading.md` contains no inference. Inferences wait for a receipt.
- [ ] If the page contradicts itself, both halves are quoted, not just the useful one.
