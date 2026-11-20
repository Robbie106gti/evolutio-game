import { PLANT_VARIETIES } from "./species.ts";

export const APP_SHELL = `
<main class="settled"><section id="world" data-tool="inspect"><div id="scene"></div><header><a class="brand" href="./"><span class="logo">e</span> evolutio<span class="tag" data-welcome>A LIVING EXPERIMENT</span></a><button id="levels-button" class="glass">Islands</button><button id="journal-toggle" class="glass" aria-controls="island-journal" aria-expanded="true" aria-label="Hide journal"><span id="journal-verb">Hide </span>Journal</button><button id="help" class="glass" aria-label="Help: controls and saving" title="Controls and saving">? <span>Help</span></button></header>
<div class="intro" data-welcome><div class="eyebrow">YOUR LITTLE WORLD, FINDING ITS WAY</div><h1>Life takes its course.</h1><p>Small differences. New generations. Endless possibilities.</p></div>
<div class="world-label glass" title="Your current island and its simulated day. One day is three simulation minutes; speed controls change how quickly time passes."><span>Island: <strong id="level-name">Verdant Island</strong></span><span id="day">Simulation day 1</span></div>
<div class="legend glass" data-welcome aria-label="Island exploration guide"><b>Tap to inspect</b><span>Animals · Plants & mushrooms</span><span>Nests & dens</span></div>
<section id="advance-overlay" class="glass" aria-labelledby="background-mode" hidden><h2 id="background-mode">Fast-forwarding</h2><p id="background-progress"></p><progress id="generation-progress" aria-label="Generations advanced"></progress><p id="background-detail"></p><div class="advance-actions"><button id="pause-background-advance">Pause</button><button id="stop-background-advance">Stop &amp; return</button></div><p id="background-status" class="visually-hidden" role="status"></p></section><div id="follow-label" hidden></div><div class="hint"><span id="desktop-hint"></span><span id="touch-hint"></span></div>
<div class="island-controls"><div id="family-watch" class="glass" hidden></div><div class="time-controls glass" aria-label="Time controls"><span>Time</span><button id="pause" aria-label="Pause simulation">Ⅱ</button><button class="rate active" data-rate="1">1×</button><button class="rate" data-rate="3">3×</button><button class="rate" data-rate="8">8×</button></div>
<details class="generation-controls glass"><summary>Generations</summary><div class="control-panel generation-panel"><label>Advance <select id="generation-count"><option value="10">10 generations</option><option value="100">100 generations</option><option value="1000">1,000 generations</option></select></label><label>Mode <select id="generation-mode" aria-describedby="generation-mode-help"><option value="detailed">Detailed</option><option value="approximate">Approximate · experimental</option></select></label><span id="generation-mode-help">Detailed simulates individual encounters.</span><button id="restore-jump" hidden>Restore / swap recovery save</button><button id="advance-generations">Run</button><span id="generation-status" role="status">Real evolution · can take time</span></div></details><details class="island-actions glass"><summary>Shape & nurture</summary><div class="control-panel tools-panel"><div class="tool-buttons">${[
  ["inspect", "Explore"],
  ["water", "Water"],
  ["soil", "Soil"],
  ["sand", "Sand"],
  ["plants", "Plant"],
  ["fungus", "Mushrooms"],
  ["disease", "Disease"],
  ["raise", "Raise"],
  ["dig", "Dig"],
]
  .map(
    ([id, label]) =>
      `<button data-tool="${id}" aria-pressed="${id === "inspect"}">${label}</button>`,
  )
  .join(
    "",
  )}</div><div class="brush-options"><label>Brush size <input id="brush-radius" type="range" min="3" max="16" value="6"/><output id="brush-radius-value">6 m</output></label><label>Strength <input id="brush-strength" type="range" min="10" max="100" value="45"/><output id="brush-strength-value">45%</output></label><label>Mode <select id="brush-mode"><option value="add">Add / increase</option><option value="remove">Remove / reduce</option></select></label><label id="plant-options">Plant variety <select id="plant-kind">${Object.entries(
  PLANT_VARIETIES,
)
  .map(
    ([kind, names]) =>
      `<optgroup label="${kind}">${names.map((n, i) => `<option value="${kind}:${i}">${n}</option>`).join("")}</optgroup>`,
  )
  .join(
    "",
  )}</select></label></div><p id="tool-help">Explore: tap an animal, plant or mushroom patch to inspect it.</p><button id="reset" class="reset-island">Archive &amp; start a new map</button></div></details><div id="tool-feedback" role="status" aria-live="polite"></div></div></section>
<aside id="island-journal" aria-label="Island journal"><div class="panel-title"><span>Island journal</span><span class="pill">LIVE</span></div><h2>Your ecosystem</h2>
<section id="lesson" class="glass" hidden></section>
<div class="stats"><div><span id="population">72</span><small>animals</small></div><div><span id="generation">1</span><small title="Highest generation born on this island. Living animals may belong to earlier generations.">generation reached</small></div><div><span id="plants">160</span><small>plants</small></div></div>
<div class="journal-actions"><button id="open-evolution" class="meet-animal">Explore evolution &amp; family trees ↗</button><button id="lineage-overlay-toggle" class="meet-animal" aria-pressed="false">Show family colours</button><p id="lineage-overlay-help" hidden>Coloured rings identify mouse lineages. Select a mouse to show only its lineage; clear selection to show all. Colours are a guide, not camouflage.</p><button id="youngest" class="meet-animal">Meet the youngest ↗</button><button id="sleepers" class="meet-animal">Watch a sleeper</button><button id="enable-breeding" class="meet-animal" hidden>Enable natural reproduction</button><div id="breeding-guide" hidden><p>Pink rings mark courtship, orange rings mark rivals, gold rings mark animals expecting young, and teal rings mark fish changing sex.</p><button id="watch-breeding" class="meet-animal" disabled>Watch breeding activity</button></div></div>
<details class="journal-section"><summary>Weather &amp; habitat</summary><div id="weather-panel" class="weather-panel"></div><div class="biome-key">Forest · Plains · Desert · Lakes · River</div></details>
<details class="journal-section"><summary>Population &amp; survival</summary><canvas id="chart" width="560" height="280" aria-label="Population history by diet and plants" role="img"></canvas><div id="counts" class="chart-key" title="Diets reflect this simulation. Bugs recycle remains as detritivores; mice change diet category with inherited traits."></div><h3>Causes of death</h3><div id="mortality"></div></details>
<details class="journal-section" id="egg-journal"><summary>Eggs by species</summary>
<table class="egg-table">
<caption>Eggs that are developing or waiting right now</caption>
<thead><tr><th scope="col">Species</th><th scope="col">Laid</th><th scope="col">Developing</th><th scope="col">Waiting</th></tr></thead>
<tbody id="egg-rows"></tbody>
</table>
<p class="egg-note">Waiting eggs need suitable conditions to resume. The Laid column counts all eggs since tracking began, including losses. Older saves start tracking with this update.</p>
</details>
<details class="journal-section" id="tree-browse-journal"><summary>Tree browsing by species</summary>
<table class="egg-table">
<caption>Tree energy removed by feeding since tracking began</caption>
<thead><tr><th scope="col">Species</th><th scope="col">Energy removed</th></tr></thead>
<tbody id="tree-browse-rows"></tbody>
</table>
</details>
<details class="journal-section"><summary>Wildlife</summary><div class="introduce-controls"><label>Animal <select id="animal-kind"></select></label><label>Number <select id="animal-count"><option value="1">1</option><option value="5">5</option><option value="12" selected>12</option></select></label><button id="add-animals">Add animals</button><p id="animal-add-status" role="status"></p></div><div id="species-list"></div><button id="introduce" class="meet-animal">Introduce missing species</button><p id="wildlife-note" class="muted" role="status">Select a species to meet one.</p></details>
<details class="journal-section"><summary>Evolution &amp; lineages</summary><h3>Inherited traits</h3><div id="traits"></div><h3>Mouse branches</h3><div id="mouse-branches"></div><h3>Plant lineages</h3><div id="plant-lineages"></div></details>
<div class="challenge"><div class="eyebrow">TRY AN EXPERIMENT</div><h3 id="challenge-title">Room to grow</h3><p id="challenge-text">Food is plentiful. Give your first generations time to settle in.</p><button id="scarcity">Try lean times <span>→</span></button></div>
<details class="journal-section"><summary>Field notes</summary><div id="events"></div></details>
<div class="save-panel"><button id="save">Save island</button><button id="export-island">Export backup</button><button id="import-island" type="button">Import backup</button><input id="island-backup-file" type="file" accept=".json,application/json" hidden><span id="save-status" role="status">Autosaves every 10 seconds</span><span id="import-status" role="status"></span><p>Saved in this browser.</p></div><div class="footer">Seed 7823 · Simulated on your device</div></aside>
<dialog id="level-select" aria-labelledby="level-select-title"><button id="close-levels" class="close" aria-label="Close island selection">×</button><div class="eyebrow">CHOOSE YOUR NEXT DISCOVERY</div><h2 id="level-select-title">Your islands</h2><p>Learn step by step, or return to your sandbox. Each island saves separately in this browser.</p><div id="level-cards"></div><section><h3>Current island saves</h3><button id="fresh-map">Archive &amp; start a new map</button><div id="island-archives"></div></section><p id="level-error" role="status"></p></dialog>
<dialog id="evolution-journal" aria-labelledby="evolution-title"></dialog>
<section id="inspect" class="glass" hidden></section>
<dialog id="guide" aria-labelledby="help-title"><button id="close-guide" class="close" aria-label="Close help">×</button><h2 id="help-title">Controls &amp; saving</h2>
<dl class="help-topics">
<dt>Move around</dt><dd>Drag to orbit. Use arrow keys to pan; hold Shift to move faster. Scroll or pinch to zoom.</dd>
<dt>Inspect &amp; edit</dt><dd>Tap an animal, plant, mushroom, nest or den to inspect it. Select Follow animal to track it. Open Shape &amp; nurture for brushes; press Esc to return to Explore.</dd>
<dt>Control time</dt><dd>Pause or choose 1×, 3× or 8×. Generations advances behind the scenes; Stop &amp; return brings you back. Hide journal gives the island more room.</dd>
<dt>Keep your progress</dt><dd>Open the journal for Save island and Export backup. Islands autosave in this browser; each island has a separate save. Export backup downloads a copy. Progress stays on this device and does not advance while closed.</dd>
</dl><a href="./gallery.html" target="_blank" rel="noopener">Open wildlife gallery ↗</a><p class="help-context">Curious about a creature or plant? Its inspector explains its needs, traits and role in the ecosystem.</p><button id="begin" class="primary">Back to island</button></dialog></main>`;

