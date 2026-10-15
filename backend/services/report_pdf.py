"""Renders a Report (services.report) as a branded A4 PDF with fpdf2.

HarfBuzz text shaping plus Noto fallbacks render Hindi, Kannada and Tamil correctly next to Inter Tight (the app's
UI font). Colours are the app's OKLCH tokens converted to sRGB. Times are shown in IST, since the app serves India."""
import re
from datetime import datetime, timedelta, timezone

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

import config
from services.report import Report

IST = timezone(timedelta(hours=5, minutes=30), "IST")
FONTS = config.ASSETS_DIR / "fonts"
MASCOT = config.ASSETS_DIR / "nola.svg"

INK = (17, 13, 23)
INK_SOFT = (79, 75, 87)
PAPER = (246, 242, 252)
PAPER_2 = (237, 230, 246)
ACCENT = (118, 42, 167)
ACCENT_2 = (183, 64, 177)
CORAL = (248, 144, 124)
CORAL_SOFT = (254, 239, 235)
LEVEL = {"soon": ((230, 140, 44), "See a doctor soon"), "now": ((205, 21, 38), "See a doctor today"),
         "emergency": ((205, 21, 38), "Emergency help"), "crisis": ((118, 42, 167), "Support line shared")}

DISCLAIMER = ("Nola is a wellbeing companion, not a doctor. Nothing in this report is, or authorises, a medical diagnosis, "
              "and Nola does not prescribe medicines or treatments. This report only records what she shared and the general, "
              "non-medical suggestions Nola offered, to help her talk to a qualified doctor. Please rely on a doctor's "
              "examination and advice. In an emergency, call 112.")

# Emoji and symbols have no glyph in the bundled fonts; joiners (ZWJ/ZWNJ) stay because Indic scripts need them.
_UNSUPPORTED = re.compile("[\U00010000-\U0010FFFF☀-➿︎️​]")


def _clean(text: str) -> str:
    return _UNSUPPORTED.sub("", text or "").replace("\r", "").strip()


def _when(ts: float, fmt: str = "%d %b %Y, %I:%M %p") -> str:
    return datetime.fromtimestamp(ts, IST).strftime(fmt).lstrip("0")


class _Doc(FPDF):
    def __init__(self, report: Report):
        super().__init__(format="A4", unit="mm")
        self.report = report
        self.set_margins(16, 16, 16)
        self.set_auto_page_break(True, margin=20)
        self.add_font("Inter", "", FONTS / "InterTight-Regular.ttf")
        self.add_font("Inter", "B", FONTS / "InterTight-SemiBold.ttf")
        self.add_font("InterM", "", FONTS / "InterTight-Medium.ttf")
        for script in ("Devanagari", "Kannada", "Tamil"):
            self.add_font(script, "", FONTS / f"NotoSans{script}-Regular.ttf")
        self.set_fallback_fonts(["Devanagari", "Kannada", "Tamil"], exact_match=False)
        self.set_text_shaping(True)
        self.set_title(f"Nola report - {_clean(report.title)}")
        self.set_author("Nola")
        self.set_creator("Nola")

    # ── page furniture ──
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Inter", "B", 11)
        self.set_text_color(*INK)
        self.cell(0, 6, "Nola", new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.set_fill_color(*ACCENT_2)
        self.ellipse(self.l_margin + self.get_string_width("Nola") + 1.6, self.t_margin + 3.4, 1.2, 1.2, style="F")
        self.set_font("Inter", "", 8.5)
        self.set_text_color(*INK_SOFT)
        self.cell(0, 6, _clean(self.report.title)[:70] + f"  ·  {self.report.name}", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*PAPER_2)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.ln(6)

    def footer(self):
        self.set_y(-13)
        self.set_font("Inter", "", 7.5)
        self.set_text_color(*INK_SOFT)
        self.cell(0, 5, "Nola  —  suggestions only, not a medical diagnosis. Emergency? Call 112.", new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # ── building blocks ──
    @property
    def inner(self) -> float:
        return self.w - self.l_margin - self.r_margin

    def para(self, text: str, size: float = 10.5, color=INK, h: float = 5.4, indent: float = 0):
        self.set_font("Inter", "", size)
        self.set_text_color(*color)
        self.set_x(self.l_margin + indent)
        self.multi_cell(self.inner - indent, h, _clean(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def section(self, title: str, note: str = ""):
        if self.will_page_break(22):
            self.add_page()
        self.ln(5)
        self.set_font("Inter", "B", 8.5)
        self.set_text_color(*ACCENT)
        self.set_char_spacing(0.6)
        self.cell(0, 5, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_char_spacing(0)
        if note:
            self.set_font("Inter", "", 8)
            self.set_text_color(*INK_SOFT)
            self.cell(0, 4.5, note, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1.5)

    def bullets(self, items: list[str], size: float = 10.5):
        for item in items:
            item = _clean(item)
            if not item:
                continue
            if self.will_page_break(6):
                self.add_page()
            y = self.get_y()
            self.set_fill_color(*ACCENT_2)
            self.ellipse(self.l_margin + 1, y + 1.9, 1.7, 1.7, style="F")
            self.para(item, size=size, indent=5.5)
            self.ln(1)

    def boxed(self, text_fn_height: float, fill, draw=None, radius: float = 3.5, pad: float = 4):
        """Draws a rounded box of the given inner height at the cursor, leaving the cursor at the padded text start."""
        x, y = self.l_margin, self.get_y()
        self.set_fill_color(*fill)
        if draw:
            self.set_draw_color(*draw)
            self.set_line_width(0.35)
        self.rect(x, y, self.inner, text_fn_height + 2 * pad, style="DF" if draw else "F", round_corners=True, corner_radius=radius)
        self.set_y(y + pad)

    def measure(self, text: str, width: float, size: float, h: float, family: str = "Inter", style: str = "") -> float:
        self.set_font(family, style, size)
        return self.multi_cell(width, h, _clean(text), dry_run=True, output="HEIGHT")


def _cover(pdf: _Doc, r: Report):
    top = pdf.t_margin
    pdf.set_fill_color(*PAPER)
    pdf.rect(pdf.l_margin, top, pdf.inner, 42, style="F", round_corners=True, corner_radius=5)
    pdf.image(str(MASCOT), x=pdf.l_margin + 4, y=top + 4, w=34)
    pdf.set_xy(pdf.l_margin + 42, top + 8)
    pdf.set_font("Inter", "B", 28)
    pdf.set_text_color(*INK)
    pdf.cell(pdf.get_string_width("Nola") + 1, 12, "Nola")
    pdf.set_fill_color(*ACCENT_2)
    pdf.ellipse(pdf.get_x() + 0.2, top + 16.4, 2.4, 2.4, style="F")
    pdf.set_xy(pdf.l_margin + 42, top + 21)
    pdf.set_font("InterM", "", 11)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 6, "Summary for your doctor visit")
    pdf.set_xy(pdf.l_margin + 42, top + 28)
    pdf.set_font("Inter", "", 8.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 5, "Your wellbeing companion, in your language")

    right = pdf.l_margin + pdf.inner - 4
    for i, (label, value) in enumerate([("Prepared for", r.name), ("Chat", _clean(r.title)[:42]),
                                        ("Chat started", _when(r.started_at)), ("Report made", _when(r.generated_at))]):
        y = top + 7 + i * 7.5
        pdf.set_xy(right - 70, y)
        pdf.set_font("Inter", "", 7)
        pdf.set_text_color(*INK_SOFT)
        pdf.cell(70, 3.2, label.upper(), align="R")
        pdf.set_xy(right - 70, y + 3)
        pdf.set_font("InterM", "", 9)
        pdf.set_text_color(*INK)
        pdf.cell(70, 4, value, align="R")
    pdf.set_y(top + 48)

    # The disclaimer comes before anything else.
    h = pdf.measure(DISCLAIMER, pdf.inner - 12, 9, 4.6)
    pdf.boxed(h + 6, CORAL_SOFT, CORAL)
    y = pdf.get_y()
    pdf.set_x(pdf.l_margin + 6)
    pdf.set_font("Inter", "B", 9.5)
    pdf.set_text_color(*INK)
    pdf.cell(0, 5, "Not a medical diagnosis — suggestions only", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_xy(pdf.l_margin + 6, y + 6)
    pdf.set_font("Inter", "", 9)
    pdf.set_text_color(*INK_SOFT)
    pdf.multi_cell(pdf.inner - 12, 4.6, DISCLAIMER, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)


def _summary(pdf: _Doc, r: Report):
    s = r.summary
    pdf.section("In short", "Everything below is what she shared in the chat, in her own words where quoted.")
    pdf.para(s.summary, size=11.5, h=6)
    if s.summary_her_language:
        pdf.ln(2)
        pdf.para(s.summary_her_language, size=10, color=INK_SOFT, h=5.6)

    if s.main_concerns:
        pdf.section("Main concerns")
        pdf.bullets(s.main_concerns)

    if s.symptoms:
        pdf.section("What she noticed")
        pdf.set_font("Inter", "", 9.5)
        pdf.set_draw_color(*PAPER_2)
        pdf.set_text_color(*INK)
        pdf.set_fill_color(255, 255, 255)
        heads = FontFace(family="Inter", emphasis="BOLD", size_pt=7.5, color=INK_SOFT, fill_color=PAPER)
        with pdf.table(col_widths=(34, 22, 44), line_height=5.2, padding=(1.8, 2), borders_layout="HORIZONTAL_LINES",
                       headings_style=heads, cell_fill_mode="NONE", text_align="LEFT") as table:
            head = table.row()
            for label in ("SYMPTOM", "SINCE", "IN HER WORDS"):
                head.cell(label)
            for sym in s.symptoms:
                row = table.row()
                row.cell(_clean(sym.symptom))
                row.cell(_clean(sym.since) or "—")
                row.cell(_clean(sym.her_words) or "—")

    if s.feelings:
        pdf.section("How she has been feeling")
        pdf.para(s.feelings)
    if s.lifestyle:
        pdf.section("Day-to-day context")
        pdf.bullets(s.lifestyle)
    if s.already_tried:
        pdf.section("What she has already tried", "As she described it. Nola did not recommend these.")
        pdf.bullets(s.already_tried)

    if r.profile or r.cycle:
        pdf.section("Background she shared", "From her one-time sign-up questions and her own period log. Estimates, not measurements.")
        if r.profile:
            pdf.para(r.profile, size=10)
        if r.cycle:
            pdf.ln(1.5)
            pdf.para(f"Cycle log (as of {_when(r.generated_at, '%d %b %Y')}): {r.cycle}", size=10, color=INK_SOFT)

    if r.doctor_flags:
        pdf.section("When Nola suggested seeing a doctor")
        for f in r.doctor_flags:
            color, label = LEVEL.get(f.level, (ACCENT, f.level))
            if pdf.will_page_break(10):
                pdf.add_page()
            y = pdf.get_y()
            pdf.set_font("Inter", "B", 7.5)
            w = pdf.get_string_width(label.upper()) + 6
            pdf.set_fill_color(*color)
            pdf.rect(pdf.l_margin, y, w, 5, style="F", round_corners=True, corner_radius=2.5)
            pdf.set_text_color(255, 255, 255)
            pdf.set_xy(pdf.l_margin, y)
            pdf.cell(w, 5, label.upper(), align="C")
            pdf.set_xy(pdf.l_margin + w + 3, y)
            pdf.set_font("Inter", "", 8.5)
            pdf.set_text_color(*INK_SOFT)
            pdf.cell(0, 5, _when(f.at), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            if f.message:
                pdf.ln(0.8)
                pdf.para(f.message, size=10)
            pdf.ln(2)

    if r.suggestions_given:
        pdf.section("Everyday suggestions Nola shared", "General wellbeing ideas, not medical advice or treatment.")
        pdf.bullets(r.suggestions_given, size=10)

    if s.questions_for_doctor:
        pdf.section("Questions to ask the doctor")
        for q in s.questions_for_doctor:
            if pdf.will_page_break(7):
                pdf.add_page()
            y = pdf.get_y()
            pdf.set_draw_color(*ACCENT)
            pdf.set_line_width(0.35)
            pdf.rect(pdf.l_margin + 0.3, y + 0.9, 3.4, 3.4, style="D", round_corners=True, corner_radius=0.8)
            pdf.para(q, indent=6.5)
            pdf.ln(1.2)


def _transcript(pdf: _Doc, r: Report):
    pdf.add_page()
    pdf.set_font("Inter", "B", 16)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, "Conversation transcript", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Inter", "", 9)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 5, f"{len(r.transcript)} messages · times in IST", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)
    width = pdf.inner - 10
    for line in r.transcript:
        mine = line.role == "user"
        body = _clean(line.text)
        extra = ""
        if line.suggestions:
            extra += "\n" + "\n".join(f"•  {_clean(s)}" for s in line.suggestions)
        if line.question:
            extra += "\n" + _clean(line.question)
        text = body + extra
        h = pdf.measure(text, width, 9.8, 5)
        if pdf.will_page_break(min(h + 16, 60)):
            pdf.add_page()
        pdf.set_font("Inter", "B", 7.5)
        pdf.set_text_color(*(ACCENT if mine else ACCENT_2))
        pdf.set_char_spacing(0.5)
        pdf.cell(20, 4, "HER" if mine else "NOLA")
        pdf.set_char_spacing(0)
        pdf.set_font("Inter", "", 7.5)
        pdf.set_text_color(*INK_SOFT)
        pdf.cell(0, 4, _when(line.at), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1)
        if mine and h + 8 < pdf.h - pdf.t_margin - 30:  # a box only when it fits on one page
            pdf.boxed(h, PAPER_2, radius=3.5, pad=4)
            pdf.set_x(pdf.l_margin + 5)
        else:
            top = pdf.get_y()
            pdf.set_x(pdf.l_margin + 5)
        pdf.set_font("Inter", "", 9.8)
        pdf.set_text_color(*INK)
        pdf.multi_cell(width, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if mine:
            pdf.ln(4)
        else:
            pdf.set_draw_color(*ACCENT_2)
            pdf.set_line_width(0.6)
            if pdf.get_y() > top:
                pdf.line(pdf.l_margin + 1, top + 0.5, pdf.l_margin + 1, pdf.get_y() - 0.5)
        pdf.ln(4)

    pdf.ln(4)
    if pdf.will_page_break(34):
        pdf.add_page()
    h = pdf.measure(DISCLAIMER, pdf.inner - 12, 9, 4.6)
    pdf.boxed(h, PAPER, radius=4, pad=6)
    pdf.set_x(pdf.l_margin + 6)
    pdf.set_font("Inter", "", 9)
    pdf.set_text_color(*INK_SOFT)
    pdf.multi_cell(pdf.inner - 12, 4.6, DISCLAIMER, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def render(report: Report) -> bytes:
    pdf = _Doc(report)
    pdf.add_page()
    _cover(pdf, report)
    _summary(pdf, report)
    _transcript(pdf, report)
    return bytes(pdf.output())
