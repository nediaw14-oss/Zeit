# ⏱ Zeiterfassung

Eine einfache Zeiterfassungs-App als einzelne HTML-Datei – ohne Server, ohne Anmeldung.

## Funktionen
- Start/Stopp-Timer mit Projekt und Notiz (läuft weiter, auch wenn der Tab geschlossen wird)
- Einträge manuell nachtragen, bearbeiten und löschen (inkl. Pause)
- Übersicht nach Tag, Woche (KW), Monat oder gesamt – mit Summe pro Projekt
- Soll-Stunden pro Woche mit Plus/Minus-Anzeige
- CSV-Export (für Excel) sowie JSON-Backup und -Import
- Dunkelmodus und Handy-tauglich

Die Daten werden **nur lokal im Browser** gespeichert (localStorage).
Für einen Gerätewechsel: Backup exportieren und auf dem anderen Gerät importieren.

## Über GitHub öffnen (GitHub Pages)
1. Im Repository auf **Settings → Pages** gehen.
2. Unter *Build and deployment* → *Source*: **Deploy from a branch** wählen.
3. Den Branch mit der `index.html` auswählen (z. B. `main`), Ordner `/ (root)`, **Save**.
4. Nach ca. 1 Minute ist die App erreichbar unter:
   `https://<benutzername>.github.io/<repository>/`

Lokal geht es auch: `index.html` einfach im Browser öffnen.
