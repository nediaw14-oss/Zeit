/*!
 * SchnittWundeR – CNC-Export-Dialog
 * Einbinden:
 *   <script src="cnc-export.js"></script>
 *   <script src="cnc-export-ui.js"></script>
 *   <button onclick="SchnittCNCUI.open(() => meinPlanImCNCFormat())">CNC-Export</button>
 */
(function () {
  'use strict';
  const C = window.SchnittCNC;
  if (!C) { console.error('cnc-export.js muss vor cnc-export-ui.js geladen werden.'); return; }
  const LS_KEY = 'schnittwunder_cnc_settings';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } };
  const save = s => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* egal */ } };

  const css = `
  .scnc-bg{position:fixed;inset:0;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif}
  .scnc{background:#fff;color:#0b2545;border-radius:14px;width:min(520px,94vw);max-height:92vh;overflow:auto;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .scnc h2{margin:0 0 4px;font-size:20px;color:#1d4ed8}.scnc p.s{margin:0 0 14px;color:#557;font-size:13px}
  .scnc label{display:block;font-size:13px;margin:10px 0 4px;font-weight:600}
  .scnc select,.scnc input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #c8d3e6;border-radius:8px;font-size:14px}
  .scnc .g{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
  .scnc .ck{display:flex;gap:8px;align-items:center;font-weight:400;margin-top:12px}.scnc .ck input{width:auto}
  .scnc .b{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
  .scnc button{padding:10px 16px;border-radius:8px;border:0;font-size:14px;cursor:pointer}
  .scnc .p{background:#1d4ed8;color:#fff}.scnc .x{background:#e8eef9;color:#0b2545}
  .scnc .err{color:#b91c1c;font-size:13px;white-space:pre-line;margin-top:10px}
  .scnc .hint{font-size:12px;color:#667;margin-top:6px}
  .scnc details{margin-top:12px}.scnc summary{cursor:pointer;font-weight:600;font-size:13px}`;

  // getPlan(optionen) liefert den Plan; hooks.save(datei) speichert eine Datei (sonst Browser-Download)
  function open(getPlan, hooks = {}) {
    if (!document.getElementById('scnc-css')) {
      const st = document.createElement('style'); st.id = 'scnc-css'; st.textContent = css; document.head.appendChild(st);
    }
    const s = Object.assign({ machine: 'mach3', thickness: 19 }, C.DEFAULTS, load());
    const machineOpts = Object.entries(C.MACHINES).map(([k, m]) => `<option value="${k}" ${k === s.machine ? 'selected' : ''}>${m.label}</option>`).join('');
    const bg = document.createElement('div');
    bg.className = 'scnc-bg';
    bg.innerHTML = `
    <div class="scnc" role="dialog" aria-label="CNC-Export">
      <h2>CNC-Export</h2>
      <p class="s">Schnittplan direkt an Fräse, Nesting-Maschine oder CAM-Programm.</p>
      <label>Maschine / Programm</label>
      <select id="scnc-m">${machineOpts}</select>
      <div class="hint" id="scnc-h"></div>
      <label>Plattenstärke (mm)</label><input id="scnc-t" type="number" step="0.5" min="1" value="${s.thickness}">
      <div class="hint">Steht eine Stärke im Materialnamen (z. B. „Spanplatte 19 weiß“), wird die genommen.</div>
      <div id="scnc-gc">
        <div class="g">
          <div><label>Fräser-Ø (mm)</label><input id="scnc-td" type="number" step="0.1" value="${s.toolDiameter}"></div>
          <div><label>Drehzahl (U/min)</label><input id="scnc-rpm" type="number" value="${s.spindleRpm}"></div>
          <div><label>Vorschub (mm/min)</label><input id="scnc-f" type="number" value="${s.feedRate}"></div>
          <div><label>Eintauchen (mm/min)</label><input id="scnc-pf" type="number" value="${s.plungeRate}"></div>
          <div><label>Zustellung (mm)</label><input id="scnc-pd" type="number" step="0.5" value="${s.passDepth}"></div>
          <div><label>Durchfräsen (mm)</label><input id="scnc-tc" type="number" step="0.1" value="${s.throughCut}"></div>
        </div>
        <label class="ck"><input id="scnc-tabs" type="checkbox" ${s.tabs ? 'checked' : ''}> Haltestege (Teile fliegen nicht weg)</label>
        <details><summary>Weitere Einstellungen</summary>
          <div class="g">
            <div><label>Steg-Breite (mm)</label><input id="scnc-tw" type="number" value="${s.tabWidth}"></div>
            <div><label>Steg-Höhe (mm)</label><input id="scnc-th" type="number" step="0.5" value="${s.tabHeight}"></div>
            <div><label>Sicherheitshöhe (mm)</label><input id="scnc-sz" type="number" value="${s.safeZ}"></div>
            <div><label>Werkzeug-Nr.</label><input id="scnc-tn" type="number" value="${s.toolNumber}"></div>
            <div><label>Nullpunkt XY</label><select id="scnc-o">
              <option value="bottom-left" ${s.origin === 'bottom-left' ? 'selected' : ''}>Links unten</option>
              <option value="top-left" ${s.origin === 'top-left' ? 'selected' : ''}>Links oben</option>
              <option value="center" ${s.origin === 'center' ? 'selected' : ''}>Mitte</option></select></div>
            <div><label>Z-Nullpunkt</label><select id="scnc-z">
              <option value="top" ${s.zZero === 'top' ? 'selected' : ''}>Plattenoberseite</option>
              <option value="bed" ${s.zZero === 'bed' ? 'selected' : ''}>Maschinentisch</option></select></div>
          </div>
          <label class="ck"><input id="scnc-ramp" type="checkbox" ${s.ramp ? 'checked' : ''}> Rampe beim Eintauchen</label>
          <label class="ck"><input id="scnc-climb" type="checkbox" ${s.climb ? 'checked' : ''}> Gleichlauf statt Gegenlauf</label>
        </details>
      </div>
      <div class="err" id="scnc-e"></div>
      <div class="b"><button class="x" id="scnc-c">Abbrechen</button><button class="p" id="scnc-go">Exportieren</button></div>
    </div>`;
    document.body.appendChild(bg);
    const $ = id => bg.querySelector('#' + id);
    const HINTS = {
      gcode: 'G-Code – direkt auf der Steuerung starten. Vorher immer im Simulator prüfen (z. B. NC Viewer, CAMotics).',
      dxf: 'DXF – Konturen auf Layer TEILE_<Stärke>MM, Kanten auf KANTEN. Im Programm Werkzeug & Tiefe zuweisen.',
      svg: 'SVG in mm – einfach im Programm importieren.',
      csv: 'CSV-Teileliste mit Koordinaten & Kanten – für Plattensägen-Software und Excel.',
    };
    const upd = () => {
      const m = C.MACHINES[$('scnc-m').value];
      $('scnc-gc').style.display = m.format === 'gcode' ? '' : 'none';
      $('scnc-h').textContent = HINTS[m.format];
    };
    $('scnc-m').addEventListener('change', upd); upd();
    const close = () => bg.remove();
    $('scnc-c').onclick = close;
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    $('scnc-go').onclick = () => {
      const n = id => parseFloat($(id).value);
      const opts = {
        machine: $('scnc-m').value, thickness: n('scnc-t'), toolDiameter: n('scnc-td'), spindleRpm: n('scnc-rpm'), feedRate: n('scnc-f'),
        plungeRate: n('scnc-pf'), passDepth: n('scnc-pd'), throughCut: n('scnc-tc'), tabs: $('scnc-tabs').checked,
        tabWidth: n('scnc-tw'), tabHeight: n('scnc-th'), safeZ: n('scnc-sz'), toolNumber: n('scnc-tn'),
        origin: $('scnc-o').value, zZero: $('scnc-z').value, ramp: $('scnc-ramp').checked, climb: $('scnc-climb').checked,
      };
      try {
        if (!(opts.toolDiameter > 0 && opts.passDepth > 0 && opts.feedRate > 0)) throw new Error('Fräser-Ø, Zustellung und Vorschub müssen größer als 0 sein.');
        if (!(opts.thickness > 0)) throw new Error('Bitte eine Plattenstärke eingeben.');
        const plan = typeof getPlan === 'function' ? getPlan(opts) : getPlan;
        const files = C.exportForMachine(plan, opts.machine, opts);
        save(opts);
        if (typeof hooks.save === 'function') files.forEach((f, i) => setTimeout(() => hooks.save(f), i * 400));
        else C.download(files);
        close();
      } catch (e) { $('scnc-e').textContent = e.message; }
    };
  }
  window.SchnittCNCUI = { open };
})();
