# Takes a latex input and generates an svg for use as a macro icon.

import argparse
import pathlib
import re
import subprocess

ICON_CANVAS_PT = 24.0
SVG_TAG_RE = re.compile(
    r"<svg(?P<before>[^>]*?)\swidth='(?P<width>[\d.]+)pt'\sheight='(?P<height>[\d.]+)pt'\sviewBox='(?P<x>-?[\d.]+) (?P<y>-?[\d.]+) (?P<vb_width>[\d.]+) (?P<vb_height>[\d.]+)'(?P<after>[^>]*)>"
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("latex", help="The latex input to generate an svg for")
    args = parser.parse_args()
    latex = args.latex
    return generate_svg(latex)


def generate_svg(latex: str) -> int:
    temp_folder = pathlib.Path(".") / "svg_temp"
    temp_folder.mkdir(parents=True, exist_ok=True)
    tex_file = temp_folder / "temp.tex"
    svg_file = temp_folder / "temp.svg"
    content = Rf"""
\documentclass[border=0pt]{{standalone}}
\usepackage{{amsmath, amsfonts}}

\begin{{document}}
\( \displaystyle {latex} \)
\end{{document}}
"""
    tex_file.write_text(content, encoding="utf-8")
    pdf = temp_folder / "temp.pdf"
    subprocess.run(
        ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", tex_file.name],
        cwd=temp_folder,
        check=True,
    )
    if not pdf.exists():
        raise FileNotFoundError(
            f"DVI file {pdf} not found. Compilation probably failed."
        )
    subprocess.run(
        ["dvisvgm", "--pdf", pdf.name, "-o", svg_file.name],
        cwd=temp_folder,
        check=True,
    )
    if not svg_file.exists():
        raise FileNotFoundError(
            f"SVG file {svg_file} not found. pdf -> svg conversion probably failed."
        )
    svg_content = svg_file.read_text()
    svg_file.write_text(
        normalize_svg_canvas(svg_content).replace("fill='#000000'", "fill='currentColor'"),
        encoding="utf-8",
    )
    return 0


def normalize_svg_canvas(svg_content: str) -> str:
    """Center the generated math in a fixed square viewport to keep icon scale consistent."""
    match = SVG_TAG_RE.search(svg_content)
    if not match:
        raise ValueError("Could not find an SVG root tag with pt dimensions and a viewBox.")

    x = float(match.group("x"))
    y = float(match.group("y"))
    width = float(match.group("vb_width"))
    height = float(match.group("vb_height"))
    canvas = max(ICON_CANVAS_PT, width, height)
    center_x = x + width / 2
    center_y = y + height / 2
    next_x = center_x - canvas / 2
    next_y = center_y - canvas / 2

    replacement = (
        f"<svg{match.group('before')} width='{format_pt(canvas)}pt' "
        f"height='{format_pt(canvas)}pt' "
        f"viewBox='{format_pt(next_x)} {format_pt(next_y)} "
        f"{format_pt(canvas)} {format_pt(canvas)}'{match.group('after')}>"
    )
    return SVG_TAG_RE.sub(replacement, svg_content, count=1)


def format_pt(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
