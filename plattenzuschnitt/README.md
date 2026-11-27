# Plattenzuschnitt Optimierer

Kostenloser Zuschnitt-Optimierer für Plattenwerkstoffe (Spanplatte, MDF, Multiplex …) als einzelne HTML-Datei – ohne Server, ohne Anmeldung, ohne Limit.

## Funktionen
- **▶ Play-Button**: berechnet den Schnittplan; nach Änderungen erscheint „Schnittplan veraltet“
- **Optionen** wie bei Cut List Optimizer: Schnittfuge, Alles auf eine Platte, Etiketten, Materialien, Kantenanleimung, Maserungsrichtung
- **Plan bearbeiten** (Schloss): Teile ziehen (mit Einrasten), drehen, entfernen, wieder einsetzen
- Werkzeugleiste: Zoom, Schrift größer/kleiner, Farben, Maße, Nummern, Ansicht drehen
- **Übersicht** (Gesamt / Einstellungen) und **Schnittfolge** mit geführtem Zuschnitt Schritt für Schritt
- **Teileliste** und **Zuschnittliste**, alles auch als PDF („Listen als PDF“)
- Etiketten mit Kanten-Skizze (farbige Kanten, Maserungspfeil)
- Teile an/aus, Länge ⇄ Breite tauschen, „Für alle Teile“: Kanten, Bezeichnung, Material
- Einstellungen-Fenster: Sprache (Deutsch/English/Bosanski), Einheiten (mm/cm/Zoll), Reihenfolge der Maße, Nachkommastellen, gleiche Platten stapeln, Optimierungspriorität, Schnittrichtung, minimales Besäummaß, Randbeschnitt pro Seite
- Projekte speichern/laden, als Datei sichern und öffnen (.json)
- Teile aus Excel einfügen oder als .csv öffnen, Schnittliste als CSV exportieren
- Mehrere Materialien (Teil → Material), unbegrenztes Lager (Stk leer)
- Kanten pro Teil (L1/L2/B1/B2) als gestrichelte Linie, Kantendicke abziehen, lfm-Summe
- Erster Schnitt längs/quer/automatisch, Ziel wenig Verschnitt oder wenig Schnitte
- Kosten (€/Platte, €/lfm Kante), Anzahl Schnitte und Schnittlänge
- Reststücke anzeigen und ins Lager übernehmen
- Maßketten rundum an jeder Platte, Schnittplan als PDF (A4 quer) und Drucken
- Teileliste mit Bezeichnung, Länge, Breite, Stückzahl und „drehen erlaubt“ (Maserung)
- Mehrere Plattenformate auf Lager mit Stückzahl
- Sägeblattstärke und Besäumen je Kante einstellbar
- Guillotine-Optimierung (nur durchgehende Schnitte, wie an der Formatkreissäge)
- Maßstäblicher Schnittplan pro Platte mit Teilenummern, Verschnitt in %
- Schnittliste zum Kopieren
- **Etiketten als PDF mit QR-Code** und allen Infos im Klartext (Teil, Maß, Material, Nr., Platte, Maserung, Auftrag, Datum)
  - A4: 70 × 37 mm (24/Blatt), 105 × 48 mm (12/Blatt), 70 × 42,3 mm (21/Blatt)
  - Etikettendrucker: 100 × 50 mm, 62 × 29 mm

Eingaben werden lokal im Browser gespeichert (localStorage).

## Öffnen
Über GitHub Pages (wenn für dieses Repo aktiv):
`https://nediaw14-oss.github.io/Zeit/plattenzuschnitt/`

Oder `index.html` herunterladen und im Browser öffnen (Internet nötig für die PDF-/QR-Bibliotheken).
