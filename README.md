# AI Meeting Intelligence System

> **Van vergaderingen naar concrete resultaten.**

Klikbaar prototype dat vergaderingen omzet in samenvattingen, besluiten en actiepunten, de voortgang van
actiepunten over meerdere vergaderingen volgt en de volgende vergadering helpt voorbereiden.

Er is **nog geen echte LLM of spraakherkenning** aangesloten. Alle AI-functies lopen via een `MockProvider`
met realistische Nederlandse demodata. De UI praat alleen met de abstracte `AIProvider`-interface, zodat een
echte LLM en Whisper later kunnen worden ingeplugd zonder de UI te wijzigen. Alles werkt offline.

## Vereisten

| Tool    | Versie    |
| ------- | --------- |
| Node.js | 20 of hoger |
| Python  | 3.11 of hoger |

## Installeren en starten

**Windows (PowerShell)**

```powershell
.\start.ps1
```

**macOS / Linux**

```bash
./start.sh
```

Of handmatig (alle platformen):

```bash
npm run setup   # eenmalig: root + frontend-pakketten, backend/.venv + Python-pakketten
npm run dev     # start backend (poort 8000) en frontend (poort 5173) tegelijk
```

Open daarna <http://localhost:5173>. API-documentatie (OpenAPI): <http://localhost:8000/docs>.

Bij de eerste start wordt de database (`backend/data/meetings.db`) automatisch gevuld met demodata.

| Commando        | Wat het doet                                  |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Backend + frontend starten                    |
| `npm run seed`  | Database leegmaken en opnieuw vullen met demodata |
| `npm run test`  | Backend-tests (pytest)                        |
| `npm run build` | Productiebuild van de frontend                |

Configuratie staat in `.env` (zie `.env.example`). Standaard: `AI_PROVIDER=mock`.

## Projectstructuur

```
├── backend/                 FastAPI + SQLModel + SQLite
│   ├── app/
│   │   ├── ai/              AIProvider-interface, MockProvider, stubs (OpenAI, Anthropic, Whisper), JSON-schema's
│   │   ├── routers/         REST-endpoints (prefix /api)
│   │   ├── models.py        Domeinmodel (Project, Doelstelling, Vergadering, Actiepunt, Statuswijziging, …)
│   │   ├── status.py        Statusmodel van actiepunten (overgangsregels)
│   │   ├── processing.py    Verwerkingspijplijn: transcriberen → … → voorbereiding
│   │   ├── services.py      KPI's, voortgang, opbouw van API-objecten
│   │   └── seed.py          Demodata (2 projecten, 4 vergaderingen)
│   └── tests/               pytest
├── frontend/                React + Vite + TypeScript + Tailwind + shadcn/ui
│   └── src/
│       ├── components/      Layout, StatusBadge, gedeelde componenten, shadcn/ui
│       ├── pages/           Schermen
│       ├── hooks/           TanStack Query-hooks
│       └── lib/             API-client, types, statusmetadata, opmaak
├── scripts/                 Platformonafhankelijke start/setup-scripts
├── start.ps1 / start.sh     Eén commando om alles te starten
└── .env.example
```

## Statusmodel actiepunten

| Status              | Weergave                          | Betekenis                                          |
| ------------------- | --------------------------------- | -------------------------------------------------- |
| Voorgesteld         | grijs, gestippelde rand           | Door AI herkend, nog niet bevestigd                |
| Open                | blauw                             | Bevestigde taak                                    |
| Uitgesteld          | oranje + teller ("2×")            | Deadline verschoven                                |
| Gemeld als afgerond | amber + hand-icoon                | Iemand zegt dat het klaar is, nog niet bevestigd   |
| Afgerond            | groen + vinkje                    | Bevestigd door eigenaar of met bewijs              |
| Vervallen           | doorgestreept grijs               | Niet meer relevant                                 |

**Kernregel:** een actiepunt gaat nooit direct van *Gemeld als afgerond* naar *Afgerond* zonder expliciete
gebruikersactie (**Bevestigen** of **Bewijs toevoegen**). De AI mag zelf nooit iets afronden. Afgedwongen in
`backend/app/status.py` en getest in `backend/tests/test_status_model.py`.

Status is nooit alleen aan kleur te herkennen: elke badge heeft een icoon, tekst en een tooltip met uitleg.

## Privacy

Het systeem volgt **taken en projecten, geen personen**: er zijn bewust geen persoonsscores of ranglijsten
(AVG / AI Act). Een upload vereist de bevestiging dat alle deelnemers over de opname zijn geïnformeerd.

## Fasering

- [x] **Fase 1 – Fundament**: backend, modellen, seed-data, MockProvider, API, frontend-skelet, thema, dashboard
- [x] **Fase 2 – Kernschermen**: vergadering detail (transcript, samenvatting, review, bronlinks), actiepunten (tabel + kanban + historiepaneel)
- [x] **Fase 3 – USP-schermen**: vergelijkingsweergave, voorbereiding (vragen + conceptagenda met drag & drop), projectpagina's met voortgangsgrafiek
- [ ] Fase 4 – Upload-wizard, sprekers koppelen, instellingen
- [ ] Fase 5 – Afwerking, README met screenshots, `docs/LLM_INTEGRATIE.md`
