const W = 1280;
const H = 720;

const COLORS = {
  floor: 0x1a2427,
  floor2: 0x253136,
  ink: "#d9e7ee",
  muted: "#88a1ad",
  line: 0x3d4b53,
  green: 0x22c55e,
  yellow: 0xfacc15,
  red: 0xef4444,
  blue: 0x0ea5e9,
  cyan: 0x38bdf8,
  orange: 0xf97316,
  purple: 0x7c3aed,
  brown: 0xb8793a,
  dark: 0x0c141b,
  panel: 0x111c24,
  panel2: 0x17242e,
  white: 0xf8fafc,
  asphalt: 0x111a1e,
  concrete: 0x2d383b,
  bay: 0x223039,
  hazard: 0xfbbf24,
};

const TUNE = {
  artCapacity: 100,
  primarySpawnMs: 900,
  secondarySpawnMs: 2200,
  artRefillMs: 45000,
  raaPalletBoxes: 3,
  raaPrepCapacity: 5,
  raaPrepMs: 4000,
  raaPrepClutterMs: 45000,
  artLowWarning: 20,
  artCriticalWarning: 5,
  baseCount: 5,
  baseCapacity: 6,
  emptyPull: 14,
  emptySplit: 7,
  stagingSlotCapacity: 3,
  stagingLanes: 5,
  freightPreview: 8,
  mixedJamMs: 9500,
  ibtCapacity: 10,
  ibtClearMs: 15000,
  gpmAutoMs: 2500,
  gpmAutoChance: 0.55,
  blockedGraceMs: 1400,
  blockedPenaltyMs: 1600,
  scores: {
    stage: 110,
    ibt: 140,
    fast: 30,
    raaPrep: 35,
    raaSmoothTransition: 90,
    raaNoPrepPenalty: -30,
    raaPrepUse: 20,
    raaClutter: -10,
    empty: 10,
    manualGpm: -60,
    mixedLane: -20,
    reworkMixed: -45,
    mixedJam: -25,
    crossLane: -10,
    cleanLaneComplete: 125,
    hotLaneStart: 20,
    forecastComplete: 90,
    hotBlocked: -45,
    blocked: -30,
    autoClearEach: 35,
    ibtClearEach: 60,
  },
  freight: [
    { key: "Brown", color: 0xb8793a },
    { key: "Red", color: 0xef4444 },
    { key: "Orange", color: 0xf97316 },
    { key: "Purple", color: 0x7c3aed },
    { key: "Blue", color: 0x0ea5e9 },
  ],
};

const SIDE_INFO = {
  primary: {
    title: "PRIMARY",
    label: "Primary",
    x: 178,
    baseY: 230,
    dockX: 58,
    raaX: 58,
    raaY: 369,
    conveyorY: 205,
    stackTop: "pTop",
    stackBottom: "pBottom",
    spawnMs: TUNE.primarySpawnMs,
  },
  secondary: {
    title: "SECONDARY",
    label: "Secondary",
    x: 1084,
    baseY: 230,
    dockX: 1218,
    raaX: 1218,
    raaY: 369,
    conveyorY: 205,
    stackTop: "sTop",
    stackBottom: "sBottom",
    spawnMs: TUNE.secondarySpawnMs,
  },
};

const WORKER_SHEET = {
  key: "workerSheet",
  path: "assets/worker_sprites_v2.png",
  frameWidth: 96,
  frameHeight: 128,
  framesPerRow: 7,
  scale: 0.42,
};

class RCFlowScene extends Phaser.Scene {
  constructor() {
    super("RCFlowScene");
  }

  preload() {
    const workerSource = window.WORKER_SPRITES_DATA || WORKER_SHEET.path;
    this.load.spritesheet(WORKER_SHEET.key, workerSource, {
      frameWidth: WORKER_SHEET.frameWidth,
      frameHeight: WORKER_SHEET.frameHeight,
    });
  }

  create() {
    this.now = 0;
    this.score = 0;
    this.mode = { kind: "none", stack: null, splitRemaining: 0 };
    this.alerts = [];
    this.fx = [];
    this.buttons = [];
    this.clickZones = [];
    this.movers = [];
    this.selectedStack = null;
    this.pendingPallet = null;
    this.ibt = { count: 0, clearing: false, timer: 0 };
    this.staging = this.makeStaging();
    this.sides = {
      primary: this.makeSide("primary"),
      secondary: this.makeSide("secondary"),
    };

    this.createTextures();
    this.drawStaticWorld();
    this.createActors();
    this.createHud();
    this.registerInputs();
    this.addAlert("SHIFT START: ART trailers active. Protect the flow.");
  }

  makeSide(key) {
    const info = SIDE_INFO[key];
    return {
      key,
      info,
      source: "ART",
      artBacklog: TUNE.artCapacity,
      refillTimer: 0,
      raaBoxes: 0,
      raaPrep: {
        pallets: [],
        prepping: false,
        timer: 0,
        alertedLow: false,
        alertedCritical: false,
        noPrepPenalized: false,
      },
      queue: this.makeFreightQueue(),
      spawnClock: 0,
      status: "green",
      bases: Array.from({ length: TUNE.baseCount }, (_, i) => ({
        index: i,
        empty: true,
        boxes: 0,
        colorKey: null,
        color: null,
        blocked: false,
        fullAt: 0,
        lastPenaltyAt: 0,
        x: info.x,
        y: info.baseY + i * 66,
      })),
    };
  }

  makeStaging() {
    return {
      lanes: Array.from({ length: TUNE.stagingLanes }, (_, i) => ({
        index: i,
        label: String.fromCharCode(65 + i),
        affinity: i < 2 ? "primary" : i > 2 ? "secondary" : "flex",
        pallets: [],
        colorKey: null,
        color: null,
        forecastPlanned: false,
        mixed: false,
        ready: false,
        readyAt: 0,
        jamStartedAt: 0,
        x: 442 + i * 99,
        y: 444,
      })),
    };
  }

  makeFreightQueue() {
    return Array.from({ length: TUNE.freightPreview }, () => this.pickFreight());
  }

  createTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 26, 18, 3);
    g.fillStyle(0x000000, 0.13);
    g.fillRect(3, 4, 20, 2);
    g.fillRect(12, 0, 2, 18);
    g.generateTexture("box", 26, 18);
    g.clear();
    g.fillStyle(0x9a6a35, 1);
    g.fillRoundedRect(0, 0, 50, 30, 4);
    g.fillStyle(0xd6a25c, 1);
    for (let y = 4; y < 28; y += 9) g.fillRect(4, y, 42, 4);
    g.lineStyle(2, 0x6b451f, 1);
    g.strokeRoundedRect(0, 0, 50, 30, 4);
    g.generateTexture("pallet", 50, 30);
    g.clear();
    g.fillStyle(0x0f172a, 0.32);
    g.fillEllipse(14, 42, 26, 9);
    g.fillStyle(0xf8fafc, 1);
    g.fillCircle(14, 8, 7);
    g.fillStyle(0xfacc15, 1);
    g.fillRect(7, 2, 14, 4);
    g.fillStyle(0x2563eb, 1);
    g.fillRoundedRect(5, 16, 18, 20, 4);
    g.fillStyle(0x93c5fd, 1);
    g.fillRect(8, 20, 12, 3);
    g.fillStyle(0x111827, 1);
    g.fillRect(7, 36, 5, 11);
    g.fillRect(17, 36, 5, 11);
    g.generateTexture("worker", 28, 50);
    g.clear();
    g.fillStyle(0x0f172a, 0.35);
    g.fillEllipse(28, 30, 58, 12);
    g.fillStyle(0xfacc15, 1);
    g.fillRoundedRect(0, 4, 40, 22, 5);
    g.fillStyle(0xfef3c7, 1);
    g.fillRoundedRect(9, 0, 19, 12, 3);
    g.fillStyle(0x111827, 1);
    g.fillCircle(9, 27, 5);
    g.fillCircle(31, 27, 5);
    g.fillStyle(0x334155, 1);
    g.fillRect(38, 9, 22, 5);
    g.fillRect(58, 4, 3, 23);
    g.generateTexture("forklift", 66, 38);
    g.destroy();
  }

  drawStaticWorld() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x182022);

    this.drawConcreteFloor();
    this.drawWarehouseWall();
    this.drawSafetyMarkings();
    this.drawFloorProps();

    this.drawWarehouseShell();
    this.drawZoneBands();

    this.drawHeaderBand();
    this.drawOpsBoard();
    this.drawConveyors();
    this.drawDockArea("primary");
    this.drawDockArea("secondary");
    this.drawBases("primary");
    this.drawBases("secondary");
    this.drawStagingArea();
    this.drawEmptyPalletArea();
    this.drawIbtArea();
  }

  drawConcreteFloor() {
    const g = this.add.graphics();
    g.fillStyle(0x565b56, 1);
    g.fillRect(0, 96, W, H - 96);
    g.fillStyle(0x4d524e, 0.82);
    g.fillRect(0, 96, W, H - 96);

    for (let x = 0; x < W; x += 128) {
      for (let y = 112; y < H; y += 112) {
        const tone = ((x / 128 + y / 112) % 2) ? 0x5b605a : 0x4a504c;
        g.fillStyle(tone, 0.32);
        g.fillRect(x, y, 126, 110);
      }
    }

    g.lineStyle(1, 0x2f3534, 0.25);
    for (let x = 0; x <= W; x += 128) g.lineBetween(x, 96, x, H);
    for (let y = 112; y <= H; y += 112) g.lineBetween(0, y, W, y);
    g.lineStyle(1, 0x737872, 0.1);
    for (let x = 64; x <= W; x += 128) g.lineBetween(x, 96, x, H);

    this.drawFloorScuffs(g);
    g.fillStyle(0x0b1012, 0.2);
    g.fillRect(0, 96, W, 26);
    g.fillRect(0, 690, W, 30);
  }

  drawFloorScuffs(g) {
    const marks = [
      [418, 178, 92, 22, -8], [742, 330, 108, 18, 7], [555, 610, 160, 20, -3],
      [1010, 168, 128, 18, 4], [170, 618, 120, 20, 8], [1175, 512, 90, 16, -10],
      [330, 350, 110, 18, 12], [834, 584, 120, 16, -7],
    ];
    marks.forEach(([x, y, w, h], i) => {
      g.fillStyle(i % 2 ? 0x252b2b : 0x77786f, i % 2 ? 0.13 : 0.08);
      g.fillEllipse(x, y, w, h);
    });
  }

  drawWarehouseWall() {
    const g = this.add.graphics();
    g.fillStyle(0x8a8980, 1);
    g.fillRect(0, 0, W, 116);
    g.fillStyle(0x75746d, 0.52);
    g.fillRect(0, 76, W, 40);
    g.fillStyle(0x3e403e, 0.8);
    g.fillRect(0, 109, W, 7);
    g.lineStyle(1, 0x4f504b, 0.45);
    for (let x = 0; x < W; x += 96) g.lineBetween(x, 0, x, 116);
    for (let i = 0; i < 16; i++) {
      const x = 30 + i * 82;
      const y = 18 + (i % 3) * 13;
      g.fillStyle(i % 2 ? 0x62615a : 0x9a9990, 0.13);
      g.fillCircle(x, y, 18 + (i % 4) * 3);
    }

    this.drawDockPortal(640, 89, "1");
    this.drawWarningSign(330, 50, "NOTICE", "KEEP AISLES");
    this.drawWarningSign(410, 50, "CAUTION", "PALLET TRAFFIC", true);
  }

  drawDockPortal(x, y, label) {
    const g = this.add.graphics();
    g.fillStyle(0x11181b, 1);
    g.fillRoundedRect(x - 92, y - 80, 184, 128, 5);
    g.fillStyle(0x1f2a2d, 1);
    g.fillRoundedRect(x - 82, y - 70, 164, 112, 4);
    g.fillStyle(0x0a0d0e, 1);
    g.fillRect(x - 47, y - 44, 94, 86);
    for (let yy = y - 36; yy <= y + 34; yy += 10) {
      g.lineStyle(2, 0x344044, 0.8);
      g.lineBetween(x - 37, yy, x + 37, yy);
    }
    g.fillStyle(0xe8e0d0, 1);
    g.fillRoundedRect(x - 17, y - 66, 34, 28, 2);
    this.add.text(x, y - 52, label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 20,
      color: "#1f2933",
    }).setOrigin(0.5);
    [x - 72, x + 72].forEach((postX) => this.drawBollard(postX, y + 42));
  }

  drawWarningSign(x, y, title, body, caution = false) {
    const g = this.add.graphics();
    g.fillStyle(caution ? 0xfacc15 : 0xe5eef5, 0.96);
    g.fillRoundedRect(x - 36, y - 20, 72, 40, 3);
    g.lineStyle(2, caution ? 0x3b2d04 : 0x1e3a5f, 0.9);
    g.strokeRoundedRect(x - 36, y - 20, 72, 40, 3);
    this.add.text(x, y - 10, title, {
      fontFamily: "Arial Black, Arial",
      fontSize: 10,
      color: caution ? "#3b2d04" : "#1e3a5f",
    }).setOrigin(0.5);
    this.add.text(x, y + 7, body, {
      fontFamily: "Arial Black, Arial",
      fontSize: 7,
      color: caution ? "#3b2d04" : "#1f2937",
      align: "center",
    }).setOrigin(0.5);
  }

  drawWarehouseShell() {
    const g = this.add.graphics();
    this.drawStorageRack(g, 10, 126, 118, 198, false);
    this.drawStorageRack(g, 1152, 126, 118, 198, true);
    this.drawStorageRack(g, 10, 516, 118, 146, false);
    this.drawStorageRack(g, 1152, 516, 118, 146, true);
  }

  drawStorageRack(g, x, y, w, h, flip = false) {
    g.fillStyle(0x12202a, 0.96);
    g.fillRoundedRect(x, y, w, h, 4);
    const uprightColor = flip ? 0x0e7490 : 0x1d4ed8;
    for (let col = 0; col < 3; col++) {
      const px = x + 12 + col * ((w - 24) / 2);
      g.fillStyle(uprightColor, 0.72);
      g.fillRect(px - 3, y, 6, h);
    }
    for (let row = 0; row < 3; row++) {
      const py = y + 18 + row * ((h - 36) / 2);
      g.fillStyle(0xc26b1a, 0.82);
      g.fillRect(x + 8, py, w - 16, 6);
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        this.drawCartonStack(g, x + 27 + col * 48, y + 36 + row * 52, 34, 28);
      }
    }
    [x + 8, x + w - 18].forEach((postX) => {
      g.fillStyle(0xfacc15, 0.85);
      g.fillRect(postX, y + h - 32, 10, 24);
      g.lineStyle(2, 0x111827, 0.7);
      g.lineBetween(postX, y + h - 8, postX + 10, y + h - 28);
    });
  }

  drawSafetyMarkings() {
    const g = this.add.graphics();
    const paint = 0xc59222;
    this.drawStripedBand(g, 0, 568, W, 64, paint, 0.55);
    this.drawPaintedRect(g, 150, 126, 178, 442, paint, 0.58);
    this.drawPaintedRect(g, 952, 126, 178, 442, paint, 0.58);
    this.drawPaintedRect(g, 354, 326, 572, 238, paint, 0.52);
    this.drawPaintedRect(g, 982, 590, 304, 112, paint, 0.5);
    this.drawPaintedRect(g, 22, 594, 316, 112, paint, 0.5);
    this.drawStripedBox(g, 296, 140, 74, 116, paint);
    this.drawStripedBox(g, 910, 142, 74, 116, paint);
  }

  drawPaintedRect(g, x, y, w, h, color, alpha) {
    g.lineStyle(4, color, alpha);
    g.strokeRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x6f5218, 0.22);
    g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, 5);
  }

  drawStripedBand(g, x, y, w, h, color, alpha) {
    g.fillStyle(color, 0.09);
    g.fillRect(x, y, w, h);
    g.lineStyle(4, color, alpha);
    g.lineBetween(x, y, x + w, y);
    g.lineBetween(x, y + h, x + w, y + h);
    for (let sx = x - h; sx < x + w; sx += 28) {
      g.lineStyle(3, color, alpha * 0.72);
      g.lineBetween(sx, y + h, sx + h, y);
    }
  }

  drawStripedBox(g, x, y, w, h, color) {
    g.fillStyle(color, 0.11);
    g.fillRect(x, y, w, h);
    g.lineStyle(3, color, 0.5);
    g.strokeRect(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += 18) {
      g.lineStyle(2, color, 0.42);
      g.lineBetween(sx, y + h, sx + h, y);
    }
  }

  drawZoneBands() {
    const g = this.add.graphics();
    g.fillStyle(0x24353b, 0.33);
    g.fillRoundedRect(154, 130, 160, 430, 8);
    g.fillRoundedRect(966, 130, 160, 430, 8);
    g.fillStyle(0x11191b, 0.18);
    g.fillRoundedRect(364, 328, 552, 230, 10);
    g.lineStyle(2, 0x111827, 0.18);
    g.strokeRoundedRect(364, 328, 552, 230, 10);
  }

  drawFloorProps() {
    const g = this.add.graphics();
    this.drawPalletCluster(g, 74, 328, 3, 3);
    this.drawPalletCluster(g, 1118, 420, 3, 3);
    this.drawBarrels(g, 1196, 420);
    this.drawCrateStack(g, 156, 636);
    this.drawPalletJack(g, 246, 634);
    this.drawParkedForklift(g, 914, 637);
    [508, 524, 544, 568, 702, 774, 1164, 1218].forEach((x, i) => this.drawBollard(x, i < 6 ? 122 : 638));
  }

  drawCartonStack(g, x, y, w, h) {
    g.fillStyle(0xb8793a, 0.95);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    g.lineStyle(1, 0x6f451d, 0.7);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    g.fillStyle(0xf3c37a, 0.22);
    g.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, 3);
    g.fillStyle(0x4b2c12, 0.2);
    g.fillRect(x - 1, y - h / 2, 2, h);
  }

  drawPalletCluster(g, x, y, cols, rows) {
    g.fillStyle(0x9a6a35, 0.78);
    g.fillRoundedRect(x - 54, y + 36, 110, 12, 3);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.drawCartonStack(g, x - 38 + col * 38, y - 30 + row * 30, 34, 26);
      }
    }
  }

  drawCrateStack(g, x, y) {
    for (let i = 0; i < 3; i++) {
      const cx = x + (i % 2) * 58;
      const cy = y - Math.floor(i / 2) * 54;
      g.fillStyle(0x9a6a35, 0.96);
      g.fillRoundedRect(cx - 28, cy - 24, 56, 48, 3);
      g.lineStyle(2, 0x4b2c12, 0.65);
      g.strokeRoundedRect(cx - 28, cy - 24, 56, 48, 3);
      g.lineBetween(cx - 22, cy - 18, cx + 22, cy + 18);
      g.lineBetween(cx + 22, cy - 18, cx - 22, cy + 18);
    }
  }

  drawBarrels(g, x, y) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const bx = x + col * 38;
        const by = y + row * 28;
        g.fillStyle(0x1f4f74, 0.98);
        g.fillEllipse(bx, by, 34, 20);
        g.fillRect(bx - 17, by, 34, 24);
        g.fillEllipse(bx, by + 24, 34, 20);
        g.lineStyle(1, 0x8fc6e8, 0.35);
        g.strokeEllipse(bx, by, 34, 20);
      }
    }
  }

  drawPalletJack(g, x, y) {
    g.lineStyle(5, 0xd97706, 0.92);
    g.lineBetween(x, y, x + 56, y);
    g.lineBetween(x + 10, y + 13, x + 64, y + 13);
    g.lineStyle(4, 0x1f2937, 1);
    g.lineBetween(x + 58, y - 4, x + 78, y - 38);
    g.fillStyle(0x111827, 1);
    g.fillCircle(x + 3, y + 4, 6);
    g.fillCircle(x + 62, y + 17, 5);
  }

  drawParkedForklift(g, x, y) {
    g.fillStyle(0x05090c, 0.24);
    g.fillEllipse(x, y + 32, 146, 36);
    g.fillStyle(0xd6a21e, 0.96);
    g.fillRoundedRect(x - 36, y - 22, 82, 54, 8);
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(x - 54, y - 30, 48, 66, 6);
    g.fillStyle(0x0f172a, 1);
    g.fillCircle(x - 42, y + 32, 13);
    g.fillCircle(x + 40, y + 28, 12);
    g.lineStyle(5, 0x111827, 1);
    g.lineBetween(x - 74, y + 6, x - 130, y + 6);
    g.lineBetween(x - 74, y + 22, x - 130, y + 22);
  }

  drawBollard(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x080b0d, 0.25);
    g.fillEllipse(x, y + 12, 20, 8);
    g.fillStyle(0xeab308, 0.94);
    g.fillRoundedRect(x - 5, y - 20, 10, 34, 4);
    g.fillStyle(0xfff1a8, 0.24);
    g.fillRect(x - 3, y - 17, 3, 26);
  }

  drawHeaderBand() {
    const g = this.add.graphics();
    g.fillStyle(0x071016, 1);
    g.fillRect(0, 0, W, 96);
    g.fillStyle(0x0f1b22, 1);
    g.fillRoundedRect(18, 12, 520, 68, 8);
    g.lineStyle(1, 0x2e4755, 0.85);
    g.strokeRoundedRect(18, 12, 520, 68, 8);
    g.fillStyle(0x13242c, 1);
    g.fillRoundedRect(552, 12, 700, 68, 8);
    g.strokeRoundedRect(552, 12, 700, 68, 8);
    g.lineStyle(2, 0x38bdf8, 0.28);
    g.lineBetween(0, 95, W, 95);
    this.add.text(28, 16, "RC FLOW CONTROL", {
      fontFamily: "Arial Black, Arial",
      fontSize: 24,
      color: "#eff6ff",
    });
    this.add.text(30, 49, "Freight collapse prevention • live warehouse operations board", {
      fontSize: 13,
      color: "#8ba8b6",
    });
    this.add.text(566, 21, "ACTIVE FEED", {
      fontFamily: "Arial Black, Arial",
      fontSize: 12,
      color: "#7dd3fc",
    });
    this.add.text(566, 48, "Manage ART, RAA, staging, IBT, and empty pallet recovery", {
      fontSize: 13,
      color: "#c7d2da",
    });
  }

  drawOpsBoard() {
    const g = this.add.graphics();
    g.fillStyle(0x071016, 0.42);
    g.fillRoundedRect(326, 150, 628, 160, 14);
    g.fillStyle(0x101b22, 0.98);
    g.fillRoundedRect(338, 160, 604, 140, 12);
    g.lineStyle(2, 0x38bdf8, 0.38);
    g.strokeRoundedRect(338, 160, 604, 140, 12);
    g.fillStyle(0x172832, 0.98);
    g.fillRoundedRect(356, 178, 568, 104, 8);
    g.lineStyle(1, 0x2f4c5a, 0.72);
    g.strokeRoundedRect(356, 178, 568, 104, 8);
    g.fillStyle(0x38bdf8, 0.75);
    g.fillRoundedRect(378, 194, 54, 4, 2);
    g.fillStyle(0xfbbf24, 0.75);
    g.fillRoundedRect(848, 194, 54, 4, 2);
    g.fillStyle(0x0d171d, 0.92);
    g.fillRoundedRect(382, 205, 516, 66, 6);
    g.lineStyle(1, 0x314b58, 0.7);
    g.strokeRoundedRect(382, 205, 516, 66, 6);
  }

  drawConveyors() {
    ["primary", "secondary"].forEach((key) => {
      const info = SIDE_INFO[key];
      const x1 = key === "primary" ? 92 : 1188;
      const x2 = key === "primary" ? 314 : 966;
      this.add.line(0, 0, x1, info.conveyorY, x2, info.conveyorY, 0x74808a)
        .setOrigin(0)
        .setLineWidth(26);
      this.add.line(0, 0, x1, info.conveyorY, x2, info.conveyorY, 0x111827)
        .setOrigin(0)
        .setLineWidth(16);
      this.add.line(0, 0, x1, info.conveyorY, x2, info.conveyorY, 0x263640)
        .setOrigin(0)
        .setLineWidth(11);
      for (let i = 0; i < 10; i++) {
        const x = Phaser.Math.Linear(x1, x2, i / 9);
        this.add.rectangle(x, info.conveyorY, 4, 28, 0x93a4ad, 0.42).setAngle(22);
      }
    });
  }

  drawDockArea(key) {
    const info = SIDE_INFO[key];
    const dockX = info.dockX;
    this.makeDockButton(key, "art", dockX, 176, "ART");
    this.makeDockButton(key, "raa", dockX, info.raaY, "RAA");
    const prepX = dockX;
    const prepY = info.raaY + 106;
    this.add.rectangle(prepX, prepY + 4, 102, 56, 0x05090c, 0.25);
    this.add.rectangle(prepX, prepY, 92, 46, 0x1a241d, 0.92).setStrokeStyle(1, 0x9f7d32);
  }

  makeDockButton(sideKey, type, x, y, label) {
    const w = 94;
    const h = 90;
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => this.handleDockClick(sideKey, type));
    this.clickZones.push(zone);
    this.add.rectangle(x, y + 6, w + 8, h + 10, 0x05090c, 0.28);
    this.add.rectangle(x, y, w, h, 0x192632, 0.98).setStrokeStyle(2, type === "art" ? 0x7c8d98 : 0xd6a84c);
    this.add.rectangle(x, y - 31, w - 16, 12, type === "art" ? 0x32424c : 0x4a3717, 1);
    for (let i = -28; i <= 28; i += 14) {
      this.add.line(0, 0, x - 38, y + i, x + 38, y + i, 0x40515b).setOrigin(0).setLineWidth(2);
    }
    this.add.text(x, y - 31, label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 16,
      color: "#f8fafc",
    }).setOrigin(0.5);
  }

  drawBases(sideKey) {
    const side = this.sides?.[sideKey] || this.makeSide(sideKey);
    const info = SIDE_INFO[sideKey];
    side.bases.forEach((base) => {
      this.add.zone(base.x, base.y, 130, 50).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.handleBaseClick(sideKey, base.index));
      this.add.rectangle(base.x, base.y + 4, 142, 58, 0x0a1116, 0.22);
      this.add.rectangle(base.x, base.y, 132, 52, 0x1f2d35, 0.68).setStrokeStyle(1, 0x4f626d, 0.45);
    });
  }

  drawStagingArea() {
    this.add.text(466, 338, "GPM STAGING", {
      fontFamily: "Arial Black, Arial",
      fontSize: 16,
      color: "#e0f2fe",
    });
    this.add.rectangle(640, 444, 552, 196, 0x0d171d, 0.38);
    this.add.rectangle(640, 444, 530, 188, 0x121f28, 0.92).setStrokeStyle(2, 0x3e5968);
    this.staging.lanes.forEach((lane) => {
      this.add.zone(lane.x, lane.y, 82, 136).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.handleStagingLaneClick(lane.index));
      this.add.rectangle(lane.x, lane.y, 82, 136, 0x182631, 0.96).setStrokeStyle(1, 0x405763);
      this.add.text(lane.x - 32, lane.y - 61, lane.label, {
        fontFamily: "Arial Black, Arial",
        fontSize: 12,
        color: "#9bd4ea",
      });
      this.add.rectangle(lane.x + 27, lane.y - 56, 12, 5, lane.affinity === "primary" ? COLORS.cyan : lane.affinity === "secondary" ? COLORS.purple : COLORS.hazard, 0.85);
      for (let slot = 0; slot < TUNE.stagingSlotCapacity; slot++) {
        this.add.rectangle(lane.x, lane.y + 36 - slot * 38, 62, 28, 0x0f1a21, 0.8)
          .setStrokeStyle(1, 0x334751);
      }
    });
  }

  drawEmptyPalletArea() {
    this.add.text(38, 586, "EMPTY PALLET TRAILER", {
      fontFamily: "Arial Black, Arial",
      fontSize: 13,
      color: "#fde68a",
    });
    this.add.zone(104, 642, 142, 62).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.handleEmptyTrailerClick());
    this.add.rectangle(104, 642, 152, 72, 0x070b0e, 0.28);
    this.add.rectangle(104, 642, 142, 62, 0x292317, 0.98).setStrokeStyle(2, 0xd6a84c);
    for (let x = 46; x <= 154; x += 18) this.add.rectangle(x, 664, 12, 4, 0xd6a84c, 0.55);
    this.add.text(104, 642, "PULL 14", {
      fontFamily: "Arial Black, Arial",
      fontSize: 18,
      color: "#fff7ed",
    }).setOrigin(0.5);

    this.stacks = {
      pTop: { key: "pTop", label: "P TOP", side: "primary", x: 250, y: 604, count: 0 },
      pBottom: { key: "pBottom", label: "P BOT", side: "primary", x: 250, y: 674, count: 0 },
      sTop: { key: "sTop", label: "S TOP", side: "secondary", x: 1030, y: 604, count: 0 },
      sBottom: { key: "sBottom", label: "S BOT", side: "secondary", x: 1030, y: 674, count: 0 },
    };
    Object.values(this.stacks).forEach((stack) => {
      this.add.zone(stack.x, stack.y, 102, 48).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.handleStackClick(stack.key));
      this.add.rectangle(stack.x, stack.y + 4, 112, 56, 0x070b0e, 0.25);
      this.add.rectangle(stack.x, stack.y, 102, 48, 0x18232a, 0.96).setStrokeStyle(1, 0x657682);
    });
  }

  drawIbtArea() {
    this.add.text(1040, 586, "IBT BLUE TRAILER", {
      fontFamily: "Arial Black, Arial",
      fontSize: 13,
      color: "#bae6fd",
    });
    this.add.rectangle(1170, 642, 165, 84, 0x070b0e, 0.25);
    this.add.rectangle(1170, 642, 155, 74, 0x0d2633, 0.96).setStrokeStyle(2, COLORS.blue);
    this.add.line(0, 0, 1098, 610, 1242, 610, 0x7dd3fc, 0.35).setOrigin(0).setLineWidth(2);
  }

  createActors() {
    this.workers = [];
    const hasWorkerSheet = this.textures.exists(WORKER_SHEET.key);
    ["primary", "secondary"].forEach((sideKey) => {
      const dir = sideKey === "primary" ? 1 : -1;
      for (let i = 0; i < 2; i++) {
        const characterRow = sideKey === "primary" ? i : i + 2;
        const baseFrame = characterRow * WORKER_SHEET.framesPerRow;
        const frame = baseFrame + (i === 0 ? 5 : 4);
        const textureKey = hasWorkerSheet ? WORKER_SHEET.key : "worker";
        const sprite = this.add.sprite(SIDE_INFO[sideKey].x + dir * (78 + i * 22), 255 + i * 128, textureKey, hasWorkerSheet ? frame : undefined)
          .setScale(hasWorkerSheet ? WORKER_SHEET.scale : 0.9)
          .setFlipX(sideKey === "secondary")
          .setDepth(18);
        this.workers.push({
          sideKey,
          sprite,
          homeX: sprite.x,
          homeY: sprite.y,
          phase: Math.random() * Math.PI * 2,
          frames: [baseFrame + 5, baseFrame + 3, baseFrame + 4],
          usesSheet: hasWorkerSheet,
        });
      }
    });
    this.forklifts = [
      this.add.sprite(414, 315, "forklift").setDepth(17),
      this.add.sprite(866, 315, "forklift").setFlipX(true).setDepth(17),
    ];
  }

  createHud() {
    this.hud = {
      score: this.add.text(890, 22, "", { fontFamily: "Arial Black, Arial", fontSize: 22, color: "#f8fafc" }),
      blocked: this.add.text(890, 52, "", { fontSize: 13, color: "#cbd5e1" }),
      legend: this.add.text(400, 654, "Forecast hot colors • keep lanes clean • match 3", {
        fontSize: 12,
        color: "#cbd5e1",
      }),
    };
    this.makeButton(458, 612, 136, 36, "Toggle Primary", () => this.toggleSide("primary"));
    this.makeButton(610, 612, 136, 36, "Toggle Secondary", () => this.toggleSide("secondary"));
    this.makeButton(762, 612, 116, 36, "Call GPM", () => this.manualGpm());
    this.makeButton(1170, 698, 138, 32, "Request IBT", () => this.requestIbt());
    this.makeButton(58, 95, 112, 30, "New Trailer P", () => this.requestArt("primary"));
    this.makeButton(1220, 95, 112, 30, "New Trailer S", () => this.requestArt("secondary"));
  }

  makeButton(x, y, w, h, label, cb) {
    const shadow = this.add.rectangle(x, y + 3, w + 4, h + 4, 0x05090c, 0.28).setDepth(40);
    const box = this.add.rectangle(x, y, w, h, 0x21313b, 0.98).setStrokeStyle(1, 0x6d8492).setDepth(41);
    const text = this.add.text(x, y, label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 11,
      color: "#eff6ff",
    }).setOrigin(0.5).setDepth(42);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(43);
    zone.on("pointerover", () => box.setFillStyle(0x2a4050));
    zone.on("pointerout", () => box.setFillStyle(0x21313b));
    zone.on("pointerdown", cb);
    this.buttons.push({ shadow, box, text, zone });
  }

  registerInputs() {
    this.input.on("pointerdown", (pointer) => {
      this.lastPointer = { x: pointer.worldX, y: pointer.worldY };
    });
  }

  update(time, delta) {
    this.now = time;
    this.updateTrailers(delta);
    this.updateRaaPrep(delta);
    this.updateSpawning(delta);
    this.updatePenalties();
    this.updateAutoGpm(delta);
    this.updateIbt(delta);
    this.updateMovers(delta);
    this.updateActors(time);
    this.renderDynamic(time);
    this.updateHud();
  }

  updateTrailers(delta) {
    Object.values(this.sides).forEach((side) => {
      if (side.refillTimer > 0) {
        side.refillTimer = Math.max(0, side.refillTimer - delta);
        if (side.refillTimer === 0) {
          side.artBacklog = TUNE.artCapacity;
          this.addAlert(`${side.info.label} ART trailer refilled.`);
        }
      }
    });
  }

  updateRaaPrep(delta) {
    Object.values(this.sides).forEach((side) => {
      const prep = side.raaPrep;
      if (side.artBacklog <= TUNE.artLowWarning && side.artBacklog > TUNE.artCriticalWarning && !prep.alertedLow) {
        prep.alertedLow = true;
        this.addAlert(`${side.info.label} ART low: prep RAA before transition.`);
      }
      if (side.artBacklog <= TUNE.artCriticalWarning && side.artBacklog > 0 && !prep.alertedCritical) {
        prep.alertedCritical = true;
        this.addAlert(`${side.info.label} ART critical. RAA prep should be ready.`);
      }
      if (side.artBacklog > TUNE.artLowWarning) {
        prep.alertedLow = false;
        prep.alertedCritical = false;
        prep.noPrepPenalized = false;
      }
      if (prep.prepping) {
        prep.timer = Math.max(0, prep.timer - delta);
        if (prep.timer === 0) {
          prep.prepping = false;
          prep.pallets.push({ boxes: TUNE.raaPalletBoxes, createdAt: this.now });
          this.score += TUNE.scores.raaPrep;
          this.addAlert(`${side.info.label} RAA prep complete: backup pallet staged.`);
        }
      }
      prep.pallets.forEach((pallet) => {
        if (!pallet.cluttered && this.now - pallet.createdAt >= TUNE.raaPrepClutterMs) {
          pallet.cluttered = true;
          this.score += TUNE.scores.raaClutter;
          this.addAlert(`${side.info.label} RAA prep is aging into clutter.`);
        }
      });
    });
  }

  updateSpawning(delta) {
    Object.values(this.sides).forEach((side) => {
      side.spawnClock += delta;
      if (side.spawnClock < side.info.spawnMs) return;
      side.spawnClock = 0;
      this.trySpawnFreight(side);
    });
  }

  trySpawnFreight(side) {
    if (side.source === "ART") {
      if (side.artBacklog <= 0 || side.refillTimer > 0) return;
      side.artBacklog -= 1;
      if (side.artBacklog === 0) {
        if (side.raaPrep.pallets.length > 0) {
          this.addAlert(`${side.info.label} ART empty. RAA prep is ready for smooth transition.`);
        } else {
          this.addAlert(`${side.info.label} ART empty with no RAA prep. Flow gap risk.`);
          if (!side.raaPrep.noPrepPenalized) {
            side.raaPrep.noPrepPenalized = true;
            this.score += TUNE.scores.raaNoPrepPenalty;
          }
        }
      }
    } else {
      if (side.raaBoxes <= 0 && !this.loadPreparedRaaPallet(side, false)) return;
      side.raaBoxes -= 1;
    }

    const freight = side.queue.shift();
    side.queue.push(this.pickFreight());
    const base = this.reserveBase(side, freight);
    if (!base) {
      this.addAlert(`${side.info.label} ${freight.key} has no legal base. Flow is choking.`);
      this.score -= 15;
      return;
    }
    this.launchBox(side, base, freight);
  }

  pickFreight() {
    if (Math.random() < 0.1) return TUNE.freight.find((item) => item.key === "Blue");
    const pool = TUNE.freight.filter((item) => item.key !== "Blue");
    return Phaser.Utils.Array.GetRandom(pool);
  }

  reserveBase(side, freight) {
    const same = side.bases.find((base) =>
      base.empty && !base.blocked && base.colorKey === freight.key && base.boxes < TUNE.baseCapacity
    );
    const target = same || side.bases.find((base) =>
      base.empty && !base.blocked && base.boxes === 0 && base.colorKey === null
    );
    if (!target) return null;
    target.colorKey = freight.key;
    target.color = freight.color;
    target.boxes += 1;
    if (target.boxes >= TUNE.baseCapacity) {
      target.blocked = true;
      target.fullAt = this.now;
      target.lastPenaltyAt = this.now;
      this.addAlert(`${side.info.label} base ${target.index + 1} full: move pallet.`);
    }
    return target;
  }

  launchBox(side, base, freight) {
    const startX = side.key === "primary" ? 104 : 1176;
    const sprite = this.add.sprite(startX, side.info.conveyorY, "box")
      .setTint(freight.color)
      .setDepth(20);
    this.movers.push({
      sprite,
      from: { x: startX, y: side.info.conveyorY },
      to: { x: base.x, y: base.y },
      t: 0,
      dur: side.status === "red" ? 1450 : side.status === "yellow" ? 1120 : 820,
    });
  }

  updatePenalties() {
    Object.values(this.sides).forEach((side) => {
      side.bases.forEach((base) => {
        if (!base.blocked) return;
        const age = this.now - base.fullAt;
        const hot = this.isForecastHot(base.colorKey);
        const interval = hot ? 1000 : TUNE.blockedPenaltyMs;
        if (age > TUNE.blockedGraceMs && this.now - base.lastPenaltyAt >= interval) {
          base.lastPenaltyAt = this.now;
          const penalty = hot ? TUNE.scores.hotBlocked : TUNE.scores.blocked;
          this.score += penalty;
          this.floatText(base.x, base.y - 26, hot ? `${penalty} hot block` : `${penalty} blocked`, "#fca5a5");
        }
      });
    });
    this.staging.lanes.forEach((lane) => {
      if (lane.mixed && lane.jamStartedAt && this.now - lane.jamStartedAt >= TUNE.mixedJamMs) {
        lane.jamStartedAt = this.now;
        this.score += TUNE.scores.mixedJam;
        this.floatText(lane.x, lane.y - 76, `${TUNE.scores.mixedJam} jam`, "#fca5a5");
      }
    });
  }

  updateAutoGpm(delta) {
    this.gpmClock = (this.gpmClock || 0) + delta;
    if (this.gpmClock < TUNE.gpmAutoMs) return;
    this.gpmClock = 0;
    this.staging.lanes.forEach((lane) => {
      const chance = lane.forecastPlanned || this.isForecastHot(lane.colorKey)
        ? Math.min(0.9, TUNE.gpmAutoChance + 0.25)
        : TUNE.gpmAutoChance;
      if (lane.ready && !lane.mixed && Math.random() < chance) {
        this.clearStagingLane(lane, "GPM auto-clear", lane.pallets.length * TUNE.scores.autoClearEach);
      }
    });
  }

  updateIbt(delta) {
    if (!this.ibt.clearing) return;
    this.ibt.timer = Math.max(0, this.ibt.timer - delta);
    if (this.ibt.timer === 0) {
      const cleared = this.ibt.count;
      this.ibt.count = 0;
      this.ibt.clearing = false;
      this.score += cleared * TUNE.scores.ibtClearEach;
      this.addAlert(`IBT trailer cleared ${cleared} blue pallets.`);
    }
  }

  updateMovers(delta) {
    this.movers = this.movers.filter((mover) => {
      mover.t += delta / mover.dur;
      const t = Phaser.Math.Clamp(mover.t, 0, 1);
      mover.sprite.x = Phaser.Math.Linear(mover.from.x, mover.to.x, t);
      mover.sprite.y = Phaser.Math.Linear(mover.from.y, mover.to.y, t);
      mover.sprite.rotation += 0.04;
      if (t >= 1) {
        mover.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  updateActors(time) {
    this.workers.forEach((worker) => {
      const side = this.sides[worker.sideKey];
      const pressure = this.getBlockedCount(side) + this.getMissingCount(side);
      const movement = pressure > 2 ? 14 : 8;
      worker.sprite.x = worker.homeX + Math.sin(time / 1100 + worker.phase) * movement;
      worker.sprite.y = worker.homeY + Math.sin(time / 280 + worker.phase) * (pressure > 2 ? 8 : 4);
      if (worker.usesSheet) {
        worker.sprite.setFrame(worker.frames[Math.floor(time / 700 + worker.phase) % worker.frames.length]);
      }
      worker.sprite.setAlpha(pressure > 3 ? 0.82 : 1);
    });
    this.forklifts[0].x = 414 + Math.sin(time / 1600) * 74;
    this.forklifts[1].x = 866 + Math.cos(time / 1500) * 74;
  }

  handleDockClick(sideKey, type) {
    const side = this.sides[sideKey];
    if (type === "raa") {
      if (side.source === "ART") {
        this.startRaaPrep(side);
        return;
      }
      if (side.raaBoxes > 0) {
        this.addAlert(`${side.info.label} RAA pallet still feeding.`);
        return;
      }
      if (!this.loadPreparedRaaPallet(side, false)) {
        side.raaBoxes = TUNE.raaPalletBoxes;
        this.addAlert(`${side.info.label} emergency RAA staged: 3 backup boxes.`);
      }
    } else if (side.artBacklog <= 0 && side.refillTimer <= 0) {
      this.requestArt(sideKey);
    }
  }

  toggleSide(sideKey) {
    const side = this.sides[sideKey];
    side.source = side.source === "ART" ? "RAA" : "ART";
    if (side.source === "RAA" && side.raaBoxes <= 0) {
      this.loadPreparedRaaPallet(side, true);
    }
    side.spawnClock = 0;
    this.addAlert(`${side.info.label} feed switched to ${side.source}.`);
  }

  startRaaPrep(side) {
    const prep = side.raaPrep;
    if (prep.prepping) {
      this.addAlert(`${side.info.label} RAA prep already underway.`);
      return;
    }
    if (prep.pallets.length + (prep.prepping ? 1 : 0) >= TUNE.raaPrepCapacity) {
      this.addAlert(`${side.info.label} RAA prep buffer full.`);
      return;
    }
    prep.prepping = true;
    prep.timer = TUNE.raaPrepMs;
    this.addAlert(`${side.info.label} RAA prep started. Backup pallet ready in 4s.`);
  }

  loadPreparedRaaPallet(side, transition) {
    const prep = side.raaPrep;
    if (prep.pallets.length <= 0) {
      if (transition && side.artBacklog <= 0 && !prep.noPrepPenalized) {
        prep.noPrepPenalized = true;
        this.score += TUNE.scores.raaNoPrepPenalty;
        this.addAlert(`${side.info.label} switched to RAA with no prep. Manual stage needed.`);
      }
      return false;
    }
    const pallet = prep.pallets.shift();
    side.raaBoxes = pallet.boxes;
    this.score += TUNE.scores.raaPrepUse;
    if (transition && side.artBacklog <= 0) {
      this.score += TUNE.scores.raaSmoothTransition;
      this.floatText(side.info.raaX, side.info.raaY - 78, `+${TUNE.scores.raaSmoothTransition} smooth`, "#bbf7d0");
      this.addAlert(`${side.info.label} smooth RAA transition: prepped pallet loaded.`);
    } else {
      this.addAlert(`${side.info.label} loaded prepared RAA pallet.`);
    }
    return true;
  }

  requestArt(sideKey) {
    const side = this.sides[sideKey];
    if (side.artBacklog > 0 || side.refillTimer > 0) {
      this.addAlert(`${side.info.label} ART cannot be requested yet.`);
      return;
    }
    side.refillTimer = TUNE.artRefillMs;
    this.addAlert(`${side.info.label} new ART requested. 45 second dock turn.`);
  }

  handleEmptyTrailerClick() {
    this.pendingPallet = null;
    if (this.mode.kind === "splitPull") {
      this.addAlert("Finish placing the current pallet pull.");
      return;
    }
    this.mode = { kind: "splitPull", stack: null, splitRemaining: 2 };
    this.addAlert("Pulled 14 empty pallets. Pick two empty stack pads.");
  }

  handleStackClick(stackKey) {
    const stack = this.stacks[stackKey];
    if (this.mode.kind === "splitPull") {
      if (stack.count !== 0) {
        this.addAlert("Split pull can only go to empty stack pads.");
        return;
      }
      stack.count = TUNE.emptySplit;
      this.mode.splitRemaining -= 1;
      this.addAlert(`${stack.label} received 7 empties.`);
      if (this.mode.splitRemaining <= 0) this.mode = { kind: "none", stack: null, splitRemaining: 0 };
      return;
    }
    if (stack.count <= 0) {
      this.addAlert(`${stack.label} is empty.`);
      return;
    }
    this.pendingPallet = null;
    this.selectedStack = stack;
    this.mode = { kind: "placeEmpty", stack: stackKey, splitRemaining: 0 };
    this.addAlert(`${stack.label} selected. Click a matching empty base.`);
  }

  handleBaseClick(sideKey, baseIndex) {
    const side = this.sides[sideKey];
    const base = side.bases[baseIndex];
    if (this.mode.kind === "placeEmpty") {
      if (base.blocked) {
        this.mode = { kind: "none", stack: null, splitRemaining: 0 };
        this.selectedStack = null;
        this.addAlert("Empty-pallet mode cleared. Full pallet selected.");
      } else {
      const stack = this.stacks[this.mode.stack];
      if (!stack || stack.side !== sideKey) {
        this.addAlert("That stack belongs to the other side.");
        return;
      }
      if (base.empty || base.boxes > 0 || base.blocked) {
        this.addAlert("Place empties only on clear bases missing a pallet.");
        return;
      }
      base.empty = true;
      stack.count -= 1;
      this.score += TUNE.scores.empty;
      this.floatText(base.x, base.y - 26, "+10 empty", "#bbf7d0");
      if (stack.count <= 0) this.mode = { kind: "none", stack: null, splitRemaining: 0 };
      return;
      }
    }

    if (base.blocked) {
      if (base.colorKey !== "Blue") {
        this.pendingPallet = {
          side,
          base,
          fast: this.now - base.fullAt <= TUNE.blockedGraceMs,
        };
        this.mode = { kind: "none", stack: null, splitRemaining: 0 };
        this.selectedStack = null;
        this.addAlert(`${side.info.label} ${base.colorKey} pallet selected. Choose a staging lane.`);
        return;
      }
      this.moveFullPallet(side, base);
    } else if (!base.empty) {
      this.addAlert("Base is missing an empty pallet. Select a stack first.");
    }
  }

  handleStagingLaneClick(laneIndex) {
    const lane = this.staging.lanes[laneIndex];
    if (this.pendingPallet) {
      this.placePendingPalletInLane(lane);
      return;
    }
    if (lane.mixed) {
      this.reworkMixedLane(lane);
      return;
    }
    if (lane.pallets.length > 0) {
      this.addAlert(lane.ready && !lane.mixed
        ? `Lane ${lane.label} is ready. Waiting for GPM pickup.`
        : `Lane ${lane.label} is locked to ${lane.colorKey}.`);
      return;
    }
    this.addAlert(`Lane ${lane.label} is open. Place a pallet to lock it.`);
  }

  placePendingPalletInLane(lane) {
    const pending = this.pendingPallet;
    if (!pending || !pending.base.blocked || !pending.base.colorKey) {
      this.pendingPallet = null;
      this.addAlert("Selected pallet is no longer available.");
      return;
    }
    const { side, base, fast } = pending;
    const colorKey = base.colorKey;
    const color = base.color;
    if (!this.canPlaceInLane(lane, colorKey)) {
      this.addAlert(`Lane ${lane.label} cannot accept ${colorKey}. Pick a matching, open, or mixable lane.`);
      return;
    }
    const willMix = lane.pallets.length > 0 && lane.colorKey !== colorKey;
    const wasEmpty = lane.pallets.length === 0;
    this.addPalletToLane(lane, colorKey, color, willMix);
    if (willMix) {
      this.score += TUNE.scores.mixedLane;
      this.addAlert(`Lane ${lane.label} mixed. Rework it into open lanes or call GPM.`);
    }
    if (wasEmpty && this.isForecastHot(colorKey)) {
      this.score += TUNE.scores.hotLaneStart;
      this.floatText(lane.x, lane.y - 78, `+${TUNE.scores.hotLaneStart} hot lane`, "#fef08a");
    }
    this.score += TUNE.scores.stage + (fast ? TUNE.scores.fast : 0);
    if (lane.affinity !== "flex" && lane.affinity !== side.key) {
      this.score += TUNE.scores.crossLane;
      this.floatText(lane.x, lane.y - 78, `${TUNE.scores.crossLane} cross lane`, "#fde68a");
      this.addAlert(`Cross-aisle staging to lane ${lane.label} added travel pressure.`);
    }
    this.floatText(base.x, base.y - 30, `+${TUNE.scores.stage + (fast ? TUNE.scores.fast : 0)} staged`, "#bbf7d0");
    this.clearBaseAfterMove(base);
    this.pendingPallet = null;
    this.addAlert(`${side.info.label} ${colorKey} staged to lane ${lane.label}.`);
  }

  canPlaceInLane(lane, colorKey) {
    if (lane.ready || lane.pallets.length >= TUNE.stagingSlotCapacity) return false;
    if (lane.pallets.length === 0) return true;
    if (!lane.mixed && lane.colorKey === colorKey) return true;
    return true;
  }

  moveFullPallet(side, base) {
    const fast = this.now - base.fullAt <= TUNE.blockedGraceMs;
    if (base.colorKey === "Blue") {
      if (this.ibt.count >= TUNE.ibtCapacity) {
        this.addAlert("IBT is full. Request trailer clear before moving blue freight.");
        return;
      }
      this.ibt.count += 1;
      this.score += TUNE.scores.ibt + (fast ? TUNE.scores.fast : 0);
      this.floatText(base.x, base.y - 30, `+${TUNE.scores.ibt + (fast ? TUNE.scores.fast : 0)} IBT`, "#7dd3fc");
      this.addAlert(`${side.info.label} blue pallet moved to IBT.`);
    } else {
      if (!this.stagePallet(base.colorKey, base.color)) return;
      this.score += TUNE.scores.stage + (fast ? TUNE.scores.fast : 0);
      this.floatText(base.x, base.y - 30, `+${TUNE.scores.stage + (fast ? TUNE.scores.fast : 0)} staged`, "#bbf7d0");
    }
    this.clearBaseAfterMove(base);
  }

  clearBaseAfterMove(base) {
    base.empty = false;
    base.boxes = 0;
    base.colorKey = null;
    base.color = null;
    base.blocked = false;
    base.fullAt = 0;
    base.lastPenaltyAt = 0;
  }

  stagePallet(colorKey, color) {
    const lane = this.findCleanLane(colorKey) ||
      this.findOpenLane();
    if (lane) {
      this.addPalletToLane(lane, colorKey, color, false);
      return true;
    }

    const mixedLane = this.findMixableLane();
    if (!mixedLane) {
      this.addAlert(`${colorKey} pallet cannot stage: all lanes are blocked or ready.`);
      return false;
    }
    this.addPalletToLane(mixedLane, colorKey, color, true);
    this.score += TUNE.scores.mixedLane;
    this.addAlert(`Lane ${mixedLane.label} mixed. Rework it into open lanes or call GPM.`);
    return true;
  }

  findCleanLane(colorKey) {
    return this.staging.lanes.find((lane) =>
      !lane.mixed &&
      !lane.ready &&
      lane.colorKey === colorKey &&
      lane.pallets.length < TUNE.stagingSlotCapacity
    );
  }

  findOpenLane() {
    return this.staging.lanes.find((lane) =>
      lane.pallets.length === 0
    );
  }

  findOpenLanes(excludeLane = null) {
    return this.staging.lanes.filter((lane) =>
      lane !== excludeLane &&
      lane.pallets.length === 0
    );
  }

  findMixableLane() {
    return this.staging.lanes.find((lane) =>
      !lane.ready &&
      lane.pallets.length > 0 &&
      lane.pallets.length < TUNE.stagingSlotCapacity
    );
  }

  addPalletToLane(lane, colorKey, color, forceMixed) {
    const previousCount = lane.pallets.length;
    if (previousCount === 0) {
      lane.colorKey = colorKey;
      lane.color = color;
      lane.forecastPlanned = this.isForecastHot(colorKey);
    }
    if (lane.colorKey !== colorKey || forceMixed) {
      lane.mixed = true;
      lane.ready = false;
      lane.jamStartedAt ||= this.now;
    }
    lane.pallets.push({ colorKey, color });
    if (lane.pallets.length === TUNE.stagingSlotCapacity && !lane.mixed) {
      lane.ready = true;
      lane.readyAt = this.now;
      this.score += TUNE.scores.cleanLaneComplete;
      if (lane.forecastPlanned || this.isForecastHot(colorKey)) {
        this.score += TUNE.scores.forecastComplete;
        this.floatText(lane.x, lane.y - 94, `+${TUNE.scores.forecastComplete} forecast`, "#fef08a");
      }
      this.addAlert(`Lane ${lane.label} ready: ${colorKey} x3.`);
      this.floatText(lane.x, lane.y - 78, `+${TUNE.scores.cleanLaneComplete} clean lane`, "#bbf7d0");
    }
  }

  reworkMixedLane(lane) {
    if (!lane.mixed || lane.pallets.length <= 1) {
      this.addAlert(`Lane ${lane.label} does not need rework.`);
      return;
    }
    const groups = [];
    lane.pallets.forEach((pallet) => {
      let group = groups.find((item) => item.colorKey === pallet.colorKey);
      if (!group) {
        group = { colorKey: pallet.colorKey, color: pallet.color, pallets: [] };
        groups.push(group);
      }
      group.pallets.push({ colorKey: pallet.colorKey, color: pallet.color });
    });
    if (groups.length <= 1) {
      lane.mixed = false;
      lane.jamStartedAt = 0;
      lane.colorKey = groups[0].colorKey;
      lane.color = groups[0].color;
      this.addAlert(`Lane ${lane.label} is clean again.`);
      return;
    }
    const openLanes = this.findOpenLanes(lane);
    const lanesNeeded = Math.max(0, groups.length - 1);
    if (openLanes.length < lanesNeeded) {
      this.addAlert(`Rework needs ${lanesNeeded} open lane${lanesNeeded === 1 ? "" : "s"}. Clear space before separating lane ${lane.label}.`);
      this.floatText(lane.x, lane.y - 82, "Needs open lanes", "#fde68a");
      return;
    }

    const sourceLabel = lane.label;
    this.resetLane(lane);
    groups.forEach((group, index) => {
      const target = index === 0 ? lane : openLanes[index - 1];
      target.colorKey = group.colorKey;
      target.color = group.color;
      target.forecastPlanned = this.isForecastHot(group.colorKey);
      target.pallets = group.pallets;
      target.mixed = false;
      target.ready = target.pallets.length >= TUNE.stagingSlotCapacity;
      target.readyAt = target.ready ? this.now : 0;
      target.jamStartedAt = 0;
      this.floatText(target.x, target.y - 76, group.colorKey, "#e0f2fe");
      if (target.ready) {
        this.score += TUNE.scores.cleanLaneComplete;
        this.floatText(target.x, target.y - 94, `+${TUNE.scores.cleanLaneComplete} clean lane`, "#bbf7d0");
      }
    });
    this.score += TUNE.scores.reworkMixed;
    this.floatText(lane.x, lane.y - 82, `${TUNE.scores.reworkMixed} rework`, "#fde68a");
    this.addAlert(`Lane ${sourceLabel} reworked into ${groups.length} clean lanes.`);
  }

  resetLane(lane) {
    lane.pallets = [];
    lane.colorKey = null;
    lane.color = null;
    lane.mixed = false;
    lane.ready = false;
    lane.readyAt = 0;
    lane.jamStartedAt = 0;
    lane.forecastPlanned = false;
  }

  clearStagingLane(lane, reason, score = 0) {
    const cleared = lane.pallets.length;
    const label = lane.label;
    this.resetLane(lane);
    this.score += score;
    if (cleared > 0) this.addAlert(`${reason}: Lane ${label} cleared ${cleared} pallets.`);
  }

  manualGpm() {
    let cleared = 0;
    this.staging.lanes.forEach((lane) => {
      cleared += lane.pallets.length;
      this.clearStagingLane(lane, "Manual GPM", 0);
    });
    this.score += TUNE.scores.manualGpm;
    this.addAlert(`Manual GPM called. ${cleared} staged pallets cleared.`);
  }

  requestIbt() {
    if (this.ibt.clearing) {
      this.addAlert("IBT trailer already being swapped.");
      return;
    }
    if (this.ibt.count <= 0) {
      this.addAlert("IBT has no blue pallets to clear.");
      return;
    }
    this.ibt.clearing = true;
    this.ibt.timer = TUNE.ibtClearMs;
    this.addAlert("IBT trailer requested. Clearing in 15 seconds.");
  }

  getBlockedCount(side) {
    return side.bases.filter((base) => base.blocked).length;
  }

  getMissingCount(side) {
    return side.bases.filter((base) => !base.empty && !base.blocked && base.boxes === 0).length;
  }

  computeSideStatus(side) {
    const blocked = this.getBlockedCount(side);
    const missing = this.getMissingCount(side);
    const sourceRed = side.source === "ART"
      ? side.artBacklog <= 0
      : side.raaBoxes <= 0;
    if (sourceRed || blocked >= 3 || missing >= 3) return "red";
    if (blocked >= 1 || missing >= 1) return "yellow";
    return "green";
  }

  renderDynamic(time) {
    if (this.dynamicLayer) this.dynamicLayer.destroy();
    if (this.tempTexts) {
      this.tempTexts.forEach((t) => t.destroy());
      this.tempTexts = [];
    }
    this.dynamicLayer = this.add.graphics().setDepth(10);
    Object.values(this.sides).forEach((side) => {
      side.status = this.computeSideStatus(side);
      this.paintSide(side, time);
    });
    this.paintFreightForecast(time);
    this.paintStaging();
    this.paintStacks();
    this.paintIbt(time);
    this.checkGameOver();
  }

  paintSide(side, time) {
    const g = this.dynamicLayer;
    const info = side.info;
    const statusColor = side.status === "green" ? COLORS.green : side.status === "yellow" ? COLORS.yellow : COLORS.red;
    const flash = side.status === "green" ? 1 : Math.sin(time / 120) > 0 ? 1 : 0.25;
    const dir = side.key === "primary" ? 1 : -1;
    const x1 = side.key === "primary" ? 92 : 1188;
    const x2 = side.key === "primary" ? 314 : 966;
    g.lineStyle(8, statusColor, 0.16 * flash);
    g.lineBetween(x1, info.conveyorY - 24, x2, info.conveyorY - 24);
    g.lineStyle(4, statusColor, 0.9 * flash);
    g.lineBetween(x1, info.conveyorY - 24, x2, info.conveyorY - 24);
    const chevronCount = 7;
    const phase = ((time / (side.status === "red" ? 260 : side.status === "yellow" ? 180 : 120)) % 1);
    for (let i = 0; i < chevronCount; i++) {
      const p = (i + phase) / chevronCount;
      const x = Phaser.Math.Linear(x1, x2, side.key === "primary" ? p : 1 - p);
      g.fillStyle(statusColor, side.status === "green" ? 0.58 : flash);
      g.fillTriangle(x - dir * 10, info.conveyorY - 13, x + dir * 8, info.conveyorY, x - dir * 10, info.conveyorY + 13);
    }
    this.paintBeacon(info.dockX, 124, statusColor, flash);
    this.paintBeacon(info.raaX, info.raaY - 58, side.source === "RAA" ? COLORS.yellow : 0x51616b, side.source === "RAA" ? flash : 0.45);

    this.paintDockText(side);
    this.paintRaaPrep(side, time);
    side.bases.forEach((base) => {
      const fill = base.blocked ? 0x4a1414 : base.empty ? 0x20313b : 0x2b2118;
      g.fillStyle(0x05090c, 0.3);
      g.fillRoundedRect(base.x - 71, base.y - 21, 140, 56, 8);
      g.fillStyle(fill, 0.98);
      g.fillRoundedRect(base.x - 65, base.y - 25, 130, 50, 7);
      g.lineStyle(3, base.blocked ? COLORS.red : base.empty ? 0x6c7f8b : base.color, base.blocked ? flash : 0.95);
      g.strokeRoundedRect(base.x - 65, base.y - 25, 130, 50, 7);
      g.fillStyle(0xffffff, 0.08);
      g.fillRoundedRect(base.x - 60, base.y - 20, 120, 10, 4);
      if (base.empty) {
        g.fillStyle(0xd6a25c, 0.5);
        g.fillRoundedRect(base.x - 46, base.y + 12, 92, 8, 3);
        g.fillStyle(0x7a5228, 0.55);
        for (let x = base.x - 38; x <= base.x + 38; x += 19) g.fillRect(x, base.y + 10, 4, 12);
      }
      if (base.color) {
        for (let i = 0; i < base.boxes; i++) {
          const bx = base.x - 46 + (i % 3) * 32;
          const by = base.y - 14 + Math.floor(i / 3) * 17;
          g.fillStyle(base.color, 1);
          g.fillRoundedRect(bx, by, 25, 14, 2);
          g.fillStyle(0xffffff, 0.14);
          g.fillRect(bx + 3, by + 3, 19, 2);
        }
        g.fillStyle(base.color, 0.65);
        g.fillRoundedRect(base.x - 61, base.y + 21, (122 * base.boxes) / TUNE.baseCapacity, 3, 2);
      }
      if (!base.empty && !base.blocked) {
        g.fillStyle(0xfacc15, flash);
        g.fillTriangle(base.x + dir * 47, base.y - 11, base.x + dir * 59, base.y, base.x + dir * 47, base.y + 11);
      }
      if (base.blocked) {
        g.lineStyle(2, COLORS.red, flash);
        g.lineBetween(base.x - 53, base.y - 17, base.x + 53, base.y + 17);
        g.lineBetween(base.x + 53, base.y - 17, base.x - 53, base.y + 17);
      }
      if (this.pendingPallet?.base === base) {
        g.fillStyle(COLORS.yellow, 0.12 + 0.08 * Math.sin(this.now / 110));
        g.fillRoundedRect(base.x - 74, base.y - 32, 148, 64, 9);
        g.lineStyle(3, COLORS.yellow, flash);
        g.strokeRoundedRect(base.x - 74, base.y - 32, 148, 64, 9);
      }
    });
  }

  paintBeacon(x, y, color, alpha) {
    const g = this.dynamicLayer;
    g.fillStyle(color, 0.12 * alpha);
    g.fillCircle(x, y, 18);
    g.fillStyle(color, 0.34 * alpha);
    g.fillCircle(x, y, 12);
    g.fillStyle(color, alpha);
    g.fillCircle(x, y, 6);
  }

  paintFreightForecast(time) {
    const g = this.dynamicLayer;
    const primary = this.getDisplayForecast(this.sides.primary);
    const secondary = this.getDisplayForecast(this.sides.secondary);
    const pCenter = 600;
    const sCenter = 680;
    const step = 30;
    const pY = 226;
    const sY = 252;
    const pHot = this.getForecastHotColor(this.sides.primary);
    const sHot = this.getForecastHotColor(this.sides.secondary);
    const pNext = this.sides.primary.queue[0];
    const sNext = this.sides.secondary.queue[0];
    const pProgress = Phaser.Math.Clamp(this.sides.primary.spawnClock / this.sides.primary.info.spawnMs, 0, 1);
    const sProgress = Phaser.Math.Clamp(this.sides.secondary.spawnClock / this.sides.secondary.info.spawnMs, 0, 1);

    this.paintForecastHeader(g, 640, 190);
    this.paintForecastTrack(g, pCenter, pY, -1, primary.length, COLORS.cyan, time);
    this.paintForecastTrack(g, sCenter, sY, 1, secondary.length, COLORS.hazard, time);

    primary.forEach((freight, i) => {
      const isNext = i === primary.length - 1;
      const x = pCenter - i * step;
      this.paintForecastChip(g, x, pY, freight, pHot?.key === freight.key, isNext, isNext ? pProgress : 0);
    });
    secondary.forEach((freight, i) => {
      const isNext = i === secondary.length - 1;
      const x = sCenter + i * step;
      this.paintForecastChip(g, x, sY, freight, sHot?.key === freight.key, isNext, isNext ? sProgress : 0);
    });

    this.paintNextCallout(g, pCenter - (primary.length - 1) * step - 38, pY, pNext, "NEXT");
    this.paintNextCallout(g, sCenter + (secondary.length - 1) * step + 38, sY, sNext, "NEXT");
  }

  getDisplayForecast(side) {
    return side.queue.slice(0, TUNE.freightPreview).reverse();
  }

  paintForecastHeader(g, x, y) {
    g.fillStyle(0x0b1419, 0.9);
    g.fillRoundedRect(x - 92, y - 14, 184, 28, 5);
    g.lineStyle(1, 0x3b5561, 0.7);
    g.strokeRoundedRect(x - 92, y - 14, 184, 28, 5);
    this.drawTempText(x, y - 3, "FUTURE  ->  NEXT", "#c7d2da", 0.5, 11);
  }

  paintForecastChip(g, x, y, freight, hot = false, next = false, progress = 0) {
    const w = next ? 25 : 20;
    const h = next ? 17 : 13;
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w, h, 3);
    if (hot) {
      g.fillStyle(freight.color, next ? 0.28 : 0.18);
      g.fillCircle(x, y, next ? 17 : 13);
    }
    if (next) {
      g.lineStyle(3, 0xf8fafc, 0.75);
      g.strokeCircle(x, y, 18);
      g.lineStyle(3, freight.color, 0.95);
      g.beginPath();
      g.arc(x, y, 18, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * progress), false);
      g.strokePath();
    }
    g.fillStyle(freight.color, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, 2);
  }

  paintForecastTrack(g, centerX, y, dir, count, color, time) {
    const endX = centerX + dir * ((count - 1) * 30 + 20);
    const pulse = (time / 420) % 1;
    g.lineStyle(2, color, 0.22);
    g.lineBetween(centerX, y, endX, y);
    for (let i = 0; i < count - 1; i++) {
      const x = centerX + dir * (15 + i * 30 + pulse * 12);
      g.fillStyle(color, 0.18 + i * 0.015);
      if (dir < 0) {
        g.fillTriangle(x + 6, y - 6, x - 5, y, x + 6, y + 6);
      } else {
        g.fillTriangle(x - 6, y - 6, x + 5, y, x - 6, y + 6);
      }
    }
  }

  paintNextCallout(g, x, y, freight, label) {
    if (!freight) return;
    g.fillStyle(0x071016, 0.82);
    g.fillRoundedRect(x - 24, y - 15, 48, 30, 5);
    g.lineStyle(1, freight.color, 0.8);
    g.strokeRoundedRect(x - 24, y - 15, 48, 30, 5);
    g.fillStyle(freight.color, 1);
    g.fillCircle(x - 14, y, 5);
    this.drawTempText(x + 6, y - 4, label, "#f8fafc", 0.5, 9);
  }

  paintHotForecast(g, x, y, freight) {
    g.fillStyle(freight.color, 0.9);
    g.fillCircle(x, y, 6);
    g.lineStyle(1, freight.color, 0.65);
    g.strokeCircle(x, y, 11);
  }

  getForecastHotColor(side) {
    const counts = new Map();
    side.queue.slice(0, 5).forEach((freight) => {
      if (freight.key === "Blue") return;
      counts.set(freight.key, (counts.get(freight.key) || 0) + 1);
    });
    let best = null;
    counts.forEach((count, key) => {
      if (count >= 2 && (!best || count > best.count)) {
        best = { key, count };
      }
    });
    if (!best) return null;
    return TUNE.freight.find((freight) => freight.key === best.key) || null;
  }

  isForecastHot(colorKey) {
    return Object.values(this.sides).some((side) => this.getForecastHotColor(side)?.key === colorKey);
  }

  paintRaaPrep(side, time) {
    const g = this.dynamicLayer;
    const prep = side.raaPrep;
    const x = side.info.dockX;
    const y = side.info.raaY + 106;
    const lowArt = side.artBacklog <= TUNE.artLowWarning && side.artBacklog > 0;
    const flash = Math.sin(time / 130) > 0 ? 1 : 0.28;
    const border = prep.pallets.length > 0 ? COLORS.green : lowArt ? COLORS.yellow : 0x9f7d32;
    g.fillStyle(border, lowArt ? 0.1 * flash : 0.06);
    g.fillRoundedRect(x - 48, y - 25, 96, 50, 6);
    g.lineStyle(2, border, lowArt ? flash : 0.75);
    g.strokeRoundedRect(x - 46, y - 23, 92, 46, 5);
    for (let i = 0; i < TUNE.raaPrepCapacity; i++) {
      const px = x - 32 + i * 16;
      const pallet = prep.pallets[i];
      g.fillStyle(pallet ? (pallet.cluttered ? COLORS.yellow : 0xd6a25c) : 0x2a362e, pallet ? 0.95 : 0.7);
      g.fillRoundedRect(px - 6, y - 5, 12, 14, 2);
      if (pallet) {
        g.fillStyle(0x0f172a, 0.35);
        g.fillRect(px - 4, y + 2, 8, 3);
      }
    }
    if (prep.prepping) {
      const progress = 1 - prep.timer / TUNE.raaPrepMs;
      g.fillStyle(COLORS.yellow, 0.28);
      g.fillRoundedRect(x - 34, y + 15, 68, 5, 3);
      g.fillStyle(COLORS.yellow, 0.95);
      g.fillRoundedRect(x - 34, y + 15, 68 * progress, 5, 3);
    }
    this.drawTempText(x, y - 18, `${prep.pallets.length}/${TUNE.raaPrepCapacity}`, prep.pallets.length ? "#bbf7d0" : "#fde68a", 0.5);
  }

  paintDockText(side) {
    if (side.readouts) side.readouts.forEach((t) => t.destroy());
    const align = side.key === "primary" ? 0.5 : 0.5;
    side.readouts = [
      this.add.text(side.info.dockX, 203, `${side.source}  ART ${side.artBacklog}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: 11,
        color: "#dbeafe",
      }).setOrigin(align, 0.5).setDepth(11),
      this.add.text(side.info.raaX, side.info.raaY + 29, `RAA ${side.raaBoxes}/3`, {
        fontFamily: "Arial Black, Arial",
        fontSize: 11,
        color: "#fef3c7",
      }).setOrigin(align, 0.5).setDepth(11),
    ];
    if (side.refillTimer > 0) {
      side.readouts.push(this.add.text(side.info.dockX, 222, `REFILL ${Math.ceil(side.refillTimer / 1000)}s`, {
        fontSize: 11,
        color: "#fef08a",
      }).setOrigin(0.5).setDepth(11));
    }
  }

  paintStaging() {
    const g = this.dynamicLayer;
    this.staging.lanes.forEach((lane) => {
      const flash = Math.sin(this.now / 120) > 0 ? 1 : 0.28;
      const border = lane.mixed ? COLORS.red : lane.ready ? COLORS.green : lane.color || 0x51616b;
      if (lane.ready || lane.mixed || lane.colorKey) {
        g.fillStyle(border, lane.ready ? 0.12 * flash : lane.mixed ? 0.1 * flash : 0.07);
        g.fillRoundedRect(lane.x - 45, lane.y - 72, 90, 144, 8);
      }
      g.lineStyle(3, border, lane.ready || lane.mixed ? flash : 0.82);
      g.strokeRoundedRect(lane.x - 41, lane.y - 68, 82, 136, 7);
      lane.pallets.forEach((pallet, slot) => {
        const y = lane.y + 36 - slot * 38;
        g.fillStyle(0x000000, 0.28);
        g.fillRoundedRect(lane.x - 33, y - 10, 66, 32, 4);
        g.fillStyle(pallet.color, 1);
        g.fillRoundedRect(lane.x - 31, y - 14, 62, 28, 4);
        g.fillStyle(0x0f172a, 0.36);
        g.fillRect(lane.x - 26, y + 2, 52, 5);
        g.fillStyle(0xffffff, 0.15);
        g.fillRect(lane.x - 25, y - 9, 50, 3);
      });
      const state = lane.ready
        ? "GPM"
        : lane.mixed
          ? "REWORK"
          : lane.colorKey
            ? `${lane.pallets.length}/3`
            : "OPEN";
      this.drawTempText(lane.x, lane.y + 76, state, lane.ready ? "#bbf7d0" : lane.mixed ? "#fecaca" : "#b6c9d3", 0.5);
    });
  }

  paintStacks() {
    Object.values(this.stacks).forEach((stack) => {
      const selected = this.mode.kind === "placeEmpty" && this.mode.stack === stack.key;
      if (selected) {
        this.dynamicLayer.fillStyle(COLORS.yellow, 0.11 + 0.08 * Math.sin(this.now / 120));
        this.dynamicLayer.fillRoundedRect(stack.x - 58, stack.y - 31, 116, 62, 8);
      }
      this.dynamicLayer.lineStyle(2, selected ? COLORS.yellow : 0x51616b, selected ? 1 : 0.5);
      this.dynamicLayer.strokeRoundedRect(stack.x - 51, stack.y - 24, 102, 48, 6);
      for (let i = 0; i < Math.min(stack.count, 7); i++) {
        const px = stack.x - 34 + (i % 4) * 22;
        const py = stack.y + 7 - Math.floor(i / 4) * 13;
        this.dynamicLayer.fillStyle(0xd6a25c, stack.count > 0 ? 0.7 : 0.2);
        this.dynamicLayer.fillRoundedRect(px, py, 18, 7, 2);
      }
      this.drawTempText(stack.x, stack.y - 9, stack.label, "#dbeafe", 0.5);
      this.drawTempText(stack.x, stack.y + 10, `${stack.count}`, stack.count > 0 ? "#fef3c7" : "#78909b", 0.5);
    });
  }

  paintIbt(time) {
    const g = this.dynamicLayer;
    const flash = this.ibt.count >= TUNE.ibtCapacity ? (Math.sin(time / 100) > 0 ? 1 : 0.25) : 0.75;
    g.fillStyle(COLORS.blue, 0.06 + this.ibt.count / TUNE.ibtCapacity * 0.12);
    g.fillRoundedRect(1092, 605, 155, 74, 6);
    g.lineStyle(3, this.ibt.count >= TUNE.ibtCapacity ? COLORS.red : COLORS.blue, flash);
    g.strokeRoundedRect(1092, 605, 155, 74, 6);
    for (let i = 0; i < this.ibt.count; i++) {
      g.fillStyle(COLORS.blue, 1);
      g.fillRoundedRect(1106 + (i % 5) * 26, 621 + Math.floor(i / 5) * 24, 20, 15, 2);
    }
    const msg = this.ibt.clearing ? `CLEAR ${Math.ceil(this.ibt.timer / 1000)}s` : `${this.ibt.count}/10`;
    this.drawTempText(1170, 663, msg, "#dbeafe", 0.5);
  }

  drawTempText(x, y, text, color, origin = 0, fontSize = 11) {
    if (!this.tempTexts) this.tempTexts = [];
    const t = this.add.text(x, y, text, { fontSize, color }).setDepth(11).setOrigin(origin, 0);
    this.tempTexts.push(t);
  }

  updateHud() {
    const blocked = this.getBlockedCount(this.sides.primary) + this.getBlockedCount(this.sides.secondary);
    const primary = this.sides.primary;
    const secondary = this.sides.secondary;
    this.hud.score.setText(`SCORE ${this.score}`);
    this.hud.blocked.setText(
      `Blocked ${blocked}/10   IBT ${this.ibt.count}/10   P ART ${primary.artBacklog} RAA ${primary.raaPrep.pallets.length}/${TUNE.raaPrepCapacity}   S ART ${secondary.artBacklog} RAA ${secondary.raaPrep.pallets.length}/${TUNE.raaPrepCapacity}`
    );
  }

  getReadyLaneCount() {
    return this.staging.lanes.filter((lane) => lane.ready && !lane.mixed).length;
  }

  getMixedLaneCount() {
    return this.staging.lanes.filter((lane) => lane.mixed).length;
  }

  addAlert(text) {
    this.alerts.push(text);
    if (this.alerts.length > 8) this.alerts.shift();
  }

  floatText(x, y, text, color) {
    const label = this.add.text(x, y, text, {
      fontFamily: "Arial Black, Arial",
      fontSize: 13,
      color,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: label,
      y: y - 34,
      alpha: 0,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  checkGameOver() {
    const pBlocked = this.sides.primary.bases.every((base) => base.blocked);
    const sBlocked = this.sides.secondary.bases.every((base) => base.blocked);
    if (pBlocked && sBlocked && !this.gameOver) {
      this.gameOver = true;
      this.add.rectangle(W / 2, H / 2, 520, 180, 0x120d0d, 0.94).setDepth(100);
      this.add.text(W / 2, H / 2 - 40, "FREIGHT FLOW COLLAPSE", {
        fontFamily: "Arial Black, Arial",
        fontSize: 28,
        color: "#fecaca",
      }).setOrigin(0.5).setDepth(101);
      this.add.text(W / 2, H / 2 + 12, "Both sides are fully blocked. Refresh to restart.", {
        fontSize: 16,
        color: "#e5e7eb",
      }).setOrigin(0.5).setDepth(101);
      this.scene.pause();
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: "#091017",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: RCFlowScene,
};

window.addEventListener("load", () => {
  if (!window.Phaser) {
    document.body.innerHTML = "<p style='color:white;font:16px sans-serif;padding:24px'>Phaser failed to load. Check the CDN connection or run with internet access.</p>";
    return;
  }
  new Phaser.Game(config);
});
