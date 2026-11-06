"""Hulpfuncties voor Nederlandse datums."""

import re
from datetime import date

MONTHS = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
]

_DATE_RE = re.compile(r"(\d{1,2}) (" + "|".join(MONTHS) + r")", re.IGNORECASE)


def format_date(d: date) -> str:
    """10 november"""
    return f"{d.day} {MONTHS[d.month - 1]}"


def parse_date(text: str, reference: date) -> date | None:
    """Zoekt de eerste 'D maand' in de tekst; kiest het jaar zodat de datum niet ver in het verleden ligt."""
    m = _DATE_RE.search(text)
    if not m:
        return None
    day, month = int(m.group(1)), MONTHS.index(m.group(2).lower()) + 1
    try:
        candidate = date(reference.year, month, day)
    except ValueError:
        return None
    if (reference - candidate).days > 180:
        candidate = candidate.replace(year=reference.year + 1)
    return candidate
