# Weltreise · Costa Deliziosa 2026/27

Eine einzelne HTML-Seite, die die 141-tägige Weltkreuzfahrt von Civitavecchia nach
Civitavecchia (24. Nov 2026 – 13. Apr 2027) verfolgbar macht – für die Familie zuhause
und für die Reisende an Bord.

Öffnen: `index.html` (lokal per Doppelklick oder als GitHub Page).
Kein Build, keine Abhängigkeiten außer Leaflet (Karte) und Open-Meteo (Wetter).

## Gestaltung

Helles Logbuch: warmes Papier, Marineblau, Messing als Akzent, Petrol für alles Live.
Grundschrift 17 px, kleinste Schrift 13 px, Kontrast mindestens 6:1.
Der Entwurf liegt als Design-Canvas vor: https://claude.ai/code/artifact/2898c283-720b-4994-99d8-72279c40eabf

## Was die Seite zeigt

**Bordkarte (Livestatus, rechts oben)**
- Status: im Hafen, auf See, vor der Reise oder angekommen
- Bordzeit an der Schiffsposition (Zeitzone der Position, sonst nautische Zonenzeit)
- Position, Fahrt über Grund, Kurs, Wetter am Schiff, Seegang und Wassertemperatur
  (mit Einordnung: badewarm, angenehm, frisch, kalt)
- Nächster Hafen mit geplanter Ankunft, Distanz in Seemeilen und **erwarteter Ankunft**
  (aus Position und Geschwindigkeit gerechnet, mit Abweichung zum Fahrplan)
- Ankunftszeit zusätzlich in Wiener Zeit – praktisch für Anrufe
- Hinweis, ob an Bord gerade eine gute Zeit für einen Anruf ist
- Fortschritt in Reisetagen und Seemeilen

**Route**
- Alle 53 Anläufe mit Liegezeiten, Seetagen und aktueller Ortszeit je Hafen
- Karte mit Gesamtroute, bereits gefahrener Strecke und Schiffssymbol (Kurs gedreht)
- Tagesband über alle 141 Tage: Hafentage, Seetage, heute
- Suche nach Hafen oder Land, Filter „Seetage“ und „ab heute“

**Je Station**
- Bild aus Wikipedia, Kurzbeschreibung, Sehenswürdigkeiten
- Datum, Liegezeit, Dauer an Land, Ortszeit, Zeitunterschied zu Wien, Distanz zum Schiff
- Wetter vor Ort jetzt (inkl. Sonnenauf- und -untergang, Wassertemperatur) sowie Vorhersage
  für den Anlauftag, sobald er in der 16-Tage-Vorhersage liegt; Wassertemperatur am Anlauftag,
  sobald er in der 7-Tage-Marinevorhersage liegt
- Ankunftsprognose, wenn es der nächste Hafen ist
- Notizfeld je Hafen (bleibt im jeweiligen Browser)
- Links zu Google Maps, Wikipedia, Windy und ein kopierbarer Direktlink

**Landausflüge**
- Je Hafen Ausflüge mit Uhrzeit, Dauer, Treffpunkt und Hinweisen erfassen
- Erscheinen in der Routenliste, in der Bordkarte (heute bzw. nächster Hafen) und im Kalenderexport
- Gemeinsame Liste über `data/ausfluege.json` (Vorlage: `data/ausfluege.example.json`),
  eigene Einträge bleiben im Browser; „Ausflüge als JSON“ kopiert sie zum Teilen

**Wetterwarnungen**
- Regelbasiert aus Open-Meteo: Böen, Gewitter und Seegang der nächsten 48 Std. an der
  Schiffsposition sowie Böen, Unwetter, Hitze und hohe Regenwahrscheinlichkeit am Anlauftag
  der nächsten drei Häfen (soweit in der 16-Tage-Vorhersage)
- Keine amtlichen Warnungen – als Hinweis gedacht, nicht als Ersatz für das Bordprogramm

**Zeitumstellungen an Bord**
- Aus den Zeitzonen der Häfen berechnet, inkl. Datumsgrenze im Pazifik
- Als Zeile in der Routenliste, als Kachel „Nächste Zeitumstellung“ und als Gesamtliste
- Costa nennt die genaue Nacht im Bordprogramm; die Seite zeigt Richtung und Umfang

**Die Reise in Zahlen**
- Laufende Bilanz: Seemeilen, Häfen, Länder, Reisetage, Zeitzonen, Umstellungen,
  Äquatorüberquerungen, längste Etappe, längste Liegezeit, nördlichster und südlichster Hafen
- Zum Reiseende die Abschlussstatistik

**Sonstiges**
- `Kalender .ics`: alle Anläufe als Kalenderdatei für Outlook, iOS oder Android
- Als App installierbar (Web-Manifest + Service Worker), startet auch bei schwachem
  Schiffs-WLAN; Wetter- und Positionsdaten werden zwischengespeichert
- Direktlinks je Hafen (`index.html#hafen-21`)

## Woher kommt die Schiffsposition?

aisstream.io erlaubt keine Verbindungen direkt aus dem Browser. Deshalb holt ein Job im
Repository die Position serverseitig und die Seite liest nur noch das Ergebnis:

1. **AIS-Abgleich über GitHub Action** (`.github/workflows/position.yml`, Skript
   `scripts/fetch-position.mjs`): läuft alle 10 Minuten, lauscht bis 4 Minuten auf eine
   Positionsmeldung der MMSI 247282900 und schreibt `position.json` und `status.json` auf den
   Branch `position-data`. Die Seite liest beide von `raw.githubusercontent.com`.
   Voraussetzung: das Repository-Secret **`AISSTREAM_KEY`** (Settings → Secrets and variables →
   Actions). Der Job lässt sich unter „Actions“ auch von Hand starten.
   Meldungen älter als 18 Stunden gelten nicht mehr als aktuelle Position; die Seite zeigt sie
   aber weiterhin als „Letzte AIS-Meldung vor …“ (vor der Reise als Schiffsposition, unterwegs als
   Marke „zuletzt gesehen“). `status.json` zeigt, wann zuletzt geprüft wurde und ob das Schiff in
   Reichweite einer Landstation war. Der Job kennt einen Diagnosemodus (Eingabe „diag“ beim
   manuellen Start), der alle Schiffe im Mittelmeer zählt und prüft, ob die Deliziosa darunter ist.
2. **Manuell eingetragene Position** – im Dialog **Positionsquelle** eintippen, gilt nur im
   eigenen Browser. „Position als JSON kopieren“ liefert den Inhalt für eine Notlösung über
   `data/position.json` im Repository.
3. **Fahrplan-Schätzung** – Großkreis zwischen den beiden Häfen, zeitlich interpoliert.
   Immer verfügbar, deutlich als Schätzung gekennzeichnet.

Terrestrisches AIS erreicht das Schiff in Häfen und bis etwa 40 sm vor der Küste. Auf hoher See
bleibt es bei der Schätzung; dafür bräuchte es ein bezahltes Satelliten-AIS-Abo, das der Job
ebenso einlesen könnte.

## Gemeinsame Notizen und Landausflüge

Notizen und selbst eingetragene Landausflüge liegen zuerst im Browser. Ist in `data/sync.json`
die Adresse einer Firebase Realtime Database hinterlegt (Vorlage: `data/sync.example.json`),
teilt die Seite sie mit allen: eigene Änderungen werden sofort hochgeladen, fremde jede Minute
und beim Zurückkehren zur Seite abgeholt; der jüngere Stand gewinnt. Jeder Eintrag trägt den
Namen aus dem Feld „Dein Name“.

Einrichtung (einmalig, kostenlos): Firebase-Projekt anlegen → Realtime Database erstellen →
Regeln auf `".read": true, ".write": true` setzen → die Datenbank-URL plus `/weltreise` in
`data/sync.json` eintragen. Die Adresse ist im Repository öffentlich; wer sie kennt, kann
mitschreiben. Für eine Familienseite ist das vertretbar, für mehr braucht es Anmeldung.

## Routenänderungen

- **24. Aug. 2026 (Costa über e-hoi):** Der Anlauf Cristóbal/Colón am 19.12. entfällt. Stattdessen
  Durchfahrt Panamakanal 08:00–19:00, anschließend Panama-Stadt mit Ankunft 21:00, Übernachtung
  und Abfahrt am 20.12. um 19:00. Der 21.12. bleibt Seetag, Puntarenas am 22.12. unverändert.
  Die Durchfahrt ist in den Daten mit `transit:true` markiert und zählt nicht als Anlauf.

## Daten pflegen

Fahrplan und Hafeninhalte stehen in `index.html` im Array `CALLS`:

```js
{n:"Suva", tz:"Pacific/Fiji", c:"Fidschi", r:"Südsee", lat:-18.141, lon:178.442,
 d1:61, d2:61, arr:"08:00", dep:"18:00",
 w:"Suva",                       // Wikipedia-Titel für das Bild
 t:"Kurzbeschreibung …",
 h:["Sehenswürdigkeit 1", "…"],
 note:"optionaler Hinweis"}      // optional
```

`arr`/`dep` sind **Ortszeiten**; `tz` ist die IANA-Zeitzone und wird für alle
Uhrzeiten- und Prognoserechnungen gebraucht. `d1`/`d2` sind Reisetage (Tag 1 = 24. Nov 2026).

Quellen: Kartenkacheln Esri World Ocean (Ersatz: OpenStreetMap), Wetter [Open-Meteo](https://open-meteo.com),
Bilder Wikipedia/Wikimedia Commons, Schiffsdaten Costa Deliziosa (IMO 9398917, MMSI 247282900).

## Ideen für später

- Foto- und Postkartengalerie je Hafen (Bilder aus SharePoint oder OneDrive einbetten)
- Push-Nachricht oder E-Mail, sobald das Schiff einen Hafen erreicht oder verlässt
- Kostenübersicht je Hafen (Landausflüge, Taxi, Souvenirs)
- Bordprogramm-PDF je Tag hinterlegen
- Gemeinsames Gästebuch: Nachrichten der Familie, die an Bord lesbar sind
