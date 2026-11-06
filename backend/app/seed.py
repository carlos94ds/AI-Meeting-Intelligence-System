"""Seed-script met demodata.

Gebruik:  python -m app.seed            (alleen als de database leeg is)
          python -m app.seed --reset    (database leegmaken en opnieuw vullen)

Alle datums zijn relatief aan vandaag, zodat de demo altijd actueel oogt.
"""

import asyncio
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlmodel import Session, SQLModel, select

from .ai.mock import MockProvider
from .db import engine, init_db
from .dutch import format_date
from .models import (
    ActionItem,
    ActionStatus,
    AgendaItem,
    AppSettings,
    ChangeOrigin,
    Decision,
    Goal,
    Meeting,
    MeetingParticipant,
    Participant,
    Project,
    ProjectParticipant,
    StatusChange,
    SuggestionState,
    SummaryItem,
    SummaryKind,
    TranscriptSegment,
)
from .processing import regenerate_preparation
from .seed_data import CRM_MEETING, MEETING_1, MEETING_2, MEETING_3
from .status import TransitionVia, apply_transition

S = ActionStatus
K = SummaryKind
ACTOR = "Sanne"


@dataclass
class Ctx:
    session: Session
    people: dict[str, Participant]


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def add_meeting(
    ctx: Ctx, project: Project, title: str, when: datetime, duration: int,
    lines: list[tuple[str, str]], placeholders: dict[str, str], attendees: list[str],
) -> tuple[Meeting, list[int]]:
    s = ctx.session
    meeting = Meeting(project_id=project.id, title=title, date=when, duration_minutes=duration,  # type: ignore[arg-type]
                      audio_filename=f"{title.lower().replace(' ', '-')}.m4a", consent_confirmed=True)
    s.add(meeting)
    s.flush()
    for name in attendees:
        s.add(MeetingParticipant(meeting_id=meeting.id, participant_id=ctx.people[name].id))  # type: ignore[arg-type]

    labels: dict[str, str] = {}
    slot = duration * 60 / len(lines)
    ids: list[int] = []
    for pos, (speaker, text) in enumerate(lines):
        labels.setdefault(speaker, f"Spreker {len(labels) + 1}")
        filled = text.format(**placeholders)
        start = pos * slot + (pos * 7 % 11)  # deterministische spreiding
        length = min(slot - 1, max(4.0, len(filled) / 14))
        seg = TranscriptSegment(
            meeting_id=meeting.id, position=pos, speaker_label=labels[speaker],  # type: ignore[arg-type]
            participant_id=ctx.people[speaker].id, start_seconds=round(start, 1),
            end_seconds=round(start + length, 1), text=filled,
        )
        s.add(seg)
        s.flush()
        assert seg.id is not None
        ids.append(seg.id)
    return meeting, ids


def add_summary(s: Session, meeting: Meeting, seg: list[int], entries: list[tuple[SummaryKind, str, int]]) -> None:
    for kind, text, idx in entries:
        s.add(SummaryItem(meeting_id=meeting.id, kind=kind, text=text, source_segment_id=seg[idx]))  # type: ignore[arg-type]


def add_decisions(s: Session, meeting: Meeting, seg: list[int], entries: list[tuple[str, int]]) -> None:
    for text, idx in entries:
        s.add(Decision(meeting_id=meeting.id, text=text, source_segment_id=seg[idx]))  # type: ignore[arg-type]


def meeting_end(m: Meeting, extra_minutes: int = 0) -> datetime:
    return m.date + timedelta(minutes=m.duration_minutes + extra_minutes)


def add_item(
    ctx: Ctx, project: Project, meeting: Meeting, seg: list[int], *, title: str, owner: str | None,
    goal: Goal | None, deadline: date | None, src: int, confidence: float, confirm: bool = True,
    description: str = "",
) -> ActionItem:
    s = ctx.session
    created = meeting_end(meeting)
    item = ActionItem(
        project_id=project.id, meeting_id=meeting.id, goal_id=goal.id if goal else None,  # type: ignore[arg-type]
        title=title, description=description, owner_id=ctx.people[owner].id if owner else None,
        deadline=deadline, original_deadline=deadline, status=S.VOORGESTELD,
        source_segment_id=seg[src], ai_confidence=confidence, created_at=created, updated_at=created,
    )
    s.add(item)
    s.flush()
    s.add(StatusChange(action_item_id=item.id, meeting_id=meeting.id, from_status=None,  # type: ignore[arg-type]
                       to_status=S.VOORGESTELD, origin=ChangeOrigin.AI, state=SuggestionState.ACCEPTED,
                       source_segment_id=seg[src], quote=None, rationale="Door AI herkend in het transcript.",
                       actor="AI", created_at=created, decided_at=created))
    if confirm:
        change = apply_transition(item, S.OPEN, TransitionVia.CONFIRM, actor=ACTOR, meeting_id=meeting.id,
                                  at=meeting_end(meeting, 10), note="Bevestigd tijdens review")
        s.add(change)
    return item


def ai_suggestion(
    ctx: Ctx, item: ActionItem, meeting: Meeting, seg: list[int], *, to: ActionStatus, src: int,
    rationale: str, accept: bool, new_deadline: date | None = None,
) -> None:
    """AI-voorstel; bij accept=True voert de gebruiker het door ("Akkoord")."""
    s = ctx.session
    quote = s.get(TranscriptSegment, seg[src]).text  # type: ignore[union-attr]
    when = meeting_end(meeting, 15)
    if accept:
        via = TransitionVia.CONFIRM if to == S.AFGEROND else TransitionVia.EDIT
        change = apply_transition(item, to, via, actor=ACTOR, meeting_id=meeting.id, source_segment_id=seg[src],
                                  quote=quote, new_deadline=new_deadline, at=when)
        change.origin = ChangeOrigin.AI
        change.rationale = rationale
        change.created_at = meeting_end(meeting)
        s.add(change)
    else:
        s.add(StatusChange(action_item_id=item.id, meeting_id=meeting.id, from_status=item.status,  # type: ignore[arg-type]
                           to_status=to, origin=ChangeOrigin.AI, state=SuggestionState.PENDING,
                           source_segment_id=seg[src], quote=quote, rationale=rationale,
                           new_deadline=new_deadline, actor="AI", created_at=meeting_end(meeting)))
    s.add(item)


def seed(session: Session, today: date | None = None) -> None:
    today = today or date.today()
    s = session
    s.add(AppSettings(id=1))

    people = {
        "Mark": Participant(name="Mark", role="Budget", color="amber"),
        "Lisa": Participant(name="Lisa", role="Ontwerp", color="violet"),
        "Thomas": Participant(name="Thomas", role="Techniek", color="emerald"),
        "Sanne": Participant(name="Sanne", role="Projectleider", color="sky"),
        "Eva": Participant(name="Eva", role="Sales", color="rose"),
        "Joost": Participant(name="Joost", role="IT-beheer", color="teal"),
    }
    s.add_all(people.values())
    s.flush()
    ctx = Ctx(session=s, people=people)

    # ------------------------------------------------------------------ Project 1
    portal = Project(name="Website-vernieuwing Klantportaal",
                     description="Het klantportaal krijgt een nieuw ontwerp en een moderne technische basis.",
                     next_meeting_date=today + timedelta(days=13), created_at=_at(today - timedelta(days=30), 9))
    s.add(portal)
    s.flush()
    for name in ("Mark", "Lisa", "Thomas", "Sanne"):
        s.add(ProjectParticipant(project_id=portal.id, participant_id=people[name].id))  # type: ignore[arg-type]
    g_design = Goal(project_id=portal.id, title="Nieuw ontwerp opgeleverd", position=0,  # type: ignore[arg-type]
                    description="Een getest, klikbaar ontwerp voor de belangrijkste schermen.")
    g_tech = Goal(project_id=portal.id, title="Technische haalbaarheid onderzocht", position=1,  # type: ignore[arg-type]
                  description="Advies over koppelingen, hosting en het framework.")
    g_budget = Goal(project_id=portal.id, title="Budget goedgekeurd", position=2,  # type: ignore[arg-type]
                    description="Begroting inclusief post onvoorzien goedgekeurd door de directie.")
    s.add_all([g_design, g_tech, g_budget])
    s.flush()

    d1, d2, d3 = today + timedelta(days=4), today + timedelta(days=11), today + timedelta(days=18)
    ph = {"D": format_date(d1), "D2": format_date(d2), "D3": format_date(d3)}
    team = ["Mark", "Lisa", "Thomas", "Sanne"]

    # Vergadering 1 – kick-off
    m1, seg1 = add_meeting(ctx, portal, "Kick-off klantportaal", _at(today - timedelta(days=24), 10), 45,
                           MEETING_1, ph, team)
    add_summary(s, m1, seg1, [
        (K.ONDERWERP, "Aanpak, rolverdeling en eerste deadlines van de vernieuwing", 1),
        (K.ONDERWERP, "Aanleiding: het huidige portaal is traag en onoverzichtelijk, vooral op mobiel", 3),
        (K.PROBLEEM, "Het huidige framework krijgt volgend jaar geen ondersteuning meer", 5),
        (K.PROBLEEM, "Zonder goedgekeurd budget kunnen geen externe partijen worden ingehuurd", 8),
        (K.IDEE, "Klikbaar prototype laten testen door vijf klanten", 13),
        (K.AFSPRAAK, "Over twee weken de actiepunten langslopen", 28),
        (K.DEADLINE, f"Budget, ontwerp en technisch advies gereed vóór {ph['D']}", 16),
    ])
    add_decisions(s, m1, seg1, [("Gefaseerde aanpak: eerst het klantportaal, daarna de app.", 25)])
    a_budget = add_item(ctx, portal, m1, seg1, title="Budget controleren en ter goedkeuring voorleggen",
                        owner="Mark", goal=g_budget, deadline=d1, src=10, confidence=0.94,
                        description="Begroting controleren, post onvoorzien (10%) toevoegen en voorleggen aan de directie.")
    a_design = add_item(ctx, portal, m1, seg1, title="Nieuw ontwerp maken met klikbaar prototype",
                        owner="Lisa", goal=g_design, deadline=d1, src=14, confidence=0.92,
                        description="Schermen voor inloggen, overzicht en facturen, plus een klikbaar prototype.")
    a_tech = add_item(ctx, portal, m1, seg1, title="Technische mogelijkheden onderzoeken en advies schrijven",
                      owner="Thomas", goal=g_tech, deadline=d1, src=20, confidence=0.9,
                      description="Hergebruik CRM-koppeling en cloud- versus eigen hosting onderzoeken.")
    a_invite = add_item(ctx, portal, m1, seg1, title="Stakeholders uitnodigen voor de demo",
                        owner="Sanne", goal=g_design, deadline=today - timedelta(days=14), src=27, confidence=0.81)

    # Vergadering 2 – voortgang
    m2, seg2 = add_meeting(ctx, portal, "Voortgangsoverleg 1", _at(today - timedelta(days=10), 14), 40,
                           MEETING_2, ph, team)
    add_summary(s, m2, seg2, [
        (K.ONDERWERP, "Voortgang op budget, ontwerp en techniek", 1),
        (K.ONDERWERP, "Hostingkosten en de gevolgen voor de begroting", 15),
        (K.PROBLEEM, "API-documentatie van de CRM-leverancier ontbreekt nog", 12),
        (K.PROBLEEM, "Afhankelijk van één leverancier voor de documentatie", 18),
        (K.IDEE, "De demo gebruiken om het prototype direct te laten testen", 23),
        (K.AFSPRAAK, "Blokkades direct melden in het projectkanaal", 28),
        (K.DEADLINE, f"Technisch advies verschoven naar {ph['D2']}", 14),
    ])
    add_decisions(s, m2, seg2, [("Tijdens de demo wordt het prototype getest met de stakeholders.", 24)])
    ai_suggestion(ctx, a_budget, m2, seg2, to=S.GEMELD_AFGEROND, src=3, accept=True,
                  rationale="Mark meldt dat de directie het budget heeft goedgekeurd.")
    s.add(apply_transition(a_budget, S.AFGEROND, TransitionVia.EVIDENCE, actor=ACTOR, meeting_id=m2.id,
                           note="Bewijs: bevestigingsmail van de directie", at=meeting_end(m2, 60 * 20)))
    a_budget.evidence_url = "https://intranet.voorbeeld.nl/projecten/klantportaal/budget-goedkeuring.pdf"
    a_budget.evidence_note = "Bevestigingsmail directie, budget € 130.000 incl. onvoorzien"
    ai_suggestion(ctx, a_design, m2, seg2, to=S.GEMELD_AFGEROND, src=7, accept=True,
                  rationale="Lisa meldt dat het ontwerp klaar is. Nog niet bevestigd door de projectleider.")
    ai_suggestion(ctx, a_tech, m2, seg2, to=S.UITGESTELD, src=13, accept=True, new_deadline=d2,
                  rationale=f"Thomas is nog niet klaar en stelt voor de deadline te verschuiven naar {ph['D2']}.")
    ai_suggestion(ctx, a_invite, m2, seg2, to=S.GEMELD_AFGEROND, src=22, accept=True,
                  rationale="Sanne meldt dat de uitnodigingen zijn verstuurd.")
    s.add(apply_transition(a_invite, S.AFGEROND, TransitionVia.CONFIRM, actor=ACTOR, meeting_id=m2.id,
                           note="Eigen actiepunt bevestigd", at=meeting_end(m2, 20)))
    a_call = add_item(ctx, portal, m2, seg2, title="CRM-leverancier bellen en zo nodig escaleren",
                      owner="Thomas", goal=g_tech, deadline=today + timedelta(days=2), src=20, confidence=0.88)
    a_scen = add_item(ctx, portal, m2, seg2, title="Drie testscenario's voorbereiden voor de demo",
                      owner="Lisa", goal=g_design, deadline=today - timedelta(days=3), src=26, confidence=0.9)

    # Vergadering 3 – opnieuw uitgesteld (meest recente; deels nog te beoordelen)
    m3, seg3 = add_meeting(ctx, portal, "Voortgangsoverleg 2", _at(today - timedelta(days=1), 9, 30), 50,
                           MEETING_3, ph, team)
    add_summary(s, m3, seg3, [
        (K.ONDERWERP, "Technische haalbaarheid van de CRM-koppeling", 1),
        (K.ONDERWERP, "Voorbereiding van de demo", 1),
        (K.PROBLEEM, "De CRM-API werkt anders dan verwacht; bestaande koppeling waarschijnlijk niet herbruikbaar", 10),
        (K.PROBLEEM, "De demo moet mogelijk zonder werkende koppeling", 18),
        (K.IDEE, "In de demo met testdata werken om de flow te laten zien", 19),
        (K.AFSPRAAK, "Thomas meldt direct in het projectkanaal als hij opnieuw vastloopt", 29),
        (K.DEADLINE, f"Technisch advies opnieuw verschoven naar {ph['D3']}", 27),
    ])
    add_decisions(s, m3, seg3, [
        ("De demo gebruikt testdata; de echte koppeling volgt na het technisch advies.", 20),
        ("Een externe API-specialist inhuren valt binnen de post onvoorzien.", 17),
    ])
    ai_suggestion(ctx, a_scen, m3, seg3, to=S.GEMELD_AFGEROND, src=3, accept=True,
                  rationale="Lisa meldt dat de testscenario's klaarstaan.")
    s.add(apply_transition(a_scen, S.AFGEROND, TransitionVia.CONFIRM, actor=ACTOR, meeting_id=m3.id,
                           source_segment_id=seg3[4], quote=s.get(TranscriptSegment, seg3[4]).text,  # type: ignore[union-attr]
                           note="Bevestigd tijdens de vergadering", at=meeting_end(m3, 16)))
    ai_suggestion(ctx, a_tech, m3, seg3, to=S.UITGESTELD, src=12, accept=True, new_deadline=d3,
                  rationale=f"Thomas is opnieuw niet klaar; deadline verschuift naar {ph['D3']}. Dit is de tweede keer.")
    ai_suggestion(ctx, a_design, m3, seg3, to=S.AFGEROND, src=6, accept=False,
                  rationale="Lisa herhaalt dat het ontwerp klaarstaat. Het formele akkoord ontbreekt nog: "
                            "bevestig of voeg bewijs toe.")
    ai_suggestion(ctx, a_call, m3, seg3, to=S.GEMELD_AFGEROND, src=9, accept=False,
                  rationale="Thomas meldt dat de leverancier is gebeld en de documentatie binnen is.")
    # Nieuwe, nog te reviewen actiepunten (status Voorgesteld)
    add_item(ctx, portal, m3, seg3, title="Offerte opvragen bij een externe API-specialist", owner="Thomas",
             goal=g_tech, deadline=None, src=21, confidence=0.88, confirm=False)
    add_item(ctx, portal, m3, seg3, title="Toegankelijkheidsscan uitvoeren op het nieuwe ontwerp", owner=None,
             goal=g_design, deadline=None, src=24, confidence=0.62, confirm=False)
    add_item(ctx, portal, m3, seg3, title="Demo inhoudelijk voorbereiden met testdata", owner="Sanne",
             goal=g_design, deadline=today + timedelta(days=12), src=26, confidence=0.8, confirm=False)
    add_item(ctx, portal, m3, seg3, title="Begroting bijwerken na ontvangst van de offerte", owner="Mark",
             goal=g_budget, deadline=None, src=23, confidence=0.71, confirm=False)

    for pos, (title, minutes) in enumerate([
        ("Opening en stand van de actiepunten", 5),
        ("Technisch advies: blokkades en externe specialist", 15),
        ("Ontwerp: formeel akkoord", 10),
        ("Begroting en planning richting demo", 10),
        ("Rondvraag", 5),
    ]):
        s.add(AgendaItem(project_id=portal.id, title=title, duration_minutes=minutes, position=pos))  # type: ignore[arg-type]

    # ------------------------------------------------------------------ Project 2
    crm = Project(name="Introductie nieuw CRM-systeem",
                  description="Overstap naar een nieuw CRM, inclusief datamigratie en training van het salesteam.",
                  next_meeting_date=today + timedelta(days=6), created_at=_at(today - timedelta(days=20), 9))
    s.add(crm)
    s.flush()
    for name in ("Eva", "Joost", "Sanne"):
        s.add(ProjectParticipant(project_id=crm.id, participant_id=people[name].id))  # type: ignore[arg-type]
    g_train = Goal(project_id=crm.id, title="Medewerkers getraind", position=0)  # type: ignore[arg-type]
    g_data = Goal(project_id=crm.id, title="Klantdata gemigreerd", position=1)  # type: ignore[arg-type]
    s.add_all([g_train, g_data])
    s.flush()
    c1, segc = add_meeting(ctx, crm, "Startoverleg CRM-introductie", _at(today - timedelta(days=14), 13), 35,
                           CRM_MEETING, {}, ["Eva", "Joost", "Sanne"])
    add_summary(s, c1, segc, [
        (K.ONDERWERP, "Planning van de migratie en de trainingen", 1),
        (K.PROBLEEM, "Klantdata bevat veel dubbele en verouderde records", 5),
        (K.PROBLEEM, "Zorgen over een overstap midden in het kwartaal", 3),
        (K.IDEE, "Eerst een testmigratie met een klein deel van de data", 12),
        (K.AFSPRAAK, "Over drie weken de resultaten van de testmigratie bespreken", 20),
    ])
    add_decisions(s, c1, segc, [("Eerst een testmigratie met tien procent van de klantdata.", 13)])
    b_clean = add_item(ctx, crm, c1, segc, title="Klantdata opschonen vóór de migratie", owner="Joost",
                       goal=g_data, deadline=today - timedelta(days=5), src=7, confidence=0.93)
    b_train = add_item(ctx, crm, c1, segc, title="Trainingsplanning opstellen voor het salesteam", owner="Eva",
                       goal=g_train, deadline=today, src=10, confidence=0.91)
    s.add(apply_transition(b_train, S.AFGEROND, TransitionVia.EVIDENCE, actor="Sanne",
                           note="Bewijs: planning gedeeld in Teams", at=_at(today - timedelta(days=1), 16)))
    b_train.evidence_url = "https://intranet.voorbeeld.nl/crm/trainingsplanning.xlsx"
    add_item(ctx, crm, c1, segc, title="Testmigratie uitvoeren (10% van de klantdata)", owner="Joost",
             goal=g_data, deadline=today + timedelta(days=10), src=14, confidence=0.87)
    b_manual = add_item(ctx, crm, c1, segc, title="Handleiding van het oude systeem bijwerken", owner="Eva",
                        goal=g_train, deadline=today + timedelta(days=3), src=16, confidence=0.76)
    s.add(apply_transition(b_manual, S.VERVALLEN, TransitionVia.EDIT, actor="Sanne",
                           note="Oude systeem wordt eerder uitgezet; handleiding niet meer nodig",
                           at=_at(today - timedelta(days=5), 11)))
    for pos, (title, minutes) in enumerate([
        ("Resultaten testmigratie", 15), ("Status opschonen klantdata", 10), ("Trainingen: planning en locatie", 10),
    ]):
        s.add(AgendaItem(project_id=crm.id, title=title, duration_minutes=minutes, position=pos))  # type: ignore[arg-type]
    for item in (b_clean, b_train, b_manual, a_budget, a_design, a_tech, a_invite, a_call, a_scen):
        s.add(item)
    s.commit()

    # Voorbereidingsvragen via de MockProvider (zelfde logica als na een upload)
    provider = MockProvider(delay_seconds=0, today=today)
    for project in (portal, crm):
        asyncio.run(regenerate_preparation(s, project.id, provider))  # type: ignore[arg-type]


def reset_database() -> None:
    SQLModel.metadata.drop_all(engine)
    init_db()


def seed_if_empty() -> bool:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Project)).first() is not None:
            return False
        seed(session)
        return True


def main() -> None:
    if "--reset" in sys.argv:
        reset_database()
        with Session(engine) as session:
            seed(session)
        print("Database opnieuw gevuld met demodata.")
    elif seed_if_empty():
        print("Database gevuld met demodata.")
    else:
        print("Database bevat al data. Gebruik --reset om opnieuw te beginnen.")


if __name__ == "__main__":
    main()
