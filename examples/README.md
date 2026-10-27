# Examples

Every song in this folder is **made up**. The titles and lyrics were written
for these examples and don't belong to any real song, so you can practice,
share, and publish them freely.

| File | What it is |
|---|---|
| `sample_songs_export.csv` | Nine fictional songs in the same layout as a Planning Center Songs export. It includes a "List" tag group, a song with no chord chart, a seasonal song, and one song that already has a score. |
| `sample_scoring_calibration.md` | An example of the "house rules" file Claude writes after a calibration session. |
| `sample_scoring_sheet.csv` | The scoring sheet for those songs, already filled in, covering one song at every score from 1 to 5. The notes show the pattern-style explanations the rubric asks for. |

## Try it

Double-click **Start Tagger** and choose **5, "Practice with sample songs."**
To run the practice from a terminal instead:

```bash
python3 hv_tagger.py demo
```

The practice run:

1. Builds a scoring sheet from `sample_songs_export.csv`. It leaves out the song that already has a score.
2. Shows the filled-in `sample_scoring_sheet.csv`.
3. Checks the sheet and shows how the scores are spread out.
4. Sends the scores to a **pretend** Planning Center on your computer. It sends 3 songs first, then the rest.
5. Shows one song's tags before and after, so you can see that its other tags were kept.
6. Sends everything a second time to show that songs already correct are skipped.

Everything the practice run creates goes into `examples/practice_output/`.
You can delete that folder at any time.

## Why these scores?

| Song | Score | Why |
|---|---|---|
| Rise Up, You Saints | 1 | It calls the congregation to praise and talks *about* God throughout. |
| Cornerstone Creed | 1 | It's a statement of belief, like a creed. |
| Lantern in the Dark | 2 | It's declarative, except for a short bridge sung to God. |
| From the Valley to the Throne | 3 | The verses tell about God and the chorus speaks to Him. |
| Faithful Through the Years | 4 | One verse is about God; the chorus speaks to Him the whole way through. |
| Hear Us, Lord | 5 | It's a prayer from beginning to end. |
| Old Hymn With No Chart | 1 | It has no lyrics in Planning Center, so it was scored from memory of the hymn. |
| Christmas Example Carol | 1 | It tells the nativity story in third person. |
| You Are Near | (already 5) | It already had a score, so the practice run leaves it out. |
