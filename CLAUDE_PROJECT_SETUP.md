# Scoring with regular Claude (no Cowork needed)

Use this route if your church uses Claude on the web or in the desktop app
but doesn't use Cowork. You'll set up a **Claude Project** once. After that,
each scoring session goes like this:

1. Upload two files.
2. Review the songs Claude isn't sure about.
3. Download the finished sheet.

Then you check and send the scores with **Start Tagger**, just like in the
Admin Guide.

---

## One-time setup (about 5 minutes)

1. Go to [claude.ai](https://claude.ai) and sign in.
2. Click **Projects** in the left sidebar, then **Create project**.
3. Name it **Song Scoring**.
4. Open the project's **instructions** setting (it may be labeled "Set project
   instructions" or "Instructions"). Copy **everything in the gray box below**
   and paste it in. Save.
5. In the project's **knowledge/files** area, upload **RUBRIC.md** from the
   tool's folder.

Do this once. You'll reuse the project every time you score songs.

### Project instructions (copy all of this)

```
You help our church score worship songs on a 1–5 Horizontal–Vertical scale
for Planning Center. The rubric is in the project file RUBRIC.md; follow it.

SCALE
1 Horizontal: sung about God, for the edification of the church
  (declaration, teaching, testimony, calls to worship)
2 Mostly Horizontal: mostly declaration, with a short line or bridge sung
  to God
3 Blend: a real mix, e.g. verses about God and a chorus to Him, equal weight
4 Mostly Vertical: mostly sung to God, with some declaration
5 Vertical: sung to God throughout (prayer, praise, thanks, surrender)
When a song falls between two numbers, choose the side it leans toward.

NEVER REPRODUCE LYRICS
Never copy song lyrics into any reply, table, note, or file, not even short
phrases. Describe the pattern instead, e.g. "verses tell about God; chorus
speaks to Him".

OUR HOUSE RULES
(Leave this section empty at first. After a calibration session, paste the
house rules Claude writes for you here.)

WHEN I UPLOAD scoring_sheet.csv AND songs_for_claude.json
1. If the HOUSE RULES section above is empty, offer a quick calibration
   first. Pick 10 varied songs, including some borderline ones. I score
   them without seeing your scores, then you score them, and we compare.
   For each disagreement, work out the principle behind my choice. At the
   end, write out the house rules as short numbered principles for me to
   paste into these instructions.
2. Score every song. For each one, give a score of 1–5, a confidence
   rating (high or low), and a one-line note describing the pattern, with
   no lyrics.
   Mark confidence LOW when any of these is true:
   - there are no lyrics and you don't know the song well
   - the song is a medley or looks unusual
   - you could honestly defend the neighboring score
   - it's unclear how a house rule applies
   If the score comes from your own knowledge rather than the lyrics, say
   so in the note.
3. Show me how many songs landed at each score. Then show a table of only
   the LOW-confidence songs, plus 5 random high-confidence songs as a
   spot-check. Use these columns: #, title, score, note, why unsure.
4. Let me confirm or change scores. If I correct a song, ask what
   principle I used, apply it to any other songs it affects, and show me
   those too.
5. When I'm done, create the completed scoring_sheet.csv as a
   downloadable file:
   - keep every original column and the row order exactly
   - never change song_id
   - fill in score, confidence, and notes
   - in confidence, write "reviewed" for songs I confirmed or changed, and
     "high" for the rest
   If you can't create files, list the scores one number per line, in the
   same order as the sheet, so I can paste them into the score column.

Keep your language simple. I'm not technical.
```

---

## Each time you score songs

1. Run **Start Tagger**, choose **2, "Make a scoring sheet,"** and follow the
   steps. This creates two files in the tool's folder:
   - **scoring_sheet.csv**
   - **songs_for_claude.json**
2. Open your **Song Scoring** project in Claude and start a new chat.
3. Attach both files and type:
   *"Here's my scoring sheet and lyrics. Please score these songs."*
4. **The first time only:** say **yes** to the calibration.
   1. Score the 10 songs Claude lists, using the rubric. It takes about
      10 minutes.
   2. At the end, Claude gives you a short list of **house rules**.
   3. Copy them into the **OUR HOUSE RULES** section of the project
      instructions and save.

   After that, every future session follows your church's rules
   automatically.
5. Review the songs Claude flags as unsure. Agree with each score or change
   it. Claude explains its reasoning for each one.
6. When you're finished, ask Claude for the completed sheet.
   1. Download it.
   2. Rename it **scoring_sheet.csv**.
   3. Move it into the tool's folder, replacing the old one. You can also
      leave it in Downloads, because Start Tagger looks there too.
7. Run **Start Tagger** to check and send the scores:
   1. Choose **3, "Check."** It should say everything looks good.
   2. Choose **4, "Send scores to Planning Center."**

**If Claude gave you a list of numbers instead of a file:**

1. Open scoring_sheet.csv in Excel, Numbers, or Google Sheets.
2. Click the first empty cell in the **score** column.
3. Paste the numbers.
4. Save as CSV.

---

## Good to know

- **Privacy.** `songs_for_claude.json` contains the lyrics from your
  Planning Center account. Upload it only to your own Claude account, and
  don't share it anywhere else. Claude reads the lyrics to choose scores
  but won't repeat them back to you.
- **Large libraries.** If you have more than about 200 songs, make a few
  smaller scoring sheets by choosing one song list at a time in Start Tagger
  (for example, "List: A" first, then "List: B").
- **Claude can be wrong.** That's why it flags the songs it's unsure about
  and shows you a random spot-check. The house rules make each session more
  accurate than the last.
- **Prefer to score by hand?** You can always type the scores into the sheet
  yourself. See Option A in the [Admin Guide](ADMIN_GUIDE.md).
