"""MockProvider: werkt volledig offline met realistische Nederlandse demodata.

- `transcribe` geeft een vooraf geschreven vergadering terug (namen ingevuld uit de hints).
- `extract`, `match` en `prepare_next` gebruiken eenvoudige, voorspelbare regels.
  Een echte LLM vervangt deze regels, maar geeft exact dezelfde schema's terug.
"""

import asyncio
import re
from datetime import date, timedelta

from ..dutch import format_date, parse_date
from ..models import ActionStatus
from .base import AIProvider
from .schemas import (
    ExtractedActionItem,
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProgressUpdate,
    ProjectState,
    SourcedText,
    StatusSuggestion,
    Transcript,
    TranscriptionHints,
    TranscriptSegmentData,
)

FALLBACK_NAMES = ["Deelnemer A", "Deelnemer B", "Deelnemer C", "Deelnemer D"]

# (sprekerindex, tekst). Spreker 0 is de voorzitter. {a},{b},{c} zijn de eerste drie deelnemers.
_TEMPLATE: list[tuple[int, str]] = [
    (0, "Goedemiddag allemaal, fijn dat jullie er zijn. Het onderwerp van vandaag is de voortgang van de lopende actiepunten en de planning richting oplevering."),
    (1, "Goedemiddag. Zullen we meteen de actiepunten van vorige keer langslopen?"),
    (0, "Ja, graag. {a}, wil jij beginnen?"),
    (1, "Zeker. Mijn deel is af, ik heb het resultaat gisteren in de gedeelde map gezet."),
    (0, "Mooi. Dus {a} heeft het actiepunt afgerond. Ik bevestig het zodra ik het document heb bekeken."),
    (2, "Bij mij ligt het anders. Ik ben nog niet klaar, ik liep vast op een afhankelijkheid."),
    (0, "Dus {b} heeft meer tijd nodig. Zullen we de deadline verschuiven naar {d14}?"),
    (2, "Ja, {d14} is haalbaar als ik volgende week de juiste toegang krijg."),
    (3, "Ik ben bijna klaar. Ik verwacht dat ik het deze week kan afronden."),
    (0, "Prima. {c} is dus nog bezig, dat houden we gewoon open."),
    (3, "Het probleem is: er is nog steeds geen testomgeving die op productie lijkt."),
    (2, "Dat klopt. Daardoor kan ik de koppelingen niet goed testen."),
    (1, "Idee: misschien kunnen we tijdelijk een kopie van de acceptatieomgeving gebruiken."),
    (0, "Goed voorstel. Besluit: we gebruiken de acceptatieomgeving tijdelijk als testomgeving."),
    (3, "Dan moet iemand wel de toegangsrechten regelen."),
    (0, "{c}, kun jij de toegangsrechten voor de acceptatieomgeving regelen vóór {d7}?"),
    (3, "Ja, dat pak ik op."),
    (1, "Er moet ook nog een korte handleiding komen voor de nieuwe werkwijze."),
    (0, "Klopt. Ik ga een opzet maken voor de handleiding, dan kijken we er samen naar."),
    (2, "En we moeten de stakeholders informeren over de verschoven planning."),
    (0, "{a}, wil jij de stakeholders informeren over de nieuwe planning?"),
    (1, "Doe ik. Dan stuur ik morgen een korte update."),
    (0, "Afspraak: blokkades melden we voortaan direct in het projectkanaal, niet pas in de vergadering."),
    (3, "Helemaal mee eens."),
    (0, "De deadline voor de oplevering blijft {d21}. Daar houden we aan vast."),
    (2, "Dan moet de testomgeving er echt deze week staan."),
    (0, "Dat is genoteerd. Volgende keer bespreken we de resultaten van de test. Bedankt allemaal."),
]


def _fill_names(hints: TranscriptionHints | None, today: date) -> tuple[list[str], dict[str, str]]:
    names = list(hints.participant_names if hints else [])
    padded = (names + FALLBACK_NAMES)[:4]
    values = {
        "a": padded[0],
        "b": padded[1],
        "c": padded[2],
        "d7": format_date(today + timedelta(days=7)),
        "d14": format_date(today + timedelta(days=14)),
        "d21": format_date(today + timedelta(days=21)),
    }
    return names or padded, values


def build_mock_transcript(hints: TranscriptionHints | None = None, today: date | None = None) -> Transcript:
    today = today or date.today()
    names, values = _fill_names(hints, today)
    segments: list[TranscriptSegmentData] = []
    t = 0.0
    for speaker, text in _TEMPLATE:
        filled = text.format(**values)
        duration = max(3.0, round(len(filled) / 14, 1))  # ~14 tekens per seconde spraak
        segments.append(
            TranscriptSegmentData(
                speaker_label=f"Spreker {speaker + 1}",
                start_seconds=round(t, 1),
                end_seconds=round(t + duration, 1),
                text=filled,
            )
        )
        t += duration + 0.8
    return Transcript(language="nl", duration_seconds=round(t, 1), participant_names=names, segments=segments)


# --------------------------------------------------------------------------- regels voor extractie

_SUMMARY_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("topics", re.compile(r"het onderwerp van vandaag is (.+)", re.I)),
    ("decisions", re.compile(r"besluit: (.+)", re.I)),
    ("problems", re.compile(r"het probleem is:? (?:dat )?(.+)", re.I)),
    ("ideas", re.compile(r"(?:idee: )?misschien kunnen we (.+)", re.I)),
    ("agreements", re.compile(r"afspraak: (.+)", re.I)),
    ("deadlines", re.compile(r"de deadline (?:voor|blijft|is) .+", re.I)),
]

_ASSIGN_RE = re.compile(r"^(?P<name>[A-Z][\w ]*?), (?:kun|wil) jij (?P<task>.+?)\?", re.U)
_SELF_RE = re.compile(r"\bik ga (?P<task>.+?)(?:,|\.|$)", re.I)
_DONE_RE = re.compile(r"dus (?P<name>[A-Z][\w ]*?) heeft het actiepunt afgerond", re.I)
_LATE_RE = re.compile(r"dus (?P<name>[A-Z][\w ]*?) heeft meer tijd nodig", re.I)
_BUSY_RE = re.compile(r"(?P<name>[A-Z][\w ]*?) is dus nog bezig", re.I)


def _sentence(text: str) -> str:
    text = text.strip().rstrip(".?!")
    return text[:1].upper() + text[1:] + "."


def _rule_based_extract(transcript: Transcript, today: date) -> MeetingAnalysis:
    analysis = MeetingAnalysis()
    for idx, seg in enumerate(transcript.segments):
        for field, pattern in _SUMMARY_RULES:
            m = pattern.search(seg.text)
            if m:
                text = m.group(0) if field == "deadlines" else m.group(1)
                getattr(analysis, field).append(SourcedText(text=_sentence(text), segment_index=idx))

        if m := _ASSIGN_RE.search(seg.text):
            task = m.group("task")
            deadline = parse_date(task, today)
            task = re.sub(r"\s*vóór \d{1,2} \w+", "", task)
            owner = m.group("name") if m.group("name") in transcript.participant_names else None
            analysis.action_items.append(
                ExtractedActionItem(
                    title=_sentence(task).rstrip("."),
                    owner_name=owner,
                    deadline=deadline,
                    segment_index=idx,
                    confidence=0.9 if owner else 0.6,
                )
            )
        elif m := _SELF_RE.search(seg.text):
            # "Ik ga ..." – de spreker is vóór het koppelen van sprekers nog onbekend.
            analysis.action_items.append(
                ExtractedActionItem(
                    title=_sentence(m.group("task")).rstrip("."),
                    owner_name=None,
                    deadline=None,
                    segment_index=idx,
                    confidence=0.55,
                )
            )

        for regex, kind in ((_DONE_RE, "gemeld_afgerond"), (_LATE_RE, "uitgesteld"), (_BUSY_RE, "bezig")):
            if m := regex.search(seg.text):
                analysis.progress_updates.append(
                    ProgressUpdate(
                        subject_name=m.group("name"),
                        text=seg.text,
                        kind=kind,
                        new_deadline=parse_date(seg.text, today),
                        segment_index=idx,
                    )
                )
    return analysis


def _rule_based_match(
    analysis: MeetingAnalysis, open_items: list[OpenActionItemRef], today: date
) -> list[StatusSuggestion]:
    suggestions: list[StatusSuggestion] = []
    for item in open_items:
        if not item.owner_name:
            continue
        update = next((u for u in analysis.progress_updates if u.subject_name == item.owner_name), None)
        if update is None:
            continue
        if update.kind == "gemeld_afgerond" and item.status != ActionStatus.GEMELD_AFGEROND:
            suggestions.append(
                StatusSuggestion(
                    action_item_id=item.id,
                    suggested_status=ActionStatus.GEMELD_AFGEROND,
                    quote=update.text,
                    segment_index=update.segment_index,
                    rationale=f"{item.owner_name} meldt dat het klaar is; dit moet nog bevestigd worden.",
                    confidence=0.85,
                )
            )
        elif update.kind == "uitgesteld":
            new_deadline = update.new_deadline or (item.deadline or today) + timedelta(days=7)
            suggestions.append(
                StatusSuggestion(
                    action_item_id=item.id,
                    suggested_status=ActionStatus.UITGESTELD,
                    quote=update.text,
                    segment_index=update.segment_index,
                    rationale=f"{item.owner_name} is nog niet klaar; deadline verschuift naar {format_date(new_deadline)}.",
                    new_deadline=new_deadline,
                    confidence=0.9,
                )
            )
        elif update.kind == "bezig" and item.status != ActionStatus.OPEN:
            suggestions.append(
                StatusSuggestion(
                    action_item_id=item.id,
                    suggested_status=ActionStatus.OPEN,
                    quote=update.text,
                    segment_index=update.segment_index,
                    rationale=f"{item.owner_name} is er nog mee bezig.",
                    confidence=0.7,
                )
            )
    return suggestions


def _rule_based_prepare(state: ProjectState) -> list[PrepQuestionDraft]:
    drafts: list[PrepQuestionDraft] = []
    active = {ActionStatus.OPEN, ActionStatus.UITGESTELD, ActionStatus.VOORGESTELD}
    for item in state.action_items:
        who = item.owner_name or "Zonder eigenaar"
        common = {"action_item_id": item.id, "source_segment_id": item.last_source_segment_id}
        if item.status in active and item.postpone_count >= state.postpone_threshold:
            drafts.append(PrepQuestionDraft(
                text=f"{item.owner_name or 'Team'}, wat is er nodig om '{item.title}' deze keer echt af te ronden? Is hulp of een andere aanpak nodig?",
                reason=f"{who} – {item.title.lower()}, {item.postpone_count}× uitgesteld",
                priority=1, **common))
        elif item.status in active and item.deadline and item.deadline < state.today:
            drafts.append(PrepQuestionDraft(
                text=f"'{item.title}' is over de deadline ({format_date(item.deadline)}). Wat is de nieuwe, haalbare planning?",
                reason=f"{who} – deadline verstreken op {format_date(item.deadline)}",
                priority=1, **common))
        elif item.status == ActionStatus.GEMELD_AFGEROND:
            drafts.append(PrepQuestionDraft(
                text=f"Kunnen we '{item.title}' formeel als afgerond bevestigen? Is er een link of document als bewijs?",
                reason=f"{who} – gemeld als afgerond, nog niet bevestigd",
                priority=2, **common))
        elif item.status in active and not item.owner_name:
            drafts.append(PrepQuestionDraft(
                text=f"Wie wordt eigenaar van '{item.title}'?",
                reason="Actiepunt zonder eigenaar",
                priority=2, **common))
        elif item.status in active and item.postpone_count == 1:
            drafts.append(PrepQuestionDraft(
                text=f"Ligt '{item.title}' op schema voor de nieuwe deadline?",
                reason=f"{who} – {item.title.lower()}, 1× uitgesteld",
                priority=3, **common))
        elif item.status in active and item.deadline is None:
            drafts.append(PrepQuestionDraft(
                text=f"Welke deadline spreken we af voor '{item.title}'?",
                reason="Actiepunt zonder deadline",
                priority=3, **common))
    for goal in state.goals[:2]:
        if len(drafts) >= 6:
            break
        drafts.append(PrepQuestionDraft(
            text=f"Zijn er nieuwe risico's voor de doelstelling '{goal}'?",
            reason=f"Doelstelling: {goal}",
            priority=4))
    drafts.sort(key=lambda d: d.priority)
    return drafts


class MockProvider(AIProvider):
    name = "mock"

    def __init__(self, delay_seconds: float = 1.5, today: date | None = None) -> None:
        self.delay_seconds = delay_seconds
        self._today = today

    @property
    def today(self) -> date:
        return self._today or date.today()

    async def _delay(self) -> None:
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        await self._delay()
        return build_mock_transcript(hints, self.today)

    async def extract(self, transcript: Transcript) -> MeetingAnalysis:
        await self._delay()
        return _rule_based_extract(transcript, self.today)

    async def match(
        self, new_analysis: MeetingAnalysis, open_action_items: list[OpenActionItemRef]
    ) -> list[StatusSuggestion]:
        await self._delay()
        return _rule_based_match(new_analysis, open_action_items, self.today)

    async def prepare_next(self, project_state: ProjectState) -> list[PrepQuestionDraft]:
        await self._delay()
        return _rule_based_prepare(project_state)
