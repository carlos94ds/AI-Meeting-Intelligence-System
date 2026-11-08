"""Controle van AI-output, onafhankelijk van de provider.

Een taalmodel kan zich vergissen (verwijzing naar een niet-bestaand segment, een verzonnen naam of id).
Deze functies maken de output veilig voordat de pijplijn hem opslaat. Ze passen nooit de inhoud aan,
alleen wat aantoonbaar niet klopt.
"""

from ..models import ActionStatus
from .schemas import (
    ActionItemState,
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    StatusSuggestion,
    Transcript,
)

MAX_PREP_QUESTIONS = 8


def _canonical_name(name: str | None, known: list[str]) -> str | None:
    if not name:
        return None
    lookup = {k.casefold(): k for k in known}
    return lookup.get(name.strip().casefold())


def sanitize_analysis(analysis: MeetingAnalysis, transcript: Transcript) -> MeetingAnalysis:
    n = len(transcript.segments)
    ok = lambda idx: 0 <= idx < n  # noqa: E731

    def keep(items):  # type: ignore[no-untyped-def]
        return [i for i in items if ok(i.segment_index) and i.text.strip()]

    seen: set[str] = set()
    action_items = []
    for item in analysis.action_items:
        key = item.title.strip().casefold()
        if not key or key in seen or not ok(item.segment_index):
            continue
        seen.add(key)
        action_items.append(item.model_copy(update={
            "owner_name": _canonical_name(item.owner_name, transcript.participant_names),
            "goal_hint": next((g for g in transcript.project_goals if item.goal_hint and g.casefold() == item.goal_hint.casefold()), None),
        }))

    progress = [
        u.model_copy(update={"subject_name": _canonical_name(u.subject_name, transcript.participant_names) or u.subject_name})
        for u in analysis.progress_updates
        if ok(u.segment_index)
    ]
    return MeetingAnalysis(
        topics=keep(analysis.topics),
        decisions=keep(analysis.decisions),
        problems=keep(analysis.problems),
        ideas=keep(analysis.ideas),
        agreements=keep(analysis.agreements),
        deadlines=keep(analysis.deadlines),
        action_items=action_items,
        progress_updates=progress,
    )


def sanitize_suggestions(
    suggestions: list[StatusSuggestion], open_items: list[OpenActionItemRef], n_segments: int
) -> list[StatusSuggestion]:
    by_id = {i.id: i for i in open_items}
    result: list[StatusSuggestion] = []
    used: set[int] = set()
    for s in suggestions:
        item = by_id.get(s.action_item_id)
        if item is None or s.action_item_id in used or not (0 <= s.segment_index < n_segments):
            continue
        target = s.suggested_status
        # Een melding "het is klaar" is nooit meteen Afgerond: eerst Gemeld als afgerond.
        if target == ActionStatus.AFGEROND and item.status != ActionStatus.GEMELD_AFGEROND:
            target = ActionStatus.GEMELD_AFGEROND
        if target == ActionStatus.VOORGESTELD:
            continue
        if target == item.status and target != ActionStatus.UITGESTELD:
            continue  # geen wijziging
        used.add(s.action_item_id)
        result.append(s.model_copy(update={"suggested_status": target}))
    return result


def sanitize_prep(drafts: list[PrepQuestionDraft], state: ProjectState) -> list[PrepQuestionDraft]:
    items: dict[int, ActionItemState] = {i.id: i for i in state.action_items}
    clean: list[PrepQuestionDraft] = []
    for d in drafts:
        if not d.text.strip():
            continue
        item = items.get(d.action_item_id) if d.action_item_id is not None else None
        clean.append(d.model_copy(update={
            "action_item_id": item.id if item else None,
            # Bron altijd overnemen van het actiepunt zelf, nooit van het model.
            "source_segment_id": item.last_source_segment_id if item else None,
        }))
    clean.sort(key=lambda d: d.priority)
    return clean[:MAX_PREP_QUESTIONS]
