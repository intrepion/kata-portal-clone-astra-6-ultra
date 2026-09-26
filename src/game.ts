export type Vec3 = { x: number; y: number; z: number };
export type Portal = { position: Vec3; normal: Vec3 };
export type PortalPanel = Portal & { width: number; height: number };
export type Level = {
  id: number;
  title: string;
  subtitle: string;
  hint: string;
  spawn: Vec3;
  gap: { minZ: number; maxZ: number };
  cube: Vec3 | null;
  button: Vec3 | null;
  exit: Vec3;
  portalPanels: PortalPanel[];
};

const panels = (): PortalPanel[] => [
  {
    position: { x: -7.95, y: 1.65, z: 4 },
    normal: { x: 1, y: 0, z: 0 },
    width: 3.6,
    height: 3.3,
  },
  {
    position: { x: -3, y: 1.65, z: -9.95 },
    normal: { x: 0, y: 0, z: 1 },
    width: 4,
    height: 3.3,
  },
  {
    position: { x: 7.95, y: 1.65, z: -6 },
    normal: { x: -1, y: 0, z: 0 },
    width: 3.6,
    height: 3.3,
  },
];

export const LEVELS: Level[] = [
  {
    id: 1,
    title: "A question of distance",
    subtitle: "Connect two places. Change what comes between.",
    hint: "Place a blue portal on the white wall to your left, then an orange portal on a white panel across the gap. Walk into blue.",
    spawn: { x: 0, y: 0, z: 6.5 },
    gap: { minZ: -3, maxZ: 0 },
    cube: null,
    button: null,
    exit: { x: 5, y: 0, z: -8.6 },
    portalPanels: panels(),
  },
  {
    id: 2,
    title: "Something to hold on to",
    subtitle: "Your way through is also its way through.",
    hint: "Pick up the cube with E, carry it through your portals, then drop it onto the amber pressure plate to unlock the exit.",
    spawn: { x: 0, y: 0, z: 6.5 },
    gap: { minZ: -3, maxZ: 0 },
    cube: { x: -3, y: 0.55, z: 4 },
    button: { x: -3, y: 0, z: -7 },
    exit: { x: 5, y: 0, z: -8.6 },
    portalPanels: panels(),
  },
  {
    id: 3,
    title: "The long way around",
    subtitle: "Distance is a suggestion. Bring the answer with you.",
    hint: "The wider gap needs a portal connection. Bring the cube across, leave it on the amber plate, and reach the exit.",
    spawn: { x: 0, y: 0, z: 7.5 },
    gap: { minZ: -2, maxZ: 2 },
    cube: { x: 3, y: 0.55, z: 6 },
    button: { x: -4, y: 0, z: -7 },
    exit: { x: 5, y: 0, z: -8.6 },
    portalPanels: panels(),
  },
];

export type GameState = {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  portals: [Portal | null, Portal | null];
  cube: Vec3 | null;
  held: boolean;
  doorOpen: boolean;
  completed: boolean;
  teleports: number;
  elapsed: number;
  grounded: boolean;
};

export type GameInput = { forward: number; strafe: number; jump: boolean };

export const EYE_HEIGHT = 1.6;
export const PORTAL_HALF_WIDTH = 0.76;
export const PORTAL_HALF_HEIGHT = 1.28;
const PLAYER_RADIUS = 0.3;
const CUBE_HALF = 0.55;
const GRAVITY = 18;
const WALK_SPEED = 4.6;
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const copy = (v: Vec3): Vec3 => ({ ...v });
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const finiteVector = (v: Vec3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const difference = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

/** Rotate around the same Y axis used by a Three.js camera. */
function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

/** Map a point and momentum between portal frames, including the turn out of the exit. */
export function transformThroughPortal(
  position: Vec3,
  velocity: Vec3,
  yaw: number,
  entry: Portal,
  exit: Portal,
): { position: Vec3; velocity: Vec3; yaw: number } {
  const angle =
    Math.atan2(-exit.normal.x, -exit.normal.z) -
    Math.atan2(entry.normal.x, entry.normal.z);
  const local = rotateY(difference(position, entry.position), angle);
  return {
    position: {
      x: exit.position.x + local.x,
      y: exit.position.y + local.y,
      z: exit.position.z + local.z,
    },
    velocity: rotateY(velocity, angle),
    yaw: yaw + angle,
  };
}

export class Game {
  readonly level: Level;
  state: GameState;
  onEvent: (event: string) => void = () => {};
  private cubeVelocity = zero();
  private portalCooldown = 0;
  private jumpHeld = false;

  constructor(levelIndex = 0) {
    this.level =
      LEVELS[
        clamp(
          Math.trunc(Number.isFinite(levelIndex) ? levelIndex : 0),
          0,
          LEVELS.length - 1,
        )
      ]!;
    this.state = this.initialState();
  }

  private initialState(): GameState {
    return {
      position: copy(this.level.spawn),
      velocity: zero(),
      yaw: 0,
      pitch: 0,
      portals: [null, null],
      cube: this.level.cube ? copy(this.level.cube) : null,
      held: false,
      doorOpen: this.level.button === null,
      completed: false,
      teleports: 0,
      elapsed: 0,
      grounded: true,
    };
  }

  reset(): void {
    this.state = this.initialState();
    this.cubeVelocity = zero();
    this.portalCooldown = 0;
    this.jumpHeld = false;
  }

  setPortal(index: 0 | 1, portal: Portal): boolean {
    if (
      !finiteVector(portal.position) ||
      !finiteVector(portal.normal) ||
      Math.abs(portal.normal.y) > 0.01
    )
      return false;
    const length = Math.hypot(portal.normal.x, portal.normal.z);
    if (length < 0.01) return false;
    const normal = {
      x: portal.normal.x / length,
      y: 0,
      z: portal.normal.z / length,
    };
    const panel = this.level.portalPanels.find((candidate) => {
      const local = difference(portal.position, candidate.position);
      const horizontal = Math.abs(local.x * normal.z - local.z * normal.x);
      return (
        dot(normal, candidate.normal) > 0.99 &&
        Math.abs(dot(local, normal)) < 0.2 &&
        horizontal + PORTAL_HALF_WIDTH <= candidate.width / 2 + 0.001 &&
        Math.abs(local.y) + PORTAL_HALF_HEIGHT <= candidate.height / 2 + 0.001
      );
    });
    if (!panel) return false;
    const other = this.state.portals[index === 0 ? 1 : 0];
    if (other && dot(normal, other.normal) > 0.99) {
      const offset = difference(portal.position, other.position);
      const horizontal = Math.abs(offset.x * normal.z - offset.z * normal.x);
      if (
        Math.abs(dot(offset, normal)) < 0.3 &&
        horizontal < PORTAL_HALF_WIDTH * 2 + 0.12 &&
        Math.abs(offset.y) < PORTAL_HALF_HEIGHT * 2
      )
        return false;
    }
    // Store our own values so render-side objects cannot mutate portal physics.
    this.state.portals[index] = { position: copy(portal.position), normal };
    this.onEvent(index === 0 ? "portal-blue" : "portal-orange");
    return true;
  }

  interact(): boolean {
    const s = this.state;
    if (!s.cube || s.completed) return false;
    if (s.held) {
      s.held = false;
      this.cubeVelocity = {
        x: s.velocity.x * 0.3,
        y: 0,
        z: s.velocity.z * 0.3,
      };
      this.onEvent("drop");
      return true;
    }
    const eye = { ...s.position, y: s.position.y + EYE_HEIGHT };
    const offset = difference(s.cube, eye);
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    if (
      distance > 2.7 ||
      (distance > 0.01 && dot(offset, this.lookDirection()) / distance < 0.25)
    )
      return false;
    s.held = true;
    this.cubeVelocity = zero();
    this.placeHeldCube();
    this.updateDoor();
    this.onEvent("pickup");
    return true;
  }

  update(dt: number, input: GameInput): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.state.completed) return;
    // Ignore tab-suspension time; subdivision keeps wall and portal crossings stable.
    let remaining = Math.min(dt, 0.1);
    let jump = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 120);
      this.step(step, { ...input, jump });
      jump = false;
      remaining -= step;
      if (this.state.completed) break;
    }
  }

  private step(dt: number, input: GameInput): void {
    const s = this.state;
    s.elapsed += dt;
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const forward = Number.isFinite(input.forward) ? input.forward : 0;
    const strafe = Number.isFinite(input.strafe) ? input.strafe : 0;
    const magnitude = Math.max(1, Math.hypot(forward, strafe));
    const target = rotateY(
      {
        x: (strafe / magnitude) * WALK_SPEED,
        y: 0,
        z: (-forward / magnitude) * WALK_SPEED,
      },
      s.yaw,
    );
    const acceleration = s.grounded ? 35 : 8;
    const blend = 1 - Math.exp(-acceleration * dt);
    s.velocity.x += (target.x - s.velocity.x) * blend;
    s.velocity.z += (target.z - s.velocity.z) * blend;
    if (input.jump && s.grounded) {
      s.velocity.y = 4.15;
      s.grounded = false;
      this.onEvent("jump");
    }
    s.velocity.y -= GRAVITY * dt;
    let next = {
      x: s.position.x + s.velocity.x * dt,
      y: s.position.y + s.velocity.y * dt,
      z: s.position.z + s.velocity.z * dt,
    };
    const teleported = this.tryTeleport(next);
    if (teleported) next = teleported;
    const boundedX = clamp(next.x, -8 + PLAYER_RADIUS, 8 - PLAYER_RADIUS);
    const boundedZ = clamp(next.z, -10 + PLAYER_RADIUS, 10 - PLAYER_RADIUS);
    if (boundedX !== next.x) s.velocity.x = 0;
    if (boundedZ !== next.z) s.velocity.z = 0;
    next.x = boundedX;
    next.z = boundedZ;
    if (next.y > 7 - EYE_HEIGHT - 0.2) {
      next.y = 7 - EYE_HEIGHT - 0.2;
      s.velocity.y = Math.min(s.velocity.y, 0);
    }
    s.grounded = this.hasFloor(next.z) && next.y <= 0 && s.position.y > -0.3;
    if (s.grounded) {
      next.y = 0;
      s.velocity.y = 0;
    }
    s.position = next;
    if (s.position.y < -7) this.respawn();
    if (s.held) this.placeHeldCube();
    else this.updateCube(dt);
    this.updateDoor();
    if (
      s.doorOpen &&
      s.position.y >= -0.1 &&
      s.position.y < 1 &&
      Math.hypot(
        s.position.x - this.level.exit.x,
        s.position.z - this.level.exit.z,
      ) < 1.1
    ) {
      s.completed = true;
      this.onEvent("complete");
    }
  }

  private tryTeleport(next: Vec3): Vec3 | null {
    if (this.portalCooldown > 0) return null;
    const s = this.state;
    for (const index of [0, 1] as const) {
      const entry = s.portals[index];
      const exit = s.portals[index === 0 ? 1 : 0];
      if (!entry || !exit) continue;
      const before = dot(difference(s.position, entry.position), entry.normal);
      const after = dot(difference(next, entry.position), entry.normal);
      const triggerDistance = PLAYER_RADIUS + 0.08;
      if (before < 0 || after > triggerDistance || after >= before) continue;
      const local = difference(next, entry.position);
      const horizontal = Math.abs(
        local.x * entry.normal.z - local.z * entry.normal.x,
      );
      const bodyCenterY = next.y + EYE_HEIGHT * 0.52;
      if (
        horizontal > PORTAL_HALF_WIDTH - PLAYER_RADIUS * 0.45 ||
        Math.abs(bodyCenterY - entry.position.y) > PORTAL_HALF_HEIGHT - 0.35
      )
        continue;
      // Project onto the surface before mapping, then clear the exit wall.
      const onPlane = {
        x: next.x - entry.normal.x * after,
        y: next.y,
        z: next.z - entry.normal.z * after,
      };
      const transformed = transformThroughPortal(
        onPlane,
        s.velocity,
        s.yaw,
        entry,
        exit,
      );
      transformed.position.x += exit.normal.x * 0.66;
      transformed.position.z += exit.normal.z * 0.66;
      s.velocity = transformed.velocity;
      s.yaw = transformed.yaw;
      this.portalCooldown = 0.23;
      s.teleports += 1;
      this.onEvent("teleport");
      return transformed.position;
    }
    return null;
  }

  private hasFloor(z: number): boolean {
    return z <= this.level.gap.minZ || z >= this.level.gap.maxZ;
  }

  private lookDirection(): Vec3 {
    const cp = Math.cos(this.state.pitch);
    return {
      x: -Math.sin(this.state.yaw) * cp,
      y: Math.sin(this.state.pitch),
      z: -Math.cos(this.state.yaw) * cp,
    };
  }

  private placeHeldCube(): void {
    const s = this.state;
    if (!s.cube) return;
    const look = this.lookDirection();
    s.cube = {
      x: clamp(s.position.x + look.x * 1.65, -8 + CUBE_HALF, 8 - CUBE_HALF),
      y: clamp(
        s.position.y + EYE_HEIGHT + look.y * 1.65 - 0.25,
        CUBE_HALF,
        7 - CUBE_HALF,
      ),
      z: clamp(s.position.z + look.z * 1.65, -10 + CUBE_HALF, 10 - CUBE_HALF),
    };
  }

  private updateCube(dt: number): void {
    const cube = this.state.cube;
    if (!cube) return;
    this.cubeVelocity.y -= GRAVITY * dt;
    cube.x = clamp(
      cube.x + this.cubeVelocity.x * dt,
      -8 + CUBE_HALF,
      8 - CUBE_HALF,
    );
    cube.z = clamp(
      cube.z + this.cubeVelocity.z * dt,
      -10 + CUBE_HALF,
      10 - CUBE_HALF,
    );
    cube.y += this.cubeVelocity.y * dt;
    if (this.hasFloor(cube.z) && cube.y <= CUBE_HALF && cube.y > -0.3) {
      cube.y = CUBE_HALF;
      this.cubeVelocity.y = 0;
      this.cubeVelocity.x *= Math.exp(-12 * dt);
      this.cubeVelocity.z *= Math.exp(-12 * dt);
    }
    if (cube.y < -7) {
      this.state.cube = this.level.cube ? copy(this.level.cube) : null;
      this.cubeVelocity = zero();
      this.onEvent("cube-reset");
    }
  }

  private updateDoor(): void {
    const s = this.state;
    const button = this.level.button;
    const open =
      !button ||
      Boolean(
        s.cube &&
        !s.held &&
        Math.abs(s.cube.y - CUBE_HALF) < 0.06 &&
        Math.hypot(s.cube.x - button.x, s.cube.z - button.z) < 0.86,
      );
    if (s.doorOpen !== open) {
      s.doorOpen = open;
      this.onEvent("door");
    }
  }

  private respawn(): void {
    const s = this.state;
    s.position = copy(this.level.spawn);
    s.velocity = zero();
    s.grounded = true;
    if (s.held) {
      s.held = false;
      s.cube = this.level.cube ? copy(this.level.cube) : null;
      this.cubeVelocity = zero();
    }
    this.portalCooldown = 0.2;
    this.onEvent("respawn");
  }
}
