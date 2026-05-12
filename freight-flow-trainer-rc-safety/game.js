/* Freight Flow Trainer
   Sections: config, state, layout, utilities, freight, bases, staging, IBT,
   empty pallets, input, update, rendering. */

// ---------------------------------------------------------------------------
// Constants / config
// ---------------------------------------------------------------------------
const DESIGN = { w: 1200, h: 900 };

const COLORS = {
  bg: "#0b1220",
  floor: "#17202c",
  floor2: "#1f2937",
  ink: "#edf6ff",
  muted: "#91a4b7",
  panel: "rgba(13, 24, 36, 0.88)",
  panel2: "rgba(22, 34, 48, 0.9)",
  outline: "rgba(224, 242, 254, 0.22)",
  green: "#22c55e",
  yellow: "#facc15",
  red: "#ef4444",
  blue: "#0ea5e9",
  shadow: "rgba(0, 0, 0, 0.35)",
  pallet: "#d8a35d",
  palletDark: "#8b5a2b",
  dock: "#263548",
  safety: "#f59e0b",
};

const FREIGHT = {
  brown: { name: "Brown", color: "#a16207", accent: "#facc15", weight: 40 },
  red: { name: "Red", color: "#dc2626", accent: "#fecaca", weight: 20 },
  orange: { name: "Orange", color: "#f97316", accent: "#fed7aa", weight: 15 },
  purple: { name: "Purple", color: "#8b5cf6", accent: "#ddd6fe", weight: 15 },
  blue: { name: "Blue", color: "#0284c7", accent: "#bae6fd", weight: 10 },
};

const CONFIG = {
  baseCapacity: 6,
  artCapacity: 100,
  primarySpawnMs: 900,
  secondarySpawnMs: 2200,
  trailerRefillMs: 45000,
  raaPalletBoxes: 3,
  stackLimit: 7,
  stagingColumns: 4,
  stagingRows: 3,
  stagingSlotCapacity: 3,
  autoGpmCheckMs: 5000,
  autoGpmChance: 0.35,
  ibtCapacity: 10,
  ibtClearMs: 15000,
  blockedGraceMs: 1000,
  blockedPenaltyMs: 1000,
  score: {
    stagePallet: 100,
    ibtPallet: 125,
    fastFlow: 25,
    emptyPallet: 10,
    manualGpm: -100,
    blockedPenalty: -50,
    autoGpmPerPallet: 25,
    ibtClearPerPallet: 50,
    unsafeDrive: -25,
    speeding: -15,
  },
  rc: {
    safeSpeedPerSecond: 720,
    penaltyCooldownMs: 850,
  },
};

const LAYOUT = {
  hud: { x: 18, y: 16, w: 1164, h: 112 },
  floor: { x: 44, y: 150, w: 1112, h: 704 },
  primaryLane: { x: 66, y: 260, w: 238, h: 492 },
  secondaryLane: { x: 896, y: 260, w: 238, h: 492 },
  staging: { x: 406, y: 642, w: 388, h: 186 },
  drive: { x: 326, y: 274, w: 548, h: 342 },
  conveyorPrimary: { x1: 150, y1: 236, x2: 300, y2: 236, x3: 300, y3: 720 },
  conveyorSecondary: { x1: 1050, y1: 236, x2: 900, y2: 236, x3: 900, y3: 720 },
  emptyTrailer: { x: 420, y: 162, w: 154, h: 74 },
  ibt: { x: 628, y: 162, w: 150, h: 74 },
  primaryArt: { x: 72, y: 162, w: 150, h: 74 },
  secondaryArt: { x: 982, y: 162, w: 150, h: 74 },
  primaryRaa: { x: 240, y: 162, w: 132, h: 74 },
  secondaryRaa: { x: 832, y: 162, w: 132, h: 74 },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const state = {
  now: 0,
  last: performance.now(),
  score: 0,
  status: "Keep the lanes green. Build pallets, stage by color, and replenish empties early.",
  gameOver: false,
  selectedPallet: null,
  selectedStack: null,
  splitMode: false,
  splitTargets: [],
  floaters: [],
  particles: [],
  movingBoxes: [],
  buttons: [],
  hitRegions: [],
  autoGpmTimer: 0,
  flash: 0,
  sides: {
    primary: null,
    secondary: null,
  },
  staging: [],
  ibt: {
    count: 0,
    clearing: false,
    timer: 0,
    bounds: LAYOUT.ibt,
  },
  rc: {
    x: 600,
    y: 448,
    targetX: 600,
    targetY: 448,
    lastX: 600,
    lastY: 448,
    active: false,
    penaltyTimer: 0,
    speed: 0,
    safetyMistakes: 0,
  },
  emptyStacks: [],
};

function makeSide(key, label, artBounds, raaBounds, spawnMs) {
  return {
    key,
    label,
    source: "ART",
    art: {
      backlog: CONFIG.artCapacity,
      refill: false,
      timer: 0,
      spawnTimer: 0,
      spawnMs,
      bounds: artBounds,
    },
    raa: {
      boxes: 0,
      bounds: raaBounds,
    },
    bases: [],
    flow: "good",
  };
}

// ---------------------------------------------------------------------------
// Entities / layout
// ---------------------------------------------------------------------------
function init() {
  state.sides.primary = makeSide("primary", "Primary", LAYOUT.primaryArt, LAYOUT.primaryRaa, CONFIG.primarySpawnMs);
  state.sides.secondary = makeSide("secondary", "Secondary", LAYOUT.secondaryArt, LAYOUT.secondaryRaa, CONFIG.secondarySpawnMs);
  buildBases();
  buildStacks();
  buildStaging();
  requestAnimationFrame(loop);
}

function buildBases() {
  const ys = [286, 374, 462, 550, 638];
  ys.forEach((y, i) => state.sides.primary.bases.push(makeBase("primary", i, 222, y)));
  ys.forEach((y, i) => state.sides.secondary.bases.push(makeBase("secondary", i, 908, y)));
}

function makeBase(side, index, x, y) {
  return {
    side,
    index,
    x,
    y,
    w: 70,
    h: 92,
    hasPallet: true,
    color: null,
    count: 0,
    blocked: false,
    fullSince: 0,
    penaltyTimer: 0,
    fastBonusAvailable: false,
  };
}

function buildStacks() {
  state.emptyStacks = [
    { id: "pStack", side: "primary", label: "Primary Stack", x: 90, y: 336, w: 110, h: 78, count: 0 },
    { id: "sStack", side: "secondary", label: "Secondary Stack", x: 1000, y: 336, w: 110, h: 78, count: 0 },
  ];
}

function buildStaging() {
  state.staging = [];
  for (let c = 0; c < CONFIG.stagingColumns; c += 1) {
    const col = { pendingDrop: false, rows: [] };
    for (let r = 0; r < CONFIG.stagingRows; r += 1) {
      col.rows.push({ count: 0, color: null });
    }
    state.staging.push(col);
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function paddedRect(r, pad) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function addScore(points, x = 600, y = 120, label = null) {
  state.score += points;
  const text = label || `${points > 0 ? "+" : ""}${points}`;
  state.floaters.push({ text, x, y, life: 1050, color: points >= 0 ? "#86efac" : "#fca5a5" });
}

function setStatus(message) {
  state.status = message;
}

function formatSeconds(ms) {
  return `${Math.ceil(ms / 1000)}s`;
}

function pickFreightColor() {
  const roll = Math.random() * 100;
  let total = 0;
  for (const key of Object.keys(FREIGHT)) {
    total += FREIGHT[key].weight;
    if (roll <= total) return key;
  }
  return "brown";
}

function pathPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function addSpark(x, y, color) {
  for (let i = 0; i < 8; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.8) * 0.15,
      life: 520 + Math.random() * 280,
      color,
    });
  }
}

// ---------------------------------------------------------------------------
// Freight / source systems
// ---------------------------------------------------------------------------
function updateSources(dt) {
  for (const side of Object.values(state.sides)) {
    updateTrailerRefill(side, dt);
    side.art.spawnTimer += dt;
    if (side.art.spawnTimer >= side.art.spawnMs) {
      side.art.spawnTimer %= side.art.spawnMs;
      feedSide(side);
    }
  }
}

function updateTrailerRefill(side, dt) {
  if (!side.art.refill) return;
  side.art.timer -= dt;
  if (side.art.timer <= 0) {
    side.art.refill = false;
    side.art.timer = 0;
    side.art.backlog = CONFIG.artCapacity;
    setStatus(`${side.label} ART trailer is back on the dock with 100 boxes.`);
    addSpark(center(side.art.bounds).x, center(side.art.bounds).y, COLORS.green);
  }
}

function feedSide(side) {
  if (state.gameOver) return;
  if (side.source === "ART") {
    if (side.art.backlog <= 0) return;
  } else if (side.raa.boxes <= 0) {
    return;
  }

  const color = pickFreightColor();
  const base = findTargetBase(side, color);
  if (!base) {
    setStatus(`${side.label} has no valid ready base for ${FREIGHT[color].name}. Clear or replenish pallets.`);
    return;
  }

  base.color = color;
  if (side.source === "ART") side.art.backlog -= 1;
  else side.raa.boxes -= 1;

  const sourceBounds = side.source === "ART" ? side.art.bounds : side.raa.bounds;
  state.movingBoxes.push({
    side: side.key,
    color,
    target: base,
    start: center(sourceBounds),
    end: { x: base.x + base.w / 2, y: base.y + 20 },
    t: 0,
    dur: 720,
  });
}

function findTargetBase(side, color) {
  const active = side.bases.find((base) =>
    base.hasPallet && !base.blocked && base.color === color && base.count < CONFIG.baseCapacity
  );
  if (active) return active;
  return side.bases.find((base) =>
    base.hasPallet && !base.blocked && base.count === 0 && base.color === null
  );
}

function updateMovingBoxes(dt) {
  for (let i = state.movingBoxes.length - 1; i >= 0; i -= 1) {
    const box = state.movingBoxes[i];
    box.t += dt / box.dur;
    if (box.t >= 1) {
      landBox(box);
      state.movingBoxes.splice(i, 1);
    }
  }
}

function landBox(box) {
  const base = box.target;
  if (!base.hasPallet || base.blocked) return;
  base.count = clamp(base.count + 1, 0, CONFIG.baseCapacity);
  if (base.count >= CONFIG.baseCapacity) {
    base.blocked = true;
    base.fullSince = state.now;
    base.penaltyTimer = 0;
    base.fastBonusAvailable = true;
    setStatus(`${labelSide(base.side)} Base ${base.index + 1} is full. Move it before penalties start.`);
    addSpark(base.x + base.w / 2, base.y + 38, FREIGHT[base.color].color);
  }
}

function requestTrailer(sideKey) {
  const side = state.sides[sideKey];
  if (side.art.backlog > 0 || side.art.refill) {
    setStatus(`${side.label} ART request is not needed yet.`);
    return;
  }
  side.art.refill = true;
  side.art.timer = CONFIG.trailerRefillMs;
  setStatus(`${side.label} ART trailer requested. Use RAA flow while it is being swapped.`);
}

function toggleDoor(sideKey) {
  const side = state.sides[sideKey];
  side.source = side.source === "ART" ? "RAA" : "ART";
  setStatus(`${side.label} flow switched to ${side.source}.`);
}

function clickRaa(sideKey) {
  const side = state.sides[sideKey];
  if (side.source !== "RAA") {
    setStatus(`Toggle ${side.label} to RAA before staging an RAA pallet.`);
    return;
  }
  if (side.raa.boxes > 0) {
    setStatus(`${side.label} RAA pallet still has ${side.raa.boxes} boxes.`);
    return;
  }
  side.raa.boxes = CONFIG.raaPalletBoxes;
  setStatus(`${side.label} RAA pallet staged with 3 boxes.`);
  addSpark(center(side.raa.bounds).x, center(side.raa.bounds).y, COLORS.yellow);
}

// ---------------------------------------------------------------------------
// Base systems
// ---------------------------------------------------------------------------
function updateBases(dt) {
  let primaryBlocked = 0;
  let secondaryBlocked = 0;
  for (const side of Object.values(state.sides)) {
    for (const base of side.bases) {
      if (!base.blocked) continue;
      if (side.key === "primary") primaryBlocked += 1;
      else secondaryBlocked += 1;
      const blockedFor = state.now - base.fullSince;
      if (blockedFor > CONFIG.blockedGraceMs) {
        base.fastBonusAvailable = false;
        base.penaltyTimer += dt;
        while (base.penaltyTimer >= CONFIG.blockedPenaltyMs) {
          base.penaltyTimer -= CONFIG.blockedPenaltyMs;
          addScore(CONFIG.score.blockedPenalty, base.x + base.w / 2, base.y - 10);
          setStatus("Blocked pallets are costing flow points. Move full pallets quickly.");
        }
      }
    }
  }
  if (primaryBlocked === 5 && secondaryBlocked === 5) {
    state.gameOver = true;
    setStatus("Game over: both sides are fully blocked. Restart the page to try again.");
  }
}

function selectFullPallet(base) {
  if (!base.blocked) return;
  state.selectedStack = null;
  state.selectedPallet = { base };
  setStatus(`${labelSide(base.side)} ${FREIGHT[base.color].name} pallet selected.`);
}

function clearMovedBase(base) {
  if (base.fastBonusAvailable && state.now - base.fullSince <= CONFIG.blockedGraceMs) {
    addScore(CONFIG.score.fastFlow, base.x + base.w / 2, base.y - 16, "+25 fast");
  }
  base.hasPallet = false;
  base.color = null;
  base.count = 0;
  base.blocked = false;
  base.fullSince = 0;
  base.penaltyTimer = 0;
  base.fastBonusAvailable = false;
  state.selectedPallet = null;
}

function labelSide(sideKey) {
  return sideKey === "primary" ? "Primary" : "Secondary";
}

// ---------------------------------------------------------------------------
// Staging systems
// ---------------------------------------------------------------------------
function stageSelectedPallet(columnIndex) {
  if (!state.selectedPallet) return;
  const base = state.selectedPallet.base;
  const color = base.color;
  if (color === "blue") {
    setStatus("Blue pallets must go to the IBT trailer.");
    return;
  }
  const column = state.staging[columnIndex];
  const rowIndex = findStagingRow(column, color);
  if (rowIndex === -1) {
    setStatus("That staging column cannot accept this pallet color right now.");
    return;
  }
  const row = column.rows[rowIndex];
  row.color = color;
  row.count += 1;
  addScore(CONFIG.score.stagePallet, base.x + base.w / 2, base.y - 24);
  setStatus(`${FREIGHT[color].name} pallet staged in ${rowName(rowIndex)} row.`);
  clearMovedBase(base);
  resolveColumnDrop(column);
}

function findStagingRow(column, color) {
  const order = column.pendingDrop ? [1, 0] : [2, 1, 0];
  for (const rowIndex of order) {
    const row = column.rows[rowIndex];
    if (row.count >= CONFIG.stagingSlotCapacity) continue;
    if (row.color && row.color !== color) continue;
    return rowIndex;
  }
  return -1;
}

function resolveColumnDrop(column) {
  if (!column.pendingDrop) return;
  for (let r = 1; r >= 0; r -= 1) {
    const row = column.rows[r];
    const below = column.rows[r + 1];
    if (below.count === 0 && row.count === CONFIG.stagingSlotCapacity) {
      below.count = row.count;
      below.color = row.color;
      row.count = 0;
      row.color = null;
      column.pendingDrop = false;
      setStatus("Completed staging row dropped into the cleared GPM lane.");
      addSpark(LAYOUT.staging.x + 40, LAYOUT.staging.y + 220, COLORS.green);
      return;
    }
  }
}

function updateAutoGpm(dt) {
  state.autoGpmTimer += dt;
  if (state.autoGpmTimer < CONFIG.autoGpmCheckMs) return;
  state.autoGpmTimer %= CONFIG.autoGpmCheckMs;
  if (Math.random() > CONFIG.autoGpmChance) return;

  const candidates = state.staging
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => col.rows[2].count === CONFIG.stagingSlotCapacity);
  if (!candidates.length) return;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const cleared = picked.col.rows[2].count;
  picked.col.rows[2] = { count: 0, color: null };
  picked.col.pendingDrop = true;
  addScore(cleared * CONFIG.score.autoGpmPerPallet, LAYOUT.staging.x + picked.index * 86 + 40, LAYOUT.staging.y + 270, "GPM");
  setStatus("Auto GPM cleared a bottom staging row. Fill the row above to drop it down.");
  resolveColumnDrop(picked.col);
}

function manualGpm() {
  let total = 0;
  for (const col of state.staging) {
    col.pendingDrop = false;
    for (const row of col.rows) {
      total += row.count;
      row.count = 0;
      row.color = null;
    }
  }
  addScore(CONFIG.score.manualGpm, 600, 300, "-100 GPM");
  setStatus(total ? "Manual GPM cleared all staged pallets." : "Manual GPM called on empty staging.");
}

function rowName(index) {
  return ["top", "middle", "bottom"][index];
}

// ---------------------------------------------------------------------------
// IBT systems
// ---------------------------------------------------------------------------
function stageToIbt() {
  if (!state.selectedPallet) return;
  const base = state.selectedPallet.base;
  if (base.color !== "blue") {
    setStatus("Only blue pallets can be staged into the IBT trailer.");
    return;
  }
  if (state.ibt.clearing) {
    setStatus("IBT is being swapped. Hold blue pallets until the new trailer is ready.");
    return;
  }
  if (state.ibt.count >= CONFIG.ibtCapacity) {
    setStatus("IBT trailer is full. Request a new IBT before staging more blue.");
    return;
  }
  state.ibt.count += 1;
  addScore(CONFIG.score.ibtPallet, center(LAYOUT.ibt).x, center(LAYOUT.ibt).y);
  setStatus(`Blue pallet staged to IBT (${state.ibt.count}/10).`);
  clearMovedBase(base);
}

function requestIbt() {
  if (state.ibt.clearing) {
    setStatus(`IBT swap already in progress: ${formatSeconds(state.ibt.timer)} remaining.`);
    return;
  }
  if (state.ibt.count === 0) {
    setStatus("IBT is already empty.");
    return;
  }
  state.ibt.clearing = true;
  state.ibt.timer = CONFIG.ibtClearMs;
  setStatus("New IBT requested. Blue staging is paused during the swap.");
}

function updateIbt(dt) {
  if (!state.ibt.clearing) return;
  state.ibt.timer -= dt;
  if (state.ibt.timer <= 0) {
    const cleared = state.ibt.count;
    state.ibt.count = 0;
    state.ibt.clearing = false;
    state.ibt.timer = 0;
    addScore(cleared * CONFIG.score.ibtClearPerPallet, center(LAYOUT.ibt).x, LAYOUT.ibt.y - 12, "IBT clear");
    setStatus(`IBT swapped and ${cleared} blue pallets shipped.`);
  }
}

// ---------------------------------------------------------------------------
// Empty pallet systems
// ---------------------------------------------------------------------------
function startSplit() {
  let refilled = 0;
  for (const stack of state.emptyStacks) {
    if (stack.count === 0) {
      stack.count = CONFIG.stackLimit;
      refilled += 1;
      addSpark(stack.x + stack.w / 2, stack.y + stack.h / 2, COLORS.pallet);
    }
  }
  state.splitMode = false;
  state.selectedPallet = null;
  state.selectedStack = null;
  setStatus(refilled ? "Empty pallet trailer refilled empty side stacks to 7." : "Both side stacks still have pallets.");
}

function clickStack(stack) {
  if (state.splitMode) {
    if (stack.count !== 0) {
      setStatus("That stack still has pallets. Refill side stacks only when they reach 0.");
      return;
    }
    stack.count = CONFIG.stackLimit;
    state.splitMode = false;
    state.splitTargets = [];
    setStatus(`${stack.label} refilled to 7 empty pallets.`);
    addSpark(stack.x + stack.w / 2, stack.y + stack.h / 2, COLORS.pallet);
    return;
  }
  if (stack.count <= 0) {
    stack.count = CONFIG.stackLimit;
    state.selectedStack = stack;
    state.selectedPallet = null;
    setStatus(`${stack.label} refilled to 7 and selected. Click a matching empty base.`);
    addSpark(stack.x + stack.w / 2, stack.y + stack.h / 2, COLORS.pallet);
    return;
  }
  state.selectedStack = stack;
  state.selectedPallet = null;
  setStatus(`${stack.label} empty pallet stack selected (${stack.count} left).`);
}

function placeEmptyPallet(base) {
  const stack = state.selectedStack;
  if (!stack) return false;
  if (stack.side !== base.side) {
    setStatus("Empty pallets must be placed on the matching side.");
    return true;
  }
  if (base.hasPallet) {
    setStatus("That base already has an empty pallet or active freight.");
    return true;
  }
  if (stack.count <= 0) {
    setStatus("Selected empty pallet stack is depleted.");
    state.selectedStack = null;
    return true;
  }
  stack.count -= 1;
  base.hasPallet = true;
  base.count = 0;
  base.color = null;
  base.blocked = false;
  addScore(CONFIG.score.emptyPallet, base.x + base.w / 2, base.y - 16, "+10 pallet");
  setStatus(`${labelSide(base.side)} Base ${base.index + 1} replenished.`);
  if (stack.count === 0) state.selectedStack = null;
  return true;
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const p = screenToGame(event);
  handleClick(p);
});

canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  updatePointerDrive(screenToGame(event));
});

function screenToGame(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * DESIGN.w,
    y: ((event.clientY - rect.top) / rect.height) * DESIGN.h,
  };
}

function handleClick(p) {
  if (state.gameOver) return;

  for (const button of state.buttons) {
    if (inRect(p, button)) {
      button.action();
      return;
    }
  }

  if (inRect(p, LAYOUT.emptyTrailer)) {
    startSplit();
    return;
  }
  if (inRect(p, LAYOUT.ibt)) {
    stageToIbt();
    return;
  }
  for (const side of Object.values(state.sides)) {
    if (inRect(p, side.raa.bounds)) {
      clickRaa(side.key);
      return;
    }
  }
  for (const stack of state.emptyStacks) {
    if (inRect(p, paddedRect(stack, 10))) {
      clickStack(stack);
      return;
    }
  }

  const base = clickedBase(p);
  if (base) {
    if (base.blocked) {
      selectFullPallet(base);
      return;
    }
    if (placeEmptyPallet(base)) return;
    setStatus(base.hasPallet ? "That base is still building." : "Base needs an empty pallet.");
    return;
  }

  const col = stagingColumnAt(p);
  if (col !== -1) {
    stageSelectedPallet(col);
  }
}

function updatePointerDrive(p) {
  const safe = inRect(p, LAYOUT.drive);
  state.rc.active = safe;
  if (safe) {
    state.rc.targetX = p.x;
    state.rc.targetY = p.y;
  }
  if (state.selectedPallet && !safe) {
    drivingMistake("Keep the RC operator in the marked center drive lane while carrying freight.", CONFIG.score.unsafeDrive);
  }
}

function drivingMistake(message, points) {
  if (state.rc.penaltyTimer > 0) return;
  state.rc.safetyMistakes += 1;
  state.rc.penaltyTimer = CONFIG.rc.penaltyCooldownMs;
  addScore(points, state.rc.x, state.rc.y - 24, points === CONFIG.score.speeding ? "speed" : "unsafe");
  setStatus(message);
}

function clickedBase(p) {
  const candidates = [];
  for (const side of Object.values(state.sides)) {
    for (const base of side.bases) {
      if (inRect(p, paddedRect(base, 8))) candidates.push(base);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => distanceToRect(p, a) - distanceToRect(p, b));
  return candidates[0];
}

function distanceToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function stagingColumnAt(p) {
  if (!inRect(p, LAYOUT.staging)) return -1;
  const colW = LAYOUT.staging.w / CONFIG.stagingColumns;
  return clamp(Math.floor((p.x - LAYOUT.staging.x) / colW), 0, CONFIG.stagingColumns - 1);
}

// ---------------------------------------------------------------------------
// Update loop
// ---------------------------------------------------------------------------
function loop(timestamp) {
  const dt = Math.min(50, timestamp - state.last);
  state.last = timestamp;
  state.now += dt;
  state.flash += dt;
  if (!state.gameOver) {
    updateSources(dt);
    updateMovingBoxes(dt);
    updateBases(dt);
    updateAutoGpm(dt);
    updateIbt(dt);
    updateRcOperator(dt);
    updateFlowStates();
  }
  updateEffects(dt);
  render();
  requestAnimationFrame(loop);
}

function updateEffects(dt) {
  if (state.rc.penaltyTimer > 0) state.rc.penaltyTimer -= dt;
  for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
    const f = state.floaters[i];
    f.life -= dt;
    f.y -= dt * 0.035;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateRcOperator(dt) {
  state.rc.lastX = state.rc.x;
  state.rc.lastY = state.rc.y;
  const follow = clamp(dt / 120, 0, 1);
  state.rc.x += (state.rc.targetX - state.rc.x) * follow;
  state.rc.y += (state.rc.targetY - state.rc.y) * follow;

  const dist = Math.hypot(state.rc.x - state.rc.lastX, state.rc.y - state.rc.lastY);
  state.rc.speed = dt > 0 ? (dist / dt) * 1000 : 0;
  if (state.selectedPallet && state.rc.speed > CONFIG.rc.safeSpeedPerSecond) {
    drivingMistake("Slow down in the RC drive lane while carrying a pallet.", CONFIG.score.speeding);
  }
}

function updateFlowStates() {
  for (const side of Object.values(state.sides)) {
    const blocked = side.bases.filter((b) => b.blocked).length;
    const missing = side.bases.filter((b) => !b.hasPallet).length;
    const sourceDry = side.source === "ART" ? side.art.backlog <= 0 : side.raa.boxes <= 0;
    if (sourceDry || blocked >= 3 || missing >= 3) side.flow = "red";
    else if (blocked >= 1 || missing >= 1) side.flow = "yellow";
    else side.flow = "green";
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  state.buttons = [];
  ctx.clearRect(0, 0, DESIGN.w, DESIGN.h);
  drawBackground();
  drawHud();
  drawWarehouse();
  drawTrailers();
  drawConveyors();
  drawDriveLane();
  drawStaging();
  drawStacks();
  drawBases();
  drawWorkers();
  drawRcOperator();
  drawMovingBoxes();
  drawEffects();
  drawSelection();
  if (state.gameOver) drawGameOver();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, DESIGN.h);
  g.addColorStop(0, "#08111d");
  g.addColorStop(1, "#101827");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DESIGN.w, DESIGN.h);

  roundedRect(LAYOUT.floor.x, LAYOUT.floor.y, LAYOUT.floor.w, LAYOUT.floor.h, 22, "#162230", "rgba(255,255,255,0.08)");
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = "#dbeafe";
  ctx.lineWidth = 1;
  for (let x = LAYOUT.floor.x + 18; x < LAYOUT.floor.x + LAYOUT.floor.w; x += 42) {
    line(x, LAYOUT.floor.y, x, LAYOUT.floor.y + LAYOUT.floor.h);
  }
  for (let y = LAYOUT.floor.y + 22; y < LAYOUT.floor.y + LAYOUT.floor.h; y += 42) {
    line(LAYOUT.floor.x, y, LAYOUT.floor.x + LAYOUT.floor.w, y);
  }
  ctx.restore();
}

function drawHud() {
  roundedRect(LAYOUT.hud.x, LAYOUT.hud.y, LAYOUT.hud.w, LAYOUT.hud.h, 18, COLORS.panel, COLORS.outline);
  drawText("RC SAFETY FREIGHT FLOW", 38, 42, 19, COLORS.ink, "bold");
  drawText("Score", 38, 74, 12, COLORS.muted, "bold");
  drawText(String(state.score), 82, 78, 27, "#f8fafc", "bold");

  const blocked = Object.values(state.sides).reduce((sum, s) => sum + s.bases.filter((b) => b.blocked).length, 0);
  drawText(`Blocked Bases: ${blocked}/10`, 314, 48, 15, blocked ? "#fecaca" : "#bbf7d0", "bold");
  drawFittedText(state.status, 314, 77, 250, 14, "#d7e8f8");

  roundedRect(580, 34, 146, 70, 12, "rgba(15, 23, 42, 0.62)", "rgba(147,197,253,0.24)");
  drawText(`RC Mistakes: ${state.rc.safetyMistakes}`, 594, 58, 13, state.rc.safetyMistakes ? "#fde68a" : "#bfdbfe", "bold");
  drawText(`Speed: ${Math.round(state.rc.speed)}`, 594, 84, 13, state.rc.speed > CONFIG.rc.safeSpeedPerSecond ? "#fecaca" : "#c7d2fe", "bold");

  drawLegend(760, 36);
  drawButton(1018, 34, 138, 32, "Call GPM", manualGpm, "warn");
  drawButton(1018, 74, 138, 32, "Request IBT", requestIbt, "blue");
}

function drawLegend(x, y) {
  drawText("Freight Mix", x, y - 8, 12, COLORS.muted, "bold");
  let offset = 0;
  for (const key of Object.keys(FREIGHT)) {
    ctx.fillStyle = FREIGHT[key].color;
    roundedRect(x + offset, y + 6, 15, 15, 4, FREIGHT[key].color);
    drawText(`${FREIGHT[key].weight}%`, x + offset + 20, y + 19, 12, "#dbeafe");
    offset += key === "orange" ? 74 : 64;
  }
}

function drawWarehouse() {
  drawZone(LAYOUT.primaryLane, "PRIMARY BUILD LANE", "#123a4a");
  drawZone(LAYOUT.secondaryLane, "SECONDARY BUILD LANE", "#3a263f");
  drawSafetyStripes(52, 246, 1096, 18);
  drawSafetyStripes(52, 790, 1096, 18);
  drawText("SHARED STAGING", LAYOUT.staging.x + 102, LAYOUT.staging.y - 18, 17, "#e2e8f0", "bold");
}

function drawZone(r, label, color) {
  roundedRect(r.x, r.y, r.w, r.h, 18, color, "rgba(255,255,255,0.13)");
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(r.x, r.y, r.w, 2);
  ctx.restore();
  drawText(label, r.x + 18, r.y + 30, 14, "#cbd5e1", "bold");
}

function drawTrailers() {
  drawTrailer(LAYOUT.primaryArt, "PRIMARY ART", `${state.sides.primary.art.backlog}/100`, state.sides.primary.source === "ART");
  drawTrailer(LAYOUT.secondaryArt, "SECONDARY ART", `${state.sides.secondary.art.backlog}/100`, state.sides.secondary.source === "ART");
  drawRaaDoor(state.sides.primary);
  drawRaaDoor(state.sides.secondary);
  drawEmptyTrailer();
  drawIbtTrailer();

  drawButton(54, 118, 176, 28, "Request Primary Trailer", () => requestTrailer("primary"), "dark");
  drawButton(974, 118, 178, 28, "Request Secondary Trailer", () => requestTrailer("secondary"), "dark");
  drawButton(236, 118, 140, 28, "Toggle Primary", () => toggleDoor("primary"), "dark");
  drawButton(824, 118, 148, 28, "Toggle Secondary", () => toggleDoor("secondary"), "dark");
}

function drawTrailer(r, label, count, active) {
  roundedRect(r.x, r.y, r.w, r.h, 12, active ? "#1e3a4b" : "#263548", active ? "#67e8f9" : COLORS.outline);
  drawDockLines(r);
  drawText(label, r.x + 12, r.y + 24, 13, "#e0f2fe", "bold");
  drawText(count, r.x + 12, r.y + 52, 24, "#ffffff", "bold");
  const side = label.startsWith("PRIMARY") ? state.sides.primary : state.sides.secondary;
  if (side.art.refill) drawText(`ETA ${formatSeconds(side.art.timer)}`, r.x + 88, r.y + 52, 13, "#fde68a", "bold");
}

function drawRaaDoor(side) {
  const r = side.raa.bounds;
  roundedRect(r.x, r.y, r.w, r.h, 12, side.source === "RAA" ? "#3b2f16" : "#263548", side.source === "RAA" ? "#facc15" : COLORS.outline);
  drawDockLines(r);
  drawText(`${side.label.toUpperCase()} RAA`, r.x + 12, r.y + 24, 13, "#fef3c7", "bold");
  drawText(`${side.raa.boxes}/3 boxes`, r.x + 12, r.y + 52, 18, "#fff7ed", "bold");
}

function drawEmptyTrailer() {
  const r = LAYOUT.emptyTrailer;
  roundedRect(r.x, r.y, r.w, r.h, 12, "#3a2a18", "#fbbf24");
  drawDockLines(r);
  drawText("EMPTY PALLETS", r.x + 14, r.y + 24, 13, "#ffedd5", "bold");
  drawMiniPallet(r.x + 20, r.y + 39, 44, 24);
  drawText("unlimited", r.x + 76, r.y + 57, 13, "#fed7aa", "bold");
}

function drawIbtTrailer() {
  const r = LAYOUT.ibt;
  roundedRect(r.x, r.y, r.w, r.h, 12, state.ibt.clearing ? "#173047" : "#12364a", state.ibt.clearing ? "#facc15" : "#38bdf8");
  drawDockLines(r);
  drawText("IBT BLUE", r.x + 14, r.y + 24, 13, "#e0f2fe", "bold");
  drawText(`${state.ibt.count}/10`, r.x + 14, r.y + 55, 25, "#ffffff", "bold");
  if (state.ibt.clearing) drawText(formatSeconds(state.ibt.timer), r.x + 88, r.y + 54, 15, "#fde68a", "bold");
}

function drawDockLines(r) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#ffffff";
  for (let x = r.x + 18; x < r.x + r.w; x += 22) line(x, r.y + 8, x, r.y + r.h - 8);
  ctx.restore();
}

function drawConveyors() {
  drawConveyor(LAYOUT.conveyorPrimary, state.sides.primary.flow, "PRIMARY FLOW");
  drawConveyor(LAYOUT.conveyorSecondary, state.sides.secondary.flow, "SECONDARY FLOW");
}

function drawDriveLane() {
  const r = LAYOUT.drive;
  const carrying = Boolean(state.selectedPallet);
  roundedRect(r.x, r.y, r.w, r.h, 18, carrying ? "rgba(37, 99, 235, 0.2)" : "rgba(15, 23, 42, 0.58)", carrying ? "#93c5fd" : "rgba(147,197,253,0.45)");
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#bfdbfe";
  for (let x = r.x + 18; x < r.x + r.w - 18; x += 42) {
    roundedRect(x, r.y + r.h / 2 - 3, 24, 6, 3, "#bfdbfe");
  }
  ctx.restore();
  drawText("RC SAFE DRIVE SQUARE", r.x + r.w / 2, r.y + 28, 14, "#dbeafe", "bold", "center");
  drawText("Carry through center", r.x + r.w / 2, r.y + r.h - 46, 12, "#bfdbfe", "bold", "center");
  drawText("unsafe driving costs points", r.x + r.w / 2, r.y + r.h - 27, 12, "#bfdbfe", "bold", "center");
}

function drawConveyor(path, flow, label) {
  const color = flowColor(flow);
  const flashOn = Math.floor(state.flash / 240) % 2 === 0;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 31;
  ctx.strokeStyle = "#27364a";
  ctx.beginPath();
  ctx.moveTo(path.x1, path.y1);
  ctx.lineTo(path.x2, path.y2);
  ctx.lineTo(path.x3, path.y3);
  ctx.stroke();
  ctx.lineWidth = 18;
  ctx.strokeStyle = flow === "green" || flashOn ? color : "#4b5563";
  ctx.beginPath();
  ctx.moveTo(path.x1, path.y1);
  ctx.lineTo(path.x2, path.y2);
  ctx.lineTo(path.x3, path.y3);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const y = path.y2 + 28 + ((state.now / 38 + i * 34) % 310);
    line(path.x2 - 10, y, path.x2 + 10, y);
  }
  ctx.restore();
  drawText(label, path.x2 - 58, path.y2 - 34, 12, color, "bold");
}

function flowColor(flow) {
  if (flow === "green") return COLORS.green;
  if (flow === "yellow") return COLORS.yellow;
  return COLORS.red;
}

function drawStaging() {
  const r = LAYOUT.staging;
  roundedRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28, 18, "rgba(7, 18, 32, 0.68)", COLORS.outline);
  const colW = r.w / CONFIG.stagingColumns;
  const rowH = r.h / CONFIG.stagingRows;
  for (let c = 0; c < CONFIG.stagingColumns; c += 1) {
    const col = state.staging[c];
    for (let rowIndex = 0; rowIndex < CONFIG.stagingRows; rowIndex += 1) {
      const row = col.rows[rowIndex];
      const x = r.x + c * colW + 8;
      const y = r.y + rowIndex * rowH + 8;
      const disabled = col.pendingDrop && rowIndex === 2 && row.count === 0;
      roundedRect(x, y, colW - 16, rowH - 16, 10, disabled ? "#111827" : "#1f3142", row.color ? FREIGHT[row.color].color : "rgba(203,213,225,0.18)");
      if (disabled) drawText("RESERVED", x + 9, y + 35, 11, "#facc15", "bold");
      if (row.color) {
        for (let i = 0; i < row.count; i += 1) {
          drawPalletLoad(x + 11 + i * 22, y + 34, 18, FREIGHT[row.color].color);
        }
      }
      drawText(`${row.count}/3`, x + colW - 52, y + rowH - 25, 14, "#e2e8f0", "bold");
    }
  }
  ["TOP", "MID", "BOT"].forEach((name, i) => drawText(name, r.x - 46, r.y + i * rowH + 50, 11, COLORS.muted, "bold"));
}

function drawStacks() {
  for (const stack of state.emptyStacks) {
    const selected = state.selectedStack === stack || (state.splitMode && stack.count === 0);
    roundedRect(stack.x, stack.y, stack.w, stack.h, 10, selected ? "#4a341d" : "#2a221a", selected ? "#fbbf24" : "rgba(251,191,36,0.35)");
    drawText(stack.label, stack.x + 10, stack.y + 18, 11, "#fed7aa", "bold");
    drawMiniPallet(stack.x + 16, stack.y + 31, 50, 25);
    drawText(`${stack.count}/7`, stack.x + 72, stack.y + 55, 22, "#fff7ed", "bold");
  }
}

function drawBases() {
  for (const side of Object.values(state.sides)) {
    for (const base of side.bases) drawBase(base);
  }
}

function drawBase(base) {
  const selected = state.selectedPallet && state.selectedPallet.base === base;
  const missing = !base.hasPallet;
  const canRefill = missing && state.selectedStack && state.selectedStack.side === base.side;
  const border = selected ? "#fef08a" : base.blocked ? "#fb7185" : canRefill ? "#86efac" : missing ? "#facc15" : "rgba(226,232,240,0.22)";
  if (canRefill || selected || base.blocked) {
    ctx.save();
    ctx.globalAlpha = Math.floor(state.flash / 220) % 2 === 0 ? 0.22 : 0.08;
    roundedRect(base.x - 6, base.y - 6, base.w + 12, base.h + 12, 15, canRefill ? "#22c55e" : "#facc15");
    ctx.restore();
  }
  roundedRect(base.x, base.y, base.w, base.h, 12, missing ? "#1a1d23" : "#243244", border);
  drawText(`B${base.index + 1}`, base.x + 10, base.y + 18, 12, "#cbd5e1", "bold");
  if (missing) {
    drawText(canRefill ? "PLACE" : "NO", base.x + (canRefill ? 11 : 22), base.y + 44, canRefill ? 13 : 16, canRefill ? "#bbf7d0" : "#fde68a", "bold");
    drawText("PALLET", base.x + 10, base.y + 62, 12, canRefill ? "#bbf7d0" : "#fde68a", "bold");
    return;
  }
  drawMiniPallet(base.x + 14, base.y + 56, 42, 24);
  if (base.color) {
    for (let i = 0; i < base.count; i += 1) {
      const bx = base.x + 15 + (i % 3) * 14;
      const by = base.y + 40 - Math.floor(i / 3) * 13;
      drawBox(bx, by, 12, 10, FREIGHT[base.color].color);
    }
  }
  drawText(`${base.count}/6`, base.x + 37, base.y + 18, 13, base.blocked ? "#fecaca" : "#dbeafe", "bold");
  if (base.blocked) {
    const pulse = Math.floor(state.flash / 180) % 2 === 0;
    if (pulse) drawText("MOVE", base.x + 15, base.y + 88, 14, "#fecaca", "bold");
  }
}

function drawWorkers() {
  drawWorker(118, 482, "#38bdf8");
  drawWorker(164, 482, "#f59e0b");
  drawWorker(1036, 482, "#a78bfa");
  drawWorker(1082, 482, "#22c55e");
  drawPalletJack(326, 608, "primary");
  drawPalletJack(874, 608, "secondary");
}

function drawRcOperator() {
  const carrying = Boolean(state.selectedPallet);
  const unsafePulse = state.rc.penaltyTimer > 0 && Math.floor(state.flash / 110) % 2 === 0;
  ctx.save();
  ctx.translate(state.rc.x, state.rc.y);
  ctx.shadowColor = unsafePulse ? "#ef4444" : "rgba(56, 189, 248, 0.65)";
  ctx.shadowBlur = carrying ? 18 : 10;
  roundedRect(-26, -18, 52, 36, 10, unsafePulse ? "#7f1d1d" : carrying ? "#0f766e" : "#164e63", unsafePulse ? "#fecaca" : "#67e8f9");
  roundedRect(-18, -10, 36, 20, 6, carrying ? "#14b8a6" : "#0891b2");
  ctx.fillStyle = "#0f172a";
  circle(-14, 20, 6);
  circle(14, 20, 6);
  ctx.strokeStyle = "#e0f2fe";
  ctx.lineWidth = 3;
  line(0, -18, 0, -34);
  circle(0, -38, 5);
  if (carrying && state.selectedPallet.base.color) {
    drawBox(-12, -34, 24, 15, FREIGHT[state.selectedPallet.base.color].color);
  }
  ctx.restore();
  drawText("RC", state.rc.x, state.rc.y + 42, 12, "#e0f2fe", "bold", "center");
}

function drawWorker(x, y, vest) {
  ctx.save();
  ctx.fillStyle = "#f5c9a8";
  circle(x, y - 28, 8);
  ctx.fillStyle = "#1f2937";
  roundedRect(x - 9, y - 20, 18, 28, 6, vest);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  line(x - 5, y + 7, x - 10, y + 22);
  line(x + 5, y + 7, x + 10, y + 22);
  line(x - 9, y - 8, x - 19, y + 2);
  line(x + 9, y - 8, x + 19, y + 2);
  ctx.restore();
}

function drawPalletJack(x, y, side) {
  ctx.save();
  ctx.translate(x, y);
  if (side === "secondary") ctx.scale(-1, 1);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 5;
  line(0, 0, 34, -6);
  line(34, -6, 50, -28);
  ctx.fillStyle = "#ef4444";
  roundedRect(-8, -8, 42, 16, 5, "#ef4444");
  ctx.fillStyle = "#0f172a";
  circle(4, 10, 5);
  circle(28, 10, 5);
  ctx.restore();
}

function drawMovingBoxes() {
  for (const box of state.movingBoxes) {
    const t = ease(box.t);
    const p1 = pathPoint(box.start, { x: box.end.x, y: box.start.y }, Math.min(1, t * 1.35));
    const p = t < 0.65 ? p1 : pathPoint({ x: box.end.x, y: box.start.y }, box.end, (t - 0.65) / 0.35);
    drawBox(p.x - 9, p.y - 8, 18, 16, FREIGHT[box.color].color);
  }
}

function drawEffects() {
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / 600, 0, 1);
    ctx.fillStyle = p.color;
    circle(p.x, p.y, 3);
    ctx.restore();
  }
  for (const f of state.floaters) {
    ctx.save();
    ctx.globalAlpha = clamp(f.life / 600, 0, 1);
    drawText(f.text, f.x, f.y, 17, f.color, "bold", "center");
    ctx.restore();
  }
}

function drawSelection() {
  if (state.splitMode) {
    roundedRect(402, 842, 396, 36, 12, "rgba(251, 191, 36, 0.13)", "#facc15");
    drawText("Trailer ready: click one empty side stack to refill to 7", 422, 866, 15, "#fde68a", "bold");
  }
  if (state.selectedPallet) {
    const base = state.selectedPallet.base;
    drawText(`Selected: ${FREIGHT[base.color].name} pallet`, 444, 866, 16, "#fef08a", "bold");
  }
}

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
  ctx.fillRect(0, 0, DESIGN.w, DESIGN.h);
  roundedRect(355, 326, 490, 190, 18, "#111827", "#fb7185");
  drawText("FLOW STOPPED", 474, 390, 38, "#fecaca", "bold");
  drawText("Both sides are fully blocked.", 500, 428, 17, "#e5e7eb");
  drawText(`Final Score: ${state.score}`, 522, 470, 24, "#f8fafc", "bold");
  ctx.restore();
}

function drawButton(x, y, w, h, label, action, tone = "dark") {
  const palette = {
    dark: ["#1f2937", "#64748b"],
    warn: ["#3a2814", "#f59e0b"],
    blue: ["#12364a", "#38bdf8"],
  }[tone];
  roundedRect(x, y, w, h, 9, palette[0], palette[1]);
  drawText(label, x + w / 2, y + h / 2 + 5, 12, "#f8fafc", "bold", "center");
  state.buttons.push({ x, y, w, h, action });
}

function drawPalletLoad(x, y, size, color) {
  drawMiniPallet(x - 1, y + 11, size + 4, 8);
  drawBox(x, y, size, size * 0.76, color);
}

function drawMiniPallet(x, y, w, h) {
  roundedRect(x, y, w, h, 3, COLORS.pallet, "#5a3518");
  ctx.strokeStyle = "#5a3518";
  ctx.lineWidth = 2;
  line(x + 5, y, x + 5, y + h);
  line(x + w / 2, y, x + w / 2, y + h);
  line(x + w - 5, y, x + w - 5, y + h);
}

function drawBox(x, y, w, h, color) {
  const freight = Object.entries(FREIGHT).find(([, data]) => data.color === color);
  const accent = freight ? freight[1].accent : "rgba(255,255,255,0.32)";
  roundedRect(x, y, w, h, 3, color, accent);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = accent;
  ctx.fillRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.16));
  if (freight && w >= 16 && h >= 12) {
    const key = freight[0];
    const mark = key === "blue" ? "BL" : key === "brown" ? "BR" : key[0].toUpperCase();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(7, Math.min(10, w * 0.42))}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark, x + w / 2, y + h * 0.62);
  }
  ctx.restore();
}

function drawSafetyStripes(x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#2b2417";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLORS.safety;
  ctx.lineWidth = 8;
  for (let i = -40; i < w + 40; i += 28) {
    line(x + i, y + h + 10, x + i + 22, y - 10);
  }
  ctx.restore();
}

function roundedRect(x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawText(text, x, y, size, color, weight = "normal", align = "left") {
  ctx.save();
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawFittedText(text, x, y, maxWidth, size, color, weight = "normal") {
  ctx.save();
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  let fitted = text;
  while (fitted.length > 6 && ctx.measureText(fitted).width > maxWidth) {
    fitted = `${fitted.slice(0, -4)}...`;
  }
  ctx.fillStyle = color;
  ctx.fillText(fitted, x, y);
  ctx.restore();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ease(t) {
  const n = clamp(t, 0, 1);
  return n < 0.5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
}

init();
