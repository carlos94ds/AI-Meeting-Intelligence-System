import json

from app.ai.export_schemas import SCHEMAS
from app.config import ROOT_DIR


def test_gedocumenteerde_schemas_zijn_actueel() -> None:
    """docs/schemas moet overeenkomen met de Pydantic-modellen (python -m app.ai.export_schemas)."""
    for name, model in SCHEMAS.items():
        path = ROOT_DIR / "docs" / "schemas" / f"{name}.schema.json"
        assert path.exists(), f"{path} ontbreekt"
        assert json.loads(path.read_text(encoding="utf-8")) == model.model_json_schema(), f"{name} is verouderd"
