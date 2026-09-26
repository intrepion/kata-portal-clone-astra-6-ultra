import * as THREE from "three";
import type { Level } from "./game";

/** The chamber is built entirely from geometry and canvas typography. */
export function buildWorld(scene: THREE.Scene, level: Level) {
  const group = new THREE.Group();
  group.name = `Chamber ${level.id}`;
  scene.add(group);
  const textures: THREE.Texture[] = [];
  const standard = (
    color: THREE.ColorRepresentation,
    roughness = 0.8,
    metalness = 0,
  ) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const ivory = standard("#c9cec8");
  const ivoryLight = standard("#d9dcd3");
  const ivoryDark = standard("#aeb7b3");
  const floorMaterial = standard("#82928e", 0.94);
  const dark = standard("#263936", 0.7, 0.15);
  const black = standard("#142420", 0.55, 0.25);
  const steel = standard("#778d86", 0.4, 0.7);
  const orange = standard("#f2a147", 0.7);
  const cyan = new THREE.MeshStandardMaterial({
    color: "#7edecb",
    emissive: "#55d8c0",
    emissiveIntensity: 2,
  });
  const whiteLight = new THREE.MeshStandardMaterial({
    color: "#f4fff1",
    emissive: "#edffe7",
    emissiveIntensity: 3.5,
  });
  const amberLight = new THREE.MeshStandardMaterial({
    color: "#ffb650",
    emissive: "#f89b33",
    emissiveIntensity: 1.1,
  });

  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    parent: THREE.Object3D = group,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function texture(
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    textures.push(result);
    return result;
  }

  function label(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    map: THREE.Texture,
    normal = new THREE.Vector3(0, 0, 1),
    parent: THREE.Object3D = group,
  ) {
    const material = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.83,
      transparent: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    parent.add(mesh);
    return mesh;
  }

  function pipe(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius = 0.055,
    material: THREE.Material = steel,
  ) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
      material,
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Deliberate, broad seams keep the architecture legible at game resolution.
  box(16.2, 7.2, 0.18, 0, 3.5, -10.1, dark);
  box(16.2, 7.2, 0.18, 0, 3.5, 10.1, dark);
  box(0.18, 7.2, 20.2, -8.1, 3.5, 0, dark);
  box(0.18, 7.2, 20.2, 8.1, 3.5, 0, dark);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      const m =
        (row + col) % 5 === 0
          ? ivoryDark
          : (row + col) % 3 === 0
            ? ivoryLight
            : ivory;
      box(1.975, 2.07, 0.085, -7 + col * 2, 1.5 + row * 2.1, -10.025, m);
      box(1.975, 2.07, 0.085, -7 + col * 2, 1.5 + row * 2.1, 10.025, m);
    }
    for (let col = 0; col < 10; col++) {
      const m = (row * 3 + col) % 6 === 0 ? ivoryDark : ivory;
      box(0.085, 2.07, 1.975, -8.025, 1.5 + row * 2.1, -9 + col * 2, m);
      box(0.085, 2.07, 1.975, 8.025, 1.5 + row * 2.1, -9 + col * 2, m);
    }
  }
  for (const x of [-7.97, 7.97]) {
    box(0.08, 0.44, 20, x, 0.2, 0, dark);
    box(0.05, 0.055, 20, x > 0 ? x - 0.015 : x + 0.015, 0.44, 0, steel);
    box(0.08, 0.035, 19.9, x > 0 ? x - 0.055 : x + 0.055, 0.49, 0, cyan);
    box(0.24, 0.22, 20, x, 6.55, 0, dark);
  }
  box(16, 0.44, 0.08, 0, 0.2, -9.97, dark);
  box(16, 0.44, 0.08, 0, 0.2, 9.97, dark);

  const gap = level.gap;
  const hasGap = gap.maxZ > gap.minZ;
  // Generate whole rectangular tiles and clip the two edges against the pit.
  for (let x = -8; x < 8; x += 2) {
    for (let z = -10; z < 10; z += 2) {
      const sections = hasGap
        ? [
            [z, Math.min(z + 2, gap.minZ)],
            [Math.max(z, gap.maxZ), z + 2],
          ]
        : [[z, z + 2]];
      for (const [start, end] of sections) {
        if (end - start <= 0.025) continue;
        const mat = (x + z + 24) % 6 === 0 ? ivoryDark : floorMaterial;
        box(
          1.977,
          0.24,
          end - start - 0.024,
          x + 1,
          -0.12,
          (start + end) / 2,
          mat,
        );
      }
    }
  }
  // Small metal corner fixings add scale without noisy photographic textures.
  for (let x = -7.85; x < 8; x += 4) {
    for (let z = -9.85; z < 10; z += 4) {
      if (hasGap && z > gap.minZ && z < gap.maxZ) continue;
      box(0.045, 0.004, 0.045, x, 0.003, z, dark);
    }
  }

  if (hasGap) {
    const hazardTexture = texture(256, 64, (ctx) => {
      ctx.fillStyle = "#e6a845";
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = "#29352f";
      for (let i = -64; i < 320; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 32, 0);
        ctx.lineTo(i + 96, 64);
        ctx.lineTo(i + 64, 64);
        ctx.fill();
      }
    });
    hazardTexture.wrapS = THREE.RepeatWrapping;
    hazardTexture.repeat.set(8, 1);
    const hazardMaterial = new THREE.MeshStandardMaterial({
      map: hazardTexture,
      roughness: 0.9,
    });
    for (const [z, direction] of [
      [gap.minZ, -1],
      [gap.maxZ, 1],
    ]) {
      box(16, 0.55, 0.14, 0, -0.26, z, dark);
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 0.3),
        hazardMaterial,
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.007, z + direction * 0.21);
      group.add(strip);
      box(15.9, 0.055, 0.04, 0, -0.24, z + direction * -0.075, amberLight);
      box(16, 4, 0.15, 0, -2.5, z, black);
    }
    box(16, 0.3, gap.maxZ - gap.minZ, 0, -5, (gap.maxZ + gap.minZ) / 2, black);
    for (const x of [-6, -2, 2, 6]) {
      pipe(
        new THREE.Vector3(x, -2.7, gap.minZ),
        new THREE.Vector3(x, -2.7, gap.maxZ),
        0.14,
        dark,
      );
      box(
        0.3,
        0.025,
        gap.maxZ - gap.minZ,
        x,
        -2.53,
        (gap.minZ + gap.maxZ) / 2,
        amberLight,
      );
    }
  }

  // Roof coffers, suspended light rails, and utility runs.
  box(16, 0.15, 20, 0, 7.08, 0, ivoryDark);
  for (const z of [-8, -4, 0, 4, 8]) {
    box(16, 0.24, 0.19, 0, 6.89, z, dark);
    for (const x of [-4.9, 4.9]) {
      box(0.67, 0.13, 2.9, x, 6.75, z + 0.55, dark);
      box(0.49, 0.025, 2.67, x, 6.671, z + 0.55, whiteLight);
      box(0.035, 0.16, 0.06, x - 0.25, 6.83, z - 0.5, steel);
      box(0.035, 0.16, 0.06, x + 0.25, 6.83, z + 1.5, steel);
    }
  }
  for (const x of [-7.4, -7.05]) {
    pipe(
      new THREE.Vector3(x, 6.4, -9.8),
      new THREE.Vector3(x, 6.4, 9.8),
      x === -7.4 ? 0.115 : 0.07,
    );
    for (const z of [-8, -4, 0, 4, 8]) {
      const clamp = new THREE.Mesh(
        new THREE.TorusGeometry(x === -7.4 ? 0.13 : 0.083, 0.025, 6, 12),
        dark,
      );
      clamp.position.set(x, 6.4, z);
      group.add(clamp);
      box(0.065, 0.3, 0.07, x, 6.69, z, steel);
    }
  }

  const hemi = new THREE.HemisphereLight("#eff9ea", "#556c67", 2.8);
  group.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d3", 3.5);
  sun.position.set(2, 6.4, 5);
  sun.target.position.set(-5, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -13;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 32;
  sun.shadow.normalBias = 0.028;
  sun.shadow.bias = -0.00015;
  group.add(sun, sun.target);
  const fill = new THREE.PointLight("#a2eedc", 25, 17, 2);
  fill.position.set(-5, 4, -6);
  group.add(fill);
  const warm = new THREE.PointLight("#fff0cc", 18, 17, 2);
  warm.position.set(4, 4.8, 6);
  group.add(warm);

  // A deeply framed observation window brings a second scale to the room.
  box(0.18, 2.23, 6.38, 7.92, 4.45, 3.1, dark);
  box(0.035, 1.94, 6.02, 7.805, 4.45, 3.1, black);
  const windowMat = new THREE.MeshStandardMaterial({
    color: "#41635c",
    metalness: 0.65,
    roughness: 0.27,
    emissive: "#233f34",
    emissiveIntensity: 0.4,
  });
  box(0.025, 1.84, 5.88, 7.777, 4.45, 3.1, windowMat);
  for (const z of [0.22, 1.66, 3.1, 4.54, 5.98]) {
    box(0.06, 1.97, 0.05, 7.74, 4.45, z, steel);
  }
  for (const y of [3.82, 4.46, 5.08])
    box(0.06, 0.022, 5.88, 7.739, y, 3.1, steel);
  box(0.3, 0.13, 6.48, 7.74, 3.3, 3.1, ivoryLight);
  box(0.06, 0.035, 6.14, 7.74, 5.63, 3.1, whiteLight);

  const brand = texture(1536, 384, (ctx) => {
    ctx.fillStyle = "#d1d7cb";
    ctx.fillRect(0, 0, 1536, 384);
    ctx.fillStyle = "#233c36";
    ctx.font = "600 150px Arial, sans-serif";
    ctx.fillText("PARALLAX", 72, 190);
    ctx.font = "500 35px Arial, sans-serif";
    ctx.fillText("S P A T I A L   R E S E A R C H   D I V I S I O N", 81, 267);
    ctx.fillStyle = "#487e6a";
    ctx.fillRect(82, 301, 1275, 5);
    ctx.font = "28px monospace";
    ctx.fillText("EST. 1987   /   PERCEPTION IS A VARIABLE", 82, 350);
  });
  label(5.8, 1.45, -3.1, 5.16, -9.91, brand);
  const chamberNumber = texture(768, 1024, (ctx) => {
    ctx.fillStyle = "#d5d9ce";
    ctx.fillRect(0, 0, 768, 1024);
    ctx.fillStyle = "#263e36";
    ctx.font = "500 36px Arial, sans-serif";
    ctx.fillText("T E S T  C H A M B E R", 47, 95);
    ctx.font = "bold 520px Arial, sans-serif";
    ctx.fillText(String(level.id).padStart(2, "0"), 18, 586);
    ctx.fillRect(47, 648, 672, 5);
    ctx.font = "bold 39px Arial, sans-serif";
    const title = level.title.toUpperCase();
    ctx.fillText(title.length > 24 ? title.slice(0, 24) : title, 47, 738, 674);
    ctx.font = "25px monospace";
    ctx.fillText("AUTHORIZED PERSONNEL ONLY", 47, 795);
    ctx.fillStyle = "#4e7f68";
    ctx.font = "78px Arial, sans-serif";
    ctx.fillText("↗  ◇  →", 47, 924);
    ctx.fillStyle = "#455d50";
    for (let i = 0; i < 78; i++)
      ctx.fillRect(520 + i * 2.2, 863, i % 3 === 0 ? 2 : 1, 62);
  });
  label(
    2.27,
    3.03,
    -7.913,
    3.91,
    -5.15,
    chamberNumber,
    new THREE.Vector3(1, 0, 0),
  );

  const instruction = texture(1024, 256, (ctx) => {
    ctx.fillStyle = "#293f36";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = "#e2e6d7";
    ctx.font = "bold 47px Arial, sans-serif";
    ctx.fillText("THINK OUTSIDE THE ROOM.", 41, 98);
    ctx.fillStyle = "#a9c8b1";
    ctx.font = "25px monospace";
    ctx.fillText("A DISTANCE IS ONLY A MATTER OF PERSPECTIVE.", 43, 163);
    ctx.fillStyle = "#e3ac4b";
    ctx.fillRect(43, 201, 162, 7);
  });
  label(4.8, 1.2, 1.3, 4.3, 9.91, instruction, new THREE.Vector3(0, 0, -1));

  // Each pale surface is also the exact target used by the portal raycast.
  const portalTargets: THREE.Mesh[] = [];
  level.portalPanels.forEach((panel, index) => {
    const assembly = new THREE.Group();
    assembly.position.set(panel.position.x, panel.position.y, panel.position.z);
    assembly.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(panel.normal.x, panel.normal.y, panel.normal.z),
    );
    group.add(assembly);
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: "#e2e6db",
      roughness: 0.95,
    });
    const target = new THREE.Mesh(
      new THREE.PlaneGeometry(panel.width, panel.height),
      panelMaterial,
    );
    target.receiveShadow = true;
    target.userData.panel = panel;
    assembly.add(target);
    portalTargets.push(target);
    box(
      panel.width + 0.16,
      0.065,
      0.065,
      0,
      panel.height / 2 + 0.045,
      -0.015,
      dark,
      assembly,
    );
    box(
      panel.width + 0.16,
      0.065,
      0.065,
      0,
      -panel.height / 2 + 0.045,
      -0.015,
      dark,
      assembly,
    );
    for (const side of [-1, 1]) {
      box(
        0.06,
        panel.height + 0.1,
        0.055,
        side * (panel.width / 2 + 0.045),
        0.02,
        -0.015,
        dark,
        assembly,
      );
      for (const y of [-panel.height / 2 + 0.16, panel.height / 2 - 0.16]) {
        box(
          0.12,
          0.028,
          0.01,
          side * (panel.width / 2 - 0.13),
          y,
          0.009,
          steel,
          assembly,
        );
        box(
          0.025,
          0.12,
          0.01,
          side * (panel.width / 2 - 0.13),
          y,
          0.009,
          steel,
          assembly,
        );
      }
    }
    for (const y of [-0.55, 0.55])
      box(panel.width - 0.02, 0.01, 0.003, 0, y, 0.002, ivoryDark, assembly);
    const panelLabel = texture(512, 64, (ctx) => {
      ctx.fillStyle = "#435c50";
      ctx.font = "22px monospace";
      ctx.fillText(
        `P-${String(index + 1).padStart(2, "0")}  /  SPATIAL CONDUCTOR`,
        8,
        42,
      );
    });
    label(
      1.75,
      0.22,
      0,
      panel.height / 2 + 0.22,
      0.01,
      panelLabel,
      new THREE.Vector3(0, 0, 1),
      assembly,
    );
  });

  // Portal-compatible transport cube; its group origin is its physical center.
  let cube: THREE.Group | null = null;
  if (level.cube) {
    cube = new THREE.Group();
    cube.position.set(level.cube.x, level.cube.y, level.cube.z);
    group.add(cube);
    const shape = new THREE.Shape();
    shape.moveTo(-0.44, -0.44);
    shape.lineTo(0.44, -0.44);
    shape.lineTo(0.44, 0.44);
    shape.lineTo(-0.44, 0.44);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.88,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.085,
      bevelThickness: 0.085,
    });
    geometry.translate(0, 0, -0.44);
    const body = new THREE.Mesh(geometry, ivoryLight);
    body.castShadow = true;
    body.receiveShadow = true;
    cube.add(body);
    for (const x of [-0.45, 0.45])
      for (const y of [-0.45, 0.45])
        for (const z of [-0.45, 0.45]) {
          box(0.2, 0.2, 0.2, x, y, z, dark, cube);
        }
    const faces = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    faces.forEach((normal, index) => {
      const face = new THREE.Group();
      face.position.copy(normal).multiplyScalar(0.532);
      face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      cube!.add(face);
      box(0.69, 0.69, 0.018, 0, 0, -0.004, ivoryDark, face);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.21, 40), dark);
      disc.position.z = 0.01;
      face.add(disc);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.195, 0.022, 8, 40),
        index % 3 === 0 ? amberLight : cyan,
      );
      ring.position.z = 0.021;
      face.add(ring);
      const hub = new THREE.Mesh(new THREE.CircleGeometry(0.078, 24), steel);
      hub.position.z = 0.025;
      face.add(hub);
      for (const x of [-0.275, 0.275])
        for (const y of [-0.275, 0.275])
          box(0.027, 0.027, 0.015, x, y, 0.016, dark, face);
    });
  }

  let button: THREE.Group | null = null;
  let buttonCap: THREE.Mesh | null = null;
  let buttonRing: THREE.Mesh | null = null;
  const capMaterial = new THREE.MeshStandardMaterial({
    color: "#ed9b43",
    roughness: 0.65,
    metalness: 0.15,
    emissive: "#6a350c",
    emissiveIntensity: 0.3,
  });
  if (level.button) {
    button = new THREE.Group();
    button.position.set(level.button.x, level.button.y, level.button.z);
    group.add(button);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.79, 0.12, 48),
      dark,
    );
    base.position.y = 0.06;
    base.receiveShadow = true;
    button.add(base);
    buttonRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.64, 0.022, 8, 64),
      amberLight,
    );
    buttonRing.rotation.x = Math.PI / 2;
    buttonRing.position.y = 0.124;
    button.add(buttonRing);
    buttonCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.58, 0.1, 48),
      capMaterial,
    );
    buttonCap.position.y = 0.16;
    buttonCap.castShadow = true;
    button.add(buttonCap);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const tick = box(
        0.065,
        0.006,
        0.14,
        Math.sin(angle) * 0.62,
        0.13,
        Math.cos(angle) * 0.62,
        steel,
        button,
      );
      tick.rotation.y = angle;
    }
    // A clear signal track links the switch and the door along the floor.
    const dx = level.exit.x - level.button.x;
    const dz = level.exit.z - level.button.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    for (let i = 0.9; i < length - 0.6; i += 0.45) {
      const ratio = i / length;
      const x = level.button.x + dx * ratio;
      const z = level.button.z + dz * ratio;
      if (hasGap && z > gap.minZ && z < gap.maxZ) continue;
      const dash = box(0.075, 0.012, 0.18, x, 0.012, z, amberLight);
      dash.rotation.y = Math.atan2(dx, dz);
    }
  }

  const door = new THREE.Group();
  door.position.set(level.exit.x, 0, -9.77);
  group.add(door);
  box(3.24, 3.95, 0.16, 0, 1.97, -0.08, dark, door);
  box(2.65, 3.43, 0.05, 0, 1.72, 0.03, black, door);
  const hallTexture = texture(512, 768, (ctx) => {
    ctx.fillStyle = "#142e24";
    ctx.fillRect(0, 0, 512, 768);
    ctx.fillStyle = "#284f3b";
    ctx.beginPath();
    ctx.moveTo(0, 768);
    ctx.lineTo(172, 475);
    ctx.lineTo(340, 475);
    ctx.lineTo(512, 768);
    ctx.fill();
    ctx.strokeStyle = "#668c6c";
    ctx.lineWidth = 3;
    for (const x of [0, 128, 256, 384, 512]) {
      ctx.beginPath();
      ctx.moveTo(x, 768);
      ctx.lineTo(256 + (x - 256) * 0.28, 475);
      ctx.stroke();
    }
    ctx.strokeStyle = "#b2e5b3";
    ctx.lineWidth = 8;
    for (const x of [28, 484]) {
      ctx.beginPath();
      ctx.moveTo(x, 42);
      ctx.lineTo(x < 256 ? 172 : 340, 227);
      ctx.lineTo(x < 256 ? 172 : 340, 475);
      ctx.stroke();
    }
    ctx.fillStyle = "#bed7b5";
    ctx.font = "bold 72px Arial";
    ctx.textAlign = "center";
    ctx.fillText("→", 256, 386);
  });
  label(
    2.64,
    3.42,
    0,
    1.72,
    0.068,
    hallTexture,
    new THREE.Vector3(0, 0, 1),
    door,
  );
  for (const x of [-1.4, 1.4]) {
    box(0.13, 3.6, 0.21, x, 1.79, 0.11, steel, door);
    box(
      0.035,
      3.37,
      0.024,
      x + (x < 0 ? 0.082 : -0.082),
      1.72,
      0.235,
      cyan,
      door,
    );
  }
  box(2.93, 0.11, 0.28, 0, 3.56, 0.12, steel, door);
  box(2.89, 0.035, 0.35, 0, 0.018, 0.15, dark, door);
  const doorLeaves: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(side * 0.648, 0, 0.125);
    door.add(leaf);
    box(1.285, 3.4, 0.1, 0, 1.72, 0, ivoryDark, leaf);
    box(1.15, 0.09, 0.01, 0, 0.59, 0.057, dark, leaf);
    box(1.15, 0.025, 0.01, 0, 2.83, 0.057, steel, leaf);
    box(0.075, 0.7, 0.025, side * -0.49, 1.72, 0.075, dark, leaf);
    doorLeaves.push(leaf);
  }
  const exitSign = texture(1024, 176, (ctx) => {
    ctx.fillStyle = "#233f32";
    ctx.fillRect(0, 0, 1024, 176);
    ctx.fillStyle = "#d9e9c8";
    ctx.font = "bold 67px Arial";
    ctx.fillText("EXIT", 58, 110);
    ctx.font = "78px Arial";
    ctx.fillText("↗", 858, 117);
    ctx.fillStyle = "#7eb68a";
    ctx.font = "22px monospace";
    ctx.fillText("PROCEED TO NEXT CHAMBER", 290, 101);
  });
  label(3.2, 0.55, 0, 4.05, 0.11, exitSign, new THREE.Vector3(0, 0, 1), door);
  const exitIndicator = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 24),
    amberLight,
  );
  exitIndicator.position.set(1.8, 1.68, 0.07);
  door.add(exitIndicator);

  // Discrete surface details: vents, maintenance hatches, and warning plates.
  for (const z of [-7.7, 7.7]) {
    box(0.12, 0.85, 1.65, -7.93, 5.43, z, dark);
    for (let y = 5.12; y < 5.8; y += 0.105)
      box(0.135, 0.035, 1.46, -7.85, y, z, steel);
  }
  box(1.55, 1.05, 0.045, 0.5, 1.18, -9.94, ivoryDark);
  for (const x of [-0.15, 1.15])
    for (const y of [0.76, 1.61]) box(0.032, 0.032, 0.021, x, y, -9.903, dark);
  box(0.075, 0.31, 0.035, 1.04, 1.16, -9.89, dark);
  const caution = texture(512, 128, (ctx) => {
    ctx.fillStyle = "#d9ad58";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#343c2e";
    ctx.font = "bold 30px Arial";
    ctx.fillText("CAUTION: NON-EUCLIDEAN SPACE", 16, 51, 480);
    ctx.font = "20px monospace";
    ctx.fillText("KEEP ALL LIMBS IN THIS DIMENSION", 18, 91, 474);
  });
  label(1.85, 0.463, 7.918, 1.95, 7.5, caution, new THREE.Vector3(-1, 0, 0));

  let doorAmount = 0;
  let lastTime = -1;
  function update(time: number, doorOpen: boolean) {
    const dt =
      lastTime < 0 ? 1 / 60 : Math.min(0.08, Math.max(0, time - lastTime));
    lastTime = time;
    doorAmount = THREE.MathUtils.damp(doorAmount, doorOpen ? 1 : 0, 5, dt);
    doorLeaves[0].position.x = -0.648 - doorAmount * 1.13;
    doorLeaves[1].position.x = 0.648 + doorAmount * 1.13;
    exitIndicator.material = doorOpen ? cyan : amberLight;
    if (buttonCap) {
      buttonCap.position.y = 0.16 - doorAmount * 0.075;
      capMaterial.color.set(doorOpen ? "#87b98a" : "#ed9b43");
      capMaterial.emissive.set(doorOpen ? "#296b42" : "#6a350c");
      if (buttonRing) buttonRing.material = doorOpen ? cyan : amberLight;
    }
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    // Materials not used in every level are also owned by this chamber.
    for (const material of [
      ivory,
      ivoryLight,
      ivoryDark,
      floorMaterial,
      dark,
      black,
      steel,
      orange,
      cyan,
      whiteLight,
      amberLight,
      capMaterial,
    ]) {
      if (!materials.has(material)) material.dispose();
    }
    textures.forEach((map) => map.dispose());
    sun.shadow.map?.dispose();
    group.removeFromParent();
  }

  return { group, portalTargets, cube, door, button, update, dispose };
}
