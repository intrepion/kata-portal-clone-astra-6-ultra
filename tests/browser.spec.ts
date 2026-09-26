import { test as base, expect, type Page } from "@playwright/test";
import type { Game } from "../src/game";

type DebugApp = {
  game: Game;
  mode: string;
  renderer: { getContext(): WebGLRenderingContext };
  aim(): { position: { x: number; y: number; z: number } } | null;
};
declare global {
  interface Window {
    __PARALLAX__: DebugApp;
  }
}

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /WebGL|THREE\.|GL_INVALID|GL_OUT_OF_MEMORY|INVALID_OPERATION/.test(
            message.text(),
          )
        )
          errors.push(message.text());
      });
      await use(errors);
      expect(
        errors,
        "The running game must not emit JavaScript or WebGL errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

async function fallbackMouse(page: Page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () =>
      Promise.reject(
        new DOMException(
          "Pointer capture unavailable in this test",
          "NotAllowedError",
        ),
      );
  });
}
async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function aimAtPanel(page: Page, index: number) {
  await page.evaluate((panelIndex) => {
    const game = window.__PARALLAX__.game;
    const point = game.level.portalPanels[panelIndex]!.position;
    const dx = point.x - game.state.position.x;
    const dy = point.y - game.state.position.y - 1.6;
    const dz = point.z - game.state.position.z;
    game.state.yaw = Math.atan2(-dx, -dz);
    game.state.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, index);
  await frame(page);
  await expect(page.locator("#crosshair")).toHaveClass(/valid/);
  expect(await page.evaluate(() => window.__PARALLAX__.aim())).not.toBeNull();
}
async function start(page: Page, level = 0) {
  await page.goto("/");
  await expect(page.locator("#game-canvas")).toBeVisible();
  if (level) await page.locator(`[data-level="${level}"]`).click();
  await page.locator("#start-button").click();
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.mode))
    .toBe("playing");
  await frame(page);
}
async function walkTo(page: Page, x: number, z: number, stopOnPortal = false) {
  await page.evaluate(
    ({ x, z, stopOnPortal }) => {
      const game = window.__PARALLAX__.game;
      const initialTeleports = game.state.teleports;
      const idle = { forward: 0, strafe: 0, jump: false };
      for (let step = 0; step < 1800; step += 1) {
        if (
          game.state.completed ||
          (stopOnPortal && game.state.teleports > initialTeleports) ||
          Math.hypot(game.state.position.x - x, game.state.position.z - z) <
            0.08
        ) {
          for (let settle = 0; settle < 24; settle += 1)
            game.update(1 / 120, idle);
          return;
        }
        game.state.yaw = Math.atan2(
          -(x - game.state.position.x),
          -(z - game.state.position.z),
        );
        game.update(1 / 120, { ...idle, forward: 1 });
      }
      throw new Error(`Could not reach ${x}, ${z} through normal movement`);
    },
    { x, z, stopOnPortal },
  );
  await frame(page);
}
async function noGLError(page: Page) {
  expect(
    await page.evaluate(() =>
      window.__PARALLAX__.renderer.getContext().getError(),
    ),
  ).toBe(0);
}

test("selection, instructions, keyboard movement, fallback look, pause, resume and restart work", async ({
  page,
}) => {
  await fallbackMouse(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/PARALLAX/i);
  await expect(page.locator("h1")).toContainText("Distance is");
  await expect(page.locator(".chamber-row")).toHaveCount(3);
  for (const level of [1, 2, 0]) {
    await page.locator(`[data-level="${level}"]`).click();
    await expect(page.locator(`[data-level="${level}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#preview-number")).toHaveText(`0${level + 1}`);
    await frame(page);
    await noGLError(page);
  }
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  await expect(page.locator("#help-dialog")).toContainText(
    "Place the blue portal",
  );
  await page.getByRole("button", { name: "Close instructions" }).click();
  await expect(page.locator("#help-dialog")).not.toBeVisible();
  await page.locator("#start-button").click();
  await expect(page.locator("#toast")).toContainText("Drag to look");
  await expect(page.locator("#hud")).toBeVisible();
  const initialZ = await page.evaluate(
    () => window.__PARALLAX__.game.state.position.z,
  );
  await page.keyboard.down("KeyW");
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.game.state.position.z))
    .toBeLessThan(initialZ - 0.2);
  await page.keyboard.up("KeyW");
  const initialYaw = await page.evaluate(
    () => window.__PARALLAX__.game.state.yaw,
  );
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.game.state.yaw))
    .toBeLessThan(initialYaw - 0.1);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-dialog")).toBeVisible();
  const pausedTime = await page.evaluate(
    () => window.__PARALLAX__.game.state.elapsed,
  );
  await frame(page);
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.elapsed),
  ).toBe(pausedTime);
  await page.locator("#resume-button").click();
  await expect(page.locator("#pause-dialog")).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.mode))
    .toBe("playing");
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  expect(await page.evaluate(() => window.__PARALLAX__.mode)).toBe("paused");
  await page.locator("#help-done").click();
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.mode))
    .toBe("playing");
  await page.keyboard.press("KeyR");
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.position),
  ).toEqual({ x: 0, y: 0, z: 6.5 });
  await page.keyboard.press("Escape");
  await page.locator("#restart-button").click();
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.mode))
    .toBe("playing");
  await page.keyboard.press("Escape");
  await page.locator("#menu-button").click();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#hud")).not.toBeVisible();
  await page.locator("#sound-button").click();
  await expect(page.locator("#sound-button")).toHaveAttribute(
    "aria-label",
    "Enable sound",
  );
  await page.locator("#sound-button").click();
  await expect(page.locator("#sound-button")).toHaveAttribute(
    "aria-label",
    "Mute sound",
  );
  await noGLError(page);
});

test("real camera raycasts place portals and keyboard movement traverses their rendered connection", async ({
  page,
}) => {
  await fallbackMouse(page);
  await start(page);
  await aimAtPanel(page, 0);
  await page.keyboard.press("Digit1");
  await expect(page.locator("#portal-blue")).toHaveClass(/placed/);
  expect(
    await page.evaluate(
      () => window.__PARALLAX__.game.state.portals[0]?.normal.x,
    ),
  ).toBe(1);
  await page.keyboard.press("Digit2");
  await expect(page.locator("#toast")).toContainText("Use a different panel");
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.portals[1]),
  ).toBeNull();
  await aimAtPanel(page, 1);
  await page.keyboard.press("Digit2");
  await expect(page.locator("#portal-orange")).toHaveClass(/placed/);
  expect(
    await page.evaluate(
      () => window.__PARALLAX__.game.state.portals[1]?.normal.z,
    ),
  ).toBe(1);
  await aimAtPanel(page, 0);
  await page.keyboard.down("KeyW");
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.game.state.teleports), {
      timeout: 15_000,
    })
    .toBe(1);
  await page.keyboard.up("KeyW");
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.position.z),
  ).toBeLessThan(-3);
  await noGLError(page);
  await page.keyboard.press("KeyR");
  await expect(page.locator("#portal-blue")).not.toHaveClass(/placed/);
  await expect(page.locator("#portal-orange")).not.toHaveClass(/placed/);
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.teleports),
  ).toBe(0);
});

test("cube transport, grounded plate activation, completion, next chamber and saved progress work together", async ({
  page,
}) => {
  await fallbackMouse(page);
  await start(page, 1);
  await aimAtPanel(page, 0);
  await page.keyboard.press("Digit1");
  await aimAtPanel(page, 1);
  await page.keyboard.press("Digit2");
  await walkTo(page, -3, 5.9);
  await page.evaluate(() => {
    const game = window.__PARALLAX__.game;
    game.state.yaw = 0;
    game.state.pitch = -0.3;
  });
  await frame(page);
  await expect(page.locator("#interaction-prompt")).toContainText(
    "Pick up cube",
  );
  await page.keyboard.press("KeyE");
  expect(await page.evaluate(() => window.__PARALLAX__.game.state.held)).toBe(
    true,
  );
  await expect(page.locator("#interaction-prompt")).toContainText(
    "Put down cube",
  );
  await walkTo(page, -7.95, 4, true);
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.teleports),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.__PARALLAX__.game.state.cube!.z),
  ).toBeLessThan(-6);
  await walkTo(page, -3, -5.35);
  await page.evaluate(() => {
    const game = window.__PARALLAX__.game;
    game.state.yaw = 0;
    game.state.pitch = 0;
    game.update(0.02, { forward: 0, strafe: 0, jump: false });
  });
  await page.keyboard.press("KeyE");
  expect(await page.evaluate(() => window.__PARALLAX__.game.state.held)).toBe(
    false,
  );
  await expect
    .poll(() => page.evaluate(() => window.__PARALLAX__.game.state.doorOpen))
    .toBe(true);
  await walkTo(page, 5, -8.6);
  await expect(page.locator("#complete-dialog")).toBeVisible();
  await expect(page.locator("#complete-message")).toContainText(
    "Chamber 02 complete",
  );
  await expect(page.locator("#result-portals")).toHaveText("01");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("parallax-progress")!)["2"],
    ),
  ).toBeGreaterThan(0);
  await page.locator("#next-button").click();
  await expect(page.locator("#hud-code")).toHaveText("CHAMBER 03 / 03");
  expect(await page.evaluate(() => window.__PARALLAX__.game.level.id)).toBe(3);
  await page.keyboard.press("Escape");
  await page.locator("#menu-button").click();
  await expect(page.locator('[data-level="1"] .tag')).toContainText("COMPLETE");
  await expect(page.locator("#progress-label")).toHaveText("01 / 03 COMPLETE");
  await page.reload();
  await expect(page.locator('[data-level="1"] .tag')).toContainText("COMPLETE");
  await noGLError(page);
});

test.describe("touchscreen layout", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });

  test("mobile selection, instructions, touch controls and portal placement remain usable", async ({
    page,
  }) => {
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.locator('[data-level="2"]').tap();
    await expect(page.locator("#preview-number")).toHaveText("03");
    await page.locator("#help-button").tap();
    await expect(page.locator("#help-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close instructions" }).tap();
    await page.locator("#start-button").tap();
    await expect(page.locator("#mobile-controls")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Move forward", exact: true }),
    ).toBeVisible();
    await aimAtPanel(page, 0);
    await page.locator("#touch-blue").tap();
    await expect(page.locator("#portal-blue")).toHaveClass(/placed/);
    await aimAtPanel(page, 1);
    await page.locator("#touch-orange").tap();
    await expect(page.locator("#portal-orange")).toHaveClass(/placed/);
    await page.locator("#pause-button").tap();
    await expect(page.locator("#pause-dialog")).toBeVisible();
    await page.locator("#resume-button").tap();
    await expect
      .poll(() => page.evaluate(() => window.__PARALLAX__.mode))
      .toBe("playing");
    await noGLError(page);
  });
});
