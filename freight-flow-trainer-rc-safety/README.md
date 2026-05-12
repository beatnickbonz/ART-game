# Freight Flow Trainer: RC Safety Concept

Alternate 2D warehouse freight-flow training prototype focused on RC operator safety. Open `index.html` in Chrome to play; no build step is required.

## How To Play

- Keep Primary and Secondary freight flowing into bases.
- Move the mouse inside the marked `RC Safe Drive Lane` to guide the RC operator.
- When carrying a selected full pallet, keep the RC operator in the center drive lane and avoid sudden high-speed movement.
- Click a full pallet, then click shared staging for brown/red/orange/purple pallets.
- Click a full blue pallet, then click the IBT trailer.
- Replenish bases by clicking a side stack. If it is `0/7`, it refills from the unlimited trailer and becomes selected. Then click a matching-side empty base.
- Toggle a side to RAA when its ART trailer is empty, then click the RAA door to stage 3-box pallets until the ART refill arrives.
- Call GPM manually only when needed. It clears staging but costs points.

## Training Mechanics Included

- Primary ART starts at 100 boxes and spawns every 900ms.
- Secondary ART starts at 100 boxes and spawns every 2200ms.
- ART refill requests take 45 seconds.
- RAA doors stage 3-box pallets and do not auto-refill.
- Ten bases total, 5 per side, with 6-box pallet capacity.
- Freight colors follow the requested mix and lock bases immediately when assigned.
- Shared staging is a 4-column by 3-row grid with 3 pallets per slot and completed-row gravity after random GPM clears.
- Layout concept: vertical base banks on the far left/right, shared staging at the bottom, and a larger center RC tracking square.
- Blue pallets route only to IBT, with 10-pallet capacity and 15-second trailer clearing.
- Blocked bases apply a 1-second grace period, then -50 per second while blocked.
- Flow conveyors show green, flashing yellow, or flashing red based on source, blocked bases, and missing pallets.
- Empty pallet system uses one 7-pallet stack per side. The empty pallet trailer is unlimited for this concept.
- RC operator safety layer: while carrying freight, leaving the safe driving square costs `-25`; excessive mouse-driven speed costs `-15`.
- Freight colors use higher-contrast shades and marked boxes for faster identification.

## Controls

All controls are mouse/touch:

- Full pallet: select pallet.
- Staging lane: stage selected non-blue pallet.
- IBT trailer: stage selected blue pallet.
- Empty Pallet Trailer: refills any side stacks currently at `0/7`.
- Empty pallet stack: select for replenishment.
- Matching-side base: place an empty pallet.
- RAA door: stage an RAA pallet when that side is toggled to RAA.
- HUD buttons: GPM, IBT, trailer requests, and ART/RAA toggles.
- RC drive square: move your mouse through the center marked area to keep the operator in the intended safe travel path.

## Assets

No external art assets are used. All warehouse floor visuals, worker icons, pallet jacks, conveyors, freight boxes, warning states, and HUD elements are drawn procedurally in `game.js`, so there are no third-party license requirements.

## Tuning Notes

Most gameplay values live near the top of `game.js` in `CONFIG`, including spawn intervals, refill timers, capacities, scoring, freight mix, and staging behavior. Layout coordinates are centralized in `LAYOUT` and generated entity bounds, making it easier to expand the map later.
