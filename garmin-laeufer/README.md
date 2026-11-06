# Läufer-Cockpit: Connect-IQ-Datenfeld für Garmin

Ein Vollbild-Datenfeld für die Lauf-App der Uhr. Alles Wichtige auf einer Seite:

![Vorschau](docs/vorschau.png)

*Nachbau des Layouts mit Beispielwerten, kein Simulator-Screenshot.*

| Bereich | Inhalt |
|---|---|
| Bogen oben | Herzfrequenzzone 1–5, Zonen kommen aus dem Garmin-Benutzerprofil (Laufen) |
| Oben | Aktuelle Herzfrequenz in Zonenfarbe |
| Mitte, groß | Aktuelle Pace, über 10 s geglättet, farbig nach Zielpace oder HF-Zielzone (siehe unten) |
| Unten | Distanz, Zeit, Ø-Pace **oder** Zielzeit-Prognose, Kadenz (Schritte/min) |

Ist das Feld auf einer Seite mit mehreren Feldern, zeigt es nur die Pace.
km/mi richten sich nach den Einheiten der Uhr.

## Zwei Zielmodi

| Modus | Wofür | Grün | Rot | Blau |
|---|---|---|---|---|
| **Nach Zielpace** | Tempoläufe, Wettkampf | Pace im Toleranzband | zu langsam | zu schnell |
| **Nach HF-Zielzone** | Lockere Läufe, Long Run | HF in der Zielzone | Zone zu hoch | Zone zu niedrig |

Im HF-Modus ist die Zielzone im Bogen oben dünn in ihrer Farbe markiert.

## Zielzeit-Prognose

Rechnet die bisherige Durchschnittsgeschwindigkeit (ohne Pausen) auf die Wettkampfdistanz hoch, z. B. `3h29`.
Erscheint ab 500 m. Ist eine Zielpace gesetzt, steht sie grün, wenn die Zielzeit (Zielpace × Distanz) erreicht wird, sonst rot.

## Einstellungen (Connect-IQ-App am Handy)

- **Farbsteuerung der Pace**: Nach Zielpace / Nach HF-Zielzone.
- **Zielpace**: `m:ss`, z. B. `5:00`. `0:00` schaltet die Farbsteuerung aus.
- **Toleranz**: Sekunden um die Zielpace, die noch als „im Ziel“ gelten (Standard 10).
- **HF-Zielzone**: Zone 1–5 (Standard Zone 2).
- **Feld unten links**: Ø-Pace oder Zielzeit-Prognose.
- **Wettkampfdistanz**: Marathon, Halbmarathon, 10 km, 5 km.

**Tipp fürs Marathontraining:** Für lockere Läufe den HF-Modus mit Zone 2 einstellen. Für Tempoläufe und den Renntag den Pace-Modus mit Marathon-Zielpace wählen und unten links die Prognose anzeigen.

## Bauen und aufs Gerät bringen

1. [Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/) und die VS-Code-Erweiterung „Monkey C“ installieren, Developer Key erzeugen (`Monkey C: Generate a Developer Key`).
2. Ordner `garmin-laeufer` in VS Code öffnen.
3. Testen: `Monkey C: Run` startet den Simulator. Unter *Simulation → Activity Data* lässt sich ein Lauf abspielen.
4. Aufs Gerät: `Monkey C: Build for Device` und das Gerät wählen. Die erzeugte `.prg` per USB nach `GARMIN/APPS/` kopieren.
5. Auf der Uhr: Laufen → Einstellungen → Datenseiten → Seite mit **1 Feld** anlegen → Connect IQ → *Läufer-Cockpit*.

Weitere Uhren lassen sich in `manifest.xml` ergänzen (VS Code: `Monkey C: Edit Products`).

## Aufbau

- `source/LaeuferApp.mc`: App-Einstieg, lädt die Einstellungen neu.
- `source/LaeuferView.mc`: Berechnung (`compute`, 1×/s) und Zeichnen (`onUpdate`).
- `resources/settings/`: Zielpace und Toleranz.
