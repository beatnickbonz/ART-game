# RC Flow Control

A polished Phaser 3 arcade-style warehouse operations training simulator focused on RC operator freight-flow management.

## Run

Open `index.html` in Chrome. The prototype uses Phaser from the jsDelivr CDN, so Chrome needs internet access the first time it loads Phaser.

For a local server, run one of these from the project folder:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

- Click `Toggle Primary` or `Toggle Secondary` to swap that side between ART and RAA feed.
- Click an RAA dock while that side is on RAA to stage a 3-box backup pallet.
- Click a full non-blue base to select that pallet, then click a staging lane to place it.
- Click an empty staging lane to cycle its reservation: Brown, Red, Orange, Purple, then Open.
- Keep like freight together. A staging lane with 3 matching pallets becomes ready for GPM.
- Click a ready staging lane to release it, or wait for auto-GPM to clear it.
- Mixed staging lanes cannot auto-clear and will create jam penalties until manual GPM clears them.
- Primary-side lanes are faster for Primary freight, Secondary-side lanes are faster for Secondary freight, and the center lane is flexible.
- Blue pallets move to IBT instead of shared staging.
- Click the empty pallet trailer, then click two empty stack pads to split a 14-pallet pull into 7 and 7.
- Click a stack, then a matching-side base without an empty pallet to replenish it.
- Click `Call GPM` to clear staged freight with a score penalty.
- Click `Request IBT` when blue freight is waiting in the IBT trailer.
- Click `New Trailer` on an empty ART dock to begin its 45-second refill.

## Scaling

The Phaser game uses:

- `Phaser.Scale.FIT`
- `Phaser.Scale.CENTER_BOTH`
- A fixed 1280 x 720 logical canvas

That preserves aspect ratio across laptops and monitors, centers the game, and keeps pointer/touch input aligned with the scaled canvas.

## Assets And Licenses

No external art, sprites, audio, or texture assets are bundled. All warehouse visuals are procedural Phaser graphics: dock doors, conveyors, pallets, workers, RC lane markings, warning lights, freight, and dashboard UI.

Runtime dependency:

- Phaser 3.80.1 from jsDelivr CDN, MIT License.

## Tuning Guide

Most values live in `TUNE` near the top of `game.js`:

- Trailer capacities and refill timers
- ART spawn intervals
- RAA pallet size
- Base and staging capacities
- Shared staging lane count and capacity
- Freight preview queue length
- Mixed-lane jam timing
- Ready-lane pressure penalty
- GPM auto-clear interval and chance
- Blocked-base grace period and penalty cadence
- Score values
- Freight color distribution

## Future Expansion Ideas

- Add route planning and operator dispatch commands.
- Add shift goals, graded scenarios, and coaching callouts.
- Add audio: conveyor hum, dock alarms, scanner chirps, alert tones.
- Add real sprite sheets for workers, forklifts, and pallet jacks.
- Add scenario scripting for trailer surges, lane closures, IBT waves, and staffing changes.
- Add analytics after each run: bottleneck heatmap, missed fast-flow bonuses, blocked-base duration, staging discipline, and RAA usage.
