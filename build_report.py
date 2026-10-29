"""Build REPORT.docx from REPORT.md.

The markdown file stays the single source of truth; this script only renders it.
Requires python-docx:  pip install -r requirements-dev.txt

    python scripts/build_report.py

Supported syntax, on top of normal markdown:
    ```cover ... ```   a cover page block (eyebrow/title/subtitle/image/caption/meta)
    ![caption](path)   a figure, scaled to the page width, with a caption
    ---                a thin horizontal rule
"""

from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.image.image import Image as DocxImage
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "REPORT.md"
TARGET = ROOT / "REPORT.docx"

NAVY = RGBColor(0x1F, 0x38, 0x64)
ACCENT = RGBColor(0x2E, 0x5C, 0x8A)
MUTED = RGBColor(0x5A, 0x5A, 0x5A)
SOFT = RGBColor(0x3F, 0x4E, 0x63)
BODY_FONT = "Calibri"
MONO_FONT = "Consolas"

CONTENT_WIDTH = 6.5  # inches, given the margins set in setup()

INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")
IMAGE = re.compile(r"^!\[(.*?)\]\((.+?)\)$")


def shade(cell, hex_fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def bottom_border(paragraph, color: str = "2E5C8A", size: str = "6", space: str = "3") -> None:
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), space)
    bottom.set(qn("w:color"), color)
    border.append(bottom)
    paragraph._p.get_or_add_pPr().append(border)


def add_runs(paragraph, text: str, *, bold=False, size=None, color=None, font=None) -> None:
    """Emit runs, honouring **bold**, `code` and [label](url) inline markup."""

    def styled(run, *, bold=False, mono=False):
        if bold:
            run.bold = True
        if size:
            run.font.size = Pt(size - 0.5 if mono else size)
        if color is not None:
            run.font.color.rgb = color
        run.font.name = MONO_FONT if mono else font

    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            # bold segments may contain `code`; render both
            for segment in re.split(r"(`[^`]+`)", part[2:-2]):
                if not segment:
                    continue
                if segment.startswith("`") and segment.endswith("`"):
                    styled(paragraph.add_run(segment[1:-1]), bold=True, mono=True)
                else:
                    styled(paragraph.add_run(segment), bold=True)
        elif part.startswith("`") and part.endswith("`"):
            styled(paragraph.add_run(part[1:-1]), mono=True)
        elif part.startswith("[") and "](" in part:
            run = paragraph.add_run(part[1 : part.index("]")])
            run.font.color.rgb = ACCENT
            run.underline = True
            if size:
                run.font.size = Pt(size)
        else:
            run = paragraph.add_run(part)
            if bold:
                run.bold = True
            if size:
                run.font.size = Pt(size)
            if color is not None:
                run.font.color.rgb = color
            if font:
                run.font.name = font


def add_page_number(paragraph) -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED


def setup(document: Document) -> None:
    normal = document.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.12

    for section in document.sections:
        section.top_margin = Inches(0.85)
        section.bottom_margin = Inches(0.85)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        # the cover page carries no footer
        section.different_first_page_header_footer = True

    footer = document.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("CallLens · NVIDIA × Nebius Global AI Hackathon · Apache 2.0 · page ")
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    add_page_number(footer)


def heading(document: Document, text: str, level: int) -> None:
    if level == 1:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(2)
        add_runs(paragraph, text, bold=True, size=22, color=NAVY)
    elif level == 2:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(14)
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.keep_with_next = True
        add_runs(paragraph, text, bold=True, size=14, color=NAVY)
        bottom_border(paragraph)
    else:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(10)
        paragraph.paragraph_format.space_after = Pt(3)
        paragraph.paragraph_format.keep_with_next = True
        add_runs(paragraph, text, bold=True, size=11.5, color=ACCENT)


def paragraph(document: Document, text: str) -> None:
    p = document.add_paragraph()
    add_runs(p, text)


def bullets(document: Document, items: list[str], numbered: bool = False) -> None:
    for index, item in enumerate(items, start=1):
        p = document.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.28)
        p.paragraph_format.space_after = Pt(3)
        marker = f"{index}. " if numbered else "•  "
        run = p.add_run(marker)
        run.font.color.rgb = ACCENT
        add_runs(p, item)


def code_block(document: Document, lines: list[str]) -> None:
    for line in lines:
        p = document.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        run = p.add_run(line or " ")
        run.font.name = MONO_FONT
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x25, 0x2A, 0x33)
        shading = OxmlElement("w:shd")
        shading.set(qn("w:val"), "clear")
        shading.set(qn("w:fill"), "F3F4F6")
        p._p.get_or_add_pPr().append(shading)
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def table(document: Document, rows: list[str]) -> None:
    cells = [[c.strip() for c in row.strip().strip("|").split("|")] for row in rows]
    cells = [c for c in cells if not all(re.fullmatch(r":?-{2,}:?", x or "--") for x in c)]
    if not cells:
        return

    width = max(len(r) for r in cells)
    grid = document.add_table(rows=0, cols=width)
    grid.style = "Table Grid"
    grid.alignment = WD_TABLE_ALIGNMENT.CENTER

    for row_index, row in enumerate(cells):
        cells_out = grid.add_row().cells
        tr_pr = cells_out[0]._tc.getparent().get_or_add_trPr()
        tr_pr.append(OxmlElement("w:cantSplit"))
        if row_index == 0:
            header = OxmlElement("w:tblHeader")
            header.set(qn("w:val"), "true")
            tr_pr.append(header)
        for col in range(width):
            text = row[col] if col < len(row) else ""
            p = cells_out[col].paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, text, bold=row_index == 0, size=9.5)
            if row_index == 0:
                shade(cells_out[col], "E8EDF4")
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def rule(document: Document) -> None:
    p = document.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    bottom_border(p, color="D3DCE8", size="6", space="1")


def figure(document: Document, caption: str, rel_path: str) -> None:
    path = (ROOT / rel_path).resolve()
    if not path.exists():
        paragraph(document, f"[missing figure: {rel_path}]")
        return

    info = DocxImage.from_file(str(path))
    ratio = info.width / info.height
    width = 6.2 if ratio >= 1.35 else (5.6 if ratio >= 1.0 else 4.6)

    holder = document.add_paragraph()
    holder.alignment = WD_ALIGN_PARAGRAPH.CENTER
    holder.paragraph_format.space_before = Pt(8)
    holder.paragraph_format.space_after = Pt(4)
    holder.paragraph_format.keep_with_next = True
    holder.add_run().add_picture(str(path), width=Inches(width))

    cap = document.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(12)
    run = cap.add_run(caption)
    run.italic = True
    run.font.size = Pt(8.5)
    run.font.color.rgb = MUTED


def cover(document: Document, lines: list[str]) -> None:
    fields: dict[str, str] = {}
    meta: list[tuple[str, str]] = []
    for line in lines:
        if not line.strip() or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key, value = key.strip().lower(), value.strip()
        if key == "meta":
            label, _, rest = value.partition("|")
            meta.append((label.strip(), rest.strip()))
        else:
            fields[key] = value

    eyebrow = document.add_paragraph()
    eyebrow.paragraph_format.space_before = Pt(18)
    eyebrow.paragraph_format.space_after = Pt(2)
    run = eyebrow.add_run(fields.get("eyebrow", "").upper())
    run.font.size = Pt(9)
    run.bold = True
    run.font.color.rgb = ACCENT

    title = document.add_paragraph()
    title.paragraph_format.space_before = Pt(0)
    title.paragraph_format.space_after = Pt(0)
    run = title.add_run(fields.get("title", ""))
    run.font.size = Pt(40)
    run.bold = True
    run.font.color.rgb = NAVY

    subtitle = document.add_paragraph()
    subtitle.paragraph_format.space_before = Pt(4)
    subtitle.paragraph_format.space_after = Pt(14)
    run = subtitle.add_run(fields.get("subtitle", ""))
    run.font.size = Pt(13)
    run.font.color.rgb = SOFT

    if fields.get("image"):
        path = (ROOT / fields["image"]).resolve()
        if path.exists():
            holder = document.add_paragraph()
            holder.alignment = WD_ALIGN_PARAGRAPH.CENTER
            holder.paragraph_format.space_after = Pt(4)
            holder.add_run().add_picture(str(path), width=Inches(CONTENT_WIDTH + 0.1))

    if fields.get("caption"):
        cap = document.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.space_after = Pt(16)
        run = cap.add_run(fields["caption"])
        run.italic = True
        run.font.size = Pt(8.5)
        run.font.color.rgb = MUTED

    if fields.get("context"):
        block = document.add_paragraph()
        block.paragraph_format.space_before = Pt(0)
        block.paragraph_format.space_after = Pt(14)
        block.paragraph_format.left_indent = Inches(0.12)
        block.paragraph_format.line_spacing = 1.2
        bottom_border(block, color="D3DCE8", size="4", space="10")
        run = block.add_run(fields["context"])
        run.font.size = Pt(10)
        run.font.color.rgb = SOFT

    if meta:
        grid = document.add_table(rows=0, cols=2)
        grid.autofit = False
        widths = [Inches(1.5), Inches(5.0)]
        for label, value in meta:
            cells = grid.add_row().cells
            label_p = cells[0].paragraphs[0]
            label_p.paragraph_format.space_after = Pt(3)
            label_run = label_p.add_run(label)
            label_run.bold = True
            label_run.font.size = Pt(9)
            label_run.font.color.rgb = NAVY
            value_p = cells[1].paragraphs[0]
            value_p.paragraph_format.space_after = Pt(3)
            value_run = value_p.add_run(value)
            value_run.font.size = Pt(9)
            value_run.font.color.rgb = SOFT
        for i, column in enumerate(grid.columns):
            column.width = widths[i]
        for row in grid.rows:
            for i, cell in enumerate(row.cells):
                cell.width = widths[i]

    document.add_page_break()


def build() -> Path:
    text = SOURCE.read_text(encoding="utf-8")
    document = Document()
    setup(document)

    lines = text.splitlines()
    index = 0

    while index < len(lines) and not lines[index].strip():
        index += 1
    if index < len(lines) and lines[index].strip().lower() == "```cover":
        block: list[str] = []
        index += 1
        while index < len(lines) and not lines[index].strip().startswith("```"):
            block.append(lines[index].rstrip())
            index += 1
        index += 1
        cover(document, block)

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("```"):
            block = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                block.append(lines[index].rstrip())
                index += 1
            code_block(document, block)
            index += 1
            continue

        img = IMAGE.match(stripped)
        if img:
            figure(document, img.group(1), img.group(2))
            index += 1
            continue

        if re.fullmatch(r"-{3,}|\*{3,}|_{3,}", stripped):
            rule(document)
            index += 1
            continue

        if stripped.startswith("|"):
            rows: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(lines[index].strip())
                index += 1
            table(document, rows)
            continue

        match = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if match:
            heading(document, match.group(2), len(match.group(1)))
            index += 1
            continue

        if stripped.startswith(">"):
            p = document.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            run = p.add_run(stripped.lstrip("> ").strip())
            run.italic = True
            run.font.size = Pt(10)
            run.font.color.rgb = MUTED
            index += 1
            continue

        if stripped.startswith("- "):
            items: list[str] = []
            while index < len(lines):
                current = lines[index]
                if current.strip().startswith("- "):
                    items.append(current.strip()[2:])
                    index += 1
                elif current.startswith("  ") and current.strip() and items:
                    items[-1] += " " + current.strip()
                    index += 1
                else:
                    break
            bullets(document, items)
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while index < len(lines):
                current = lines[index]
                if re.match(r"^\d+\.\s+", current.strip()):
                    items.append(re.sub(r"^\d+\.\s+", "", current.strip()))
                    index += 1
                elif current.startswith("  ") and current.strip() and items:
                    items[-1] += " " + current.strip()
                    index += 1
                else:
                    break
            bullets(document, items, numbered=True)
            continue

        collect: list[str] = [stripped]
        index += 1
        while index < len(lines):
            nxt = lines[index].strip()
            if not nxt or nxt.startswith(("#", "|", "```", "- ", ">", "!")):
                break
            if re.fullmatch(r"-{3,}|\*{3,}|_{3,}", nxt):
                break
            if re.match(r"^\d+\.\s+", nxt):
                break
            collect.append(nxt)
            index += 1
        paragraph(document, " ".join(collect))

    document.save(TARGET)
    return TARGET


if __name__ == "__main__":
    path = build()
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
