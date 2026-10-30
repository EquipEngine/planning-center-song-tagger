# Technical Reference

Everything an office admin needs is in [ADMIN_GUIDE.md](ADMIN_GUIDE.md).
This page is for people who want to run the steps from a terminal, automate
them, or change the code.

## Requirements

- Python 3.8 or newer
- Standard library only, so there are no dependencies to install

## Commands

Running `python3 hv_tagger.py` with no arguments opens the menu. Each step is
also available as a subcommand:

```bash
python3 hv_tagger.py setup                       # save the PAT to config.env, test it, find the scale group
python3 hv_tagger.py discover                    # print every song tag group and tag, with IDs

python3 hv_tagger.py prepare \
    --export "Planning Center Services - Songs Export 2026-01-01.csv" \
    --scope "List: A,List: B" \
    --skip-scored                                # or --include-scored

python3 hv_tagger.py check --sheet scoring_sheet.csv
python3 hv_tagger.py apply --sheet scoring_sheet.csv          # 3-song test first, then asks
python3 hv_tagger.py apply --sheet scoring_sheet.csv --all --yes

python3 hv_tagger.py demo --no-pause             # full practice run against an in-memory fake PC
```

`--scope` matches the `Song Tag N` values in the export exactly
(case-insensitive). Pass `all`, or leave it out, to score every song.

## Files

| File | Created by | Notes |
|---|---|---|
| `config.env` | `setup` | `PC_APP_ID`, `PC_SECRET`, `SCALE_GROUP`. Git-ignored. Set to mode 600. |
| `scoring_sheet.csv` | `prepare` | Columns: `song_id, title, tags, current_score, score, confidence, notes`. If `confidence` is `low` (or `?`, `unsure`, or `check`), `check` flags the row and `apply` asks before sending it. Any other value, or a blank, counts as fine. UTF-8 with BOM so Excel opens it cleanly. Before overwriting, the previous sheet is backed up to `scoring_sheet_backup_<timestamp>.csv`. |
| `songs_for_claude.json` | `prepare` | `{song_id, title, has_lyrics, lyrics}`. Lyrics come from the first arrangement whose chord chart has text left after section headers and chord lines are stripped. **Contains copyrighted lyrics. Git-ignored.** |
| `scoring_calibration.md` | Claude (skill or Project) | The church's house rules for applying the rubric, written after calibration. Plain text, no lyrics. Git-ignored because it's church-specific. See `examples/sample_scoring_calibration.md`. |
| `logs/sent_<timestamp>.csv` | `apply` | One row per song: `time, song_id, title, score, result, detail`. `result` is `updated`, `already set`, `not found`, or `stopped`. |

`check` and `apply` accept `.csv` (comma-, semicolon-, or tab-separated;
UTF-8, cp1252, or Latin-1) or `.xlsx`. The `.xlsx` reader is built in and
reads the first sheet. Scores may be written as `5`, `5.0`, or `5 - Vertical`.

## How the scale group is resolved

`SCALE_GROUP` defaults to `Horizontal Vertical Scale`. Within that group, each
tag is matched to a score by the **leading digit** of its name, so
`1 - Horizontal` and `1 Pure Declaration` both map to score 1. The tool
refuses to send anything unless all five digits are present.

## Planning Center API details

Base URL: `https://api.planningcenteronline.com/services/v2`. Authentication
is HTTP Basic with the Personal Access Token's Client ID and Secret.

| Purpose | Call |
|---|---|
| List tag groups | `GET /tag_groups` |
| Tags in a group | `GET /tag_groups/{id}/tags` |
| A song's current tags | `GET /songs/{id}/tags` |
| Set a song's tags | `POST /songs/{id}/assign_tags` with a `TagAssignment` body |

**`assign_tags` replaces the song's entire tag list.** For each song, `apply`:

1. Reads the song's current tags.
2. Removes any tag from the scale group.
3. Adds the new score tag.
4. Posts the merged list.

Every non-scale tag is preserved. If the song already has exactly the right
score tag, no write happens, which makes re-runs idempotent.

Tag groups and tags **cannot be created through the API**, so the admin
creates them by hand in the Planning Center UI.

Rate limiting: HTTP 429 responses are retried using `Retry-After`, 5xx
responses are retried with backoff, and there's a 150 ms pause after each
write. Roughly 180 songs take 5 minutes.

A 401 or 403 stops the run with a plain-language message. A 404 on a single
song is logged as `not found`, and the run continues.

## Practice mode

`demo` uses `examples/sample_songs_export.csv` (nine fictional songs with
invented lyrics) and a `PretendPlanningCenter` class that keeps tags in
memory. It runs the real `prepare`, `check`, and `apply` code paths, writes
its output to `examples/practice_output/` (git-ignored), and never touches
the network.

## Claude skill

`skill/horizontal-vertical-tagging/SKILL.md` teaches Claude in Cowork the
following steps:

1. Load or create `scoring_calibration.md`. Creating it means a 10-song
   blind comparison with someone at the church.
2. Score every song in `songs_for_claude.json` with a high or low
   confidence rating.
3. Review either the low-confidence songs plus a random spot-check of 5,
   or every song in batches.
4. Write `score`, `confidence`, and `notes` into `scoring_sheet.csv`.

`CLAUDE_PROJECT_SETUP.md` gives the same workflow as copy-paste Project
instructions for churches that use regular Claude without Cowork. Claude doesn't call the Planning Center API
itself. The admin runs `check` and `apply`. The skill is told never to
reproduce lyrics in its output. `skill/horizontal-vertical-tagging.skill` is
the same folder, zipped for one-click install.

## Rebuilding the printable rubric

```bash
pip install reportlab
python3 docs/build_rubric_pdf.py
```

## Landing page (GitHub Pages)

`index.html` at the repo root is a self-contained landing page for sharing
the project. It has no external fonts, scripts, or images, and `.nojekyll`
tells GitHub Pages to serve it as-is.

To publish it:

1. In the GitHub repo, go to **Settings > Pages**.
2. Under "Build and deployment," choose **Deploy from a branch**.
3. Pick `main` and `/ (root)`, then save.

The page appears at `https://<owner>.github.io/<repo>/`.

On GitHub Pages, the page works out the repo from its own address. It uses
that to build the Download ZIP, guide, and Issues links. The PDF and
`.skill` links are relative, so they're served by Pages directly. If you
host the page anywhere else, set `REPO = "owner/repo"` in the script at
the bottom of `index.html`.

## Security notes

- `config.env` holds a live credential in plain text. Keep it out of shared
  drives and email. Revoke the token at
  `https://api.planningcenteronline.com/personal_access_tokens` when you're done.
- The PAT has the same permissions as the person who created it. Create it
  from an account that can edit songs, and preferably not an org-wide
  superuser.
- `.gitignore` excludes the credential, every CSV and XLSX outside
  `examples/`, the lyrics JSON, and the logs.
