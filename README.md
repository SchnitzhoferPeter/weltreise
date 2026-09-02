# Weltreise · Costa Deliziosa 2026/27

Eine einzelne HTML-Seite, die die 141-tägige Weltkreuzfahrt von Civitavecchia nach
Civitavecchia (24. Nov 2026 – 13. Apr 2027) verfolgbar macht – für die Familie zuhause
und für die Reisende an Bord.

Öffnen: `index.html` (lokal per Doppelklick oder als GitHub Page).
Kein Build, keine Abhängigkeiten außer Leaflet (Karte) und Open-Meteo (Wetter).

## Was die Seite zeigt

**Bordkarte (Livestatus, rechts oben)**
- Status: im Hafen, auf See, vor der Reise oder angekommen
- Bordzeit an der Schiffsposition (Zeitzone der Position, sonst nautische Zonenzeit)
- Position, Fahrt über Grund, Kurs, Wetter am Schiff, Seegang und Wassertemperatur
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
- Wetter vor Ort jetzt (inkl. Sonnenauf- und -untergang) sowie Vorhersage für den
  Anlauftag, sobald er in der 16-Tage-Vorhersage liegt
- Ankunftsprognose, wenn es der nächste Hafen ist
- Notizfeld je Hafen (bleibt im jeweiligen Browser)
- Links zu Google Maps, Wikipedia, Windy und ein kopierbarer Direktlink

**Sonstiges**
- `Kalender .ics`: alle Anläufe als Kalenderdatei für Outlook, iOS oder Android
- Als App installierbar (Web-Manifest + Service Worker), startet auch bei schwachem
  Schiffs-WLAN; Wetter- und Positionsdaten werden zwischengespeichert
- Direktlinks je Hafen (`index.html#hafen-21`)

## Woher kommt die Schiffsposition?

Über den Knopf **Positionsquelle** einstellbar, Reihenfolge im Automatikmodus:

1. **`data/position.json`** – die gemeinsame Quelle. Wer die Position bei
   [VesselFinder](https://www.vesselfinder.com/vessels/details/9398917) abliest, trägt sie
   dort ein (Vorlage: `data/position.example.json`), committet – und alle sehen dasselbe.
   Meldungen älter als 18 Stunden werden ignoriert.
2. **AIS live über [aisstream.io](https://aisstream.io)** – kostenloser API-Key, der nur im
   Browser gespeichert wird (`localStorage`). AIS über Landstationen erreicht das Schiff nur
   in Küstennähe; mitten im Pazifik gibt es keine Meldung.
3. **Manuell eingetragene Position** – im Dialog eintippen, gilt nur im eigenen Browser.
   Der Knopf „Position als JSON kopieren“ liefert direkt den Inhalt für Punkt 1.
4. **Fahrplan-Schätzung** – Großkreis zwischen den beiden Häfen, zeitlich interpoliert.
   Immer verfügbar, deutlich als Schätzung gekennzeichnet (gedämpfter Punkt, brauner Pfeil).

Ein echtes VesselFinder- oder MarineTraffic-API-Abo lässt sich ergänzen, indem ein
Server-Job `data/position.json` schreibt – die Seite selbst muss dafür nicht geändert werden.

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

Quellen: Kartenkacheln OpenStreetMap/CARTO, Wetter [Open-Meteo](https://open-meteo.com),
Bilder Wikipedia/Wikimedia Commons, Schiffsdaten Costa Deliziosa (IMO 9398917, MMSI 247282900).

## Ideen für später

- Foto- und Postkartengalerie je Hafen (Bilder aus SharePoint oder OneDrive einbetten)
- Landausflüge und Reservierungen je Hafen erfassen, inkl. Treffpunkt und Uhrzeit
- Push-Nachricht oder E-Mail, sobald das Schiff einen Hafen erreicht oder verlässt
- Zeitumstellungen an Bord als eigene Liste (wann wird die Uhr vor- oder zurückgestellt)
- Kostenübersicht je Hafen (Landausflüge, Taxi, Souvenirs)
- Wetterwarnungen auf der Route (Zyklonsaison Südpazifik, Kap Agulhas)
- Bordprogramm-PDF je Tag hinterlegen
- Gemeinsames Gästebuch: Nachrichten der Familie, die an Bord lesbar sind
- Statistik am Ende: gefahrene Seemeilen, Länder, Zeitzonen, wärmster und kältester Tag
