# Admin Guide: Scoring Your Songs in Planning Center

This guide walks you through every step. You don't need any technical
background. If you can download a file, copy and paste, and fill in a
spreadsheet, you can do this.

**How long it takes**

- One-time setup: about 30 minutes
- Scoring: about 1 to 2 hours for 150–200 songs. You can split it across several sittings.
- Sending the scores to Planning Center: about 10 minutes

**What you need**

- A computer (Mac or Windows)
- A Planning Center login that can **edit songs** in Services. If you're not
  sure you have this, ask whoever manages Planning Center at your church.
- Excel, Numbers, or Google Sheets

---

## Part 1: One-time setup

### Step 1: Download the tool

1. Go to the project's page on GitHub.
2. Click the green **Code** button, then **Download ZIP**.
3. Open your Downloads folder and double-click the ZIP file to unzip it.
4. Move the unzipped folder somewhere easy to find, such as your **Documents** folder.

Keep everything in this folder together. The tool saves your files here.

### Step 2: Make sure Python is installed

Python is a free program the tool needs in order to run.

**On a Mac:**

1. Open the folder and double-click **Start Tagger (Mac).command**.
2. If you see *"cannot be opened because it is from an unidentified developer"*:
   1. Click **OK**.
   2. Right-click (or Control-click) the file and choose **Open**.
   3. Click **Open** again. You only have to do this once.
3. If a box asks to install **"command line developer tools,"** click **Install**.
   When it finishes, double-click Start Tagger again.
4. If the window says Python is still missing, install it from
   [python.org/downloads](https://www.python.org/downloads/) and try again.

**On Windows:**

1. Open the folder and double-click **Start Tagger (Windows).bat**.
2. If you see a blue *"Windows protected your PC"* box, click **More info**, then **Run anyway**.
3. If the window says Python isn't installed:
   1. Go to [python.org/downloads](https://www.python.org/downloads/) and download it.
   2. When the installer opens, **check the box "Add python.exe to PATH"** at the bottom. This is important.
   3. Click **Install Now**.
   4. Double-click Start Tagger again.

When everything is working, a window opens with a menu of numbered choices.

> **Tip:** Try menu option **5, "Practice with sample songs,"** now. It walks
> through the whole process using made-up songs, and nothing real changes.
> It's the best way to see what's ahead.

### Step 3: Create the score tags in Planning Center

The scores are saved as tags in a new tag group. You create this group once,
by hand, in Planning Center.

1. Sign in to Planning Center and open **Services**.
2. Go to **Songs**, then open the song **Tags** settings. This is usually in the
   settings (gear) area of the Songs page.
3. Create a new tag group with this exact name:
   **Horizontal Vertical Scale**
4. Turn on **Required** if you want Planning Center to require a score on every
   song. This is optional. You can leave it off until your scoring is finished.
5. Add these five tags to the group, typed exactly like this:
   - `1 - Horizontal`
   - `2 - Mostly Horizontal`
   - `3 - Blend`
   - `4 - Mostly Vertical`
   - `5 - Vertical`

   Each tag name has to **start with its number**. You can change the words
   after the number if you like.

### Step 4: Connect the tool to Planning Center

The tool needs a key, called a **Personal Access Token**, so it can update
your songs. The key is two codes: an **Application ID** and a **Secret**.

1. Double-click **Start Tagger** and choose **1, "Set up."**
2. The window shows a web address. Open it in your browser:
   `https://api.planningcenteronline.com/oauth/applications`
3. Sign in, find **Personal Access Tokens**, and create a new one.
   Name it something like "Song tagging."
4. Copy the **Application ID**, paste it into the tagger window, and press Enter.
   - Mac: press Command-V to paste.
   - Windows: right-click inside the window to paste.
5. Copy the **Secret** and paste it the same way. **Nothing will appear on screen
   as you paste.** That's normal and keeps the Secret private. Press Enter.
6. The tool tests the connection and finds your score tags.
   When it says **"Setup is complete,"** you're done with setup for good.

> **About the key:** treat it like a password. It's saved only in a file named
> `config.env` inside the tool's folder. Don't email that file to anyone.
> When your project is finished, you can delete the key on the same Planning
> Center page where you created it.

---

## Part 2: Scoring your songs

### Step 5: Export your songs and make a scoring sheet

1. In Planning Center **Services**, go to **Songs**.
2. Use the export option and choose **CSV**. Save the file to your
   **Downloads** folder.
3. Double-click **Start Tagger** and choose **2, "Make a scoring sheet."**
4. The tool looks for your export in Downloads and asks *"Use this file?"*.
   Type `yes`.
   - If it can't find the file, drag the file from Finder or File Explorer
     into the window and press Enter.
5. Choose **which songs** to score. The tool lists your song tags with numbers
   next to them:
   - Type `0` for all songs.
   - Or type the numbers of the lists you want, such as `1,2` for "List: A"
     and "List: B."
6. If some songs already have a score, the tool asks whether to leave them
   out. Type `yes` if you only want to score new songs.

The tool creates a file named **scoring_sheet.csv** in its folder.

### Step 6: Fill in the scores

**Option A: Score the songs yourself**

1. Print **docs/rubric-one-pager.pdf** and keep it next to you.
2. Open **scoring_sheet.csv** in Excel, Numbers, or Google Sheets.
3. For each song, type **1, 2, 3, 4, or 5** in the **score** column.
4. The **notes** column is optional. A few words about why you chose a score
   helps if someone else reviews your work.
5. Don't change the `song_id` column, and don't rename or delete any columns.
6. **Save as CSV:**

   | Program | How to save |
   |---|---|
   | Excel | **File > Save As**, then choose **CSV UTF-8**. If Excel asks about keeping the format, choose to keep CSV. |
   | Numbers | **File > Export To > CSV**. Save it into the tool's folder as `scoring_sheet.csv`. |
   | Google Sheets | **File > Import** the CSV. When you're done, **File > Download > Comma-separated values**. Move the downloaded file into the tool's folder or leave it in Downloads. The tool looks in both places. |

**Some songs have no lyrics in Planning Center.** These are often older hymns.
Score them from what you know of the song.

**Option B: Let Claude suggest the scores**

If your church uses Claude in Cowork mode, Claude can pre-fill the scores for
you to review.

1. In Cowork, install the skill in the **skill** folder (`horizontal-vertical-tagging.skill`).
2. Give Claude access to this tool's folder.
3. Ask: *"Suggest Horizontal–Vertical scores for my scoring sheet."*
4. Claude reads the song list and the lyrics file (`songs_for_claude.json`).
   It shows you its suggestions about 20 songs at a time.
5. Agree with or change the scores as you go. Claude writes your final
   answers into scoring_sheet.csv.

The lyrics file is for this purpose only. It contains copyrighted lyrics, so
keep it private and don't share it.

### Step 7: Check your sheet

1. Double-click **Start Tagger** and choose **3, "Check my scoring sheet."**
2. The tool lists any songs that are missing a score or have a typo, such as
   "6" or "4.5".
3. Fix those in your spreadsheet, save as CSV again, and run the check again.

When the tool says **"Everything looks good,"** you're ready to send.

---

## Part 3: Sending the scores to Planning Center

### Step 8: Send a test batch, then the rest

1. Double-click **Start Tagger** and choose **4, "Send scores to Planning Center."**
2. The tool sends **just 3 songs first** and shows their names.
3. Open Planning Center in your browser, go to **Services > Songs**, and look
   at those 3 songs. Check two things:
   - Each song shows the right score tag.
   - Each song **still has its other tags**, such as its list or theme tags.
4. Back in the tagger window, type `yes` to send the rest.
   The tool shows progress, one line per song.

If anything looked wrong in step 3, type `no`. Only those 3 songs were
changed, and you can fix them by hand in Planning Center.

### Step 9: You're done

Every song the tool sent is recorded in a file in the **logs** folder.

---

## Later: when you add new songs

1. Export your songs again (Step 5).
2. When the tool asks whether to leave out songs that already have a score,
   type `yes`. The sheet will only include new songs.
3. Score them (Step 6), check (Step 7), and send (Step 8).

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "Planning Center did not accept your key" | Choose **1, Set up**, type `yes` to enter a new key, and paste both codes again. Make sure you copied the whole code. |
| "doesn't have permission" | Your Planning Center login can't edit songs. Ask your Planning Center administrator for access, or have someone with access create the key. |
| "couldn't find a tag group named ..." | Check that the group is spelled **Horizontal Vertical Scale** in Planning Center (Step 3), then choose **1, Set up** again. |
| "needs 5 tags whose names start with the numbers 1 through 5" | One of the tags is missing or doesn't start with its number. Fix the tag names in Planning Center. |
| "doesn't look like a Planning Center Songs export" | You picked a different file. Export the **Songs** list again (Step 5). |
| "That's a Numbers file" | In Numbers, use **File > Export To > CSV**, and use that file. |
| "couldn't reach Planning Center" | Check your internet connection and try again. |
| A song says "not found" | The song was deleted or merged in Planning Center. It's safe to ignore. |
| The window closes right away (Windows) | Python probably wasn't added to PATH. Reinstall Python and check **"Add python.exe to PATH"** (Step 2). |

**Is it safe to run again?** Yes. Running it again never creates duplicate
tags. Songs that already have the right score are skipped.

**Can I undo a score?** Yes. Change the score in your sheet and send again,
or change the tag on the song by hand in Planning Center.
