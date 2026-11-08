"""Exporteert de JSON-schema's van alle AI-output naar docs/schemas/.

Gebruik:  python -m app.ai.export_schemas
"""

import json

from ..config import ROOT_DIR
from .schemas import (
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    StatusSuggestion,
    Transcript,
    TranscriptionHints,
)

SCHEMAS = {
    "transcript": Transcript,
    "transcription_hints": TranscriptionHints,
    "meeting_analysis": MeetingAnalysis,
    "open_action_item_ref": OpenActionItemRef,
    "status_suggestion": StatusSuggestion,
    "project_state": ProjectState,
    "prep_question_draft": PrepQuestionDraft,
}


def main() -> None:
    out = ROOT_DIR / "docs" / "schemas"
    out.mkdir(parents=True, exist_ok=True)
    for name, model in SCHEMAS.items():
        path = out / f"{name}.schema.json"
        path.write_text(json.dumps(model.model_json_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Geschreven: {path.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()
