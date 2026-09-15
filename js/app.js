/* ============================================================
   Prompt Organizer — app.js
   Boot, first-run seeding, sample data, snapshot-mode behavior.
   ============================================================ */
(function () {
  'use strict';

  function seedDefaults(W) {
    if (!W.templates.length) {
      W.templates = [
        { name: 'Feature spec', body: '# {{feature}}\n\n## Goal\n{{goal}}\n\n## Requirements\n- The system must {{req1}}\n- The system should {{req2}}\n\n## Non-goals\n- {{nongoal}}\n\n## Acceptance\n- [ ] {{check1}}' },
        { name: 'Mechanic brief', body: '# Mechanic: {{mechanic}}\n\nLoop: {{loop}}\n\nRules:\n- {{rule1}}\n- {{rule2}}\n\nNumbers: {{numbers}}' },
        { name: 'Bug / issue', body: '# Issue: {{title}}\n\nExpected: {{expected}}\nActual: {{actual}}\n\nSteps:\n1. {{step1}}\n2. {{step2}}' }
      ];
    }
    if (!W.snippets.length) {
      W.snippets = [
        { name: 'Auth requirement', body: 'The system must require login before accessing any personal data. Sessions expire after 30 minutes of inactivity.' },
        { name: 'Rate limit', body: 'The API must enforce rate limiting: 100 requests per minute per user, with HTTP 429 responses when exceeded.' },
        { name: 'A11y baseline', body: 'All interactive elements must be keyboard reachable with visible focus states, and color must never be the only signal.' }
      ];
    }
    if (!Object.keys(W.variables).length) {
      W.variables = { game: 'Pixel Quest', version: '0.1.0', author: 'you' };
    }
  }

  function samplePrompt() {
    return [
      '# Pixel Quest — cozy farming RPG + companion web app',
      '',
      'Pixel Quest is a cozy farming RPG for PC and mobile. Players grow crops, befriend villagers, explore caves, and team up with friends in co-op multiplayer. A companion web app lets players check crop timers, trade items, and chat with their co-op party from anywhere.',
      '',
      '## Farming',
      '',
      'The farming loop must feel relaxing but deep. Players till soil, plant seeds, water crops daily, and harvest for gold and cooking ingredients.',
      '',
      'Crops have growth stages and seasons. The system must support at least 40 crops across 4 seasons, and each crop must define growth time, sell price, and season.',
      '',
      'Players can upgrade their watering can to water multiple tiles. The upgraded can should reduce daily chores without removing them entirely.',
      '',
      'Irrigation is a maybe-later idea — perhaps sprinklers the player can craft, or maybe automated watering via farmhands. Something like that.',
      '',
      'The farming system allows players to grow crops and harvest them for gold.',
      '',
      '## Villagers & quests',
      '',
      'There are 12 villagers, each with a daily schedule, gift tastes, and a friendship meter from 0 to 10 hearts.',
      '',
      'Villagers must react when the player gives a loved gift, with unique dialogue per villager. Dialogue should feel warm and specific, never generic.',
      '',
      'The quest log must track main quests, side quests, and daily favors. Players can abandon side quests but never main quests.',
      '',
      'Quest rewards include gold, recipes, and cosmetic hats. Hats are purely cosmetic and must never affect stats.',
      '',
      'What if villagers could visit the player farm on festival days? Could be cute. TBD how scheduling works.',
      '',
      '## Co-op multiplayer',
      '',
      'Up to 4 players can farm together online. The host owns the farm; guests bring their own tools and keep earned gold.',
      '',
      'The system must handle disconnects gracefully: a disconnected guest\'s character sleeps, and their items are never lost.',
      '',
      'Multiplayer must never allow item duplication. Trading between players must be confirmed by both sides.',
      '',
      'Voice chat is out of scope for version 1. Text chat with emoji must be included, and chat must support muting players.',
      '',
      'How do we handle latency for watering animations? Unknown — needs design.',
      '',
      '## Combat & caves',
      '',
      'The mines have 60 levels with escalating monsters, ores, and traps. Combat is real-time with dodge roll and three weapon types: sword, hammer, slingshot.',
      '',
      'Monsters must scale with depth, and bosses must appear every 10 levels. Boss drops must include a unique crafting material.',
      '',
      'Players should be able to flee combat at any time. Death in the mines must return the player to the entrance with half their gold — harsh but fair, maybe?',
      '',
      'Stamina limits daily actions. The system must show stamina clearly, and food must restore stamina.',
      '',
      '## Login & accounts',
      '',
      'Players must log in to save progress to the cloud. Login supports email + password and guest mode.',
      '',
      'Passwords must be at least 12 characters. Sessions should expire after 30 days on trusted devices.',
      '',
      'The system should support parental controls, ideally with play-time limits. Details TBD.',
      '',
      '## Companion web app',
      '',
      'The companion web app must show crop timers, weather forecasts, and party chat. It must work on mobile browsers.',
      '',
      'Users can log in with the same account as the game. The app should load in under 2 seconds on 4G.',
      '',
      'Push notifications should remind players when crops are ready. Users can disable notifications entirely.',
      '',
      'Design mockup: ![farm dashboard mockup](assets/farm-dashboard.png) — see the art folder for full-res versions.',
      '',
      '## Crafting',
      '',
      'Crafting uses materials from farming, mining, and foraging. There must be at least 80 recipes at launch.',
      '',
      'Recipe discovery should reward experimentation: unknown combinations can be attempted, and successes are recorded.',
      '',
      'Crafting must never consume quest items.',
      '',
      '## Save system',
      '',
      'The game must autosave every in-game hour and on sleep. Manual save slots: 3 per profile.',
      '',
      'Cloud saves must sync across PC and mobile. Conflicts must keep both copies and ask the player.',
      '',
      'Corrupted saves must be recoverable from the previous backup automatically.',
      '',
      '## Rules & policies',
      '',
      'The game must never show ads. Player data must never be sold.',
      '',
      'Chat must be moderated: blocked words are filtered, and players can report and block others.',
      '',
      'The game should be playable offline except for multiplayer and cloud sync.',
      '',
      '```js',
      '',
      '// growth tick — runs every in-game hour',
      'function tickGrowth(crop, weather) {',
      '  if (crop.stage >= crop.stages) return crop;',
      '  const rate = weather === "rain" ? 2 : 1;',
      '  crop.progress += rate * crop.growthRate;',
      '  if (crop.progress >= 100) { crop.stage++; crop.progress = 0; }',
      '  return crop;',
      '}',
      '```',
      '',
      '## Audio & art',
      '',
      'The soundtrack must adapt to seasons and time of day. Sound effects should be soft and cozy.',
      '',
      'Pixel art at 16x16 base resolution, upscaled cleanly. The art guide (docs/art-guide.md) defines the palette.',
      '',
      '## Launch plan',
      '',
      'Version 1 must include farming, villagers, quests, mining, crafting, and 2-player co-op. 4-player co-op should follow in 1.1.',
      '',
      'The game will not support mods at launch. Mod support is explicitly out of scope for version 1.',
      '',
      'We must hit 60fps on mid-range phones. Loading screens must never exceed 5 seconds.',
    ].join('\n');
  }

  function snapshotWorkspace() {
    // Snapshot files carry their own workspace — parse it synchronously so
    // boot never touches (or clobbers) the live store.
    if (!window.PO_SNAPSHOT_MODE) return null;
    try {
      var el = document.getElementById('snapshot-data');
      if (!el) return null;
      var raw = el.textContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      var obj = JSON.parse(raw);
      PO.store.S.snapshotMode = true;
      var ws = PO.store.normalizeImported(obj.workspace || obj);
      PO.store.S.workspace = ws;
      return ws;
    } catch (e) {
      console.error('snapshot parse failed', e);
      return null;
    }
  }

  function ready(W) {
    seedDefaults(W);
    PO.readme.regenerateAll(W);
    document.getElementById('wsName').value = W.name;
    PO.ui.boot(); // ui.boot also restores snapshot mode + badge as belt-and-braces
    if (window.PO_SNAPSHOT_MODE) {
      PO.ui.toast('Offline snapshot — viewer, search, graph, stats, and recompile all work without a network.', 'ok');
    } else {
      PO.store.persist();
    }
  }

  function boot() {
    PO.store.getUserId();
    var snap = snapshotWorkspace();
    if (snap) { ready(snap); return; }
    PO.store.restore().then(function (ws) {
      var W;
      if (ws) {
        W = PO.store.normalizeImported(ws);
      } else {
        W = PO.store.blankWorkspace('My Prompt Workspace');
        var r = PO.ingest.ingestPrompt(W, 'Sample: Tiny RPG Spec', samplePrompt(), {});
        PO.store.log('seed', 'First run: sample prompt organized (' + r.stats.created + ' items). Delete it any time.', null);
      }
      PO.store.S.workspace = W;
      ready(W);
    }).catch(function (e) {
      console.error(e);
      document.getElementById('tabContent').innerHTML =
        '<div class="card"><h2>Startup failed</h2><pre>' + (e.stack || e.message) + '</pre></div>';
    });
  }

  PO.app = { boot: boot, samplePrompt: samplePrompt, seedDefaults: seedDefaults };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
