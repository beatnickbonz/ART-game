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
  baseCount: 5,
  baseCapacity: 6,
  emptyPull: 14,
  emptySplit: 7,
  stagingSlotCapacity: 3,
  stagingLanes: 5,
  freightPreview: 8,
  mixedJamMs: 8000,
  ibtCapacity: 10,
  ibtClearMs: 15000,
  gpmAutoMs: 5000,
  gpmAutoChance: 0.35,
  blockedGraceMs: 1000,
  blockedPenaltyMs: 1000,
  scores: {
    stage: 100,
    ibt: 125,
    fast: 25,
    empty: 10,
    manualGpm: -100,
    mixedLane: -50,
    cleanLaneComplete: 150,
    reservationBonus: 25,
    readyLanePenalty: -25,
    blocked: -50,
    autoClearEach: 25,
    ibtClearEach: 50,
  },
  freight: [
    { key: "Brown", color: 0xb8793a, weight: 40 },
    { key: "Red", color: 0xef4444, weight: 20 },
    { key: "Orange", color: 0xf97316, weight: 15 },
    { key: "Purple", color: 0x7c3aed, weight: 15 },
    { key: "Blue", color: 0x0ea5e9, weight: 10 },
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

class RCFlowScene extends Phaser.Scene {
  constructor() {
    super("RCFlowScene");
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
        reservedKey: null,
        reservedColor: null,
        reservedBeforeSecond: false,
        mixed: false,
        ready: false,
        readyAt: 0,
        jamStartedAt: 0,
        lastReadyPenaltyAt: 0,
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
    this.add.rectangle(W / 2, H / 2, W, H, 0x121b20);

    const floor = this.add.graphics();
    floor.fillStyle(COLORS.concrete, 1);
    floor.fillRect(0, 96, W, H - 96);
    for (let x = -40; x < W + 80; x += 80) {
      for (let y = 104; y < H; y += 80) {
        const tint = (x + y) % 160 === 0 ? 0x303d41 : 0x273237;
        floor.fillStyle(tint, 0.34);
        floor.fillRect(x, y, 78, 78);
      }
    }
    floor.lineStyle(1, 0x445056, 0.35);
    for (let x = 0; x < W; x += 40) floor.lineBetween(x, 96, x, H);
    for (let y = 96; y < H; y += 40) floor.lineBetween(0, y, W, y);
    floor.fillStyle(0x0a1116, 0.25);
    floor.fillRect(0, 96, W, 18);
    floor.fillRect(0, 704, W, 16);

    this.drawWarehouseShell();
    this.drawZoneBands();

    this.drawHeaderBand();
    this.drawRcAisle();
    this.drawConveyors();
    this.drawDockArea("primary");
    this.drawDockArea("secondary");
    this.drawBases("primary");
    this.drawBases("secondary");
    this.drawStagingArea();
    this.drawEmptyPalletArea();
    this.drawIbtArea();
  }

  drawWarehouseShell() {
    const g = this.add.graphics();
    g.fillStyle(0x0c1419, 1);
    g.fillRect(0, 96, 136, 502);
    g.fillRect(1144, 96, 136, 502);
    g.fillStyle(0x18252d, 1);
    g.fillRect(136, 96, 10, 502);
    g.fillRect(1134, 96, 10, 502);
    for (let y = 126; y <= 552; y += 42) {
      g.lineStyle(2, 0x2f414c, 0.7);
      g.lineBetween(12, y, 124, y);
      g.lineBetween(1156, y, 1268, y);
    }
  }

  drawZoneBands() {
    const g = this.add.graphics();
    g.fillStyle(0x23323a, 0.72);
    g.fillRoundedRect(150, 120, 168, 444, 10);
    g.fillRoundedRect(962, 120, 168, 444, 10);
    g.lineStyle(2, 0x60717a, 0.28);
    g.strokeRoundedRect(150, 120, 168, 444, 10);
    g.strokeRoundedRect(962, 120, 168, 444, 10);
    g.fillStyle(0x17252d, 0.72);
    g.fillRoundedRect(364, 328, 552, 230, 12);
    g.lineStyle(2, 0x3d5360, 0.5);
    g.strokeRoundedRect(364, 328, 552, 230, 12);
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

  drawRcAisle() {
    const g = this.add.graphics();
    g.fillStyle(0x101820, 1);
    g.fillRoundedRect(330, 158, 620, 142, 12);
    g.fillStyle(0x1b2831, 1);
    g.fillRoundedRect(342, 170, 596, 118, 10);
    g.lineStyle(3, 0xfbbf24, 0.9);
    g.strokeRoundedRect(348, 176, 584, 106, 8);
    g.lineStyle(2, 0xffe08a, 0.22);
    g.lineBetween(356, 229, 924, 229);
    for (let x = 360; x < 920; x += 42) {
      g.lineStyle(5, 0xfbbf24, 0.74);
      g.lineBetween(x, 180, x + 24, 204);
      g.lineBetween(x, 278, x + 24, 254);
    }
    for (let x = 410; x <= 870; x += 115) {
      g.fillStyle(0x94a3b8, 0.55);
      g.fillTriangle(x, 220, x + 28, 229, x, 238);
    }
    this.add.text(491, 190, "RC OPERATOR TRAVEL AISLE", {
      fontFamily: "Arial Black, Arial",
      fontSize: 20,
      color: "#f8fafc",
    });
    this.add.text(522, 244, "Clear lane = clear flow", {
      fontSize: 13,
      color: "#fef3c7",
    });
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
    const align = key === "primary" ? 0 : 1;
    this.add.text(key === "primary" ? 22 : 1138, 114, `${info.title} DOCKS`, {
      fontFamily: "Arial Black, Arial",
      fontSize: 14,
      color: "#dbeafe",
    }).setOrigin(align, 0);

    this.makeDockButton(key, "art", dockX, 176, "ART");
    this.makeDockButton(key, "raa", dockX, info.raaY, "RAA");
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
    this.add.text(info.x - 56, 132, `${info.title} BUILD ZONE`, {
      fontFamily: "Arial Black, Arial",
      fontSize: 14,
      color: "#dbeafe",
    });
    side.bases.forEach((base) => {
      this.add.zone(base.x, base.y, 130, 50).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.handleBaseClick(sideKey, base.index));
      this.add.rectangle(base.x, base.y + 4, 142, 58, 0x0a1116, 0.22);
      this.add.rectangle(base.x, base.y, 132, 52, 0x1f2d35, 0.68).setStrokeStyle(1, 0x4f626d, 0.45);
      this.add.text(base.x - 58, base.y - 20, `B${base.index + 1}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: 10,
        color: "#8db2c3",
      });
    });
  }

  drawStagingArea() {
    this.add.text(442, 338, "SHARED GPM STAGING LANES", {
      fontFamily: "Arial Black, Arial",
      fontSize: 16,
      color: "#e0f2fe",
    });
    this.add.text(683, 341, "3 matching pallets = ready to move", {
      fontSize: 11,
      color: "#7dd3fc",
    });
    this.add.rectangle(640, 444, 552, 196, 0x0d171d, 0.38);
    this.add.rectangle(640, 444, 530, 188, 0x121f28, 0.92).setStrokeStyle(2, 0x3e5968);
    this.staging.lanes.forEach((lane) => {
      this.add.zone(lane.x, lane.y, 82, 136).setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.handleStagingLaneClick(lane.index));
      this.add.rectangle(lane.x, lane.y, 82, 136, 0x182631, 0.96).setStrokeStyle(1, 0x405763);
      this.add.text(lane.x - 32, lane.y - 61, `LANE ${lane.label}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: 10,
        color: "#9bd4ea",
      });
      this.add.text(lane.x + 22, lane.y - 61, lane.affinity === "flex" ? "FLEX" : lane.affinity === "primary" ? "P" : "S", {
        fontFamily: "Arial Black, Arial",
        fontSize: 9,
        color: lane.affinity === "flex" ? "#fde68a" : "#9bd4ea",
      });
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
    ["primary", "secondary"].forEach((sideKey) => {
      const dir = sideKey === "primary" ? 1 : -1;
      for (let i = 0; i < 2; i++) {
        const sprite = this.add.sprite(SIDE_INFO[sideKey].x + dir * (78 + i * 22), 255 + i * 128, "worker")
          .setScale(0.9)
          .setDepth(18);
        this.workers.push({ sideKey, sprite, homeY: sprite.y, phase: Math.random() * Math.PI * 2 });
      }
    });
    this.forklifts = [
      this.add.sprite(410, 268, "forklift").setDepth(17),
      this.add.sprite(840, 196, "forklift").setFlipX(true).setDepth(17),
    ];
  }

  createHud() {
    this.hud = {
      score: this.add.text(890, 22, "", { fontFamily: "Arial Black, Arial", fontSize: 22, color: "#f8fafc" }),
      blocked: this.add.text(890, 52, "", { fontSize: 13, color: "#cbd5e1" }),
      mode: this.add.text(1050, 22, "", { fontSize: 13, color: "#fef9c3" }),
      feed: this.add.text(1050, 42, "", { fontSize: 12, color: "#9fb4bf", lineSpacing: 4 }),
      legend: this.add.text(386, 654, "Click empty staging lanes to reserve color • 3 matching pallets clears clean • Mixed lanes jam", {
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
      if (side.artBacklog === 0) this.addAlert(`${side.info.label} ART empty. Request a new trailer or run RAA.`);
    } else {
      if (side.raaBoxes <= 0) return;
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
    const roll = Phaser.Math.Between(1, 100);
    let acc = 0;
    for (const item of TUNE.freight) {
      acc += item.weight;
      if (roll <= acc) return item;
    }
    return TUNE.freight[0];
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
        if (age > TUNE.blockedGraceMs && this.now - base.lastPenaltyAt >= TUNE.blockedPenaltyMs) {
          base.lastPenaltyAt = this.now;
          this.score += TUNE.scores.blocked;
          this.floatText(base.x, base.y - 26, "-50 blocked", "#fca5a5");
        }
      });
    });
    this.staging.lanes.forEach((lane) => {
      if (lane.ready && this.now - lane.lastReadyPenaltyAt >= TUNE.blockedPenaltyMs) {
        lane.lastReadyPenaltyAt = this.now;
        this.score += TUNE.scores.readyLanePenalty;
        this.floatText(lane.x, lane.y - 76, "-25 ready", "#fde68a");
      }
      if (lane.mixed && lane.jamStartedAt && this.now - lane.jamStartedAt >= TUNE.mixedJamMs) {
        lane.jamStartedAt = this.now;
        this.score += TUNE.scores.blocked;
        this.floatText(lane.x, lane.y - 76, "-50 jam", "#fca5a5");
      }
    });
  }

  updateAutoGpm(delta) {
    this.gpmClock = (this.gpmClock || 0) + delta;
    if (this.gpmClock < TUNE.gpmAutoMs) return;
    this.gpmClock = 0;
    this.staging.lanes.forEach((lane) => {
      if (lane.ready && !lane.mixed && Math.random() < TUNE.gpmAutoChance) {
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
      worker.sprite.y = worker.homeY + Math.sin(time / 280 + worker.phase) * (pressure > 2 ? 8 : 4);
      worker.sprite.setTint(pressure > 3 ? 0xfca5a5 : 0xffffff);
    });
    this.forklifts[0].x = 406 + Math.sin(time / 1600) * 84;
    this.forklifts[1].x = 850 + Math.cos(time / 1500) * 92;
  }

  handleDockClick(sideKey, type) {
    const side = this.sides[sideKey];
    if (type === "raa") {
      if (side.source !== "RAA") {
        this.addAlert(`${side.info.label}: toggle to RAA before staging backup freight.`);
        return;
      }
      if (side.raaBoxes > 0) {
        this.addAlert(`${side.info.label} RAA pallet still feeding.`);
        return;
      }
      side.raaBoxes = TUNE.raaPalletBoxes;
      this.addAlert(`${side.info.label} RAA staged: 3 backup boxes.`);
    } else if (side.artBacklog <= 0 && side.refillTimer <= 0) {
      this.requestArt(sideKey);
    }
  }

  toggleSide(sideKey) {
    const side = this.sides[sideKey];
    side.source = side.source === "ART" ? "RAA" : "ART";
    side.spawnClock = 0;
    this.addAlert(`${side.info.label} feed switched to ${side.source}.`);
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
    if (lane.pallets.length > 0) {
      if (lane.ready && !lane.mixed) {
        this.clearStagingLane(lane, "GPM lane released", TUNE.scores.autoClearEach * lane.pallets.length);
        return;
      }
      this.addAlert(`Lane ${lane.label} is occupied. Empty lanes can be reserved.`);
      return;
    }
    const reservable = TUNE.freight.filter((freight) => freight.key !== "Blue");
    const current = reservable.findIndex((freight) => freight.key === lane.reservedKey);
    const next = current >= reservable.length - 1 ? null : reservable[current + 1];
    lane.reservedKey = next?.key || null;
    lane.reservedColor = next?.color || null;
    lane.reservedBeforeSecond = !!next;
    this.addAlert(next ? `Lane ${lane.label} reserved for ${next.key}.` : `Lane ${lane.label} reservation cleared.`);
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
      this.addAlert(`Lane ${lane.label} cannot accept ${colorKey}. Pick a matching, reserved, open, or mixable lane.`);
      return;
    }
    const willMix = lane.pallets.length > 0 && lane.colorKey !== colorKey;
    this.addPalletToLane(lane, colorKey, color, willMix);
    if (willMix) {
      this.score += TUNE.scores.mixedLane;
      this.addAlert(`Lane ${lane.label} mixed. GPM flush required.`);
    }
    this.score += TUNE.scores.stage + (fast ? TUNE.scores.fast : 0);
    if (lane.affinity !== "flex" && lane.affinity !== side.key) {
      this.score -= 20;
      this.floatText(lane.x, lane.y - 78, "-20 cross lane", "#fde68a");
      this.addAlert(`Cross-aisle staging to lane ${lane.label} added travel pressure.`);
    }
    this.floatText(base.x, base.y - 30, fast ? "+125 staged" : "+100 staged", "#bbf7d0");
    this.clearBaseAfterMove(base);
    this.pendingPallet = null;
    this.addAlert(`${side.info.label} ${colorKey} staged to lane ${lane.label}.`);
  }

  canPlaceInLane(lane, colorKey) {
    if (lane.ready || lane.pallets.length >= TUNE.stagingSlotCapacity) return false;
    if (lane.pallets.length === 0) return !lane.reservedKey || lane.reservedKey === colorKey;
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
      this.floatText(base.x, base.y - 30, fast ? "+150 IBT" : "+125 IBT", "#7dd3fc");
      this.addAlert(`${side.info.label} blue pallet moved to IBT.`);
    } else {
      if (!this.stagePallet(base.colorKey, base.color)) return;
      this.score += TUNE.scores.stage + (fast ? TUNE.scores.fast : 0);
      this.floatText(base.x, base.y - 30, fast ? "+125 staged" : "+100 staged", "#bbf7d0");
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
      this.findReservedLane(colorKey) ||
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
    this.addAlert(`Lane ${mixedLane.label} mixed. GPM flush required.`);
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

  findReservedLane(colorKey) {
    return this.staging.lanes.find((lane) =>
      lane.pallets.length === 0 &&
      lane.reservedKey === colorKey
    );
  }

  findOpenLane() {
    return this.staging.lanes.find((lane) =>
      lane.pallets.length === 0 &&
      !lane.reservedKey
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
    const wasReservedForThis = lane.reservedKey === colorKey;
    const previousCount = lane.pallets.length;
    if (previousCount === 0) {
      lane.colorKey = colorKey;
      lane.color = color;
    }
    if (lane.colorKey !== colorKey || forceMixed) {
      lane.mixed = true;
      lane.ready = false;
      lane.jamStartedAt ||= this.now;
    }
    lane.pallets.push({ colorKey, color });
    if (wasReservedForThis && previousCount === 1 && lane.reservedBeforeSecond && !lane.mixed) {
      this.score += TUNE.scores.reservationBonus;
      this.floatText(lane.x, lane.y - 76, "+25 read ahead", "#fef08a");
    }
    if (lane.pallets.length >= 2) lane.reservedBeforeSecond = false;
    if (lane.pallets.length === TUNE.stagingSlotCapacity && !lane.mixed) {
      lane.ready = true;
      lane.readyAt = this.now;
      lane.lastReadyPenaltyAt = this.now;
      this.score += TUNE.scores.cleanLaneComplete;
      this.addAlert(`Lane ${lane.label} ready: ${colorKey} x3.`);
      this.floatText(lane.x, lane.y - 78, "+150 clean lane", "#bbf7d0");
    }
  }

  clearStagingLane(lane, reason, score = 0) {
    const cleared = lane.pallets.length;
    const label = lane.label;
    lane.pallets = [];
    lane.colorKey = null;
    lane.color = null;
    lane.mixed = false;
    lane.ready = false;
    lane.readyAt = 0;
    lane.jamStartedAt = 0;
    lane.lastReadyPenaltyAt = 0;
    lane.reservedBeforeSecond = !!lane.reservedKey;
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
      this.add.text(side.info.x, 552, `BLOCK ${this.getBlockedCount(side)}  EMPTY MISS ${this.getMissingCount(side)}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: 11,
        color: side.status === "red" ? "#fecaca" : side.status === "yellow" ? "#fef08a" : "#bbf7d0",
      }).setOrigin(0.5).setDepth(11),
    ];
    if (side.refillTimer > 0) {
      side.readouts.push(this.add.text(side.info.dockX, 222, `REFILL ${Math.ceil(side.refillTimer / 1000)}s`, {
        fontSize: 11,
        color: "#fef08a",
      }).setOrigin(0.5).setDepth(11));
    }
    const startX = side.key === "primary" ? 150 : 1130;
    const step = side.key === "primary" ? 24 : -24;
    side.readouts.push(this.add.text(startX, 160, "NEXT", {
      fontFamily: "Arial Black, Arial",
      fontSize: 10,
      color: "#9bd4ea",
    }).setOrigin(side.key === "primary" ? 0 : 1, 0.5).setDepth(11));
    side.queue.slice(0, 6).forEach((freight, i) => {
      const x = startX + step * (i + 1);
      side.readouts.push(this.add.rectangle(x, 160, 18, 12, freight.color, 1)
        .setStrokeStyle(1, 0x0f172a)
        .setDepth(11));
    });
  }

  paintStaging() {
    const g = this.dynamicLayer;
    this.staging.lanes.forEach((lane) => {
      const flash = Math.sin(this.now / 120) > 0 ? 1 : 0.28;
      const border = lane.mixed ? COLORS.red : lane.ready ? COLORS.green : lane.reservedColor || 0x51616b;
      if (lane.ready || lane.mixed || lane.reservedKey) {
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
      if (lane.reservedKey && lane.pallets.length === 0) {
        g.fillStyle(lane.reservedColor, 0.22);
        g.fillRoundedRect(lane.x - 30, lane.y + 21, 60, 30, 4);
        this.drawTempText(lane.x, lane.y + 26, lane.reservedKey.toUpperCase(), "#f8fafc", 0.5);
      }
      const state = lane.ready
        ? "READY"
        : lane.mixed
          ? "MIXED"
          : lane.colorKey
            ? `${lane.colorKey} ${lane.pallets.length}/3`
            : lane.reservedKey
              ? "RESERVED"
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

  drawTempText(x, y, text, color, origin = 0) {
    if (!this.tempTexts) this.tempTexts = [];
    const t = this.add.text(x, y, text, { fontSize: 11, color }).setDepth(11).setOrigin(origin, 0);
    this.tempTexts.push(t);
  }

  updateHud() {
    const blocked = this.getBlockedCount(this.sides.primary) + this.getBlockedCount(this.sides.secondary);
    this.hud.score.setText(`SCORE ${this.score}`);
    this.hud.blocked.setText(`Blocked bases ${blocked}/10   IBT ${this.ibt.count}/10`);
    const modeText = this.pendingPallet
      ? `MODE: stage ${this.pendingPallet.base.colorKey} pallet`
      : this.mode.kind === "splitPull"
      ? `MODE: split pull (${this.mode.splitRemaining} pads)`
      : this.mode.kind === "placeEmpty"
        ? `MODE: place empty from ${this.stacks[this.mode.stack].label}`
        : "MODE: monitor flow";
    this.hud.mode.setText(modeText);
    this.hud.feed.setText(this.alerts.slice(-3).join("\n"));
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
