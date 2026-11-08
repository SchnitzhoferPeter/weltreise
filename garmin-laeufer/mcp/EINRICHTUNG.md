# Garmin-Daten in Claude Desktop (MCP)

Damit kann Claude deine Garmin-Connect-Daten lesen: Läufe, Splits, Zeit in HF-Zonen, Trainingszustand, Belastung, VO2max, HRV, Schlaf, Body Battery und Wettkampfprognosen.

**Server:** [Taxuspt/garmin_mcp](https://github.com/Taxuspt/garmin_mcp) (MIT-Lizenz, Community-Projekt).
**Sicherheit:** Die Konfiguration ist **nur lesend**: von 155 Werkzeugen sind nur Lesewerkzeuge freigeschaltet, Löschen und Ändern ist aus.
Die Version ist auf einen geprüften Stand fixiert (Commit `a2ca5fc`, 20.10.2026).

## 1. `uv` installieren (einmalig)

- **macOS:** `brew install uv` (oder `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Windows:** `winget install --id=astral-sh.uv -e`

Danach ein neues Terminal öffnen und prüfen: `uvx --version`

## 2. Bei Garmin anmelden (einmalig, im Terminal)

```bash
uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@a2ca5fcac34524b83814fe2fcf3d479f8a75983f garmin-mcp-auth
```

E-Mail, Passwort und ggf. den 2FA-Code eingeben. Das Passwort wird **nicht** gespeichert, nur ein Anmelde-Token in `~/.garminconnect` (nur für deinen Benutzer lesbar).
Das Token gilt etwa 6 Monate, danach diesen Schritt wiederholen.

## 3. Claude Desktop konfigurieren

Claude Desktop → Einstellungen → Entwickler → **Konfiguration bearbeiten**. Das öffnet:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Den Block `"garmin"` aus [`claude_desktop_config.json`](claude_desktop_config.json) unter `"mcpServers"` einfügen. Stehen dort schon andere Server, nur den `"garmin": {…}`-Eintrag ergänzen (Komma beachten).

Claude Desktop **komplett beenden und neu starten**. Unter dem Werkzeug-Symbol erscheint dann „garmin“.

## 4. Ausprobieren

- „Wie lief meine Trainingswoche? Umfang, lockere vs. harte Kilometer, Zeit in Zone 2.“
- „Analysiere meinen letzten Long Run: Splits, Pace-Abfall, HF-Drift.“
- „Was sagt Garmin zu meiner Marathon-Prognose und wie hat sie sich seit September entwickelt?“
- „Wie ist meine Erholung heute (HRV, Schlaf, Body Battery)? Hartes Training oder locker?“

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „garmin“ taucht nicht auf | In der Konfiguration statt `uvx` den vollen Pfad eintragen (`which uvx` bzw. `where uvx`) |
| Anmeldefehler | Schritt 2 wiederholen, Token abgelaufen |
| „Too many requests“ | Garmin bremst kurzzeitig, einige Minuten warten |

## Später erweitern

Soll Claude auch Trainings planen und direkt auf die Uhr schicken (z. B. Intervalle), in `GARMIN_ENABLED_TOOLS` ergänzen:
`create_run_workout,create_run_interval_workout,upload_workout,schedule_workout`.
Das sind Schreibzugriffe auf dein Garmin-Konto, Claude Desktop fragt vor jedem Aufruf nach.

## Hinweis

Der Server nutzt die inoffizielle Garmin-Connect-Schnittstelle (Bibliothek `garminconnect`). Garmin kann sie jederzeit ändern. Dann ein neueres Server-Release prüfen und den Commit in der Konfiguration anpassen.
