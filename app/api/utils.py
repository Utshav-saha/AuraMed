import re
from typing import Optional

# "100 ml bottle: ৳ 40.12" / "500 mg vial: ৳ 28.43,(5's pack: ৳ 142.15)" -> 40.12
_PRICE_RE = re.compile(r"৳\s*([0-9]+(?:\.[0-9]+)?)")


def parse_unit_price(package_container: Optional[str]) -> Optional[float]:
    if not package_container:
        return None
    m = _PRICE_RE.search(package_container)
    if m:
        return float(m.group(1))
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", package_container)
    return float(m.group(1)) if m else None


def parse_pack_price(package_size: Optional[str]) -> Optional[float]:
    if not package_size:
        return None
    m = _PRICE_RE.search(package_size)
    return float(m.group(1)) if m else None


_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75}
_NUM_RE = re.compile(r"(\d+(?:\.\d+)?/\d+|\d+(?:\.\d+)?|[½¼¾])")
_DOSE_LINE_RE = re.compile(
    r"(\d+(?:\.\d+)?|[½¼¾]|\d/\d)\s*[+\-–]\s*(\d+(?:\.\d+)?|[½¼¾]|\d/\d)\s*[+\-–]\s*(\d+(?:\.\d+)?|[½¼¾]|\d/\d)"
)


def _num(tok: str) -> float:
    if tok in _FRACTIONS:
        return _FRACTIONS[tok]
    if "/" in tok:
        a, b = tok.split("/")
        return float(a) / float(b)
    return float(tok)


def parse_dose(instruction: Optional[str]) -> list[float]:
    """
    '1+0+1', '1-0-1 • After food', 'Napa: ½-0-1' -> [1, 0, 1]
    pattern na pele [0,0,0]
    """
    if not instruction:
        return [0.0, 0.0, 0.0]
    m = _DOSE_LINE_RE.search(instruction)
    if not m:
        return [0.0, 0.0, 0.0]
    return [_num(m.group(1)), _num(m.group(2)), _num(m.group(3))]


def meal_timing(instruction: Optional[str]) -> Optional[str]:
    if not instruction:
        return None
    s = instruction.lower()
    if "before" in s:
        return "Before food"
    if "after" in s:
        return "After food"
    if "with" in s:
        return "With food"
    return None


def daily_total(instruction: Optional[str]) -> float:
    return sum(parse_dose(instruction))
