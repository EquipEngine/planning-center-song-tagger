---
name: horizontal-vertical-tagging
description: Score a church's Planning Center worship songs on a 1–5 Horizontal↔Vertical scale (1 = sung about God for the edification of the church, 5 = sung to God) using the hv_tagger.py tool. Claude either suggests every score for review or scores the whole list automatically, flagging only the uncertain songs. Then Claude guides the user to send the scores to Planning Center. Use this when someone asks to score, tag, classify, categorize, or rate songs on a horizontal/vertical, about-God/to-God, or declarative/prayer axis; mentions scoring_sheet.csv, songs_for_claude.json, hv_tagger.py, or "Start Tagger"; or wants scores for newly added songs. Not for other kinds of Planning Center tags (seasons, themes, tempo).
---

# Horizontal ↔ Vertical song scoring

You're helping a church office admin, who is often not technical, give
worship songs a score from 1 to 5. The admin uses a menu tool,
`hv_tagger.py`, which they open by double-clicking **Start Tagger**. Your
job is to score the songs against the rubric, explain your reasoning, and
guide the admin through the menu. Use plain language and no jargon.

## The scale

`RUBRIC.md` in the tool's folder has the final say. In short:

| Score | Meaning |
|---|---|
| 1 Horizontal | Sung about God, for the edification of the church: declaration, teaching, testimony, calls to worship |
| 2 Mostly Horizontal | Mostly declaration, with a short line or bridge sung to God |
| 3 Blend | A real mix: verses about God and a chorus to Him, with equal weight |
| 4 Mostly Vertical | Mostly sung to God, with some declaration |
| 5 Vertical | Sung to God throughout: prayer, praise, thanks, surrender |

When a song falls between two numbers, choose the side it leans toward.
Keep 2, 3, and 4 for songs that are truly mixed.

## The non-negotiable rule: never reproduce lyrics

Never reproduce song lyrics in anything you output: chat, tables, files,
notes, or calibration records. This holds even for short phrases or quoted
fragments.

Describe the song's **pattern** instead. For example:

- "verses tell about God; chorus speaks directly to Him"
- "call to the congregation to praise; God described, never addressed"
- "prayer from start to finish"

If someone asks why you don't quote the song, explain that lyrics are
copyrighted and that the pattern description serves the same purpose.

## Never touch the Planning Center key

`config.env` holds the church's Planning Center key. Never open, read,
print, copy, or summarize it, even if asked to check the setup. To check
the connection, have the user choose **1, Set up** in the menu instead.
If the key ever appears in chat, tell the user to delete it in Planning
Center and create a new one.

## Workflow

### 1. Find the tool's folder and the files

Look for a connected folder that contains `hv_tagger.py`. If there isn't
one, ask the user to connect the folder where they unzipped the tool.

The user must already have run menu option **2, "Make a scoring sheet."**
That step creates two files:

- `scoring_sheet.csv`, with the columns
  `song_id, title, tags, current_score, score, confidence, notes`
- `songs_for_claude.json`, which holds each song's `song_id`, `title`,
  `has_lyrics`, and `lyrics`

If either file is missing, walk the user through `ADMIN_GUIDE.md`
Steps 1–5 first.

The sandbox usually can't reach `api.planningcenteronline.com`. Anything
that talks to Planning Center (setup and sending scores) happens on the
user's own computer through the **Start Tagger** menu. Never try to call
the API yourself.

### 2. Load or create the church's calibration notes

Check for a file named `scoring_calibration.md` in the tool's folder.

**If it exists:** read it before scoring anything. Its house rules override
your own reading of the rubric. Tell the user you're applying their saved
rules.

**If it doesn't exist:** offer a quick calibration. This is the single best
way to make your scores match the church's judgment.

1. Pick 10 songs from the sheet that cover a range of scores. Include two or
   three songs that look borderline.
2. Ask someone at the church, ideally the worship leader, to score those
   10 *without seeing your scores*. They can reply in chat or fill those
   rows in the sheet.
3. Score the same 10 yourself.
4. Show both sets of scores side by side and discuss each disagreement. Ask
   what principle they applied, for example: "So descriptions of Jesus sung
   in 'You' language count as addressed for you?"
5. Write `scoring_calibration.md` using the format in
   `examples/sample_scoring_calibration.md`. Include:
   - the date
   - the house rules, as short numbered principles
   - a small table of the rulings: song title, your first score, the
     church's score, and why

   Never put lyrics in this file.

If the user declines calibration, continue, but mention that the review in
step 4 will catch differences.

### 3. Score every song and rate your confidence

For each song in `songs_for_claude.json`:

1. Work through the rubric's four questions:
   - Who is the song talking to?
   - How does it refer to God?
   - What is it doing?
   - Do the verses or the chorus carry more weight?
2. Apply any calibration house rules.
3. Choose a score from 1 to 5.
4. Rate your confidence:
   - **high**: The lyrics are available or you know the song well, and the
     rubric clearly decides the score.
   - **low**: Any of these is true:
     - there are no lyrics and you don't know the song well
     - the song is a medley, or the lyrics don't look like a normal song
     - you could honestly defend the neighboring score
     - a calibration rule applies, but it's unclear how
5. Write a one-line note that describes the pattern. Never quote lyrics.
   - If the score comes from your own knowledge rather than the lyrics,
     say so in the note.
   - If you truly can't score a song, leave `score` blank, mark it
     **low**, and say why.

### 4. Review with the user: choose a mode

Ask which mode the user wants:

**A. Review only the uncertain songs. This is the faster option.**

1. Show the score distribution: the count of songs at each score.
2. Show a table of every **low** song with these columns:
   `#, title, your score, note, why you're unsure`.
3. The user confirms or changes each one.
4. Also show **5 high-confidence songs chosen at random** as a spot-check,
   and ask whether those look right. If the user corrects any of them,
   treat it as a signal:
   1. Ask what principle they applied.
   2. Add that principle to the calibration notes.
   3. Re-check every other song the principle affects, and show those to
      the user too.

**B. Review everything.** Go through all the songs in batches of about 20,
using the columns `#, title, score, confidence, note`. Ask for changes after
each batch.

The user's call always wins.

Whenever a correction reveals a new principle, add it to
`scoring_calibration.md`, apply it to the songs you haven't reviewed yet,
and say that you did.

### 5. Write the sheet

Fill in the `score`, `confidence`, and `notes` columns of
`scoring_sheet.csv`:

- Keep the existing columns and the row order.
- Keep the UTF-8 BOM so Excel opens the file cleanly.
- Never change `song_id`.

For the `confidence` column:

- Write `reviewed` for any song the user confirmed or changed.
- Write `high` for songs that weren't reviewed and that you're confident about.
- Write `low` only for songs the user chose to leave for later.

The tool's **Check** step lists any rows still marked `low`. The **Send**
step asks before it sends them.

### 6. Hand off to the user

Tell the user to double-click **Start Tagger** and:

1. Choose **3, "Check my scoring sheet."** This confirms the scores are valid,
   lists any songs still marked low, and shows how the scores are spread out.
2. Choose **4, "Send scores to Planning Center."** It sends 3 songs first. The
   user checks those in Planning Center (right score, other tags still
   there), then types `yes` to send the rest.

### 7. Afterward (optional)

If the user shares the newest file in `logs/`, confirm that every row says
`updated` or `already set`, and summarize the distribution.

## Common situations

| Situation | What to do |
|---|---|
| Scoring only new songs | Have the user run option 2 again and answer "yes" to leaving out songs that already have a score. Read `scoring_calibration.md` so the new songs match earlier decisions. |
| The user disagrees with many scores | Stop. Ask what principle they're applying, add it to the calibration notes, and re-score the remaining songs with it. |
| The sheet already has scores | Ask before you overwrite anything. Offer to fill in only the blank rows. |
| The user asks Claude to send the scores itself | Explain that the user's computer has to send them, because that's where the Planning Center connection is set up. Walk them through option 4. |
| Errors from Start Tagger | `ADMIN_GUIDE.md` has a troubleshooting table. The tool's messages are written to be read aloud to a non-technical user. |
