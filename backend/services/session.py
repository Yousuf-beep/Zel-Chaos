import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import config
from models.schemas import ExtractionResult, ResultCard


@dataclass
class Session:
    id: str
    lang: str = "en-IN"
    touched: float = field(default_factory=time.time)
    turns: list[str] = field(default_factory=list)
    base_extraction: Optional[ExtractionResult] = None
    confirmed_chips: Optional[list[dict]] = None
    answers: dict[str, Any] = field(default_factory=dict)
    asked: list[str] = field(default_factory=list)
    result: Optional[ResultCard] = None

    @property
    def transcript(self) -> str:
        return "\n".join(self.turns)


class SessionStore:
    def __init__(self, ttl_min: int = config.SESSION_TTL_MIN):
        self.ttl = ttl_min * 60
        self._data: dict[str, Session] = {}

    def _sweep(self) -> None:
        now = time.time()
        for sid in [k for k, s in self._data.items() if now - s.touched > self.ttl]:
            del self._data[sid]

    def create(self) -> Session:
        self._sweep()
        s = Session(id=uuid.uuid4().hex)
        self._data[s.id] = s
        return s

    def get(self, sid: str) -> Optional[Session]:
        self._sweep()
        s = self._data.get(sid)
        if s:
            s.touched = time.time()
        return s

    def get_or_create(self, sid: str) -> Session:
        s = self.get(sid)
        if s is None:
            s = Session(id=sid)
            self._data[sid] = s
        return s

    def delete(self, sid: str) -> None:
        self._data.pop(sid, None)


store = SessionStore()
