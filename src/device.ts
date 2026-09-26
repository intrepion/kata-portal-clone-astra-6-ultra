import * as THREE from "three";
export function createDevice(camera: THREE.Camera) {
  const rig = new THREE.Group();
  rig.position.set(0.34, -0.31, -0.63);
  rig.rotation.set(0.07, -0.12, 0);
  const ceramic = new THREE.MeshStandardMaterial({
    color: "#e2e6df",
    roughness: 0.32,
    metalness: 0.2,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#203038",
    roughness: 0.5,
    metalness: 0.7,
  });
  const blue = new THREE.MeshBasicMaterial({ color: "#65e9f3" });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.12, 0.29, 5, 16),
    ceramic,
  );
  body.rotation.x = Math.PI / 2;
  rig.add(body);
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.086, 0.1, 0.16, 16),
    dark,
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = -0.25;
  rig.add(muzzle);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.007, 8, 24),
    blue,
  );
  ring.position.z = -0.333;
  rig.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 8), blue);
  core.position.z = -0.319;
  rig.add(core);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const prong = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.027, 0.25),
      dark,
    );
    prong.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, -0.25);
    prong.rotation.set(Math.sin(angle) * -0.15, Math.cos(angle) * 0.15, angle);
    rig.add(prong);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.1), dark);
  handle.position.set(0, -0.15, 0.11);
  handle.rotation.x = -0.22;
  rig.add(handle);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.014, 0.15), blue);
  top.position.set(0, 0.124, 0.035);
  rig.add(top);
  const lamp = new THREE.PointLight("#a2efff", 0.3, 0.8);
  lamp.position.set(0, 0.12, -0.2);
  rig.add(lamp);
  camera.add(rig);
  return {
    rig,
    setColor(index: 0 | 1) {
      blue.color.set(index === 0 ? "#65e9f3" : "#ffa161");
    },
    update(time: number, moving: boolean) {
      rig.position.y =
        -0.31 + Math.sin(time * (moving ? 9 : 1.5)) * (moving ? 0.008 : 0.003);
    },
  };
}
