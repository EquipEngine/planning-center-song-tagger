#!/usr/bin/env python3
"""Rebuild docs/rubric-one-pager.pdf.  Requires: pip install reportlab"""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).resolve().parent / "rubric-one-pager.pdf"
ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=18,
                    leading=22, alignment=TA_CENTER, spaceAfter=0)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontName="Helvetica-Oblique", fontSize=10,
                     leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#555"),
                     spaceAfter=10)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5,
                    leading=13, spaceBefore=11, spaceAfter=4)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontName="Helvetica", fontSize=9, leading=11.5)
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=8.6, leading=11, textColor=colors.HexColor("#333"))
QH = ParagraphStyle("QH", parent=BODY, fontName="Helvetica-Bold", fontSize=9.5, leading=12, spaceAfter=2)
HDR = ParagraphStyle("HDR", parent=BODY, fontName="Helvetica-Bold", textColor=colors.white)
NUM = ParagraphStyle("NUM", parent=BODY, fontName="Helvetica-Bold", fontSize=14, leading=16,
                     alignment=TA_CENTER, textColor=colors.white)
FOOT = ParagraphStyle("FOOT", parent=BODY, fontName="Helvetica-Oblique", fontSize=7.5,
                      alignment=TA_CENTER, textColor=colors.HexColor("#999"), spaceBefore=6)
COLORS = ["#c0504d", "#e8a37c", "#bdb59e", "#7ba6c6", "#3d6b88"]

rows = [
    ("1", "Horizontal", "Sung <b>about</b> God, to the gathered church. Declares truth, teaches, or tells a "
     "testimony. Describes who God is and what He has done, and never speaks to Him for long."),
    ("2", "Mostly Horizontal", "Mostly declaration. A bridge, a tag, or a line or two speaks directly "
     "to God, but most of the song is about Him."),
    ("3", "Blend", "A real mix. For example, the verses tell about God and the chorus speaks to Him, "
     "and both carry equal weight."),
    ("4", "Mostly Vertical", "Mostly sung to God, with some declaration. The verses often set up a "
     "chorus that's sung directly to Him."),
    ("5", "Vertical", "Sung <b>to</b> God from start to finish: prayer, praise, thanks, confession, "
     "or surrender. Says \"You\" to God throughout."),
]

story = [Paragraph("Horizontal ↔ Vertical Scoring Rubric", H1),
         Paragraph("Score each song by how it speaks: 1 (about God) to 5 (to God)", SUB)]
data = [[Paragraph("<para alignment='center'>Score</para>", HDR), Paragraph("Name", HDR),
         Paragraph("What it means", HDR)]]
for n, name, desc in rows:
    data.append([Paragraph(n, NUM), Paragraph(f"<b>{name}</b>", BODY), Paragraph(desc, BODY)])
t = Table(data, colWidths=[0.6 * inch, 1.35 * inch, 5.35 * inch])
style = [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333")),
         ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
         ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#ddd")),
         ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
style += [("BACKGROUND", (0, i), (0, i), colors.HexColor(c)) for i, c in enumerate(COLORS, 1)]
t.setStyle(TableStyle(style))
story.append(t)

story.append(Paragraph("Four questions to ask", H2))
story.append(Paragraph("Ask these about each part of the song, then go with the overall balance.", SMALL))
story.append(Spacer(1, 3))
q = [
    [Paragraph("1. Who is the song talking to?", QH), Paragraph("3. What is the song doing?", QH)],
    [Paragraph("• God → toward 5<br/>• The congregation (<i>come, sing, let us</i>) → toward 1<br/>"
               "• The singer's own soul → toward 1<br/>• Creation, angels, nations → toward 1", SMALL),
     Paragraph("• Asking God (<i>lead, come, fill, help</i>) → toward 5<br/>"
               "• Telling God who He is (<i>You are holy</i>) → toward 5<br/>"
               "• Telling people who God is (<i>He is holy</i>) → toward 1<br/>"
               "• Calling people to worship (<i>praise Him</i>) → toward 1<br/>"
               "• Testimony (<i>I was lost</i>) → toward 1, unless told to God", SMALL)],
    [Paragraph("2. How does the song refer to God?", QH),
     Paragraph("4. Verses and chorus point different ways?", QH)],
    [Paragraph("• <i>You, Your, Thee, Thou</i> → toward 5<br/>"
               "• <i>He, His, the Lord, God, Jesus</i> → toward 1", SMALL),
     Paragraph("The chorus usually matters more, because it's what the congregation repeats. "
               "If both carry equal weight, score a 3.", SMALL)],
]
qt = Table(q, colWidths=[3.65 * inch, 3.65 * inch])
qt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 1), (-1, 1), 8)]))
story.append(qt)

left = ("• <b>Hymns that speak to people</b> (<i>ye saints, my soul</i>) are horizontal, even with \"you.\"<br/>"
        "• <b>Gospel-story songs</b> (birth, cross, resurrection, in \"He\" language) are horizontal.<br/>"
        "• <b>Prayer songs with a testimony verse</b> usually land at 4.<br/>"
        "• <b>Call-and-response</b> about God is horizontal.<br/>"
        "• <b>A declarative song with one bridge sung to God</b> is a 2.")
right = ("Pick the number on the side the song <b>leans toward</b>. A song that's almost all prayer "
         "with one line of declaration is a <b>5</b>, not a 4.<br/><br/>"
         "Save 2, 3, and 4 for songs that really mix both.")
bt = Table([[Paragraph("Situations that come up often", H2), Paragraph("Stuck between two numbers?", H2)],
            [Paragraph(left, SMALL), Paragraph(right, SMALL)]], colWidths=[4.25 * inch, 3.05 * inch])
bt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
story.append(bt)

story.append(Paragraph("Notes column (optional)", H2))
story.append(Paragraph(
    "A few words about <i>why</i> you chose a score helps whoever reviews your work. For example: "
    "\"verses tell about God; chorus speaks to Him,\" \"call to the congregation to praise,\" "
    "\"prayer throughout,\" or \"retells the Christmas story.\" <b>Don't copy lyrics into the "
    "notes.</b> Lyrics are copyrighted, and the note should make sense without them.", SMALL))
story.append(Paragraph("Horizontal-Vertical Song Tagger for Planning Center · see ADMIN_GUIDE.md for "
                       "step-by-step instructions", FOOT))

SimpleDocTemplate(str(OUT), pagesize=LETTER, leftMargin=0.55 * inch, rightMargin=0.55 * inch,
                  topMargin=0.45 * inch, bottomMargin=0.45 * inch,
                  title="Horizontal-Vertical Scoring Rubric", author="").build(story)
print(f"Wrote {OUT}")
