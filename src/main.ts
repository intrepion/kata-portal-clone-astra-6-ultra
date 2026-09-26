import * as THREE from "three";
import {
  Game,
  LEVELS,
  EYE_HEIGHT,
  type Portal,
  type PortalPanel,
} from "./game";
import { buildWorld } from "./world";
import { PortalRenderer } from "./portals";
import { createDevice } from "./device";
import { Soundscape } from "./audio";
import { mountUI } from "./ui";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/space-grotesk";
import "./style.css";

mountUI();
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const sound = new Soundscape();
const canvas = $<HTMLCanvasElement>("game-canvas");
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("webgl-error").hidden = false;
  throw new Error("WebGL renderer could not be initialized.");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a0afaa");
scene.fog = new THREE.Fog("#b6c1b7", 25, 60);
const camera = new THREE.PerspectiveCamera(62, 1, 0.055, 90);
camera.rotation.order = "YXZ";
scene.add(camera);
const device = createDevice(camera);
const portalRenderer = new PortalRenderer(scene, renderer);
const raycaster = new THREE.Raycaster();
let game = new Game();
let world = buildWorld(scene, game.level);
let selectedLevel = 0;
let mode: "menu" | "playing" | "paused" | "complete" = "menu";
let previewPortals: [Portal | null, Portal | null] = [
  game.level.portalPanels[0],
  game.level.portalPanels[1],
];
let unlockedMouse = false;
const keys = new Set<string>();
let jumpQueued = false;
let drag: { x: number; y: number; pointerId: number } | null = null;
let dragDistance = 0;
function resetInput() {
  keys.clear();
  jumpQueued = false;
  drag = null;
  dragDistance = 0;
}
let toastTimer: ReturnType<typeof setTimeout>;
let flashTimer: ReturnType<typeof setTimeout>;
let progress: Record<string, number> = {};
try {
  const stored: unknown = JSON.parse(
    localStorage.getItem("parallax-progress") || "{}",
  );
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const level of LEVELS) {
      const value = (stored as Record<string, unknown>)[String(level.id)];
      if (typeof value === "number" && Number.isFinite(value) && value > 0)
        progress[level.id] = value;
    }
  }
} catch {
  /* Progress is optional in storage-restricted browsers. */
}
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const isTouch = window.matchMedia("(pointer: coarse)").matches;
function notify(message: string, duration = 4000) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => $("toast").classList.remove("visible"),
    duration,
  );
}
function flash(color = "#73e3e5") {
  $("flash").style.background = color;
  $("flash").classList.add("active");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => $("flash").classList.remove("active"), 75);
}
function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
function updateSoundButton() {
  $("sound-button").setAttribute(
    "aria-label",
    sound.enabled ? "Mute sound" : "Enable sound",
  );
  $("sound-button").setAttribute("aria-pressed", String(!sound.enabled));
}
function drawChambers() {
  $("chamber-list").innerHTML = LEVELS.map(
    (level, index) =>
      `<button class="chamber-row ${index === selectedLevel ? "active" : ""}" data-level="${index}" aria-pressed="${index === selectedLevel}"><span class="chamber-number">0${level.id}</span><span class="chamber-name">${level.title}</span><span class="tag">${progress[level.id] ? "COMPLETE ✓" : index === 0 ? "ORIENTATION" : index === 1 ? "TRANSPORT" : "APPLICATION"}</span><span class="row-arrow">↗</span></button>`,
  ).join("");
  $("progress-label").textContent =
    `0${Object.keys(progress).length} / 03 COMPLETE`;
  $("preview-code").textContent = `0${game.level.id}`;
  $("preview-number").textContent = `0${game.level.id}`;
  $("preview-name").textContent = game.level.title;
  document
    .querySelectorAll<HTMLButtonElement>("[data-level]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        sound.play("click");
        loadLevel(Number(button.dataset.level));
      }),
    );
}
function bindEvents() {
  game.onEvent = (event) => {
    if (event === "teleport") {
      sound.play("teleport");
      flash();
    }
    if (event === "respawn") {
      sound.play("respawn");
      flash("#ecbfa0");
      notify("A fresh perspective. Your portals are still connected.");
    }
    if (event === "cube-reset")
      notify("The cube has returned to its starting position.");
    if (event === "pickup" || event === "drop" || event === "door")
      sound.play(event);
    if (event === "door" && game.state.doorOpen)
      notify("Connection confirmed. The exit is open.");
    if (event === "complete") complete();
  };
}
function loadLevel(index: number) {
  selectedLevel = index;
  world.dispose();
  game = new Game(index);
  world = buildWorld(scene, game.level);
  previewPortals = [game.level.portalPanels[0], game.level.portalPanels[1]];
  bindEvents();
  drawChambers();
  updateHUD();
  resetInput();
  jumpQueued = false;
}
function updateHUD() {
  $("hud-code").textContent = `CHAMBER 0${game.level.id} / 03`;
  $("hud-title").textContent = game.level.title;
  $("hud-objective").textContent = game.level.cube
    ? "Carry the cube across. Power the pressure pad. Find the exit."
    : "Connect the white panels. Cross the gap. Reach the exit.";
}
function resize() {
  const { width, height } = $("stage").getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  portalRenderer.resize(width, height);
}
new ResizeObserver(resize).observe($("stage"));
window.addEventListener("resize", resize);
function captureMouse() {
  if (isTouch) return;
  try {
    const result = canvas.requestPointerLock();
    result?.catch(() => {
      unlockedMouse = true;
      notify("Drag to look, or use arrow keys. Press 1 / 2 to place portals.");
    });
  } catch {
    unlockedMouse = true;
  }
}
function releaseMouse() {
  if (document.pointerLockElement) document.exitPointerLock();
}
function begin() {
  game.reset();
  bindEvents();
  mode = "playing";
  document.body.classList.add("playing");
  $("hud").hidden = false;
  $("toast").classList.remove("visible");
  updateHUD();
  resetInput();
  resize();
  void sound.start();
  captureMouse();
  notify(
    "Aim at a pale framed panel. Left click for blue, right click for orange.",
    6000,
  );
}
function pause() {
  if (mode !== "playing") return;
  mode = "paused";
  resetInput();
  releaseMouse();
  $<HTMLDialogElement>("pause-dialog").showModal();
}
function resume() {
  $<HTMLDialogElement>("pause-dialog").close();
  mode = "playing";
  resetInput();
  captureMouse();
  void sound.start();
}
function returnToMenu() {
  document
    .querySelectorAll<HTMLDialogElement>("dialog[open]")
    .forEach((dialog) => dialog.close());
  mode = "menu";
  releaseMouse();
  document.body.classList.remove("playing");
  $("hud").hidden = true;
  $("toast").classList.remove("visible");
  loadLevel(selectedLevel);
  resize();
}
function complete() {
  mode = "complete";
  releaseMouse();
  resetInput();
  sound.play("complete");
  const previous = progress[game.level.id];
  progress[game.level.id] = previous
    ? Math.min(previous, game.state.elapsed)
    : game.state.elapsed;
  try {
    localStorage.setItem("parallax-progress", JSON.stringify(progress));
  } catch {
    /* Continue without saved progress. */
  }
  $("result-time").textContent = formatTime(game.state.elapsed);
  $("result-portals").textContent = String(game.state.teleports).padStart(
    2,
    "0",
  );
  const last = selectedLevel === LEVELS.length - 1;
  $("complete-title").innerHTML = last
    ? "A new way<br>of seeing."
    : "Beautifully<br>unexpected.";
  $("complete-message").textContent = last
    ? "All three chambers are complete. You have a remarkable disregard for distance."
    : `Chamber 0${game.level.id} complete. The shortest path was the one you made.`;
  $("next-button").querySelector("span")!.textContent = last
    ? "Back to the laboratory"
    : "Enter next chamber";
  $<HTMLDialogElement>("complete-dialog").showModal();
}
function aim(): PortalPanel | null {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(world.portalTargets, false)[0];
  return hit ? (hit.object.userData.panel as PortalPanel) : null;
}
function shoot(index: 0 | 1) {
  if (mode !== "playing") return;
  const panel = aim();
  if (!panel) {
    sound.play("error");
    notify("Portals attach to the pale framed wall panels.", 2200);
    return;
  }
  if (!game.setPortal(index, panel)) {
    sound.play("error");
    notify("Use a different panel. Portals need their own space.", 2200);
    return;
  }
  sound.play(index === 0 ? "blue" : "orange");
  device.setColor(index);
  device.rig.position.z = -0.59;
  if (game.state.portals[0] && game.state.portals[1])
    notify("Portals linked. Step through to change your perspective.", 2600);
}
function interact() {
  if (!game.interact())
    notify("Look at a nearby cube, then press E to pick it up.", 2200);
}
function hint() {
  if (mode === "playing") notify(game.level.hint, 9000);
}
$("start-button").addEventListener("click", begin);
$("resume-button").addEventListener("click", resume);
$("restart-button").addEventListener("click", () => {
  $<HTMLDialogElement>("pause-dialog").close();
  begin();
});
$("menu-button").addEventListener("click", returnToMenu);
$("complete-menu").addEventListener("click", returnToMenu);
$("next-button").addEventListener("click", () => {
  $<HTMLDialogElement>("complete-dialog").close();
  if (selectedLevel === LEVELS.length - 1) returnToMenu();
  else {
    loadLevel(selectedLevel + 1);
    begin();
  }
});
$("pause-button").addEventListener("click", pause);
$("hint-button").addEventListener("click", hint);
$("sound-button").addEventListener("click", () => {
  sound.setEnabled(!sound.enabled);
  if (sound.enabled) void sound.start();
  updateSoundButton();
});
$("fullscreen-button").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify(
      "Fullscreen is unavailable in this browser. You can still play in the window.",
    );
  }
});
document.addEventListener("fullscreenchange", () =>
  $("fullscreen-button").setAttribute(
    "aria-label",
    document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen",
  ),
);
let helpPausedGame = false;
$("help-button").addEventListener("click", () => {
  helpPausedGame = mode === "playing";
  if (helpPausedGame) {
    mode = "paused";
    resetInput();
    releaseMouse();
  }
  $<HTMLDialogElement>("help-dialog").showModal();
});
function closeHelp() {
  $<HTMLDialogElement>("help-dialog").close();
  if (helpPausedGame) {
    mode = "playing";
    captureMouse();
  }
  helpPausedGame = false;
}
$("help-done").addEventListener("click", closeHelp);
document.querySelector(".dialog-close")!.addEventListener("click", closeHelp);
$<HTMLDialogElement>("help-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeHelp();
});
$<HTMLDialogElement>("pause-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  resume();
});
$<HTMLDialogElement>("complete-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  returnToMenu();
});
document.querySelector(".wordmark")!.addEventListener("click", (event) => {
  event.preventDefault();
  if (mode === "playing") pause();
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) unlockedMouse = false;
  else if (mode === "playing" && !unlockedMouse && !isTouch) pause();
});
document.addEventListener("pointerlockerror", () => {
  unlockedMouse = true;
});
window.addEventListener("blur", () => {
  resetInput();
  if (mode === "playing") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") pause();
});
window.addEventListener("keydown", (event) => {
  if (mode !== "playing") return;
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Space",
      "KeyE",
      "KeyR",
      "KeyH",
      "Digit1",
      "Digit2",
    ].includes(event.code)
  )
    event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "Space") jumpQueued = true;
  if (event.code === "Escape") {
    event.preventDefault();
    pause();
  }
  if (event.code === "KeyE") interact();
  if (event.code === "KeyR") {
    game.reset();
    updateHUD();
    notify("Chamber reset. Another way of looking at it.");
  }
  if (event.code === "KeyH") hint();
  if (event.code === "Digit1") shoot(0);
  if (event.code === "Digit2") shoot(1);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if (mode !== "playing") return;
  void sound.start();
  if (document.pointerLockElement === canvas) {
    shoot(event.button === 2 ? 1 : 0);
    return;
  }
  drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  dragDistance = 0;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", (event) => {
  if (drag && dragDistance < 5 && !isTouch) shoot(event.button === 2 ? 1 : 0);
  drag = null;
});
canvas.addEventListener("pointercancel", () => {
  drag = null;
});
canvas.addEventListener("lostpointercapture", () => {
  drag = null;
});
window.addEventListener("pointermove", (event) => {
  if (mode !== "playing") return;
  let dx = 0,
    dy = 0;
  if (document.pointerLockElement === canvas) {
    dx = event.movementX;
    dy = event.movementY;
  } else if (drag && drag.pointerId === event.pointerId) {
    dx = event.clientX - drag.x;
    dy = event.clientY - drag.y;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
  } else return;
  game.state.yaw -= dx * 0.0023;
  game.state.pitch = THREE.MathUtils.clamp(
    game.state.pitch - dy * 0.0023,
    -1.35,
    1.35,
  );
});
const movementKeys: Record<string, string> = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
};
document
  .querySelectorAll<HTMLButtonElement>("[data-move]")
  .forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      keys.add(movementKeys[button.dataset.move!]);
    });
    const release = () => keys.delete(movementKeys[button.dataset.move!]);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
$("touch-blue").addEventListener("click", () => shoot(0));
$("touch-orange").addEventListener("click", () => shoot(1));
$("touch-interact").addEventListener("click", interact);
$("touch-jump").addEventListener("click", () => {
  jumpQueued = true;
});

let lastTime = performance.now();
let currentAim: PortalPanel | null = null;
function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const time = now / 1000;
  if (mode === "playing") {
    game.state.yaw +=
      ((keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0)) *
      dt *
      1.7;
    game.state.pitch = THREE.MathUtils.clamp(
      game.state.pitch +
        ((keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0)) *
          dt *
          1.4,
      -1.35,
      1.35,
    );
    game.update(dt, {
      forward: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
      strafe: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      jump: jumpQueued || keys.has("Space"),
    });
    jumpQueued = false;
    $("timer").textContent = formatTime(game.state.elapsed);
  }
  if (mode === "menu") {
    camera.position.set(
      6.3 + (reducedMotion ? 0 : Math.sin(time * 0.1) * 0.18),
      3.9,
      8.7,
    );
    camera.lookAt(-2.4, 1.5, -3.3);
    device.rig.visible = false;
  } else {
    camera.position.set(
      game.state.position.x,
      game.state.position.y + EYE_HEIGHT,
      game.state.position.z,
    );
    camera.rotation.set(game.state.pitch, game.state.yaw, 0, "YXZ");
    device.rig.visible = !game.state.held;
    device.update(
      time,
      Math.hypot(game.state.velocity.x, game.state.velocity.z) > 1,
    );
    device.rig.position.z += (-0.63 - device.rig.position.z) * 0.18;
    if (world.cube && game.state.cube)
      world.cube.position.set(
        game.state.cube.x,
        game.state.cube.y,
        game.state.cube.z,
      );
    currentAim = aim();
    $("crosshair").classList.toggle("valid", Boolean(currentAim));
    const cube = game.state.cube;
    const nearCube =
      cube &&
      Math.hypot(
        cube.x - game.state.position.x,
        cube.y - game.state.position.y - EYE_HEIGHT,
        cube.z - game.state.position.z,
      ) < 2.7;
    $("interaction-prompt").textContent = game.state.held
      ? "E · Put down cube"
      : nearCube
        ? "E · Pick up cube"
        : currentAim
          ? "PORTAL SURFACE"
          : "";
    $("portal-blue").classList.toggle("placed", Boolean(game.state.portals[0]));
    $("portal-orange").classList.toggle(
      "placed",
      Boolean(game.state.portals[1]),
    );
  }
  world.update(time, game.state.doorOpen);
  const portals = mode === "menu" ? previewPortals : game.state.portals;
  portalRenderer.update(portals, time);
  portalRenderer.render(camera, portals, device.rig);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
bindEvents();
drawChambers();
updateSoundButton();
resize();
requestAnimationFrame(frame);

// Development-only test seam: never included in production builds.
if (import.meta.env.DEV) {
  Object.defineProperty(window, "__PARALLAX__", {
    value: {
      get game() {
        return game;
      },
      get mode() {
        return mode;
      },
      get camera() {
        return camera;
      },
      get renderer() {
        return renderer;
      },
      aim,
      shoot,
      loadLevel,
    },
  });
}
