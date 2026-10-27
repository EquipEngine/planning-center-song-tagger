---
name: horizontal-vertical-tagging
description: Help a church score its Planning Center worship songs on a 1–5 Horizontal↔Vertical scale (1 = sung about God to the church, 5 = sung to God) using the hv_tagger.py tool, then guide the user to send those scores back to Planning Center as tags. Use when someone asks to score, tag, classify, rate, or pre-fill scores for songs on a horizontal/vertical, about-God/to-God, declarative/prayer, or similar axis; mentions scoring_sheet.csv, songs_for_claude.json, hv_tagger.py, or "Start Tagger"; or wants help with new songs that need a score. Not for other kinds of Planning Center tags (seasons, themes, tempo).
---

# Horizontal ↔ Vertical song scoring

This skill helps a church office admin (often not technical) score worship
songs from 1 to 5 and send the scores to Planning Center. The admin runs a
menu tool (`hv_tagger.py`, opened by double-clicking **Start Tagger**).
Claude's job is to suggest scores, explain the reasoning, and guide the
admin through the menu. Keep explanations in plain language, with no jargon.

## The scale

Read `RUBRIC.md` in the tool's folder; it's the authority. In short:

| Score | Meaning |
|---|---|
| 1 Horizontal | Sung about God, to the church: declaration, teaching, testimony, calls to worship |
| 2 Mostly Horizontal | Mostly declaration, with a short line or bridge sung to God |
| 3 Blend | A real mix, such as verses about God and a chorus to Him, with equal weight |
| 4 Mostly Vertical | Mostly sung to God, with some declaration |
| 5 Vertical | Sung to God throughout: prayer, praise, thanks, surrender |

When a song falls between two numbers, pick the side it leans toward. A song
that's nearly all prayer is a 5, not a 4.

## The non-negotiable rule: never reproduce lyrics

You are not allowed to reproduce song lyrics in anything you output:
chat messages, tables, files, or notes. This applies even to short phrases
and quoted fragments.

Describe the song's **pattern** instead:

- Good: "verses tell about God; chorus speaks directly to Him"
- Good: "call to the congregation to praise; God described, never addressed"
- Good: "prayer from start to finish"
- Bad: any words copied from the song

If someone asks why your notes don't quote the song, explain that lyrics are
copyrighted and the pattern description serves the same purpose.

## Workflow

### 1. Find the tool's folder

Look for a connected folder that contains `hv_tagger.py`. If there isn't
one, ask the user to connect the folder where they unzipped the tool.

The sandbox usually can't reach `api.planningcenteronline.com`. The user
runs every step that talks to Planning Center (setup and sending) from the
**Start Tagger** menu on their own computer. Don't try to call the API
yourself.

### 2. Make sure a scoring sheet exists

The user needs to have run menu option **2, "Make a scoring sheet."** That
step creates two files:

- `scoring_sheet.csv`, with columns `song_id, title, tags, current_score, score, notes`
- `songs_for_claude.json`, with each song's `song_id`, `title`, `has_lyrics`, and `lyrics`

If either file is missing, walk the user through the setup steps in
`ADMIN_GUIDE.md` (Steps 1–5) before going further.

### 3. Suggest scores in batches

Read `songs_for_claude.json`. For each song:

1. Apply the rubric's four questions: who is being spoken to, how God is
   referred to, what the song is doing, and whether the verses or chorus
   carry more weight.
2. Choose a score from 1 to 5.
3. Write a one-line note that describes the pattern, following the
   no-lyrics rule.

If `has_lyrics` is false, score from your knowledge of the song. If you know
it, say "scored from knowledge of the song" in the note. If you don't know
it, leave the score blank and tell the user.

Show suggestions as a table of about 20 songs at a time, with columns
`#, title, score, note`. After each batch, ask whether the user wants
changes before you continue. The user's call always wins. Keep a short
record of any changes they make.

### 4. Write the sheet

When every batch is approved, write the scores and notes into the `score`
and `notes` columns of `scoring_sheet.csv`:

- Keep the existing columns and row order.
- Keep the UTF-8 BOM, so Excel still opens the file cleanly.
- Don't change `song_id`.

### 5. Hand off to the user

Tell the user to double-click **Start Tagger** and do two things:

1. Choose **3, "Check my scoring sheet."** It confirms that every score is valid
   and shows how the scores are spread out.
2. Choose **4, "Send scores to Planning Center."** It sends 3 songs first. The
   user checks those in Planning Center to confirm each one has the right
   score and still has its other tags. Then they type `yes` to send the rest.

The tool keeps every other tag on each song, skips songs that already have
the right score, and records everything in `logs/`.

### 6. Afterward (optional)

If the user shares the newest file in `logs/`, confirm that every row says
`updated` or `already set`, and summarize how the scores are spread out.

## Common situations

| Situation | What to do |
|---|---|
| User wants to score only new songs | Have them run option 2 again and answer "yes" to leaving out already-scored songs. |
| User disagrees with many suggestions | Ask what principle they're applying, adjust your interpretation of the rubric to match, and re-score the rest of the batch that way. |
| Sheet already has scores in it | Ask before overwriting. Offer to fill in only the blank rows. |
| User asks Claude to send the scores itself | Explain that the user's computer has to send them, because the connection to Planning Center is set up there. Walk them through option 4 instead. |
| Errors from Start Tagger | `ADMIN_GUIDE.md` has a troubleshooting table. The tool's messages are written to be read aloud to a non-technical user. |
