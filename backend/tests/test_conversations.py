import asyncio
import base64
import os

import pytest
from fastapi.testclient import TestClient

from main import app
from services import crypto
from services.companion import Companion, CompanionTurn, MockCompanion
from services.memory import Memory
from services.report import ReportService
from services.report_pdf import render


def run(coro):
    return asyncio.run(coro)


class Scripted(MockCompanion):
    def __init__(self, *turns):
        self.turns = list(turns)
        self.prompts = []

    async def respond(self, system, history, text, lang):
        self.prompts.append((system, history, text))
        return self.turns.pop(0)


def test_each_chat_has_its_own_thread_and_title():
    c = Companion(engine=MockCompanion(), mem=Memory())
    a = run(c.chat("cu1", "Asha", "My period is late and I'm stressed about exams", "en-IN"))
    run(c.chat("cu1", "Asha", "I also can't sleep", "en-IN", a.conversation_id))
    b = run(c.chat("cu1", "Asha", "Cramps are making it hard to study", "en-IN"))
    assert a.conversation_id != b.conversation_id
    convs = run(c.memory.conversations("cu1"))
    assert [x["id"] for x in convs] == [b.conversation_id, a.conversation_id]  # most recent first
    assert convs[1]["message_count"] == 4 and convs[1]["title"].startswith("My period is late")
    assert len(run(c.history("cu1", a.conversation_id))) == 4


def test_model_title_is_used_and_kept():
    eng = Scripted(CompanionTurn(reply="I hear you.", title="Late period and stress"), CompanionTurn(reply="ok", title="Ignored"))
    c = Companion(engine=eng, mem=Memory())
    r = run(c.chat("cu2", "", "period late, stressed", "en-IN"))
    assert r.title == "Late period and stress"
    assert "NEW CHAT: yes" in eng.prompts[0][0]
    r2 = run(c.chat("cu2", "", "still late", "en-IN", r.conversation_id))
    assert r2.title == "Late period and stress" and "NEW CHAT: no" in eng.prompts[1][0]


def test_conversations_are_private_to_their_owner():
    c = Companion(engine=MockCompanion(), mem=Memory())
    r = run(c.chat("owner", "", "something private", "en-IN"))
    with pytest.raises(KeyError):
        run(c.chat("intruder", "", "let me in", "en-IN", r.conversation_id))
    assert run(c.memory.conversation("intruder", r.conversation_id)) is None
    assert run(c.memory.delete_conversation("intruder", r.conversation_id)) is False
    assert run(c.memory.messages("intruder", r.conversation_id)) == []
    assert len(run(c.memory.messages("owner", r.conversation_id))) == 2


def test_recall_reaches_across_chats():
    eng = Scripted(*[CompanionTurn(reply="ok") for _ in range(2)])
    c = Companion(engine=eng, mem=Memory())
    run(c.chat("cu3", "", "my exams give me headaches every week", "en-IN"))
    run(c.chat("cu3", "", "the headaches came back", "en-IN"))  # a new chat
    assert "exams give me headaches" in eng.prompts[-1][0]


def test_crypto_roundtrip_and_legacy_plaintext():
    assert crypto.enabled()  # conftest sets a test key
    sealed = crypto.seal("मेरे पीरियड्स late hain")
    assert sealed.startswith(crypto.PREFIX) and "late" not in sealed
    assert crypto.unseal(sealed) == "मेरे पीरियड्स late hain"
    assert crypto.unseal("plain old row") == "plain old row"
    assert crypto.seal("same") != crypto.seal("same")  # fresh nonce every time
    assert crypto.unseal_json(crypto.seal_json({"a": [1, 2]})) == {"a": [1, 2]}
    with pytest.raises(crypto.CryptoError):
        crypto._load_key(base64.urlsafe_b64encode(os.urandom(16)).decode())


def test_chats_are_ciphertext_in_the_database():
    mem = Memory()
    r = run(Companion(engine=MockCompanion(), mem=mem).chat("cu5", "", "my secret worry about bleeding", "en-IN"))
    rows = run(mem.db.fetchall("SELECT text, meta FROM nola.chat_messages WHERE conversation_id = %s", r.conversation_id))
    assert rows and all(t.startswith(crypto.PREFIX) and "secret" not in t and m in ("{}", {}) for t, m in rows)
    title = run(mem.db.fetchone("SELECT title FROM nola.conversations WHERE id = %s", r.conversation_id))[0]
    assert title.startswith(crypto.PREFIX)
    assert run(mem.messages("cu5", r.conversation_id))[0]["text"] == "my secret worry about bleeding"


def test_postgres_without_key_refuses_to_start(monkeypatch):
    monkeypatch.setattr(crypto, "_aes", None)
    with pytest.raises(crypto.CryptoError):
        crypto.require_key_for_postgres(True)
    crypto.require_key_for_postgres(False)  # local SQLite development may run without one
    assert crypto.seal("x") == "x"


def test_report_summary_and_pdf():
    mem = Memory()
    c = Companion(engine=Scripted(
        CompanionTurn(reply="That sounds stressful.", suggestions=["Keep a regular bedtime."], question="How is your sleep?"),
        CompanionTurn(reply="Thank you for telling me.", see_doctor="soon", doctor_reason="A period this late is worth checking.")), mem=mem)
    r = run(c.chat("cu4", "Asha", "My periods have been missed for 3 months and I have pimples", "en-IN"))
    run(c.chat("cu4", "Asha", "मुझे नींद नहीं आती 😟", "en-IN", r.conversation_id))
    svc = ReportService(mem=mem)
    rep = run(svc.build("cu4", "Asha", r.conversation_id))
    assert not rep.model_written and rep.summary.main_concerns
    assert "Keep a regular bedtime." in rep.suggestions_given
    assert [f.level for f in rep.doctor_flags] == ["soon"]
    assert len(rep.transcript) == 4 and rep.transcript[1].question == "How is your sleep?"
    assert run(svc.build("cu4", "Asha", r.conversation_id)).generated_at == rep.generated_at  # cached until new messages
    pdf = render(rep)
    assert pdf[:5] == b"%PDF-" and len(pdf) > 5000
    with pytest.raises(KeyError):
        run(svc.build("someone-else", "X", r.conversation_id))


def test_onboarding_conversation_and_report_api():
    client = TestClient(app)
    client.post("/api/auth/signup", json={"name": "Nisha", "handle": "nisha@example.com", "password": "secret12"})
    assert client.get("/api/profile").json()["onboarded"] is False
    assert client.put("/api/profile/mascot", json={"mascot": "cat"}).status_code == 409
    r = client.put("/api/profile", json={"profile": {"age": 17, "regularity": "irregular", "concerns": ["mood_stress"],
                                                     "conditions": ["none"], "hormonal_meds": "no", "mascot": "frog"}})
    assert r.status_code == 200
    me = client.get("/api/auth/me").json()["user"]
    assert me["onboarded"] is True and me["mascot"] == "frog"
    assert client.put("/api/profile/mascot", json={"mascot": "dragon"}).status_code == 422
    assert client.put("/api/profile/mascot", json={"mascot": "teddy"}).status_code == 200
    assert client.get("/api/auth/me").json()["user"]["mascot"] == "teddy"
    assert client.get("/api/profile").json()["profile"]["age"] == 17

    r = client.post("/api/companion/chat", json={"text": "I feel low and my periods are late", "lang": "en-IN"}).json()
    cid = r["conversation_id"]
    assert client.get("/api/conversations").json()["conversations"][0]["id"] == cid
    assert len(client.get(f"/api/conversations/{cid}").json()["messages"]) == 2
    assert client.post("/api/companion/chat", json={"text": "hi", "conversation_id": "nope"}).status_code == 404

    pdf = client.get(f"/api/conversations/{cid}/report.pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["cache-control"] == "no-store" and pdf.content[:5] == b"%PDF-"
    assert "Age 17 (a teenager)" in client.post(f"/api/conversations/{cid}/report").json()["report"]["profile"]

    assert client.patch(f"/api/conversations/{cid}", json={"title": "Renamed"}).status_code == 200
    assert client.get(f"/api/conversations/{cid}").json()["conversation"]["title"] == "Renamed"
    assert client.delete(f"/api/conversations/{cid}").status_code == 200
    assert client.get(f"/api/conversations/{cid}").status_code == 404

    client.post("/api/companion/chat", json={"text": "one more"})
    client.delete("/api/conversations")
    assert client.get("/api/conversations").json()["conversations"] == []

    client.post("/api/auth/logout")
    assert client.get("/api/conversations").status_code == 401
