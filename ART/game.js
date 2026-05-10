const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const blockedEl = document.getElementById("blocked");
const statusEl = document.getElementById("status");

const callGpmButton = document.getElementById("callGpmButton");
const requestIbtButton = document.getElementById("requestIbtButton");

const togglePrimaryDoorButton = document.getElementById("togglePrimaryDoorButton");
const toggleSecondaryDoorButton = document.getElementById("toggleSecondaryDoorButton");

const requestPrimaryTrailerButton = document.getElementById("requestPrimaryTrailerButton");
const requestSecondaryTrailerButton = document.getElementById("requestSecondaryTrailerButton");

let score = 0;
let gameOver = false;
let selectedPallet = null;
let selectedEmptyPalletStack = null;
let selectedSplitStacks = [];
let splittingPalletStack = false;
let boxes = [];
let conveyorAnimationOffset = 0;

const flowSource = {
  left: "art",
  right: "art"
};

const BLOCKED_BASE_GRACE_SECONDS = 1;
const BLOCKED_BASE_PENALTY_SECONDS = 1;
const BLOCKED_BASE_PENALTY_POINTS = 50;

const FAST_FLOW_BONUS_POINTS = 25;
const STAGING_FULL_PENALTY_POINTS = 25;

const CALL_GPM_PENALTY_POINTS = 100;
const AUTO_GPM_CLEAR_POINTS = 25;
const AUTO_GPM_CLEAR_CHANCE = 0.35;
const AUTO_GPM_CHECK_MS = 5000;

const ART_TRAILER_BOX_CAPACITY = 100;
const ART_TRAILER_REFILL_SECONDS = 45;
const RAA_PALLET_BOX_CAPACITY = 12;

const STAGING_SLOT_CAPACITY = 3;

const IBT_CAPACITY = 10;
const IBT_REFILL_SECONDS = 15;

const FLOW_GOOD_COLOR = "#22c55e";
const FLOW_SLOWED_COLOR = "#ef4444";
const FLOW_WARNING_COLOR = "#facc15";

const FREIGHT_TYPES = [
  { name: "brown", color: "#b8793a", chance: 0.40 },
  { name: "red", color: "#ef4444", chance: 0.20 },
  { name: "orange", color: "#f97316", chance: 0.15 },
  { name: "purple", color: "#7c3aed", chance: 0.15 },
  { name: "blue", color: "#0ea5e9", chance: 0.10 }
];

function getRandomFreightType() {
  const roll = Math.random();
  let runningTotal = 0;

  for (const freightType of FREIGHT_TYPES) {
    runningTotal += freightType.chance;

    if (roll <= runningTotal) {
      return freightType;
    }
  }

  return FREIGHT_TYPES[0];
}

function getFlowStatus(side) {
  const sideBases = side === "left" ? leftBases : rightBases;
  const blockedCount = sideBases.filter(base => base.pallet).length;
  const noPalletCount = sideBases.filter(base => !base.hasEmptyPallet && !base.pallet).length;

  const artEmpty =
    flowSource[side] === "art" &&
    artTrailers[side].backlog <= 0;

  const raaEmpty =
    flowSource[side] === "raa" &&
    raaPalletAreas[side].boxes <= 0;

  if (artEmpty || raaEmpty || blockedCount >= 3 || noPalletCount >= 3) {
    return "slowed";
  }

  if (blockedCount >= 1 || noPalletCount >= 1) {
    return "warning";
  }

  return "good";
}

function getFlowLightColor(side) {
  const status = getFlowStatus(side);
  const flashOn = Math.floor(Date.now() / 300) % 2 === 0;

  if (status === "good") return FLOW_GOOD_COLOR;
  if (status === "warning") return flashOn ? FLOW_WARNING_COLOR : "#ffffff";
  return flashOn ? FLOW_SLOWED_COLOR : "#ffffff";
}

function drawFlowLight(x, y, side, label) {
  const color = getFlowLightColor(side);
  const status = getFlowStatus(side).toUpperCase();

  ctx.fillStyle = "#111827";
  ctx.fillRect(x - 34, y - 26, 68, 52);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 4, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 17);
  ctx.fillText(status, x, y + 29);

  ctx.textAlign = "left";
}

// -----------------------------
// DOORS / TRAILERS
// -----------------------------

const leftDoor = {
  x: 30,
  y: 5,
  width: 140,
  height: 70,
  label: "Primary ART Trailer",
  side: "left"
};

const leftRaaDoor = {
  x: 180,
  y: 5,
  width: 120,
  height: 70,
  label: "Primary RAA Door",
  side: "left"
};

const ibtTrailer = {
  x: 500,
  y: 5,
  width: 130,
  height: 70,
  label: "IBT Trailer",
  pallets: [],
  capacity: IBT_CAPACITY,
  clearing: false,
  clearTimer: 0,
  clearSeconds: IBT_REFILL_SECONDS
};

const emptyPalletTrailer = {
  x: 690,
  y: 5,
  width: 150,
  height: 70,
  stacksAvailable: 10,
  stackSize: 14,
  label: "Empty Pallet Trailer"
};

const rightRaaDoor = {
  x: 900,
  y: 5,
  width: 120,
  height: 70,
  label: "Secondary RAA Door",
  side: "right"
};

const rightDoor = {
  x: 1030,
  y: 5,
  width: 140,
  height: 70,
  label: "Secondary ART Trailer",
  side: "right"
};

// -----------------------------
// ART BACKLOG / RAA PALLET AREAS
// -----------------------------

const artTrailers = {
  left: {
    backlog: ART_TRAILER_BOX_CAPACITY,
    capacity: ART_TRAILER_BOX_CAPACITY,
    refilling: false,
    refillTimer: 0,
    refillSeconds: ART_TRAILER_REFILL_SECONDS
  },
  right: {
    backlog: ART_TRAILER_BOX_CAPACITY,
    capacity: ART_TRAILER_BOX_CAPACITY,
    refilling: false,
    refillTimer: 0,
    refillSeconds: ART_TRAILER_REFILL_SECONDS
  }
};

const raaPalletAreas = {
  left: {
    x: 130,
    y: 95,
    width: 85,
    height: 80,
    boxes: 0,
    capacity: RAA_PALLET_BOX_CAPACITY,
    side: "left",
    label: "RAA Pallet"
  },
  right: {
    x: 985,
    y: 95,
    width: 85,
    height: 80,
    boxes: 0,
    capacity: RAA_PALLET_BOX_CAPACITY,
    side: "right",
    label: "RAA Pallet"
  }
};

// -----------------------------
// CONVEYORS
// -----------------------------

const leftConveyorPath = [
  { x: 100, y: 85 },
  { x: 100, y: 300 },
  { x: 220, y: 300 }
];

const rightConveyorPath = [
  { x: 1100, y: 85 },
  { x: 1100, y: 300 },
  { x: 980, y: 300 }
];

// -----------------------------
// BASES
// -----------------------------

const leftBases = [
  { x: 240, y: 250, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "left", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 240, y: 335, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "left", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 240, y: 420, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "left", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 240, y: 505, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "left", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 240, y: 590, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "left", blockedTime: 0, lastPenaltyTime: 0 }
];

const rightBases = [
  { x: 870, y: 250, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "right", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 870, y: 335, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "right", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 870, y: 420, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "right", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 870, y: 505, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "right", blockedTime: 0, lastPenaltyTime: 0 },
  { x: 870, y: 590, width: 90, height: 70, boxes: [], capacity: 6, pallet: null, hasEmptyPallet: false, freightType: null, side: "right", blockedTime: 0, lastPenaltyTime: 0 }
];

const bases = [...leftBases, ...rightBases];

for (const base of bases) {
  base.hasEmptyPallet = true;
}

// -----------------------------
// EMPTY PALLET SIDE STACKS
// -----------------------------

const emptyPalletStacks = [
  {
    x: 240,
    y: 175,
    width: 90,
    height: 60,
    count: 0,
    capacity: 7,
    side: "left",
    position: "top",
    label: "Left Top Empty"
  },
  {
    x: 240,
    y: 675,
    width: 90,
    height: 60,
    count: 0,
    capacity: 7,
    side: "left",
    position: "bottom",
    label: "Left Bottom Empty"
  },
  {
    x: 870,
    y: 175,
    width: 90,
    height: 60,
    count: 0,
    capacity: 7,
    side: "right",
    position: "top",
    label: "Right Top Empty"
  },
  {
    x: 870,
    y: 675,
    width: 90,
    height: 60,
    count: 0,
    capacity: 7,
    side: "right",
    position: "bottom",
    label: "Right Bottom Empty"
  }
];

// -----------------------------
// SHARED STAGING LANES
// -----------------------------

const stagingLanes = [
  {
    x: 410,
    y: 665,
    slotWidth: 90,
    slotHeight: 70,
    slots: [[], [], []],
    pendingDrop: false,
    label: "Stage 1"
  },
  {
    x: 510,
    y: 665,
    slotWidth: 90,
    slotHeight: 70,
    slots: [[], [], []],
    pendingDrop: false,
    label: "Stage 2"
  },
  {
    x: 610,
    y: 665,
    slotWidth: 90,
    slotHeight: 70,
    slots: [[], [], []],
    pendingDrop: false,
    label: "Stage 3"
  },
  {
    x: 710,
    y: 665,
    slotWidth: 90,
    slotHeight: 70,
    slots: [[], [], []],
    pendingDrop: false,
    label: "Stage 4"
  }
];

// -----------------------------
// GAMEPLAY
// -----------------------------

function spawnBox(side) {
  if (gameOver) return;

  const sideBases = side === "left" ? leftBases : rightBases;
  const door = side === "left" ? leftDoor : rightDoor;
  const path = side === "left" ? leftConveyorPath : rightConveyorPath;
  const freightType = getRandomFreightType();

  const matchingStartedBases = sideBases.filter(base =>
    !base.pallet &&
    base.hasEmptyPallet &&
    base.boxes.length < base.capacity &&
    base.freightType?.name === freightType.name
  );

  const emptyReadyBases = sideBases.filter(base =>
    !base.pallet &&
    base.hasEmptyPallet &&
    base.boxes.length === 0 &&
    !base.freightType
  );

  const openBases = matchingStartedBases.length > 0
    ? matchingStartedBases
    : emptyReadyBases;

  if (openBases.length === 0) {
    statusEl.textContent = `${side} side needs an available ${freightType.name} base.`;
    return;
  }

  const source = chooseFreightSource(side);

  if (!source) {
    const sideLabel = side === "left" ? "Primary" : "Secondary";
    const sourceLabel = flowSource[side] === "art" ? "ART trailer" : "RAA pallet";
    statusEl.textContent = `${sideLabel} has no available freight from ${sourceLabel}.`;
    return;
  }

  const targetBase = openBases[Math.floor(Math.random() * openBases.length)];

  // Reserve the base immediately so future boxes of this color go here.
  if (!targetBase.freightType) {
    targetBase.freightType = freightType;
  }

  boxes.push({
    x: door.x + door.width / 2,
    y: door.y + door.height,
    size: source === "raa" ? 16 : 18,
    speed: source === "raa" ? 1.7 : 1.8,
    pathIndex: 0,
    path,
    targetBase,
    side,
    source,
    freightType
  });
}

function chooseFreightSource(side) {
  const trailer = artTrailers[side];
  const raaPallet = raaPalletAreas[side];

  if (flowSource[side] === "raa") {
    if (raaPallet.boxes > 0) {
      raaPallet.boxes--;
      return "raa";
    }

    return null;
  }

  if (trailer.backlog > 0 && !trailer.refilling) {
    trailer.backlog--;

    if (trailer.backlog <= 0) {
      trailer.backlog = 0;
      trailer.refilling = false;
      trailer.refillTimer = 0;
      statusEl.textContent = `${side} ART trailer empty. Request a new trailer and toggle to RAA door.`;
    }

    return "art";
  }

  return null;
}

function toggleDoorSource(side) {
  flowSource[side] = flowSource[side] === "art" ? "raa" : "art";
  updateDoorToggleStyles();

  const sideLabel = side === "left" ? "Primary" : "Secondary";
  const sourceLabel = flowSource[side] === "art" ? "ART Trailer" : "RAA Door";

  statusEl.textContent = `${sideLabel} flow source toggled to ${sourceLabel}.`;
}

function updateDoorToggleStyles() {
  togglePrimaryDoorButton.classList.toggle("active", flowSource.left === "raa");
  toggleSecondaryDoorButton.classList.toggle("active", flowSource.right === "raa");
}

function requestNewTrailer(side) {
  if (gameOver) return;

  const trailer = artTrailers[side];
  const sideLabel = side === "left" ? "Primary" : "Secondary";

  if (trailer.backlog > 0) {
    statusEl.textContent = `${sideLabel} ART trailer is not empty yet.`;
    return;
  }

  if (trailer.refilling) {
    statusEl.textContent = `${sideLabel} ART trailer is already being replaced.`;
    return;
  }

  trailer.refilling = true;
  trailer.refillTimer = trailer.refillSeconds;

  statusEl.textContent = `Requested new ${sideLabel} ART trailer.`;
}

function updateArtTrailerRefills() {
  for (const side of ["left", "right"]) {
    const trailer = artTrailers[side];

    if (!trailer.refilling) continue;

    trailer.refillTimer -= 1 / 60;

    if (trailer.refillTimer <= 0) {
      trailer.refilling = false;
      trailer.refillTimer = 0;
      trailer.backlog = trailer.capacity;

      const sideLabel = side === "left" ? "Primary" : "Secondary";
      statusEl.textContent = `${sideLabel} ART trailer refilled to ${trailer.capacity} boxes.`;
    }
  }
}

function stageRaaPallet(side) {
  if (flowSource[side] !== "raa") {
    const sideLabel = side === "left" ? "Primary" : "Secondary";
    statusEl.textContent = `Toggle ${sideLabel} Door before using the RAA door.`;
    return;
  }

  const raaPallet = raaPalletAreas[side];
  const sideLabel = side === "left" ? "Primary" : "Secondary";

  if (raaPallet.boxes > 0) {
    statusEl.textContent = `${sideLabel} RAA pallet still has boxes. Wait until it empties.`;
    return;
  }

  raaPallet.boxes = raaPallet.capacity;

  statusEl.textContent = `${sideLabel} RAA pallet staged with ${raaPallet.capacity} boxes.`;
}

function isBlueFreight(pallet) {
  return pallet.freightType?.name === "blue";
}

function moveSelectedPalletToIbt() {
  if (!selectedPallet) return;

  if (!isBlueFreight(selectedPallet)) {
    statusEl.textContent = "Only blue freight can be staged in the IBT Trailer.";
    return;
  }

  if (ibtTrailer.clearing) {
    statusEl.textContent = "IBT is being replaced. Wait for the new IBT.";
    return;
  }

  if (ibtTrailer.pallets.length >= ibtTrailer.capacity) {
    statusEl.textContent = "IBT Trailer is full. Request a new IBT.";
    return;
  }

  const base = selectedPallet.base;
  const movedBeforePenalty = base.blockedTime < BLOCKED_BASE_GRACE_SECONDS;

  ibtTrailer.pallets.push(selectedPallet);

  base.boxes = [];
  base.pallet = null;
  base.hasEmptyPallet = false;
  base.freightType = null;
  base.blockedTime = 0;
  base.lastPenaltyTime = 0;

  selectedPallet = null;

  score += 125;

  if (movedBeforePenalty) {
    score += FAST_FLOW_BONUS_POINTS;
    statusEl.textContent = `Blue freight staged to IBT. Fast flow bonus: +${FAST_FLOW_BONUS_POINTS}.`;
  } else {
    statusEl.textContent = "Blue freight staged to IBT.";
  }
}

function requestNewIbt() {
  if (gameOver) return;

  if (ibtTrailer.clearing) {
    statusEl.textContent = "IBT request already in progress.";
    return;
  }

  if (ibtTrailer.pallets.length === 0) {
    statusEl.textContent = "IBT is already empty.";
    return;
  }

  ibtTrailer.clearing = true;
  ibtTrailer.clearTimer = ibtTrailer.clearSeconds;

  statusEl.textContent = "Requested new IBT. Trailer will clear in 15 seconds.";
}

function updateIbtTrailer() {
  if (!ibtTrailer.clearing) return;

  ibtTrailer.clearTimer -= 1 / 60;

  if (ibtTrailer.clearTimer <= 0) {
    const cleared = ibtTrailer.pallets.length;

    ibtTrailer.pallets = [];
    ibtTrailer.clearing = false;
    ibtTrailer.clearTimer = 0;

    score += cleared * 50;

    statusEl.textContent = `New IBT arrived. Cleared ${cleared} blue pallet${cleared === 1 ? "" : "s"}.`;
  }
}

function updateBoxes() {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    const targetPoint = getBoxTargetPoint(box);

    const dx = targetPoint.x - box.x;
    const dy = targetPoint.y - box.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < box.speed) {
      box.x = targetPoint.x;
      box.y = targetPoint.y;

      if (box.pathIndex < box.path.length - 1) {
        box.pathIndex++;
      } else {
        loadBoxIntoBase(box);
        boxes.splice(i, 1);
      }
    } else {
      box.x += (dx / distance) * box.speed;
      box.y += (dy / distance) * box.speed;
    }
  }
}

function getBoxTargetPoint(box) {
  if (box.pathIndex < box.path.length) {
    return box.path[box.pathIndex];
  }

  return {
    x: box.targetBase.x + box.targetBase.width / 2,
    y: box.targetBase.y + box.targetBase.height / 2
  };
}

function loadBoxIntoBase(box) {
  const base = box.targetBase;

  if (base.pallet) return;
  if (!base.hasEmptyPallet) return;
  if (base.boxes.length >= base.capacity) return;

  if (!base.freightType) {
    base.freightType = box.freightType;
  }

  if (base.freightType.name !== box.freightType.name) {
    return;
  }

  base.boxes.push({
    source: box.source,
    freightType: box.freightType
  });

  if (base.boxes.length >= base.capacity) {
    base.pallet = {
      x: base.x,
      y: base.y,
      width: base.width,
      height: base.height,
      base,
      side: box.side,
      freightType: base.freightType
    };

    base.blockedTime = 0;
    base.lastPenaltyTime = 0;
  }
}

function updateBaseBlockTimers() {
  for (const base of bases) {
    if (!base.pallet) {
      base.blockedTime = 0;
      base.lastPenaltyTime = 0;
      continue;
    }

    base.blockedTime += 1 / 60;

    if (
      base.blockedTime >= BLOCKED_BASE_GRACE_SECONDS &&
      base.blockedTime - base.lastPenaltyTime >= BLOCKED_BASE_PENALTY_SECONDS
    ) {
      score = Math.max(0, score - BLOCKED_BASE_PENALTY_POINTS);
      base.lastPenaltyTime = base.blockedTime;
      statusEl.textContent = "Penalty: full pallet left on base too long.";
    }
  }
}

// -----------------------------
// STAGING HELPERS
// -----------------------------

function getLanePalletCount(lane) {
  return lane.slots.reduce((total, row) => total + row.length, 0);
}

function isRowFull(lane, rowIndex) {
  return lane.slots[rowIndex].length >= STAGING_SLOT_CAPACITY;
}

function isBottomFull(lane) {
  return isRowFull(lane, lane.slots.length - 1);
}

function isLaneFull(lane) {
  return lane.slots.every(row => row.length >= STAGING_SLOT_CAPACITY);
}

function getTotalStagedPallets() {
  return stagingLanes.reduce((total, lane) => total + getLanePalletCount(lane), 0);
}

function findLowestEmptyRowIndex(lane) {
  for (let i = lane.slots.length - 1; i >= 0; i--) {
    if (lane.slots[i].length === 0) {
      return i;
    }
  }

  return -1;
}

function getLowestAvailableRowIndex(lane, pallet) {
  const palletType = pallet.freightType?.name;

  if (lane.pendingDrop) {
    const emptyRowIndex = findLowestEmptyRowIndex(lane);

    if (emptyRowIndex !== -1) {
      for (let i = lane.slots.length - 1; i >= 0; i--) {
        if (
          i !== emptyRowIndex &&
          i < emptyRowIndex &&
          lane.slots[i].length > 0 &&
          lane.slots[i].length < STAGING_SLOT_CAPACITY &&
          lane.slots[i][0].freightType?.name === palletType
        ) {
          return i;
        }
      }

      for (let i = lane.slots.length - 1; i >= 0; i--) {
        if (
          i !== emptyRowIndex &&
          i < emptyRowIndex &&
          lane.slots[i].length === 0
        ) {
          return i;
        }
      }
    }
  }

  for (let i = lane.slots.length - 1; i >= 0; i--) {
    const row = lane.slots[i];

    if (row.length >= STAGING_SLOT_CAPACITY) continue;

    if (row.length === 0) {
      return i;
    }

    if (row[0].freightType?.name === palletType) {
      return i;
    }
  }

  return -1;
}

function findNearestFullRowAbove(lane, emptyRowIndex) {
  for (let i = emptyRowIndex - 1; i >= 0; i--) {
    if (lane.slots[i].length >= STAGING_SLOT_CAPACITY) {
      return i;
    }
  }

  return -1;
}

function settlePendingDrops(lane) {
  if (!lane.pendingDrop) return;

  let movedAnyRow = false;

  while (true) {
    const emptyRowIndex = findLowestEmptyRowIndex(lane);

    if (emptyRowIndex === -1) break;

    const fullRowAboveIndex = findNearestFullRowAbove(lane, emptyRowIndex);

    if (fullRowAboveIndex === -1) break;

    lane.slots[emptyRowIndex] = lane.slots[fullRowAboveIndex];
    lane.slots[fullRowAboveIndex] = [];
    movedAnyRow = true;
  }

  const stillHasEmptyRowBelowFreight = lane.slots.some((row, index) => {
    if (row.length !== 0) return false;

    return lane.slots
      .slice(0, index)
      .some(aboveRow => aboveRow.length > 0);
  });

  lane.pendingDrop = stillHasEmptyRowBelowFreight;

  if (movedAnyRow) {
    statusEl.textContent = `${lane.label} staged pallets dropped down.`;
  }
}

function addPalletToLane(lane, pallet) {
  const rowIndex = getLowestAvailableRowIndex(lane, pallet);

  if (rowIndex === -1) {
    return false;
  }

  lane.slots[rowIndex].push(pallet);

  settlePendingDrops(lane);

  return true;
}

function clearBottomAndDropUpperIfFull(lane) {
  const bottomIndex = lane.slots.length - 1;

  if (!isRowFull(lane, bottomIndex)) {
    return 0;
  }

  const clearedPallets = lane.slots[bottomIndex].length;

  lane.slots[bottomIndex] = [];
  lane.pendingDrop = true;

  settlePendingDrops(lane);

  return clearedPallets;
}

function pullEmptyPalletStackFromTrailer() {
  if (gameOver) return;

  if (emptyPalletTrailer.stacksAvailable <= 0) {
    statusEl.textContent = "No more empty pallet stacks in trailer.";
    return;
  }

  const emptyStacks = emptyPalletStacks.filter(stack => stack.count === 0);

  if (emptyStacks.length < 2) {
    statusEl.textContent = "Need at least two empty pallet stacks at 0 to split a stack of 14.";
    return;
  }

  splittingPalletStack = true;
  selectedSplitStacks = [];
  selectedPallet = null;
  selectedEmptyPalletStack = null;

  statusEl.textContent = "Select two empty pallet stacks to split the 14-stack into 7 and 7.";
}

function selectStackForSplit(stack) {
  if (!splittingPalletStack) return;

  if (stack.count !== 0) {
    statusEl.textContent = "That stack is not empty. Select a stack at 0.";
    return;
  }

  if (selectedSplitStacks.includes(stack)) {
    statusEl.textContent = "That stack is already selected. Choose a different empty stack.";
    return;
  }

  selectedSplitStacks.push(stack);

  if (selectedSplitStacks.length === 1) {
    statusEl.textContent = "First empty pallet stack selected. Select one more empty stack.";
    return;
  }

  const firstStack = selectedSplitStacks[0];
  const secondStack = selectedSplitStacks[1];

  firstStack.count = 7;
  secondStack.count = 7;
  emptyPalletTrailer.stacksAvailable--;

  splittingPalletStack = false;
  selectedSplitStacks = [];

  statusEl.textContent =
    `Split 14 pallets into ${firstStack.side} ${firstStack.position} and ${secondStack.side} ${secondStack.position}.`;
}

function placeEmptyPalletOnBase(base) {
  if (!selectedEmptyPalletStack) return;

  if (base.side !== selectedEmptyPalletStack.side) {
    statusEl.textContent = "Use the empty pallet stack from the matching side.";
    return;
  }

  if (selectedEmptyPalletStack.count <= 0) {
    statusEl.textContent = "That empty pallet stack is empty.";
    selectedEmptyPalletStack = null;
    return;
  }

  if (base.hasEmptyPallet || base.pallet || base.boxes.length > 0) {
    statusEl.textContent = "That base already has a pallet or boxes.";
    return;
  }

  selectedEmptyPalletStack.count--;
  base.hasEmptyPallet = true;
  selectedEmptyPalletStack = null;

  score += 10;
  statusEl.textContent = "Empty pallet placed on base.";
}

function moveSelectedPalletToLane(lane) {
  if (selectedPallet.freightType?.name === "blue") {
    statusEl.textContent = "Blue freight must be staged in the IBT Trailer.";
    return;
  }

  if (isLaneFull(lane)) {
    score = Math.max(0, score - STAGING_FULL_PENALTY_POINTS);
    statusEl.textContent = `Staging lane full. Flow penalty: -${STAGING_FULL_PENALTY_POINTS}.`;
    return;
  }

  const base = selectedPallet.base;
  const movedBeforePenalty = base.blockedTime < BLOCKED_BASE_GRACE_SECONDS;

  const added = addPalletToLane(lane, selectedPallet);

  if (!added) {
    const freightName = selectedPallet.freightType?.name || "that";
    statusEl.textContent = `No matching staging space available for ${freightName} freight.`;
    return;
  }

  base.boxes = [];
  base.pallet = null;
  base.hasEmptyPallet = false;
  base.freightType = null;
  base.blockedTime = 0;
  base.lastPenaltyTime = 0;

  selectedPallet = null;

  score += 100;

  if (movedBeforePenalty) {
    score += FAST_FLOW_BONUS_POINTS;
    statusEl.textContent = `Fast freight flow bonus: +${FAST_FLOW_BONUS_POINTS}. Base needs a new empty pallet.`;
  } else {
    statusEl.textContent = "Full pallet moved to staging. Base needs a new empty pallet.";
  }
}

function callGPM() {
  if (gameOver) return;

  const clearedPallets = getTotalStagedPallets();

  for (const lane of stagingLanes) {
    lane.slots = [[], [], []];
    lane.pendingDrop = false;
  }

  score = Math.max(0, score - CALL_GPM_PENALTY_POINTS);

  if (clearedPallets === 0) {
    statusEl.textContent = `Called GPM with no staged pallets. Penalty: -${CALL_GPM_PENALTY_POINTS}.`;
    return;
  }

  statusEl.textContent =
    `Manual GPM cleared ${clearedPallets} pallet${clearedPallets === 1 ? "" : "s"}. Penalty: -${CALL_GPM_PENALTY_POINTS}.`;
}

function autoClearStagedPallets() {
  if (gameOver) return;

  const bottomFullLanes = stagingLanes.filter(lane => isBottomFull(lane));

  if (bottomFullLanes.length === 0) return;

  if (Math.random() > AUTO_GPM_CLEAR_CHANCE) return;

  const lane = bottomFullLanes[Math.floor(Math.random() * bottomFullLanes.length)];
  const clearedPallets = clearBottomAndDropUpperIfFull(lane);

  if (clearedPallets <= 0) return;

  score += clearedPallets * AUTO_GPM_CLEAR_POINTS;

  statusEl.textContent =
    `GPM cleared ${clearedPallets} pallets from ${lane.label}. Flow bonus: +${clearedPallets * AUTO_GPM_CLEAR_POINTS}.`;
}

// -----------------------------
// DRAWING
// -----------------------------

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawFloorGrid();
  drawZoneLabels();

  drawDoor(leftDoor);
  drawRaaDoor(leftRaaDoor);
  drawIbtTrailer();
  drawEmptyPalletTrailer();
  drawRaaDoor(rightRaaDoor);
  drawDoor(rightDoor);

  drawConveyor(leftConveyorPath, "Primary Conveyor", "left");
  drawConveyor(rightConveyorPath, "Secondary Conveyor", "right");


  drawRaaPalletAreas();
  drawEmptyPalletStacks();
  drawBases();
  drawStagingLanes();
  drawBoxes();
  drawPallets();

  updateHud();
}

function drawFloorGrid() {
  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawZoneLabels() {
  ctx.fillStyle = "#333";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";

  ctx.fillText("PRIMARY SIDE", 285, 115);
  ctx.fillText("SECONDARY SIDE", 915, 115);
  ctx.fillText("SHARED STAGING LANES", 605, 650);

  ctx.textAlign = "left";
}

function drawDoor(door) {
  const trailer = artTrailers[door.side];

  ctx.fillStyle = trailer.refilling ? "#ffe4e6" : "#d7ecff";
  ctx.fillRect(door.x, door.y, door.width, door.height);

  ctx.strokeStyle = trailer.refilling ? "#be123c" : "#222";
  ctx.lineWidth = 2;
  ctx.strokeRect(door.x, door.y, door.width, door.height);
  ctx.lineWidth = 1;

  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";

  const percent = Math.round((trailer.backlog / trailer.capacity) * 100);

  const words = door.label.split(" ");
  ctx.fillText(words[0], door.x + door.width / 2, door.y + 16);
  ctx.fillText(words.slice(1).join(" "), door.x + door.width / 2, door.y + 31);
  ctx.fillText(`${trailer.backlog}/${trailer.capacity} (${percent}%)`, door.x + door.width / 2, door.y + 47);

  if (trailer.refilling) {
    ctx.fillText(`Refill: ${Math.ceil(trailer.refillTimer)}s`, door.x + door.width / 2, door.y + 64);
  } else if (trailer.backlog <= 0) {
    ctx.fillText("Needs Trailer", door.x + door.width / 2, door.y + 64);
  }

  ctx.textAlign = "left";
}

function drawRaaDoor(door) {
  const isActiveSide = flowSource[door.side] === "raa";

  ctx.fillStyle = isActiveSide ? "#fff1a8" : "#e8f5e9";
  ctx.fillRect(door.x, door.y, door.width, door.height);

  ctx.strokeStyle = isActiveSide ? "#c28a00" : "#1b5e20";
  ctx.lineWidth = isActiveSide ? 3 : 2;
  ctx.strokeRect(door.x, door.y, door.width, door.height);
  ctx.lineWidth = 1;

  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";

  const words = door.label.split(" ");
  ctx.fillText(words[0], door.x + door.width / 2, door.y + 22);
  ctx.fillText(words[1], door.x + door.width / 2, door.y + 39);
  ctx.fillText(words.slice(2).join(" "), door.x + door.width / 2, door.y + 56);

  ctx.textAlign = "left";
}

function drawIbtTrailer() {
  ctx.fillStyle = ibtTrailer.clearing ? "#dbeafe" : "#e0f2fe";
  ctx.fillRect(ibtTrailer.x, ibtTrailer.y, ibtTrailer.width, ibtTrailer.height);

  ctx.strokeStyle = ibtTrailer.clearing ? "#1d4ed8" : "#0369a1";
  ctx.lineWidth = ibtTrailer.clearing ? 3 : 2;
  ctx.strokeRect(ibtTrailer.x, ibtTrailer.y, ibtTrailer.width, ibtTrailer.height);
  ctx.lineWidth = 1;

  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";

  ctx.fillText("IBT Trailer", ibtTrailer.x + ibtTrailer.width / 2, ibtTrailer.y + 18);
  ctx.fillText(`${ibtTrailer.pallets.length}/${ibtTrailer.capacity} Blue`, ibtTrailer.x + ibtTrailer.width / 2, ibtTrailer.y + 38);

  if (ibtTrailer.clearing) {
    ctx.fillText(`New IBT: ${Math.ceil(ibtTrailer.clearTimer)}s`, ibtTrailer.x + ibtTrailer.width / 2, ibtTrailer.y + 58);
  } else if (ibtTrailer.pallets.length >= ibtTrailer.capacity) {
    ctx.fillText("Full - Request", ibtTrailer.x + ibtTrailer.width / 2, ibtTrailer.y + 58);
  } else {
    ctx.fillText("Blue Only", ibtTrailer.x + ibtTrailer.width / 2, ibtTrailer.y + 58);
  }

  ctx.textAlign = "left";
}

function drawEmptyPalletTrailer() {
  ctx.fillStyle = splittingPalletStack ? "#fff1a8" : "#fff3d6";
  ctx.fillRect(emptyPalletTrailer.x, emptyPalletTrailer.y, emptyPalletTrailer.width, emptyPalletTrailer.height);

  ctx.strokeStyle = splittingPalletStack ? "#c28a00" : "#222";
  ctx.lineWidth = splittingPalletStack ? 3 : 2;
  ctx.strokeRect(emptyPalletTrailer.x, emptyPalletTrailer.y, emptyPalletTrailer.width, emptyPalletTrailer.height);
  ctx.lineWidth = 1;

  ctx.fillStyle = "#000";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Empty Pallet", emptyPalletTrailer.x + emptyPalletTrailer.width / 2, emptyPalletTrailer.y + 22);
  ctx.fillText("Trailer", emptyPalletTrailer.x + emptyPalletTrailer.width / 2, emptyPalletTrailer.y + 38);
  ctx.fillText(
    `14-stacks: ${emptyPalletTrailer.stacksAvailable}`,
    emptyPalletTrailer.x + emptyPalletTrailer.width / 2,
    emptyPalletTrailer.y + 56
  );
  ctx.textAlign = "left";
}

function drawConveyor(path, label, side) {
  const status = getFlowStatus(side);
  const flashOn = Math.floor(Date.now() / 300) % 2 === 0;

  if (status === "good") {
    ctx.strokeStyle = FLOW_GOOD_COLOR;
  } else if (status === "warning") {
    ctx.strokeStyle = flashOn ? FLOW_WARNING_COLOR : "#444";
  } else {
    ctx.strokeStyle = flashOn ? FLOW_SLOWED_COLOR : "#444";
  }

  ctx.lineWidth = 30;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);

  for (const point of path) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.stroke();

  ctx.lineCap = "butt";
  ctx.lineWidth = 1;

  drawConveyorArrows(path);

  ctx.fillStyle = "#fff";
  ctx.font = "13px Arial";
  ctx.textAlign = "center";

  const labelPoint = path[Math.floor(path.length / 2)];
  ctx.fillText(label, labelPoint.x, labelPoint.y - 10);

  ctx.textAlign = "left";
}

function drawConveyorArrows(path) {
  ctx.fillStyle = "#ffffff";

  conveyorAnimationOffset = (conveyorAnimationOffset + 0.8) % 40;

  for (let i = 1; i < path.length; i++) {
    const start = path[i - 1];
    const end = path[i];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    for (let d = conveyorAnimationOffset; d < length; d += 40) {
      const x = start.x + (dx / length) * d;
      const y = start.y + (dy / length) * d;

      drawArrow(x, y, angle);
    }
  }
}

function drawArrow(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-8, -7);
  ctx.lineTo(-8, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawRaaPalletAreas() {
  for (const side of ["left", "right"]) {
    const area = raaPalletAreas[side];
    const isSelectedTarget = flowSource[side] === "raa";

    ctx.fillStyle = area.boxes > 0 ? "#fef3c7" : "#f8fafc";
    ctx.fillRect(area.x, area.y, area.width, area.height);

    ctx.strokeStyle = isSelectedTarget ? "#b45309" : area.boxes > 0 ? "#d97706" : "#64748b";
    ctx.lineWidth = isSelectedTarget ? 4 : area.boxes > 0 ? 3 : 2;
    ctx.strokeRect(area.x, area.y, area.width, area.height);
    ctx.lineWidth = 1;

    ctx.fillStyle = "#000";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("RAA", area.x + area.width / 2, area.y + 18);
    ctx.fillText("Pallet", area.x + area.width / 2, area.y + 34);
    ctx.fillText(`${area.boxes}/${area.capacity}`, area.x + area.width / 2, area.y + 54);

    if (area.boxes > 0) {
      ctx.fillStyle = "#b8793a";
      ctx.fillRect(area.x + 28, area.y + 60, 28, 12);
    }

    ctx.textAlign = "left";
  }
}

function drawEmptyPalletStacks() {
  for (const stack of emptyPalletStacks) {
    const isSelectedForPlacement = selectedEmptyPalletStack === stack;
    const isSelectedForSplit = selectedSplitStacks.includes(stack);

    ctx.fillStyle = isSelectedForPlacement || isSelectedForSplit ? "#fff1a8" : "#f7f7f7";
    ctx.fillRect(stack.x, stack.y, stack.width, stack.height);

    ctx.strokeStyle = isSelectedForPlacement || isSelectedForSplit ? "#c28a00" : "#333";
    ctx.lineWidth = isSelectedForPlacement || isSelectedForSplit ? 3 : 1;
    ctx.strokeRect(stack.x, stack.y, stack.width, stack.height);
    ctx.lineWidth = 1;

    ctx.fillStyle = "#000";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";

    ctx.fillText(stack.side.toUpperCase(), stack.x + stack.width / 2, stack.y + 14);
    ctx.fillText(stack.position.toUpperCase(), stack.x + stack.width / 2, stack.y + 28);
    ctx.fillText(`${stack.count}/${stack.capacity}`, stack.x + stack.width / 2, stack.y + 44);

    ctx.strokeStyle = "#8b5a2b";

    for (let i = 0; i < stack.count; i++) {
      ctx.strokeRect(
        stack.x + 15 + i * 8,
        stack.y + 49,
        7,
        6
      );
    }

    ctx.textAlign = "left";
  }
}

function drawBases() {
  for (const base of bases) {
    if (base.pallet) {
      ctx.fillStyle = "#ffd6d6";
    } else if (base.hasEmptyPallet) {
      ctx.fillStyle = "#dcfce7";
    } else {
      ctx.fillStyle = "#eeeeee";
    }

    ctx.fillRect(base.x, base.y, base.width, base.height);

    ctx.strokeStyle = base.pallet ? "#cc0000" : base.hasEmptyPallet ? "#15803d" : "#777";
    ctx.lineWidth = base.pallet ? 3 : 2;
    ctx.strokeRect(base.x, base.y, base.width, base.height);
    ctx.lineWidth = 1;

    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.fillText("Base", base.x + 30, base.y + 16);
    ctx.fillText(`${base.boxes.length}/${base.capacity}`, base.x + 34, base.y + 34);

    if (base.freightType && base.boxes.length > 0) {
      ctx.fillStyle = base.freightType.color;
      ctx.fillText(base.freightType.name, base.x + 22, base.y + 50);
    } else if (base.pallet) {
      const timeLeft = Math.max(0, BLOCKED_BASE_GRACE_SECONDS - Math.floor(base.blockedTime));
      ctx.fillText(`Move: ${timeLeft}s`, base.x + 16, base.y + 53);
    } else {
      ctx.fillText(base.hasEmptyPallet ? "Ready" : "No Pallet", base.x + 17, base.y + 53);
    }

    drawBaseBoxes(base);
  }
}

function drawBaseBoxes(base) {
  for (let i = 0; i < base.boxes.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = base.x + 12 + col * 22;
    const y = base.y + 55 + row * 8;

    ctx.fillStyle = base.boxes[i].freightType?.color || "#b8793a";
    ctx.fillRect(x, y, 18, 7);

    ctx.strokeStyle = "#5a3518";
    ctx.strokeRect(x, y, 18, 7);
  }
}

function drawBoxes() {
  for (const box of boxes) {
    ctx.fillStyle = box.freightType?.color || "#b8793a";
    ctx.fillRect(box.x, box.y, box.size, box.size);

    ctx.strokeStyle = "#5a3518";
    ctx.strokeRect(box.x, box.y, box.size, box.size);

    ctx.strokeStyle = "#d9a066";
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x + box.size, box.y + box.size);
    ctx.moveTo(box.x + box.size, box.y);
    ctx.lineTo(box.x, box.y + box.size);
    ctx.stroke();
  }
}

function drawPallets() {
  for (const base of bases) {
    if (!base.pallet) continue;

    const pallet = base.pallet;

    ctx.fillStyle = pallet.freightType?.color || "#8b5a2b";
    ctx.globalAlpha = 0.25;
    ctx.fillRect(pallet.x - 4, pallet.y - 4, pallet.width + 8, pallet.height + 8);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = selectedPallet === pallet ? "#0077ff" : "#000";
    ctx.lineWidth = selectedPallet === pallet ? 4 : 2;
    ctx.strokeRect(pallet.x - 4, pallet.y - 4, pallet.width + 8, pallet.height + 8);

    ctx.lineWidth = 1;
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.fillText("FULL", pallet.x + 30, pallet.y + 66);
  }
}

function drawStagingLanes() {
  for (const lane of stagingLanes) {
    for (let i = 0; i < lane.slots.length; i++) {
      const slot = lane.slots[i];
      const palletCount = slot.length;

      const slotX = lane.x;
      const slotY = lane.y + i * lane.slotHeight;

      ctx.fillStyle = palletCount > 0 ? "#dbeafe" : "#eef0ff";
      ctx.fillRect(slotX, slotY, lane.slotWidth, lane.slotHeight);

      ctx.strokeStyle = palletCount > 0 ? "#2563eb" : "#333";
      ctx.lineWidth = palletCount > 0 ? 3 : 2;
      ctx.strokeRect(slotX, slotY, lane.slotWidth, lane.slotHeight);
      ctx.lineWidth = 1;

      ctx.fillStyle = "#000";
      ctx.font = "11px Arial";
      ctx.textAlign = "center";

      const rowLabel =
        i === 0 ? "Top" :
        i === 1 ? "Middle" :
        "Bottom";

      const pendingText = lane.pendingDrop && i !== lane.slots.length - 1 ? " ↓" : "";

      ctx.fillText(lane.label, slotX + lane.slotWidth / 2, slotY + 14);
      ctx.fillText(`${rowLabel} ${palletCount}/${STAGING_SLOT_CAPACITY}${pendingText}`, slotX + lane.slotWidth / 2, slotY + 29);

      if (palletCount > 0) {
        for (let p = 0; p < palletCount; p++) {
          ctx.fillStyle = slot[p]?.freightType?.color || "#8b5a2b";

          ctx.fillRect(
            slotX + 18 + p * 18,
            slotY + 43,
            15,
            16
          );
        }
      }
    }
  }

  ctx.textAlign = "left";
}

// -----------------------------
// HUD / GAME STATUS
// -----------------------------

function updateHud() {
  const blockedBases = bases.filter(base => base.pallet).length;
  const leftBlocked = leftBases.filter(base => base.pallet).length;
  const rightBlocked = rightBases.filter(base => base.pallet).length;

  scoreEl.textContent = score;
  blockedEl.textContent = blockedBases;

  if (gameOver) return;

  if (leftBlocked >= leftBases.length && rightBlocked >= rightBases.length) {
    endGame("Game Over: Primary and Secondary sides are fully blocked!");
    return;
  }
}

function endGame(message) {
  gameOver = true;
  statusEl.textContent = message;
}

// -----------------------------
// CLICK CONTROLS
// -----------------------------

canvas.addEventListener("click", event => {
  if (gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouse = {
  x: (event.clientX - rect.left) * scaleX,
  y: (event.clientY - rect.top) * scaleY
  };

  const clickedPallet = findClickedPallet(mouse);

  if (clickedPallet) {
    selectedPallet = clickedPallet;
    selectedEmptyPalletStack = null;
    selectedSplitStacks = [];
    splittingPalletStack = false;
    statusEl.textContent = `${clickedPallet.freightType?.name || "Full"} pallet selected. Click a matching staging lane.`;
    return;
  }

  if (isPointInside(mouse, leftRaaDoor)) {
    stageRaaPallet("left");
    return;
  }

  if (isPointInside(mouse, rightRaaDoor)) {
    stageRaaPallet("right");
    return;
  }

  if (isPointInside(mouse, ibtTrailer) && selectedPallet) {
    moveSelectedPalletToIbt();
    return;
  }

  if (isPointInside(mouse, emptyPalletTrailer)) {
    pullEmptyPalletStackFromTrailer();
    return;
  }

  const clickedEmptyStack = findClickedEmptyPalletStack(mouse);

  if (clickedEmptyStack) {
    if (splittingPalletStack) {
      selectStackForSplit(clickedEmptyStack);
      return;
    }

    if (clickedEmptyStack.count <= 0) {
      statusEl.textContent = "That empty pallet stack is empty.";
      return;
    }

    selectedEmptyPalletStack = clickedEmptyStack;
    selectedPallet = null;
    selectedSplitStacks = [];
    splittingPalletStack = false;

    statusEl.textContent = `${clickedEmptyStack.side} ${clickedEmptyStack.position} empty pallet stack selected. Click a matching base.`;
    return;
  }

  const clickedBase = findClickedBase(mouse);

  if (clickedBase && selectedEmptyPalletStack) {
    placeEmptyPalletOnBase(clickedBase);
    return;
  }

  if (selectedPallet) {
    const clickedLane = findClickedStagingLane(mouse);

    if (clickedLane) {
      moveSelectedPalletToLane(clickedLane);
      return;
    }
  }
});

function isPointInside(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function findClickedBase(mouse) {
  return bases.find(base => isPointInside(mouse, base));
}

function findClickedPallet(mouse) {
  for (const base of bases) {
    const pallet = base.pallet;
    if (!pallet) continue;

    if (isPointInside(mouse, pallet)) {
      return pallet;
    }
  }

  return null;
}

function findClickedEmptyPalletStack(mouse) {
  return emptyPalletStacks.find(stack => isPointInside(mouse, stack));
}

function findClickedStagingLane(mouse) {
  return stagingLanes.find(lane =>
    mouse.x >= lane.x &&
    mouse.x <= lane.x + lane.slotWidth &&
    mouse.y >= lane.y &&
    mouse.y <= lane.y + lane.slotHeight * lane.slots.length
  );
}

// -----------------------------
// BUTTON CONTROLS
// -----------------------------

callGpmButton.addEventListener("click", callGPM);
requestIbtButton.addEventListener("click", requestNewIbt);

requestPrimaryTrailerButton.addEventListener("click", () => requestNewTrailer("left"));
requestSecondaryTrailerButton.addEventListener("click", () => requestNewTrailer("right"));

togglePrimaryDoorButton.addEventListener("click", () => toggleDoorSource("left"));
toggleSecondaryDoorButton.addEventListener("click", () => toggleDoorSource("right"));

// -----------------------------
// START GAME
// -----------------------------

setInterval(() => spawnBox("left"), 700);
setInterval(() => spawnBox("right"), 1800);
setInterval(autoClearStagedPallets, AUTO_GPM_CHECK_MS);

function gameLoop() {
  if (!gameOver) {
    updateBoxes();
    updateBaseBlockTimers();
    updateArtTrailerRefills();
    updateIbtTrailer();
  }

  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();