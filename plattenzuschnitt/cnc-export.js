/*!
 * SchnittWundeR – CNC-Export
 * Exportiert optimierte Schnittpläne für CNC-Fräsen, Nesting-Maschinen und CAM-Programme.
 *
 * Formate:
 *   - G-Code mit Postprozessoren: GRBL, Mach3/Mach4, LinuxCNC, UCCNC, Fanuc/ISO, Haas
 *   - DXF (R12, ASCII) – Import in woodWOP (Homag), bSolid (Biesse), Alphacam, VCarve/Aspire,
 *     Fusion 360, EstlCAM, SCM Maestro, Fräsprogramme allgemein
 *   - SVG (mm) – Easel, Carbide Create, Laser, Inkscape
 *   - CSV-Teileliste mit Koordinaten – Plattensägen/Optimierer (Cut Rite, Ardis, OptiCut, Excel)
 *
 * Eingabeformat (siehe README.md):
 *   plan = {
 *     unit: 'mm',
 *     kerf: 4,                      // Sägeblatt/Fräserbreite im Plan (nur Info)
 *     sheets: [{
 *       name, material, width, height, thickness,
 *       parts: [{ id, name, x, y, w, h, rotated, edges:{top,bottom,left,right} }]
 *     }]
 *   }
 *   x/y = linke untere Ecke des Teils auf der Platte, w/h = Fertigmaß auf der Platte.
 *
 * Läuft im Browser (window.SchnittCNC) und in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SchnittCNC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- Hilfen
  const DEFAULTS = {
    toolDiameter: 6,        // mm, Schaftfräser
    feedRate: 6000,         // mm/min Vorschub XY
    plungeRate: 1500,       // mm/min Eintauchen Z
    spindleRpm: 18000,
    passDepth: 6,           // mm Zustellung pro Durchgang
    throughCut: 0.3,        // mm tiefer als Plattenstärke (in die Opferplatte)
    safeZ: 15,              // mm Sicherheitshöhe
    tabs: true,             // Haltestege
    tabWidth: 8,            // mm
    tabHeight: 2,           // mm Steg-Reststärke
    tabsPerSide: 1,         // Stege pro Seite (bei Seiten > tabMinSide)
    tabMinSide: 150,        // mm – kürzere Seiten bekommen keine Stege
    ramp: true,             // schräg eintauchen statt senkrecht
    climb: false,           // Gleichlauf (true) / Gegenlauf (false)
    smallPartsFirst: true,  // kleine Teile zuerst fräsen (bessere Haltekraft)
    origin: 'bottom-left',  // Nullpunkt: 'bottom-left' | 'top-left' | 'center'
    zZero: 'top',           // Z0 auf 'top' (Plattenoberseite) oder 'bed' (Maschinentisch)
    toolNumber: 1,
    lineNumbers: undefined, // undefined = Postprozessor entscheidet
    decimals: 3,
  };

  const fmtNum = (n, d) => {
    let s = (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
    s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  };

  function validatePlan(plan) {
    const errs = [];
    if (!plan || !Array.isArray(plan.sheets) || !plan.sheets.length) errs.push('Keine Platten im Plan.');
    (plan.sheets || []).forEach((s, i) => {
      if (!(s.width > 0 && s.height > 0)) errs.push(`Platte ${i + 1}: Breite/Höhe fehlt.`);
      if (!(s.thickness > 0)) errs.push(`Platte ${i + 1}: Plattenstärke fehlt.`);
      (s.parts || []).forEach((p, j) => {
        if (!(p.w > 0 && p.h > 0)) errs.push(`Platte ${i + 1}, Teil ${j + 1}: Maße fehlen.`);
        if (p.x < -0.01 || p.y < -0.01 || p.x + p.w > s.width + 0.01 || p.y + p.h > s.height + 0.01)
          errs.push(`Platte ${i + 1}, Teil "${p.name || p.id || j + 1}" liegt außerhalb der Platte.`);
      });
    });
    if (errs.length) throw new Error(errs.join('\n'));
  }

  // Koordinaten von Plan (links unten) in Maschinen-Nullpunkt umrechnen
  function originTransform(sheet, origin) {
    switch (origin) {
      case 'top-left': return (x, y) => [x, y - sheet.height];
      case 'center': return (x, y) => [x - sheet.width / 2, y - sheet.height / 2];
      default: return (x, y) => [x, y];
    }
  }

  // ---------------------------------------------------------- Postprozessoren
  const POSTS = {
    grbl: {
      label: 'GRBL (Shapeoko, X-Carve, Sienci, China-CNC 3018 …)', ext: 'nc', lineNumbers: false,
      comment: c => `(${c.replace(/[()]/g, '')})`,
      header: o => ['G21', 'G90', 'G17', 'G94', `M3 S${o.spindleRpm}`, 'G4 P3'],
      toolChange: () => [],
      footer: o => [`G0 Z${fmtNum(o.safeZTop, 3)}`, 'M5', 'G0 X0 Y0', 'M30'],
    },
    mach3: {
      label: 'Mach3 / Mach4', ext: 'tap', lineNumbers: true,
      comment: c => `(${c.replace(/[()]/g, '')})`,
      header: o => ['G21', 'G90', 'G17', 'G40', 'G49', 'G64', 'G94'],
      toolChange: o => [`T${o.toolNumber} M6`, `S${o.spindleRpm} M3`, 'G4 P3'],
      footer: o => [`G0 Z${fmtNum(o.safeZTop, 3)}`, 'M5', 'G0 X0 Y0', 'M30'],
    },
    linuxcnc: {
      label: 'LinuxCNC', ext: 'ngc', lineNumbers: false,
      comment: c => `(${c.replace(/[()]/g, '')})`,
      header: o => ['%', 'G21', 'G90', 'G17', 'G40', 'G49', 'G64 P0.02', 'G94'],
      toolChange: o => [`T${o.toolNumber} M6`, `S${o.spindleRpm} M3`, 'G4 P3'],
      footer: o => [`G0 Z${fmtNum(o.safeZTop, 3)}`, 'M5', 'G0 X0 Y0', 'M2', '%'],
    },
    uccnc: {
      label: 'UCCNC', ext: 'nc', lineNumbers: false,
      comment: c => `(${c.replace(/[()]/g, '')})`,
      header: o => ['G21', 'G90', 'G17', 'G40', 'G94'],
      toolChange: o => [`T${o.toolNumber} M6`, `S${o.spindleRpm} M3`, 'G4 P3'],
      footer: o => [`G0 Z${fmtNum(o.safeZTop, 3)}`, 'M5', 'G0 X0 Y0', 'M30'],
    },
    fanuc: {
      label: 'Fanuc / ISO (viele Industrie-Steuerungen, Syntec, Siemens im ISO-Modus)', ext: 'nc', lineNumbers: true,
      comment: c => `(${c.toUpperCase().replace(/[()]/g, '')})`,
      header: o => ['%', 'O1000', 'G21 G90 G17 G40 G49 G80 G94', 'G54'],
      toolChange: o => [`T${o.toolNumber} M6`, `S${o.spindleRpm} M3`, 'G4 X3.'],
      footer: o => [`G0 Z${fmtNum(o.safeZTop, 3)}`, 'M5', 'G28 G91 Z0', 'G90', 'M30', '%'],
    },
    haas: {
      label: 'Haas', ext: 'nc', lineNumbers: true,
      comment: c => `(${c.toUpperCase().replace(/[()]/g, '')})`,
      header: o => ['%', 'O01000', 'G21 G90 G17 G40 G49 G80 G94', 'G54'],
      toolChange: o => [`T${o.toolNumber} M06`, `S${o.spindleRpm} M03`, `G43 H${String(o.toolNumber).padStart(2, '0')} Z${fmtNum(o.safeZTop, 3)}`],
      footer: o => [`G00 Z${fmtNum(o.safeZTop, 3)}`, 'M05', 'G28 G91 Z0', 'G90', 'M30', '%'],
    },
  };

  // ------------------------------------------------------------- Werkzeugweg
  // Rechteck außen um das Teil, korrigiert um Fräserradius.
  // Liefert Punktliste (geschlossen) im Uhrzeigersinn / Gegenuhrzeigersinn.
  function partContour(p, r, climb) {
    const x0 = p.x - r, y0 = p.y - r, x1 = p.x + p.w + r, y1 = p.y + p.h + r;
    // Außenkontur: Gegenlauf = im Uhrzeigersinn (CW), Gleichlauf = gegen den Uhrzeigersinn (CCW)
    // Startpunkt: Mitte der unteren Kante (weg von den Ecken → saubere Ecken)
    const mx = (x0 + x1) / 2;
    const cw = [[mx, y0], [x0, y0], [x0, y1], [x1, y1], [x1, y0], [mx, y0]];
    const ccw = [[mx, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [mx, y0]];
    return climb ? ccw : cw;
  }

  // Stege als [start,end]-Intervalle entlang jeder Segmentlänge
  function tabIntervals(len, o) {
    if (!o.tabs || len < o.tabMinSide) return [];
    const n = Math.max(1, o.tabsPerSide);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const c = (len * i) / (n + 1);
      out.push([c - o.tabWidth / 2, c + o.tabWidth / 2]);
    }
    return out;
  }

  function generateGCode(plan, options = {}) {
    validatePlan(plan);
    const postKey = (options.post || 'grbl').toLowerCase();
    const post = POSTS[postKey];
    if (!post) throw new Error(`Unbekannter Postprozessor "${postKey}". Verfügbar: ${Object.keys(POSTS).join(', ')}`);
    const files = [];

    plan.sheets.forEach((sheet, si) => {
      const o = Object.assign({}, DEFAULTS, options);
      const T = sheet.thickness;
      const zTop = o.zZero === 'bed' ? T : 0;           // Z der Plattenoberseite
      const zFinal = zTop - T - o.throughCut;            // Endtiefe
      o.safeZTop = zTop + o.safeZ;
      const zTab = zTop - T + o.tabHeight;               // Z-Höhe über Steg
      const r = o.toolDiameter / 2;
      const tf = originTransform(sheet, o.origin);
      const d = o.decimals;
      const useN = o.lineNumbers !== undefined ? o.lineNumbers : post.lineNumbers;
      const lines = [];
      let n = 10;
      const emit = l => { lines.push(useN && !l.startsWith('%') && !/^O\d/.test(l) ? `N${n} ${l}` : l); if (useN && !l.startsWith('%') && !/^O\d/.test(l)) n += 10; };
      const X = (x, y) => { const [a, b] = tf(x, y); return `X${fmtNum(a, d)} Y${fmtNum(b, d)}`; };

      // Header
      post.header(o).forEach(l => (l === '%' || /^O\d/.test(l) ? lines.push(l) : emit(l)));
      emit(post.comment(`SchnittWundeR – Platte ${si + 1}/${plan.sheets.length}: ${sheet.name || ''} ${sheet.material || ''} ${sheet.width}x${sheet.height}x${T} mm`));
      emit(post.comment(`Fraeser D${o.toolDiameter} | F${o.feedRate} | S${o.spindleRpm} | Zustellung ${o.passDepth} | Z0=${o.zZero === 'bed' ? 'Tisch' : 'Plattenoberseite'} | Nullpunkt ${o.origin}`));
      post.toolChange(o).forEach(emit);
      if (postKey === 'grbl') { /* GRBL: Spindel läuft schon aus Header */ }
      emit(`G0 Z${fmtNum(o.safeZTop, d)}`);

      // Reihenfolge
      const parts = (sheet.parts || []).slice();
      if (o.smallPartsFirst) parts.sort((a, b) => a.w * a.h - b.w * b.h);

      // Tiefenstufen
      const depths = [];
      for (let z = zTop - o.passDepth; z > zFinal + 1e-6; z -= o.passDepth) depths.push(z);
      depths.push(zFinal);

      parts.forEach((p, pi) => {
        const pts = partContour(p, r, o.climb);
        emit(post.comment(`Teil ${pi + 1}/${parts.length}: ${p.name || p.id || ''} ${fmtNum(p.w, 1)}x${fmtNum(p.h, 1)}${p.rotated ? ' (gedreht)' : ''}`));
        emit(`G0 ${X(pts[0][0], pts[0][1])}`);
        emit(`G0 Z${fmtNum(zTop + 2, d)}`);

        let zPrev = zTop;
        depths.forEach(z => {
          const isTabPass = o.tabs && z < zTab - 1e-6;
          // Eintauchen: Rampe entlang der ersten Kante (halbe Kantenlänge) oder senkrecht
          if (o.ramp) {
            const [sx, sy] = pts[0];
            const [ex, ey] = pts[1];
            const segLen = Math.hypot(ex - sx, ey - sy);
            const rampLen = Math.min(segLen * 0.9, Math.max(10, (zPrev - z) * 8));
            const ux = (ex - sx) / segLen, uy = (ey - sy) / segLen;
            const zMid = (zPrev + z) / 2;
            emit(`G1 Z${fmtNum(zPrev, d)} F${o.plungeRate}`);
            emit(`G1 ${X(sx + ux * rampLen, sy + uy * rampLen)} Z${fmtNum(zMid, d)} F${o.plungeRate}`);
            emit(`G1 ${X(sx, sy)} Z${fmtNum(z, d)}`);
          } else {
            emit(`G1 Z${fmtNum(z, d)} F${o.plungeRate}`);
          }
          let first = true;
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
            const len = Math.hypot(bx - ax, by - ay);
            const ux = (bx - ax) / len, uy = (by - ay) / len;
            // Stege nur auf den vollen Seiten (Segmente 2–5 ≈ ganze Kanten); erste/letzte Halbkante ohne Steg
            const fullSide = i > 1 && i < pts.length - 1;
            const tabs = isTabPass && fullSide ? tabIntervals(len, o) : [];
            const feed = first ? ` F${o.feedRate}` : '';
            first = false;
            if (!tabs.length) { emit(`G1 ${X(bx, by)}${feed}`); continue; }
            let pos = 0; let f = feed;
            tabs.forEach(([t0, t1]) => {
              const s0 = Math.max(pos, t0 - r), s1 = Math.min(len, t1 + r); // Fräserradius berücksichtigen
              emit(`G1 ${X(ax + ux * s0, ay + uy * s0)}${f}`); f = '';
              emit(`G1 Z${fmtNum(zTab, d)}`);
              emit(`G1 ${X(ax + ux * s1, ay + uy * s1)}`);
              emit(`G1 Z${fmtNum(z, d)}`);
              pos = s1;
            });
            emit(`G1 ${X(bx, by)}`);
          }
          zPrev = z;
        });
        emit(`G0 Z${fmtNum(o.safeZTop, d)}`);
      });

      post.footer(o).forEach(l => (l === '%' ? lines.push(l) : emit(l)));
      const base = safeName(`${sheet.name || 'platte'}_${si + 1}`);
      files.push({ filename: `${base}.${post.ext}`, mime: 'text/plain', content: lines.join('\r\n') + '\r\n' });
    });
    return files;
  }

  // --------------------------------------------------------------------- DXF
  // DXF R12 ASCII: maximal kompatibel. Layer:
  //   PLATTE        – Plattenumriss
  //   TEILE_<T>MM   – Teilekonturen (Fertigmaß, ohne Fräserkorrektur), Layername enthält Tiefe
  //   KANTEN        – Kantenmarkierung (Linie 2 mm innen an bekanteten Seiten)
  //   BESCHRIFTUNG  – Teilenamen
  function generateDXF(plan, options = {}) {
    validatePlan(plan);
    const o = Object.assign({ origin: 'bottom-left', labels: true, edgeMarks: true, oneFilePerSheet: true, sheetGap: 100 }, options);
    const make = (sheets, startIndex) => {
      const L = [];
      const g = (code, val) => { L.push(String(code)); L.push(String(val)); };
      const layers = new Set(['0', 'PLATTE', 'KANTEN', 'BESCHRIFTUNG']);
      sheets.forEach(s => layers.add(depthLayer(s.thickness)));
      // HEADER
      g(0, 'SECTION'); g(2, 'HEADER');
      g(9, '$ACADVER'); g(1, 'AC1009');
      g(9, '$INSUNITS'); g(70, 4); // mm
      g(9, '$MEASUREMENT'); g(70, 1);
      g(0, 'ENDSEC');
      // TABLES
      g(0, 'SECTION'); g(2, 'TABLES');
      g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.size);
      const colors = { PLATTE: 8, KANTEN: 1, BESCHRIFTUNG: 3 };
      layers.forEach(name => { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, colors[name] || 5); g(6, 'CONTINUOUS'); });
      g(0, 'ENDTAB');
      g(0, 'ENDSEC');
      // ENTITIES
      g(0, 'SECTION'); g(2, 'ENTITIES');
      let offX = 0;
      sheets.forEach((sheet, k) => {
        const tf0 = originTransform(sheet, o.origin);
        const tf = (x, y) => { const [a, b] = tf0(x, y); return [a + offX, b]; };
        const poly = (layer, pts) => {
          g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
          pts.forEach(([x, y]) => { const [a, b] = tf(x, y); g(0, 'VERTEX'); g(8, layer); g(10, fmtNum(a, 4)); g(20, fmtNum(b, 4)); g(30, 0); });
          g(0, 'SEQEND'); g(8, layer);
        };
        const line = (layer, x1, y1, x2, y2) => {
          const [a, b] = tf(x1, y1), [c, e] = tf(x2, y2);
          g(0, 'LINE'); g(8, layer); g(10, fmtNum(a, 4)); g(20, fmtNum(b, 4)); g(30, 0); g(11, fmtNum(c, 4)); g(21, fmtNum(e, 4)); g(31, 0);
        };
        const text = (layer, x, y, h, str) => {
          const [a, b] = tf(x, y);
          g(0, 'TEXT'); g(8, layer); g(10, fmtNum(a, 4)); g(20, fmtNum(b, 4)); g(30, 0); g(40, fmtNum(h, 3)); g(1, dxfText(str));
          g(72, 1); g(73, 2); g(11, fmtNum(a, 4)); g(21, fmtNum(b, 4)); g(31, 0); // zentriert
        };
        poly('PLATTE', rect(0, 0, sheet.width, sheet.height));
        text('BESCHRIFTUNG', sheet.width / 2, sheet.height + 20, 12, `${sheet.name || 'Platte ' + (startIndex + k + 1)} ${sheet.material || ''} ${sheet.width}x${sheet.height}x${sheet.thickness}`);
        const layer = depthLayer(sheet.thickness);
        (sheet.parts || []).forEach(p => {
          poly(layer, rect(p.x, p.y, p.w, p.h));
          if (o.edgeMarks && p.edges) {
            const m = 2;
            if (p.edges.bottom) line('KANTEN', p.x + m, p.y + m, p.x + p.w - m, p.y + m);
            if (p.edges.top) line('KANTEN', p.x + m, p.y + p.h - m, p.x + p.w - m, p.y + p.h - m);
            if (p.edges.left) line('KANTEN', p.x + m, p.y + m, p.x + m, p.y + p.h - m);
            if (p.edges.right) line('KANTEN', p.x + p.w - m, p.y + m, p.x + p.w - m, p.y + p.h - m);
          }
          if (o.labels) {
            const h = Math.max(3, Math.min(20, Math.min(p.w, p.h) / 6));
            text('BESCHRIFTUNG', p.x + p.w / 2, p.y + p.h / 2, h, `${p.name || p.id || ''} ${fmtNum(p.w, 1)}x${fmtNum(p.h, 1)}`.trim());
          }
        });
        offX += sheet.width + o.sheetGap;
      });
      g(0, 'ENDSEC');
      g(0, 'EOF');
      return L.join('\r\n') + '\r\n';
    };
    if (o.oneFilePerSheet) {
      return plan.sheets.map((s, i) => ({ filename: `${safeName(`${s.name || 'platte'}_${i + 1}`)}.dxf`, mime: 'application/dxf', content: make([s], i) }));
    }
    return [{ filename: 'schnittplan.dxf', mime: 'application/dxf', content: make(plan.sheets, 0) }];
  }

  const depthLayer = t => `TEILE_${fmtNum(t, 1).replace('.', '_')}MM`;
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  // DXF R12 kennt kein UTF-8: Umlaute umschreiben
  const dxfText = s => String(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^\x20-\x7E]/g, '?');

  // --------------------------------------------------------------------- SVG
  function generateSVG(plan, options = {}) {
    validatePlan(plan);
    const o = Object.assign({ labels: true }, options);
    return plan.sheets.map((s, i) => {
      const H = s.height;
      const y = v => fmtNum(H - v, 3); // SVG-Y nach unten → spiegeln
      const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const parts = (s.parts || []).map(p => {
        const r = `<rect x="${fmtNum(p.x, 3)}" y="${y(p.y + p.h)}" width="${fmtNum(p.w, 3)}" height="${fmtNum(p.h, 3)}" fill="none" stroke="#000000" stroke-width="0.2"/>`;
        const fs = Math.max(3, Math.min(20, Math.min(p.w, p.h) / 6));
        const t = o.labels ? `<text x="${fmtNum(p.x + p.w / 2, 3)}" y="${y(p.y + p.h / 2)}" font-size="${fmtNum(fs, 2)}" font-family="Arial" text-anchor="middle" dominant-baseline="middle" fill="#0055cc">${esc(p.name || p.id || '')}</text>` : '';
        return r + t;
      }).join('\n    ');
      const content = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}mm" height="${s.height}mm" viewBox="0 0 ${s.width} ${s.height}">
  <title>SchnittWundeR – ${esc(s.name || 'Platte ' + (i + 1))} ${esc(s.material || '')} ${s.width}x${s.height}x${s.thickness}</title>
  <g id="platte"><rect x="0" y="0" width="${s.width}" height="${s.height}" fill="none" stroke="#999999" stroke-width="0.3"/></g>
  <g id="teile" data-depth="${s.thickness}">
    ${parts}
  </g>
</svg>
`;
      return { filename: `${safeName(`${s.name || 'platte'}_${i + 1}`)}.svg`, mime: 'image/svg+xml', content };
    });
  }

  // --------------------------------------------------------------------- CSV
  // Semikolon-getrennt (deutsches Excel), mit BOM. Für Plattensägen-Software & Teilelisten-Import.
  function generateCSV(plan, options = {}) {
    validatePlan(plan);
    const o = Object.assign({ separator: ';', decimalComma: true }, options);
    const num = v => { const s = fmtNum(v, 1); return o.decimalComma ? s.replace('.', ',') : s; };
    const q = v => { const s = String(v ?? ''); return /[;",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Platte', 'Material', 'Plattenstaerke', 'Teil-ID', 'Bezeichnung', 'Laenge', 'Breite', 'X', 'Y', 'Gedreht', 'Kante oben', 'Kante unten', 'Kante links', 'Kante rechts'];
    const rows = [head.join(o.separator)];
    plan.sheets.forEach((s, i) => (s.parts || []).forEach(p => {
      const e = p.edges || {};
      rows.push([i + 1, s.material || '', num(s.thickness), p.id ?? '', p.name ?? '', num(p.w), num(p.h), num(p.x), num(p.y), p.rotated ? 'ja' : 'nein',
        e.top ? 1 : 0, e.bottom ? 1 : 0, e.left ? 1 : 0, e.right ? 1 : 0].map(q).join(o.separator));
    }));
    return [{ filename: 'teileliste_cnc.csv', mime: 'text/csv', content: '﻿' + rows.join('\r\n') + '\r\n' }];
  }

  // ------------------------------------------------------- Maschinen-Profile
  // Voreinstellungen für gängige Maschinen/Programme → wählt Format + Postprozessor.
  const MACHINES = {
    'shapeoko':      { label: 'Carbide 3D Shapeoko / Nomad', format: 'gcode', post: 'grbl' },
    'xcarve':        { label: 'Inventables X-Carve (Easel)', format: 'gcode', post: 'grbl', alt: 'svg' },
    'sienci':        { label: 'Sienci LongMill (gSender)', format: 'gcode', post: 'grbl' },
    'onefinity':     { label: 'Onefinity (Buildbotics)', format: 'gcode', post: 'linuxcnc' },
    'cnc3018':       { label: 'China-CNC 3018 / 6040 (GRBL)', format: 'gcode', post: 'grbl' },
    'stepcraft':     { label: 'Stepcraft (UCCNC)', format: 'gcode', post: 'uccnc' },
    'mach3':         { label: 'Fräse mit Mach3 / Mach4', format: 'gcode', post: 'mach3' },
    'linuxcnc':      { label: 'Fräse mit LinuxCNC', format: 'gcode', post: 'linuxcnc' },
    'uccnc':         { label: 'Fräse mit UCCNC', format: 'gcode', post: 'uccnc' },
    'estlcam':       { label: 'EstlCAM', format: 'dxf' },
    'fanuc':         { label: 'Industrie-Fräse Fanuc / ISO / Syntec', format: 'gcode', post: 'fanuc' },
    'haas':          { label: 'Haas Router', format: 'gcode', post: 'haas' },
    'homag':         { label: 'Homag (woodWOP / CADmatic)', format: 'dxf' },
    'weeke':         { label: 'Weeke (woodWOP)', format: 'dxf' },
    'biesse':        { label: 'Biesse (bSolid / bNest)', format: 'dxf' },
    'scm':           { label: 'SCM (Maestro)', format: 'dxf' },
    'felder':        { label: 'Felder / Format-4 (F4 Integrate)', format: 'dxf' },
    'holzher':       { label: 'Holz-Her (campus)', format: 'dxf' },
    'vcarve':        { label: 'Vectric VCarve / Aspire / Cut2D', format: 'dxf' },
    'fusion':        { label: 'Autodesk Fusion 360', format: 'dxf' },
    'alphacam':      { label: 'Alphacam', format: 'dxf' },
    'carbidecreate': { label: 'Carbide Create', format: 'svg' },
    'easel':         { label: 'Easel', format: 'svg' },
    'laser':         { label: 'Laser (LightBurn, Inkscape)', format: 'svg' },
    'cutrite':       { label: 'Plattensäge / Cut Rite / Ardis / OptiCut', format: 'csv' },
  };

  function exportPlan(plan, format, options = {}) {
    switch ((format || '').toLowerCase()) {
      case 'gcode': case 'nc': return generateGCode(plan, options);
      case 'dxf': return generateDXF(plan, options);
      case 'svg': return generateSVG(plan, options);
      case 'csv': return generateCSV(plan, options);
      default: throw new Error(`Unbekanntes Format "${format}" (gcode, dxf, svg, csv).`);
    }
  }

  function exportForMachine(plan, machineKey, options = {}) {
    const m = MACHINES[machineKey];
    if (!m) throw new Error(`Unbekannte Maschine "${machineKey}".`);
    return exportPlan(plan, m.format, Object.assign({ post: m.post }, options));
  }

  // Browser-Download (mehrere Dateien nacheinander)
  function download(files) {
    if (typeof document === 'undefined') return;
    files.forEach((f, i) => setTimeout(() => {
      const blob = new Blob([f.content], { type: f.mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, i * 300));
  }

  function safeName(s) {
    return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'platte';
  }

  return { DEFAULTS, POSTS, MACHINES, exportPlan, exportForMachine, generateGCode, generateDXF, generateSVG, generateCSV, download, validatePlan };
});
