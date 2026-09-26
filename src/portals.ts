import * as THREE from "three";
import { transformThroughPortal, type Portal } from "./game";

export class PortalRenderer {
  readonly groups: [THREE.Group, THREE.Group];
  private targets: THREE.WebGLRenderTarget[];
  private surfaces: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>[] =
    [];
  private camera = new THREE.PerspectiveCamera();
  private width = 1;
  private height = 1;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
  ) {
    this.targets = [0, 1].map(
      () =>
        new THREE.WebGLRenderTarget(512, 512, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        }),
    );
    this.groups = [0, 1].map((index) => {
      const color = new THREE.Color(index === 0 ? "#48dfff" : "#ff9850");
      const group = new THREE.Group();
      const material = new THREE.ShaderMaterial({
        uniforms: {
          view: { value: this.targets[index].texture },
          viewport: { value: new THREE.Vector2(1, 1) },
          color: { value: color },
          time: { value: 0 },
          linked: { value: false },
        },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform sampler2D view;uniform vec2 viewport;uniform vec3 color;uniform float time;uniform bool linked;varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=length(p);float edge=smoothstep(.65,1.,r);float wave=sin(r*27.-time*2.8+atan(p.y,p.x)*3.);vec3 base=linked?texture2D(view,gl_FragCoord.xy/viewport).rgb:mix(vec3(.012,.035,.05),color*.25,(wave+1.)*.5);gl_FragColor=vec4(mix(base,color,edge*.48),1.);}`,
        toneMapped: false,
      });
      const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 80), material);
      surface.scale.set(0.755, 1.28, 1);
      group.add(surface);
      this.surfaces.push(surface);
      for (let layer = 0; layer < 3; layer++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(
            1,
            layer === 0 ? 0.021 : 0.032 + layer * 0.018,
            8,
            96,
          ),
          new THREE.MeshBasicMaterial({
            color,
            transparent: layer > 0,
            opacity: layer === 0 ? 1 : 0.17 / layer,
            depthWrite: layer === 0,
          }),
        );
        ring.scale.set(0.77, 1.3, 1);
        ring.position.z = 0.012 - layer * 0.003;
        group.add(ring);
      }
      const light = new THREE.PointLight(color, 6, 4, 2);
      light.position.z = 0.6;
      group.add(light);
      scene.add(group);
      return group;
    }) as [THREE.Group, THREE.Group];
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const resolution = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.surfaces.forEach((surface) =>
      surface.material.uniforms.viewport.value.copy(resolution),
    );
    const scale = Math.min(1, 1000 / width);
    this.targets.forEach((target) =>
      target.setSize(Math.floor(width * scale), Math.floor(height * scale)),
    );
  }

  update(portals: [Portal | null, Portal | null], time: number) {
    this.groups.forEach((group, index) => {
      const portal = portals[index];
      group.visible = Boolean(portal);
      if (portal) {
        group.position.set(
          portal.position.x + portal.normal.x * 0.036,
          portal.position.y,
          portal.position.z + portal.normal.z * 0.036,
        );
        group.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(portal.normal.x, portal.normal.y, portal.normal.z),
        );
      }
      this.surfaces[index].material.uniforms.time.value = time;
      this.surfaces[index].material.uniforms.linked.value = Boolean(
        portals[0] && portals[1],
      );
    });
  }

  render(
    camera: THREE.PerspectiveCamera,
    portals: [Portal | null, Portal | null],
    hiddenObject: THREE.Object3D,
  ) {
    if (!portals[0] || !portals[1]) return;
    const priorVisible = hiddenObject.visible;
    hiddenObject.visible = false;
    this.groups.forEach((group) => {
      group.visible = false;
    });
    camera.updateMatrixWorld();
    for (const index of [0, 1] as const) {
      const entry = portals[index]!;
      const exit = portals[index === 0 ? 1 : 0]!;
      const facing = new THREE.Vector3()
        .subVectors(
          camera.position,
          new THREE.Vector3(
            entry.position.x,
            entry.position.y,
            entry.position.z,
          ),
        )
        .dot(new THREE.Vector3(entry.normal.x, entry.normal.y, entry.normal.z));
      if (facing < 0) continue;
      const mapped = transformThroughPortal(
        camera.position,
        { x: 0, y: 0, z: 0 },
        0,
        entry,
        exit,
      );
      this.camera.copy(camera, false);
      this.camera.position.set(
        mapped.position.x,
        mapped.position.y,
        mapped.position.z,
      );
      this.camera.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          mapped.yaw,
        ),
      );
      this.camera.updateMatrixWorld();
      const normal = new THREE.Vector3(
        exit.normal.x,
        exit.normal.y,
        exit.normal.z,
      );
      this.renderer.clippingPlanes = [
        new THREE.Plane(
          normal,
          -normal.dot(
            new THREE.Vector3(
              exit.position.x,
              exit.position.y,
              exit.position.z,
            ),
          ) - 0.07,
        ),
      ];
      this.renderer.setRenderTarget(this.targets[index]);
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.clippingPlanes = [];
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.groups.forEach((group) => {
      group.visible = true;
    });
    hiddenObject.visible = priorVisible;
  }
}
