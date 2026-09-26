import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Game,
  LEVELS,
  transformThroughPortal,
  type GameInput,
  type Portal,
  type Vec3,
} from "../src/game.ts";

const idle: GameInput = { forward: 0, strafe: 0, jump: false };
const close = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 0.00001,
    `${actual} should equal ${expected}`,
  );
const speed = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
function advance(game: Game, seconds: number, input: GameInput = idle) {
  for (let t = 0; t < seconds; t += 1 / 120) game.update(1 / 120, input);
}
function connect(game: Game) {
  assert.equal(game.setPortal(0, game.level.portalPanels[0]!), true);
  assert.equal(game.setPortal(1, game.level.portalPanels[1]!), true);
}

test("portal frame mapping preserves momentum, vertical offset, and the camera heading", () => {
  const entry: Portal = {
    position: { x: -8, y: 1.65, z: 4 },
    normal: { x: 1, y: 0, z: 0 },
  };
  const exit: Portal = {
    position: { x: -3, y: 1.65, z: -10 },
    normal: { x: 0, y: 0, z: 1 },
  };
  const result = transformThroughPortal(
    { x: -8.2, y: 0.4, z: 4.3 },
    { x: -7, y: 2, z: 1 },
    Math.PI / 2,
    entry,
    exit,
  );
  close(speed(result.velocity), Math.sqrt(54));
  close(result.velocity.x, 1);
  close(result.velocity.y, 2);
  close(result.velocity.z, 7);
  close(result.position.x, -2.7);
  close(result.position.y, 0.4);
  close(result.position.z, -9.8);
  close(Math.sin(result.yaw), 0);
  close(Math.cos(result.yaw), -1);
});

test("mapping through a portal and back recovers the original point and velocity", () => {
  const [entry, exit] = LEVELS[0]!.portalPanels;
  const original = {
    position: { x: -7.9, y: 0.3, z: 4.2 },
    velocity: { x: -4, y: -2, z: 0.5 },
    yaw: 1.5,
  };
  const out = transformThroughPortal(
    original.position,
    original.velocity,
    original.yaw,
    entry!,
    exit!,
  );
  const back = transformThroughPortal(
    out.position,
    out.velocity,
    out.yaw,
    exit!,
    entry!,
  );
  for (const key of ["x", "y", "z"] as const) {
    close(back.position[key], original.position[key]);
    close(back.velocity[key], original.velocity[key]);
  }
  close(Math.sin(back.yaw), Math.sin(original.yaw));
});

test("portals require a valid full-size panel and cannot overlap", () => {
  const game = new Game();
  const panel = game.level.portalPanels[0]!;
  assert.equal(game.setPortal(0, panel), true);
  assert.equal(game.setPortal(1, panel), false);
  assert.equal(
    game.setPortal(1, {
      position: { x: 0, y: 0, z: 4 },
      normal: { x: 0, y: 1, z: 0 },
    }),
    false,
  );
  assert.equal(
    game.setPortal(1, { ...panel, position: { ...panel.position, y: 0.2 } }),
    false,
  );
  assert.equal(
    game.setPortal(1, { ...panel, position: { ...panel.position, z: 10 } }),
    false,
  );
  assert.equal(
    game.setPortal(1, { ...panel, normal: { x: NaN, y: 0, z: 0 } }),
    false,
  );
  assert.equal(game.setPortal(1, game.level.portalPanels[1]!), true);
  const oldX = game.state.portals[0]!.position.x;
  const callerOwned = {
    position: { ...panel.position },
    normal: { ...panel.normal },
  };
  assert.equal(game.setPortal(0, callerOwned), true);
  callerOwned.position.x = 100;
  assert.equal(game.state.portals[0]!.position.x, oldX);
});

test("walking into linked portals crosses before the room wall can stop the player", () => {
  const game = new Game();
  connect(game);
  const events: string[] = [];
  game.onEvent = (event) => events.push(event);
  game.state.position = { x: -7.3, y: 0, z: 4 };
  game.state.yaw = Math.PI / 2;
  advance(game, 0.2, { ...idle, forward: 1 });
  assert.equal(game.state.teleports, 1);
  assert.equal(events.filter((event) => event === "teleport").length, 1);
  assert.ok(game.state.position.z < -8);
  assert.ok(Math.abs(game.state.position.x + 3) < 0.01);
  assert.ok(game.state.velocity.z > 4);
  assert.equal(game.state.grounded, true);
});

test("unlinked portals are solid and moving beside a portal does not teleport", () => {
  const game = new Game();
  game.setPortal(0, game.level.portalPanels[0]!);
  game.state.position = { x: -7.3, y: 0, z: 4 };
  game.state.yaw = Math.PI / 2;
  advance(game, 0.4, { ...idle, forward: 1 });
  assert.equal(game.state.teleports, 0);
  close(game.state.position.x, -7.7);
  game.setPortal(1, game.level.portalPanels[1]!);
  game.state.position.z = 6;
  advance(game, 0.4, { ...idle, forward: 1 });
  assert.equal(game.state.teleports, 0);
});

test("a normal running jump cannot clear the first gap and falling respawns safely", () => {
  const game = new Game();
  connect(game);
  const events: string[] = [];
  game.onEvent = (event) => events.push(event);
  game.state.position = { x: 0, y: 0, z: 0.08 };
  game.state.velocity.z = -4.6;
  advance(game, 0.65, { forward: 1, strafe: 0, jump: true });
  assert.ok(game.state.position.y < -0.25);
  advance(game, 1.2);
  assert.ok(events.includes("respawn"));
  assert.equal(game.state.position.y, 0);
  assert.ok(game.state.position.z > 6);
  assert.ok(
    game.state.portals.every(Boolean),
    "fall recovery preserves the player's portal solution",
  );
});

test("pickup and carrying preserve a cube through a portal and keep it inside room walls", () => {
  const game = new Game(1);
  connect(game);
  game.state.position = { x: -3, y: 0, z: 6 };
  assert.equal(game.interact(), true);
  assert.equal(game.state.held, true);
  game.state.position = { x: -7.3, y: 0, z: 4 };
  game.state.yaw = Math.PI / 2;
  advance(game, 0.2, { ...idle, forward: 1 });
  assert.equal(game.state.teleports, 1);
  assert.equal(game.state.held, true);
  assert.ok(game.state.cube!.z < -6);
  game.state.position = { x: 7.6, y: 0, z: -6 };
  game.state.yaw = -Math.PI / 2;
  advance(game, 0.01);
  assert.ok(game.state.cube!.x <= 7.45);
  assert.equal(game.interact(), true);
  assert.equal(game.state.held, false);
});

test("pressure plates require a resting, released cube and close immediately when it is picked up", () => {
  const game = new Game(1);
  const button = game.level.button!;
  game.state.cube = { x: button.x, y: 2, z: button.z };
  advance(game, 0.01);
  assert.equal(game.state.doorOpen, false);
  advance(game, 0.5);
  assert.equal(game.state.doorOpen, true);
  game.state.position = { x: button.x, y: 0, z: button.z + 2 };
  assert.equal(game.interact(), true);
  assert.equal(game.state.doorOpen, false);
});

test("exits complete once, only with an unlocked door", () => {
  const game = new Game(1);
  let completions = 0;
  game.onEvent = (event) => {
    if (event === "complete") completions += 1;
  };
  game.state.position = { ...game.level.exit };
  advance(game, 0.1);
  assert.equal(game.state.completed, false);
  game.state.cube = { ...game.level.button!, y: 0.55 };
  advance(game, 0.1);
  assert.equal(game.state.completed, true);
  advance(game, 0.1);
  assert.equal(completions, 1);
  game.reset();
  assert.equal(game.state.completed, false);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.doorOpen, false);
});

test("every chamber can be solved by carrying its cube through the same portal connection", () => {
  function walkTo(game: Game, x: number, z: number, stop = () => false) {
    for (let frame = 0; frame < 1200; frame += 1) {
      if (
        stop() ||
        game.state.completed ||
        Math.hypot(game.state.position.x - x, game.state.position.z - z) < 0.08
      ) {
        advance(game, 0.2);
        return;
      }
      game.state.yaw = Math.atan2(
        -(x - game.state.position.x),
        -(z - game.state.position.z),
      );
      game.update(1 / 120, { ...idle, forward: 1 });
    }
    assert.fail(`Could not walk to ${x}, ${z} in chamber ${game.level.id}`);
  }
  for (let index = 0; index < LEVELS.length; index += 1) {
    const game = new Game(index);
    connect(game);
    if (game.state.cube) {
      walkTo(game, game.state.cube.x, game.state.cube.z + 1.9);
      game.state.yaw = 0;
      assert.equal(game.interact(), true);
    }
    walkTo(game, -7.95, 4, () => game.state.teleports > 0);
    assert.equal(game.state.teleports, 1);
    if (game.level.button) {
      walkTo(game, game.level.button.x, game.level.button.z + 1.65);
      game.state.yaw = 0;
      advance(game, 0.02);
      assert.equal(game.interact(), true);
      advance(game, 0.5);
      assert.equal(game.state.doorOpen, true);
    }
    walkTo(game, game.level.exit.x, game.level.exit.z);
    assert.equal(game.state.completed, true);
  }
});
