import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# Aparte, tijdelijke database en geen kunstmatige vertraging tijdens tests.
_tmp = Path(tempfile.mkdtemp())
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["MOCK_DELAY_SECONDS"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import reset_database  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    reset_database()
    with TestClient(app) as c:
        yield c
