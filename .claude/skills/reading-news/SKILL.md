---
name: reading-news
description: Generate the weekly Reading News newsletter for the Tally Reading app. Pulls the most-read authors across all schools from the production D1 database, searches the web for genuine recent news and upcoming releases about them, vets every item for appropriateness and grounding, writes public/reading-news.json, and reminds Sam to review and publish. Use when asked to generate or refresh reading news, update the reading newsletter, or run the reading-news skill.
---

# Reading News Generator

Builds `public/reading-news.json` — the feed behind the Stats-page news ticker + newsletter dialog (`src/components/news/`). It turns "which authors are our schools actually reading" into a short, genuine, teacher-friendly newsletter of releases and news.

## Guardrails — read before doing anything

- **Never fabricate.** Every item must come from a real source you found via web search, with a real, working link. If you can't find genuine news for an author, **skip them**. A short honest newsletter beats invented headlines or guessed dates.
- **Do NOT push or deploy.** Write the file, summarise, and stop. Sam reviews and publishes (his push triggers the Cloudflare deploy). Never run `git push` / `npm run go` / `wrangler deploy` from this skill.
- **Aggregate data only.** Step 1 pulls cross-school popularity (book titles, authors, counts). Never put any school name, student, or per-org data into the newsletter — the audience is every school.
- **British English**, warm and understated — match the voice of the existing `public/reading-news.json` seed.

## Step 1 — Pull the top authors/books from production

```bash
node scripts/reading-news-stats.mjs --limit 12
```

Read-only SELECT against prod D1. It prints JSON: `{ generatedAt, totalReads, topAuthors:[{author, reads, avgRating, books:[…]}], topBooks:[…] }`. Capture it.

- **Use `reads` as the popularity signal** — `avgRating` is sparsely populated (often `null`), so don't rank on it.
- If only a few authors come back (early-stage data), that's fine — work with what's there.

## Step 2 — Research each author (web search)

For the top ~6–8 authors, use WebSearch to find **genuine, recent** news and upcoming releases. Good queries:

- `"<author>" new book 2026`, `"<author>" upcoming release`, `"<author>" latest news`
- Prefer, in order: **new/upcoming releases**, **awards/shortlists** (Yoto Carnegie, Waterstones Children's Book Prize, Blue Peter Book Awards), **adaptations** (TV/film/stage), notable author news.
- For each promising item capture: the **claim**, the **source publication**, the **URL**, and the **date**.

Tie items back to what the schools read (use Step 1) so each feels relevant — e.g. "your readers love the Worst Witch books — here's news on the series."

## Step 2b — General reading news (events + author birthdays)

Also gather a short set of dated "diary" items for the newsletter's events section. These are generic (not from Step 1) but bias toward relevance:

- **Upcoming UK children's-book events** — World Book Day (first Thursday of March), the Reading Agency's Summer Reading Challenge, National Poetry Day, National Storytelling Week, Roald Dahl Day, etc. Search to confirm the actual upcoming date.
- **Author birthdays**, especially of the Step 1 top authors (e.g. Michael Morpurgo, 5 October) and household names (Julia Donaldson, Beatrix Potter, Roald Dahl). Use the real birth date; flag a milestone if there is one (a 160th, say).
- Keep dates **accurate** — confirm anything you're unsure of, and use the next future occurrence in `YYYY-MM-DD`. A wrong date in a teacher's diary is worse than no date.

## Step 3 — Vet every item (moderation + grounding)

An item goes in only if ALL of these hold:

1. **Grounded** — supported by a real source you actually found; the URL works and backs the claim. Don't guess at titles or dates.
2. **Appropriate** — suitable next to children's reading in a UK primary context. Even though only teachers see it, skip adult themes, author controversy unrelated to their books, or anything you wouldn't want surfaced here. Handle **sensitive author biography** (e.g. an author who has died) with respect — frame as legacy/celebration of the books, not as a headline shock. When in doubt, leave it out.
3. **Useful** — tells a teacher something they could act on or share (a release to watch for, a read-alike, an award).

Drop anything that fails, and note what you dropped (and why) in your summary.

## Step 4 — Write `public/reading-news.json`

Write exactly this shape (the app consumes it; keep keys/spelling identical):

```json
{
  "generatedAt": "<today YYYY-MM-DD, from Step 1's generatedAt>",
  "issue": "<month + year, e.g. June 2026>",
  "title": "Reading News",
  "intro": "<one warm sentence introducing this issue>",
  "isPreview": false,
  "items": [
    {
      "id": "<unique-kebab-case>",
      "headline": "<concise and specific>",
      "author": "<author name>",
      "book": "<a related title the schools read, or null>",
      "rank": "<author's 1-based position in Step 1 topAuthors>",
      "kind": "release | news | award | spotlight",
      "summary": "<2–3 warm, practical sentences for teachers, grounded in the source>",
      "source": "<publication name>",
      "link": "<real URL, or null>"
    }
  ],
  "events": [
    {
      "id": "<unique-kebab-case>",
      "date": "<YYYY-MM-DD, next occurrence>",
      "name": "<event or author birthday>",
      "kind": "event | birthday",
      "blurb": "<1–2 warm sentences for teachers>",
      "link": "<real URL, or null>"
    }
  ]
}
```

Rules:

- 4–8 items, ordered by `rank` (most-read first). `rank` is the author's 1-based position in Step 1's `topAuthors`; the app shows it as a "1st most-read" badge.
- `events`: 3–6 dated diary items (`kind`: `event` or `birthday`), soonest first; use accurate `YYYY-MM-DD` dates. The app sorts them, shows a date badge, and computes a live countdown — so never store a countdown, just the date.
- `kind`: `release` for new/upcoming books, `award` for prizes/shortlists, `news` for other genuine news, `spotlight` **only** as a fallback evergreen highlight when no dated news exists for an otherwise-loved author.
- `link` must be a real URL or `null` — never a placeholder.
- Validate it parses: `node -e "JSON.parse(require('fs').readFileSync('public/reading-news.json','utf8'))"`.

## Step 5 — Summarise and remind (do NOT push)

1. Print a short summary: each item included (headline + source), plus anything you dropped in vetting and why.
2. Send the reminder:
   ```bash
   cmux notify "Reading News draft ready — review public/reading-news.json and publish" 2>/dev/null || true
   ```
3. Tell Sam to review and publish when happy (and that **you won't** do it for him):
   ```bash
   git add public/reading-news.json && git commit -m "content: refresh reading news" && git push
   ```
   CWB auto-deploys on that push. Stop here.
