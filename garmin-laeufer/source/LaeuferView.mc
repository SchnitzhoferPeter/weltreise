import Toybox.Activity;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.UserProfile;
import Toybox.WatchUi;

//! Vollbild-Datenfeld für Läufer:
//!  - Herzfrequenz mit Zonen-Bogen (Zonen aus dem Garmin-Benutzerprofil)
//!  - geglättete aktuelle Pace (10 s), farbig gegen Zielpace ODER Ziel-HF-Zone
//!  - Distanz, Zeit, Ø-Pace bzw. Zielzeit-Prognose, Kadenz
class LaeuferView extends WatchUi.DataField {

    const BUF_SIZE = 10;
    const ZONE_COLORS = [
        Graphics.COLOR_LT_GRAY,  // Z1
        Graphics.COLOR_BLUE,     // Z2
        Graphics.COLOR_GREEN,    // Z3
        Graphics.COLOR_ORANGE,   // Z4
        Graphics.COLOR_RED       // Z5
    ];

    hidden var _speedBuf as Array<Float>;
    hidden var _bufIdx as Number = 0;
    hidden var _bufCount as Number = 0;

    hidden var _pace as Float? = null;      // Sekunden pro Einheit
    hidden var _avgPace as Float? = null;
    hidden var _hr as Number? = null;
    hidden var _cadence as Number? = null;
    hidden var _distance as Float? = null;  // Meter
    hidden var _timer as Number? = null;    // Millisekunden

    hidden var _zones as Array<Number>?;
    hidden var _targetPace as Number = 0;   // Sekunden pro Einheit, 0 = aus
    hidden var _tolerance as Number = 10;
    hidden var _targetMode as Number = 0;   // 0 = Zielpace, 1 = Ziel-HF-Zone
    hidden var _targetZone as Number = 2;
    hidden var _raceDist as Number = 42195; // Meter
    hidden var _bottomLeft as Number = 0;   // 0 = Ø-Pace, 1 = Prognose
    hidden var _forecast as Number? = null; // Millisekunden

    function initialize() {
        DataField.initialize();
        _speedBuf = new Array<Float>[BUF_SIZE];
        for (var i = 0; i < BUF_SIZE; i++) {
            _speedBuf[i] = 0.0;
        }
        _zones = UserProfile.getHeartRateZones(UserProfile.HR_ZONE_SPORT_RUNNING);
        loadSettings();
    }

    function loadSettings() as Void {
        _targetPace = parsePace(Application.Properties.getValue("targetPace"));
        _tolerance = numProp("paceTolerance", 10);
        _targetMode = numProp("targetMode", 0);
        _targetZone = numProp("targetZone", 2);
        _raceDist = numProp("raceDistance", 42195);
        _bottomLeft = numProp("bottomLeft", 0);
        if (_targetZone < 1 || _targetZone > 5) {
            _targetZone = 2;
        }
        if (_raceDist <= 0) {
            _raceDist = 42195;
        }
    }

    hidden function numProp(key as String, dflt as Number) as Number {
        var v = Application.Properties.getValue(key);
        return (v instanceof Number) ? v : dflt;
    }

    // ---------------------------------------------------------------- Daten

    function compute(info as Activity.Info) as Void {
        var unit = paceUnitMeters();

        var spd = info.currentSpeed;
        if (spd != null) {
            _speedBuf[_bufIdx] = spd.toFloat();
            _bufIdx = (_bufIdx + 1) % BUF_SIZE;
            if (_bufCount < BUF_SIZE) {
                _bufCount++;
            }
        }
        var sum = 0.0;
        for (var i = 0; i < _bufCount; i++) {
            sum += _speedBuf[i];
        }
        var avg = (_bufCount > 0) ? sum / _bufCount : 0.0;
        _pace = (avg > 0.5) ? unit / avg : null;   // unter 1,8 km/h: keine Pace

        var avgSpd = info.averageSpeed;
        _avgPace = (avgSpd != null && avgSpd > 0.5) ? unit / avgSpd : null;

        _hr = info.currentHeartRate;
        _cadence = info.currentCadence;
        _distance = info.elapsedDistance;
        _timer = info.timerTime;

        // Prognose: bisherige Ø-Geschwindigkeit auf die Wettkampfdistanz hochgerechnet
        var d = _distance;
        var t = _timer;
        if (d != null && t != null && d >= 500 && t > 0) {
            _forecast = (d >= _raceDist) ? t : (t.toFloat() * _raceDist / d).toNumber();
        } else {
            _forecast = null;
        }
    }

    // ---------------------------------------------------------------- Anzeige

    function onUpdate(dc as Graphics.Dc) as Void {
        var bg = getBackgroundColor();
        var fg = (bg == Graphics.COLOR_BLACK) ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        dc.setColor(fg, bg);
        dc.clear();

        var screenH = System.getDeviceSettings().screenHeight;
        if (dc.getHeight() < screenH * 0.6) {
            drawCompact(dc, fg);
        } else {
            drawFull(dc, fg);
        }
    }

    //! Layout, wenn das Feld nur einen Teil des Bildschirms bekommt
    hidden function drawCompact(dc as Graphics.Dc, fg as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.18, Graphics.FONT_XTINY, "PACE", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(targetColor(fg), Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.6, Graphics.FONT_NUMBER_MEDIUM, fmtPace(_pace), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    hidden function drawFull(dc as Graphics.Dc, fg as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        var zone = hrZone();
        var round = System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND;

        // Herzfrequenz-Zonenbogen oben (nur runde Displays)
        if (round) {
            drawZoneArc(dc, cx, h / 2, (w < h ? w : h) / 2 - 7, zone);
        } else if (zone > 0) {
            dc.setColor(ZONE_COLORS[zone - 1] as Number, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(0, 0, w, 6);
        }

        // Herzfrequenz
        var hrColor = (zone > 0) ? ZONE_COLORS[zone - 1] as Number : fg;
        dc.setColor(hrColor, Graphics.COLOR_TRANSPARENT);
        var hrText = (_hr != null) ? _hr.format("%d") : "--";
        dc.drawText(cx, h * 0.17, Graphics.FONT_NUMBER_MILD, hrText, center);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.27, Graphics.FONT_XTINY, (zone > 0) ? "HF  Z" + zone : "HF", center);

        // Aktuelle Pace (groß)
        dc.setColor(targetColor(fg), Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.42, Graphics.FONT_NUMBER_HOT, fmtPace(_pace), center);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.545, Graphics.FONT_XTINY, paceLabel(), center);

        // Trennlinien
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(0, h * 0.6, w, h * 0.6);
        dc.drawLine(cx, h * 0.6, cx, h);
        dc.drawLine(0, h * 0.79, w, h * 0.79);

        // Distanz | Zeit
        drawCell(dc, w * 0.29, h * 0.665, fmtDist(_distance), distLabel(), fg);
        drawCell(dc, w * 0.71, h * 0.665, fmtTime(_timer), "ZEIT", fg);
        // Ø-Pace | Kadenz
        if (_bottomLeft == 1) {
            drawCell(dc, w * 0.36, h * 0.855, fmtForecast(_forecast), "PROGNOSE", forecastColor(fg));
        } else {
            drawCell(dc, w * 0.36, h * 0.855, fmtPace(_avgPace), "Ø PACE", fg);
        }
        drawCell(dc, w * 0.64, h * 0.855, (_cadence != null) ? _cadence.format("%d") : "--", "SPM", fg);
    }

    hidden function drawCell(dc as Graphics.Dc, x as Numeric, y as Numeric, value as String, label as String, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, Graphics.FONT_MEDIUM, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y + dc.getFontHeight(Graphics.FONT_MEDIUM) * 0.6, Graphics.FONT_XTINY, label,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! Fünf Segmente von 150° bis 30° (oben); aktive Zone kräftig, Rest gedimmt.
    //! Im HF-Zielmodus ist die Zielzone dünn in ihrer Farbe markiert.
    hidden function drawZoneArc(dc as Graphics.Dc, cx as Number, cy as Number, r as Number, zone as Number) as Void {
        for (var i = 0; i < 5; i++) {
            var start = 150 - i * 24 - 1;
            var stop = 150 - (i + 1) * 24 + 1;
            var active = (i + 1 == zone);
            dc.setPenWidth(active ? 10 : 4);
            var isTarget = (_targetMode == 1 && i + 1 == _targetZone);
            dc.setColor((active || isTarget) ? ZONE_COLORS[i] as Number : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, start, stop);
        }
        dc.setPenWidth(1);
    }

    // ---------------------------------------------------------------- Hilfsfunktionen

    //! 0 = unter Zone 1 bzw. keine Daten, sonst 1–5
    hidden function hrZone() as Number {
        var z = _zones;
        var hr = _hr;
        if (hr == null || z == null || z.size() < 6 || hr < z[0]) {
            return 0;
        }
        for (var i = 1; i <= 5; i++) {
            if (hr <= z[i]) {
                return i;
            }
        }
        return 5;
    }

    //! Pace-Modus: Grün = im Zielbereich, Rot = zu langsam, Blau = zu schnell
    //! HF-Modus:   Grün = in der Zielzone, Rot = darüber, Blau = darunter
    hidden function targetColor(fg as Number) as Number {
        if (_targetMode == 1) {
            if (_hr == null) {
                return fg;
            }
            var zone = hrZone();
            if (zone == _targetZone) {
                return Graphics.COLOR_GREEN;
            }
            return (zone > _targetZone) ? Graphics.COLOR_RED : Graphics.COLOR_BLUE;
        }
        var pace = _pace;
        if (_targetPace <= 0 || pace == null) {
            return fg;
        }
        var diff = pace - _targetPace;
        if (diff > _tolerance) {
            return Graphics.COLOR_RED;
        }
        if (diff < -_tolerance) {
            return Graphics.COLOR_BLUE;
        }
        return Graphics.COLOR_GREEN;
    }

    //! Grün, wenn die Prognose die Zielzeit (Zielpace x Distanz) schafft, sonst Rot
    hidden function forecastColor(fg as Number) as Number {
        var f = _forecast;
        if (f == null || _targetMode != 0 || _targetPace <= 0) {
            return fg;
        }
        var targetMs = _targetPace * 1000.0 * _raceDist / paceUnitMeters();
        return (f <= targetMs) ? Graphics.COLOR_GREEN : Graphics.COLOR_RED;
    }

    hidden function isStatute() as Boolean {
        return System.getDeviceSettings().paceUnits == System.UNIT_STATUTE;
    }

    hidden function paceUnitMeters() as Float {
        return isStatute() ? 1609.344 : 1000.0;
    }

    hidden function paceLabel() as String {
        var l = isStatute() ? "PACE /mi" : "PACE /km";
        if (_targetMode == 1) {
            l += "  Ziel Z" + _targetZone;
        } else if (_targetPace > 0) {
            l += "  Ziel " + fmtPace(_targetPace.toFloat());
        }
        return l;
    }

    hidden function distLabel() as String {
        return (System.getDeviceSettings().distanceUnits == System.UNIT_STATUTE) ? "MI" : "KM";
    }

    hidden function fmtPace(secs as Float?) as String {
        if (secs == null || secs >= 3600) {
            return "--:--";
        }
        var s = secs.toNumber();
        return (s / 60).format("%d") + ":" + (s % 60).format("%02d");
    }

    hidden function fmtTime(ms as Number?) as String {
        if (ms == null) {
            return "0:00";
        }
        var s = ms / 1000;
        var h = s / 3600;
        var m = (s % 3600) / 60;
        if (h > 0) {
            return h.format("%d") + ":" + m.format("%02d") + ":" + (s % 60).format("%02d");
        }
        return m.format("%d") + ":" + (s % 60).format("%02d");
    }

    //! "3h28" ab einer Stunde, sonst "24:30"
    hidden function fmtForecast(ms as Number?) as String {
        if (ms == null) {
            return "--:--";
        }
        var s = ms / 1000;
        if (s >= 3600) {
            return (s / 3600).format("%d") + "h" + ((s % 3600) / 60).format("%02d");
        }
        return (s / 60).format("%d") + ":" + (s % 60).format("%02d");
    }

    hidden function fmtDist(m as Float?) as String {
        if (m == null) {
            return "0.00";
        }
        var unit = (System.getDeviceSettings().distanceUnits == System.UNIT_STATUTE) ? 1609.344 : 1000.0;
        return (m / unit).format("%.2f");
    }

    //! "4:45" -> 285; ungültig oder "0:00" -> 0 (aus)
    hidden function parsePace(value as PropertyValueType?) as Number {
        if (!(value instanceof String)) {
            return 0;
        }
        var idx = value.find(":");
        if (idx == null) {
            return 0;
        }
        var min = value.substring(0, idx);
        var sec = value.substring(idx + 1, value.length());
        if (min == null || sec == null) {
            return 0;
        }
        var mn = min.toNumber();
        var sn = sec.toNumber();
        if (mn == null || sn == null || sn < 0 || sn > 59) {
            return 0;
        }
        return mn * 60 + sn;
    }
}
