import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "icons" / "generatedUiIconSvg.ts"
OUTPUT = ROOT / "docs" / "docs" / "assets" / "icons"

GENERATED_ICONS = {
    "content_copy": ("copy", "Copy"),
    "history": ("copy-history", "Copy equation history"),
    "select_all": ("substitute-all", "Substitute all matching expressions"),
    "functions": ("apply-operation", "Apply operation"),
    "input": ("force-factor-selection", "Force factor selection"),
    "call_split": ("factor-selection", "Factor selection"),
    "ramp_left": ("distribute-selection", "Distribute selection"),
    "clean": ("clean-up-selection", "Clean up selection"),
    "calculate": ("evaluate-selection", "Evaluate selection"),
    "rule": ("apply-identity", "Apply identity"),
    "arrow_drop_down": ("choose-identity", "Choose identity"),
    "exposure_neg_1": ("toggle-negation", "Toggle negation"),
    "function": ("toggle-function-symbol", "Toggle function symbol"),
    "data_object": ("toggle-delimiters", "Toggle delimiters"),
    "data_array": ("cycle-delimiter", "Cycle delimiter"),
}

CUSTOM_ICONS = {
    "additive-move-mode": (
        "Additive move mode",
        "0 0 24 24",
        '<path d="M11 4a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"/>',
    ),
    "multiplicative-move-mode": (
        "Multiplicative move mode",
        "0 0 24 24",
        '<path d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6z"/>',
    ),
    "undo": (
        "Undo",
        "0 0 24 24",
        '<path d="M9.7 6.3a1 1 0 0 1 0 1.4L7.4 10H15a5 5 0 1 1 0 10h-2a1 1 0 1 1 0-2h2a3 3 0 1 0 0-6H7.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0z"/>',
    ),
    "redo": (
        "Redo",
        "0 0 24 24",
        '<path d="M14.3 6.3a1 1 0 0 0 0 1.4l2.3 2.3H9a5 5 0 1 0 0 10h2a1 1 0 1 0 0-2H9a3 3 0 1 1 0-6h7.6l-2.3 2.3a1 1 0 1 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 0z"/>',
    ),
    "substitute": (
        "Substitute",
        "0 0 24 24",
        '<rect x="2.5" y="7" width="5.5" height="10" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/>'
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M10.5 12h3.5M12.5 10l2 2-2 2"/>'
        '<rect x="16" y="7" width="5.5" height="10" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    ),
    "flip-relation": (
        "Flip relation",
        "0 0 24 24",
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 9a7 7 0 0 1 11.95-2.85L20 9"/>'
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 5v4h-4"/>'
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 14h9M7.5 17.5h9"/>',
    ),
}


def wrap_icon(name: str, title: str, view_box: str, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" '
        f'viewBox="0 0 36 36" role="img" aria-labelledby="{name}-title">\n'
        f'  <title id="{name}-title">{title}</title>\n'
        '  <rect x="0.5" y="0.5" width="35" height="35" rx="3" '
        'fill="#424242" stroke="#757575"/>\n'
        f'  <svg x="7" y="7" width="22" height="22" viewBox="{view_box}" '
        'fill="rgba(255,255,255,0.87)" color="rgba(255,255,255,0.87)">\n'
        f"    {body}\n"
        "  </svg>\n"
        "</svg>\n"
    )


def parse_generated_icons() -> dict[str, str]:
    result = {}
    pattern = re.compile(r'^\s*"([^"]+)":\s*("(?:\\.|[^"\\])*"),?\s*$', re.MULTILINE)
    for match in pattern.finditer(SOURCE.read_text(encoding="utf-8")):
        result[match.group(1)] = json.loads(match.group(2))
    return result


def unwrap_svg(svg: str) -> tuple[str, str]:
    svg = svg[svg.index("<svg") :]
    opening, body = svg.split(">", 1)
    body = body.rsplit("</svg>", 1)[0]
    view_box = re.search(r'viewBox="([^"]+)"', opening).group(1)
    body = body.replace('fill="#000000"', 'fill="currentColor"')
    return view_box, body.strip()


OUTPUT.mkdir(parents=True, exist_ok=True)
generated = parse_generated_icons()

for source_name, (filename, title) in GENERATED_ICONS.items():
    view_box, body = unwrap_svg(generated[source_name])
    (OUTPUT / f"{filename}.svg").write_text(
        wrap_icon(filename, title, view_box, body),
        encoding="utf-8",
    )

for filename, (title, view_box, body) in CUSTOM_ICONS.items():
    (OUTPUT / f"{filename}.svg").write_text(
        wrap_icon(filename, title, view_box, body),
        encoding="utf-8",
    )
