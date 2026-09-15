/* ============================================================
   Prompt Organizer — prefs.js
   User preferences: themes, animations, density, font scale,
   reaction speed. Persisted per browser (localStorage), applied
   instantly. Nothing here is corporate — make it yours.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'po.prefs.v1';

  var THEMES = {
    midnight: { label: '🌌 Midnight (default)', desc: 'The classic deep-space look.' },
    ocean:    { label: '🌊 Ocean',   desc: 'Cool teals — easy on the eyes.' },
    forest:   { label: '🌲 Forest',  desc: 'Warm greens, cozy cabin vibes.' },
    sunset:   { label: '🌇 Sunset',  desc: 'Amber and coral, warm and fun.' },
    candy:    { label: '🍭 Candy',   desc: 'Playful pink and purple pops.' },
    paper:    { label: '📜 Paper',   desc: 'Bright light mode for sunny days.' }
  };

  var DEFAULTS = { theme: 'midnight', anim: 'on', density: 'comfy', font: 100, fx: 'on', reduceMotionHint: true };

  var S = load();

  function load() {
    var out = {};
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); Object.keys(DEFAULTS).forEach(function (k) { out[k] = s[k] != null ? s[k] : DEFAULTS[k]; }); }
    catch (e) { out = Object.assign({}, DEFAULTS); }
    if (!THEMES[out.theme]) out.theme = 'midnight';
    return out;
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  function get(k) { return S[k]; }
  function set(k, v) { S[k] = v; save(); apply(); }
  function reset() { S = Object.assign({}, DEFAULTS); save(); apply(); }

  function apply() {
    var b = document.body;
    if (!b) return;
    // theme (swap out any po-theme-* class)
    b.className = b.className.replace(/\bpo-theme-\S+/g, '').trim();
    b.classList.add('po-theme-' + S.theme);
    // motion
    b.classList.toggle('po-anim-off', S.anim === 'off');
    // density
    b.classList.toggle('po-compact', S.density === 'compact');
    // fun effects (confetti etc.)
    b.classList.toggle('po-fx-off', S.fx === 'off');
    // font scale via a CSS variable on :root
    document.documentElement.style.setProperty('--po-font-scale', (S.font / 100).toFixed(2));
  }

  function confetti(x, y) {
    if (S.fx === 'off' || S.anim === 'off') return;
    var colors = ['#5aa2ff', '#3fd68c', '#ffbf4d', '#ff6b6b', '#c792ea', '#6fd3e7'];
    for (var i = 0; i < 26; i++) {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;width:8px;height:8px;border-radius:2px;' +
        'left:' + x + 'px;top:' + y + 'px;background:' + colors[i % colors.length] + ';opacity:1;transition:transform 1s ease-out,opacity 1s;';
      document.body.appendChild(d);
      (function (el, dx, dy, rot) {
        requestAnimationFrame(function () {
          el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
          el.style.opacity = '0';
        });
        setTimeout(function () { el.remove(); }, 1100);
      })(d, (Math.random() - 0.5) * 260, (Math.random() - 0.9) * 220, Math.random() * 540);
    }
  }

  function openSettings() {
    var themes = Object.keys(THEMES).map(function (k) {
      return '<option value="' + k + '"' + (S.theme === k ? ' selected' : '') + '>' + THEMES[k].label + '</option>';
    }).join('');
    var fontPct = Math.round(S.font);
    require_ui_modal('<h2>🎨 Make it yours</h2>',
      '<div class="row"><div style="flex:1;min-width:200px"><label class="small muted">Theme</label>' +
      '<select id="prTheme">' + themes + '</select>' +
      '<div class="tiny muted" id="prThemeNote">' + (THEMES[S.theme] || {}).desc + '</div></div>' +
      '<div style="flex:1;min-width:200px"><label class="small muted">Text size — <strong id="prFontV">' + fontPct + '%</strong></label>' +
      '<input type="range" id="prFont" min="85" max="130" step="5" value="' + fontPct + '"></div></div>' +
      '<div class="row" style="margin-top:10px">' +
      '<div style="flex:1;min-width:180px"><label class="small muted">Animations</label>' +
      '<select id="prAnim"><option value="on"' + (S.anim === 'on' ? ' selected' : '') + '>Playful</option>' +
      '<option value="off"' + (S.anim === 'off' ? ' selected' : '') + '>Calm (none)</option></select></div>' +
      '<div style="flex:1;min-width:180px"><label class="small muted">Spacing</label>' +
      '<select id="prDens"><option value="comfy"' + (S.density === 'comfy' ? ' selected' : '') + '>Comfy</option>' +
      '<option value="compact"' + (S.density === 'compact' ? ' selected' : '') + '>Compact</option></select></div></div>' +
      '<div class="row" style="margin-top:10px"><div style="flex:1"><label class="small muted">Fun effects</label>' +
      '<select id="prFx"><option value="on"' + (S.fx === 'on' ? ' selected' : '') + '>On (confetti!)</option>' +
      '<option value="off"' + (S.fx === 'off' ? ' selected' : '') + '>Off</option></select></div>' +
      '<div style="flex:1;align-self:end"><button class="btn sm" id="prReset">Reset to defaults</button></div></div>' +
      '<p class="tiny muted">Saved in this browser. Works offline.</p>',
      [{ label: 'Done', primary: true, onClick: function () { } }]);
    function bind(id, key, after) {
      var el = document.getElementById(id);
      if (el) el.onchange = function () { set(key, el.value); if (after) after(); };
    }
    bind('prTheme', 'theme', function () {
      var n = document.getElementById('prThemeNote');
      if (n) n.textContent = THEMES[get('theme')].desc;
    });
    bind('prAnim', 'anim');
    bind('prDens', 'density');
    bind('prFx', 'fx');
    var fr = document.getElementById('prFont');
    if (fr) fr.oninput = function () {
      document.getElementById('prFontV').textContent = fr.value + '%';
      set('font', +fr.value);
    };
    var rs = document.getElementById('prReset');
    if (rs) rs.onclick = function () { reset(); document.getElementById('prFontV').textContent = Math.round(S.font) + '%'; };
  }

  // late-binding modal (prefs.js loads before ui-core.js)
  function require_ui_modal(head, body, buttons) {
    if (window.PO && PO.ui && PO.ui.modal) return PO.ui.modal(head, body, buttons);
    setTimeout(function () { require_ui_modal(head, body, buttons); }, 120);
  }

  function boot() { apply(); }

  window.PO = window.PO || {};
  PO.prefs = { get: get, set: set, reset: reset, apply: apply, openSettings: openSettings, THEMES: THEMES, confetti: confetti, boot: boot, S: S };
})();