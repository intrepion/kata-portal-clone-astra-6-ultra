# PARALLAX

An original, compact first-person puzzle game inspired by the spatial mechanics of Valve's _Portal_. Connect two wall portals, carry a cube across a gap, and find a new route through three laboratory chambers.

Built with TypeScript, Three.js, and Vite. Chamber geometry, materials, signage, the portal device, and Web Audio sound effects are generated in code. The project does not contain Valve game assets, levels, dialogue, or music, and is not affiliated with Valve.

## Play locally

Use Node.js 24 and npm:

```bash
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173), choose a chamber, and select **Enter chamber**. A desktop browser with WebGL and a mouse is recommended. Touchscreens have movement and action buttons, plus drag-to-look controls.

Aim at the pale framed wall panels to place a blue portal and an orange portal. Once both are placed, enter either to come out of the other. For example, in the first chamber you can connect the panel beside the starting platform to a panel beyond the gap, then walk through to reach the exit.

## Controls

| Input            | Action                            |
| ---------------- | --------------------------------- |
| W / A / S / D    | Move                              |
| Mouse            | Look around                       |
| Left click or 1  | Place blue portal                 |
| Right click or 2 | Place orange portal               |
| Space            | Jump                              |
| E                | Pick up or put down the cube      |
| R                | Restart the current chamber       |
| H                | Show the chamber hint             |
| Escape           | Pause and release the mouse       |
| Arrow keys       | Look around without mouse capture |

If the browser cannot capture the mouse, drag on the scene to look around. Use the sound and fullscreen buttons in the header for those settings. Touchscreen players can drag to look and use the on-screen directional, portal, pickup, and jump buttons.

## The experiment

- **A question of distance:** Connect platforms separated by a gap.
- **Something to hold on to:** Carry a cube through a portal and leave it on a pressure plate to open the exit.
- **The long way around:** Bring the cube across a wider gap and solve the final pressure-plate route.

Linked portals show a rendered view from the other end. Traversal maps the player's position, facing direction, and velocity between the two wall orientations. Cubes can be carried through with the player. Jumping, falling, respawning, pressure plates, exit doors, pause, restart, hints, completion times, and traversal counts are implemented.

Completed chambers and best times are saved in this browser under `parallax-progress`; the audio preference is saved under `parallax-sound`. The game remains playable when browser storage or audio is unavailable. There is no account or server-side progress synchronization.

This is a three-chamber browser game with deliberately limited scope: portals attach to designated vertical wall panels, floor and ceiling portals are unsupported, and portal views do not recursively render other portals. Cubes travel through portals while carried; released cubes do not independently traverse them. It does not recreate the full Portal campaign or its complete physics system.

## Validate and build

```bash
# Simulation and portal-physics tests
npm run test

# Type checking and production build
npm run build

# Install the browser used by the interaction tests
npx playwright install chromium

# Browser tests; Playwright starts its own server on port 4175
npm run test:e2e

# Run all checks in sequence
npm run check
```

The production output is written to `dist/`. Run `npm run preview` to inspect the built application locally. GitHub Actions runs the complete check suite on pushes and pull requests using Node.js 24 and Chromium.

## Assets and license

The game uses original procedural geometry, canvas-generated signage, and synthesized audio. DM Sans and Space Grotesk are bundled locally through the `@fontsource-variable/dm-sans` and `@fontsource-variable/space-grotesk` packages. Fonts and other application assets are served with the game; gameplay has no dependency on external asset services or network APIs at runtime.

The source is available under the [MIT License](LICENSE), copyright © 2026 Oliver Forral. Dependency and font licenses remain with their respective authors. _Portal_ and Valve are referenced only to identify the gameplay inspiration.
