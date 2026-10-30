# Horizontal ↔ Vertical Song Tagger for Planning Center

Give every song in your Planning Center Services library a score from 1 to 5,
based on how the song speaks about God or to God:

| Score | Meaning |
|---|---|
| **1 – Horizontal** | Sung **about** God, for the edification of the church: declaring truth, teaching, testimony |
| **2 – Mostly Horizontal** | Mostly declaration, with a moment of prayer |
| **3 – Blend** | A real mix of the two |
| **4 – Mostly Vertical** | Mostly prayer or praise, with some declaration |
| **5 – Vertical** | Sung **to** God: prayer, praise, and worship addressed to Him |

The scores are saved as tags in Planning Center. Once they're there, you can
filter songs by score, report on the balance of your song list, and plan
services that mix the two.

## Pick your path

| I am... | Start here |
|---|---|
| **An office admin or volunteer.** I want clear steps and no programming. | **[ADMIN_GUIDE.md](ADMIN_GUIDE.md)** |
| **Someone who wants Claude to do the scoring.** | Claude in Cowork: the [`skill/`](skill/) folder. Regular Claude: **[CLAUDE_PROJECT_SETUP.md](CLAUDE_PROJECT_SETUP.md)**. Both are explained in [ADMIN_GUIDE.md](ADMIN_GUIDE.md) Step 6, Option B. |
| **Technical.** I want the command line and the details. | [TECHNICAL.md](TECHNICAL.md) |

Whichever path you pick, [RUBRIC.md](RUBRIC.md) (or the printable
[docs/rubric-one-pager.pdf](docs/rubric-one-pager.pdf)) explains how to choose
each score.

## How it works

1. **Set up once:** create the score tags in Planning Center and connect the tool with a key.
2. **Make a scoring sheet:** export your songs from Planning Center, and the tool builds a simple spreadsheet from the export.
3. **Score:** type a 1–5 next to each song yourself, or let Claude score them all. Claude flags the songs it's unsure about for you to review.
4. **Send:** the tool sends the scores to Planning Center. It tries 3 songs first so you can check them before it does the rest.

You run every step by double-clicking **Start Tagger** and choosing from a
menu. There's nothing to install except Python, which is free.

**Practice first.** Menu option 5 runs the whole process with nine made-up
songs and a pretend Planning Center. Nothing real changes.

**Share it:** `index.html` is a ready-made landing page. Turn on GitHub
Pages (Settings > Pages > Deploy from branch `main`, root) to get a link you
can send to other churches. See [TECHNICAL.md](TECHNICAL.md#landing-page-github-pages).

## What's in this folder

```
Start Tagger (Mac).command      Double-click on a Mac
Start Tagger (Windows).bat      Double-click on Windows
hv_tagger.py                    The tool itself (the launchers run this)
ADMIN_GUIDE.md                  Step-by-step instructions in plain language
RUBRIC.md                       How to choose a score
TECHNICAL.md                    Commands, file formats, API details
CLAUDE_PROJECT_SETUP.md         Have regular Claude (no Cowork) do the scoring
index.html                      Landing page for GitHub Pages
docs/rubric-one-pager.pdf       Printable rubric for whoever does the scoring
examples/                       Made-up sample songs for practice
skill/                          Optional Claude (Cowork) skill
```

## Safety

- The tool changes only the 1–5 score tag on each song. It keeps every other tag (lists, themes, seasons, and so on).
- Running it again is safe. Songs that already have the right score are skipped.
- Every song it sends is recorded in the `logs/` folder.
- Your Planning Center key, your song exports, and your lyrics stay on your computer. They're excluded from this repository.

## Credit and license

This tool was originally developed by the worship team at Wawasee Bible Church.
It's free to use and adapt under the MIT License (see [LICENSE](LICENSE)).

This project isn't affiliated with or endorsed by Planning Center.
