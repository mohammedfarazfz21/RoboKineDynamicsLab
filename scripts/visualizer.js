/* ===================================================================
   RoboKineDynamics Lab — 3D Visualization Engine (visualizer.js)
   Three.js scene manager: renders robot models, grids, and overlays.
   Depends on: Three.js (CDN), OrbitControls (CDN), kinematics.js
   =================================================================== */

class RobotVisualizer {
  constructor(containerEl) {
    this.container = containerEl;
    this.scene     = null;
    this.camera    = null;
    this.renderer  = null;
    this.controls  = null;

    // Robot groups
    this.robotGroup   = null;
    this.frameHelpers = [];
    this.trajectoryLine = null;
    this.ghostTarget  = null;

    // Colors
    this.COLORS = {
      joint:    0x6366f1,
      link:     0x334155,
      link2:    0x475569,
      endEff:   0x22d3ee,
      grid:     0x1e293b,
      ground:   0x0f172a,
      frame_x:  0xff4444,
      frame_y:  0x44ff44,
      frame_z:  0x4488ff,
      traj:     0xfb7185,
      ghost:    0xfbbf24,
      wheel:    0x64748b,
      body:     0x475569,
      bodyTop:  0x6366f1
    };

    this._init();
    this._animate = this._animate.bind(this);
    this._animate();
  }

  // ── Initialization ──────────────────────────────────────────────

  _init() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e17);
    this.scene.fog = new THREE.FogExp2(0x0b0e17, 0.06);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
    this.camera.position.set(3, 2.5, 3);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 20;
    this.controls.target.set(0, 0.5, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.3);
    fillLight.position.set(-3, 4, -2);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x22d3ee, 0.4, 15);
    rimLight.position.set(-2, 3, 5);
    this.scene.add(rimLight);

    // Ground grid
    this._createGround();

    // Robot group placeholder
    this.robotGroup = new THREE.Group();
    this.scene.add(this.robotGroup);

    // Trajectory line (hidden by default — path tracing disabled)
    const trajGeo = new THREE.BufferGeometry();
    const trajMat = new THREE.LineBasicMaterial({ color: this.COLORS.traj, transparent: true, opacity: 0.6 });
    this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.trajectoryLine.visible = false; // trajectory path disabled
    this.scene.add(this.trajectoryLine);

    // IK ghost target
    const ghostGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: this.COLORS.ghost,
      emissive: this.COLORS.ghost,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7
    });
    this.ghostTarget = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostTarget.visible = false;
    this.scene.add(this.ghostTarget);

    // Transform Controls for IK
    this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 0.75;
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) {
          // Trigger IK solve when dragging ends
          if (this.onTargetMove) this.onTargetMove(this.ghostTarget.position);
      }
    });
    // Also trigger during change for real-time feel
    this.transformControls.addEventListener('change', () => {
        if (this.transformControls.dragging) {
            if (this.onTargetMove) this.onTargetMove(this.ghostTarget.position);
        }
    });
    this.scene.add(this.transformControls);

    // Resize handler
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  _createGround() {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: this.COLORS.ground,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(20, 40, this.COLORS.grid, this.COLORS.grid);
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    grid.position.y = 0.001;
    this.scene.add(grid);

    // Origin axes
    const axesHelper = new THREE.AxesHelper(0.5);
    axesHelper.position.y = 0.002;
    this.scene.add(axesHelper);
  }

  // ── Robot Building ──────────────────────────────────────────────

  /** Build the 3D model for the current robot type */
  buildRobot(robotId) {
    // Clear existing
    while (this.robotGroup.children.length) {
      const child = this.robotGroup.children[0];
      this.robotGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this.frameHelpers = [];

    if (robotId === 'diff_drive') {
      this._buildDiffDrive();
    } else {
      // Arm robots are built dynamically in updateArm()
    }
  }

  /** Update arm robot visualization from kinematics data */
  updateArm(jointPositions, jointRotations, config) {
    // Clear and rebuild each frame
    while (this.robotGroup.children.length) {
      const child = this.robotGroup.children[0];
      this.robotGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    this.frameHelpers = [];

    const n = jointPositions.length;
    const jointColors = [0x6366f1, 0x818cf8, 0x22d3ee, 0x34d399, 0xfbbf24, 0xfb7185, 0xa78bfa];

    for (let i = 0; i < n; i++) {
      const pos = jointPositions[i];

      // Joint sphere
      const jointGeo = new THREE.SphereGeometry(i === 0 ? 0.07 : 0.05, 20, 20);
      const jointMat = new THREE.MeshStandardMaterial({
        color: jointColors[i % jointColors.length],
        emissive: jointColors[i % jointColors.length],
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.6
      });
      const joint = new THREE.Mesh(jointGeo, jointMat);
      joint.position.set(pos[0], pos[1], pos[2]);
      joint.castShadow = true;
      this.robotGroup.add(joint);

      // Link cylinder (from previous joint to this one)
      if (i > 0) {
        const prev = jointPositions[i - 1];
        this._addLink(prev, pos, i - 1);
      }

      // --- DH Visualization (Step-wise transformations) ---
      // Adding coordinate frame at each joint
      const frameGroup = this._createCoordFrame(0.15);
      frameGroup.position.set(pos[0], pos[1], pos[2]);
      
      if (jointRotations && jointRotations[i]) {
        const rot = jointRotations[i];
        const m = new THREE.Matrix4();
        m.set(
          rot[0][0], rot[0][1], rot[0][2], 0,
          rot[1][0], rot[1][1], rot[1][2], 0,
          rot[2][0], rot[2][1], rot[2][2], 0,
          0, 0, 0, 1
        );
        frameGroup.setRotationFromMatrix(m);
      }
      this.robotGroup.add(frameGroup);
      this.frameHelpers.push(frameGroup);
      this.robotGroup.add(frameGroup);
      this.frameHelpers.push(frameGroup);
    }

    // End-effector indicator (glow ring)
    if (n > 1) {
      const eePos = jointPositions[n - 1];
      const eeRingGeo = new THREE.TorusGeometry(0.08, 0.01, 8, 32);
      const eeRingMat = new THREE.MeshStandardMaterial({
        color: this.COLORS.endEff,
        emissive: this.COLORS.endEff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.8
      });
      const eeRing = new THREE.Mesh(eeRingGeo, eeRingMat);
      eeRing.position.set(eePos[0], eePos[1], eePos[2]);
      eeRing.rotation.x = Math.PI / 2;
      this.robotGroup.add(eeRing);
    }
  }

  /** Add a cylindrical link between two points */
  _addLink(from, to, index) {
    const dir = new THREE.Vector3(
      to[0] - from[0],
      to[1] - from[1],
      to[2] - from[2]
    );
    const length = dir.length();
    if (length < 0.001) return;

    const linkGeo = new THREE.CylinderGeometry(0.025, 0.03, length, 12);
    const colors = [0x334155, 0x475569, 0x3b5998, 0x2d4a7a, 0x1e3a5f, 0x4a5568];
    const linkMat = new THREE.MeshStandardMaterial({
      color: colors[index % colors.length],
      roughness: 0.4,
      metalness: 0.7
    });
    const link = new THREE.Mesh(linkGeo, linkMat);
    link.castShadow = true;

    // Position at midpoint
    link.position.set(
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2
    );

    // Orient along direction
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, dir.normalize());
    link.setRotationFromQuaternion(quaternion);

    this.robotGroup.add(link);
  }

  /** Create RGB coordinate frame arrows */
  _createCoordFrame(size) {
    const group = new THREE.Group();
    const colors = [this.COLORS.frame_x, this.COLORS.frame_y, this.COLORS.frame_z];
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ];

    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.ArrowHelper(dirs[i], new THREE.Vector3(0,0,0), size, colors[i], size * 0.3, size * 0.15);
      group.add(arrow);
    }

    return group;
  }

  // ── Differential Drive ──────────────────────────────────────────

  _buildDiffDrive() {
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.1, 0.25);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.COLORS.body,
      roughness: 0.3,
      metalness: 0.7
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.08;
    body.castShadow = true;
    this.robotGroup.add(body);

    // Top panel (accent colored)
    const topGeo = new THREE.BoxGeometry(0.25, 0.02, 0.2);
    const topMat = new THREE.MeshStandardMaterial({
      color: this.COLORS.bodyTop,
      emissive: this.COLORS.bodyTop,
      emissiveIntensity: 0.2,
      roughness: 0.2,
      metalness: 0.8
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 0.14;
    top.castShadow = true;
    this.robotGroup.add(top);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: this.COLORS.wheel,
      roughness: 0.5,
      metalness: 0.5
    });

    const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(-0.16, 0.05, 0);
    this.robotGroup.add(leftWheel);

    const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(0.16, 0.05, 0);
    this.robotGroup.add(rightWheel);

    // Caster wheel
    const casterGeo = new THREE.SphereGeometry(0.025, 12, 12);
    const caster = new THREE.Mesh(casterGeo, wheelMat);
    caster.position.set(0, 0.025, -0.1);
    this.robotGroup.add(caster);

    // Direction arrow
    const arrowDir = new THREE.Vector3(0, 0, 1);
    const arrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(0, 0.15, 0), 0.2, this.COLORS.endEff, 0.06, 0.04);
    this.robotGroup.add(arrow);
  }

  /** Update diff drive pose */
  updateDiffDrive(pose) {
    this.robotGroup.position.set(pose.x, 0, pose.y);
    this.robotGroup.rotation.y = -pose.theta;
  }

  // ── Trajectory Visualization ────────────────────────────────────

  updateTrajectory(points) {
    if (!points || points.length < 2) {
      this.trajectoryLine.geometry.setFromPoints([]);
      return;
    }

    const vec3Points = points.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0));
    const geo = new THREE.BufferGeometry().setFromPoints(vec3Points);
    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.geometry = geo;
  }

  // ── IK Ghost Target ────────────────────────────────────────────

  showGhostTarget(pos) {
    this.ghostTarget.position.set(pos[0], pos[1], pos[2] || 0);
    this.ghostTarget.visible = true;
    if (this.transformControls) this.transformControls.attach(this.ghostTarget);
  }

  hideGhostTarget() {
    this.ghostTarget.visible = false;
    if (this.transformControls) this.transformControls.detach();
  }

  // ── Camera Controls ─────────────────────────────────────────────

  recenterCamera() {
    // Animate camera to default position
    const target = { x: 0, y: 0.5, z: 0 };
    const camPos = { x: 3, y: 2.5, z: 3 };

    // Simple lerp animation
    const startTarget = { ...this.controls.target };
    const startPos = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const duration = 500;
    const startTime = performance.now();

    const animateCamera = (time) => {
      const t = Math.min(1, (time - startTime) / duration);
      const ease = t * (2 - t); // ease-out quad

      this.camera.position.x = startPos.x + (camPos.x - startPos.x) * ease;
      this.camera.position.y = startPos.y + (camPos.y - startPos.y) * ease;
      this.camera.position.z = startPos.z + (camPos.z - startPos.z) * ease;

      this.controls.target.x = startTarget.x + (target.x - startTarget.x) * ease;
      this.controls.target.y = startTarget.y + (target.y - startTarget.y) * ease;
      this.controls.target.z = startTarget.z + (target.z - startTarget.z) * ease;

      this.controls.update();

      if (t < 1) requestAnimationFrame(animateCamera);
    };

    requestAnimationFrame(animateCamera);
  }

  /** Handle container resize */
  resize() {
    this._onResize();
  }

  // ── Animation Loop ──────────────────────────────────────────────

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ── Snapshots ──────────────────────────────────────────────────
  
  createSnapshot(jointPositions, jointRotations, config) {
    const snapshotGroup = new THREE.Group();
    snapshotGroup.name = 'snapshot_' + Date.now();
    
    const n = jointPositions.length;
    for (let i = 0; i < n; i++) {
      const pos = jointPositions[i];
      // Ghost joint
      const jointGeo = new THREE.SphereGeometry(i === 0 ? 0.07 : 0.05, 12, 12);
      const jointMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
      const joint = new THREE.Mesh(jointGeo, jointMat);
      joint.position.set(pos[0], pos[1], pos[2]);
      snapshotGroup.add(joint);

      // Ghost link
      if (i > 0) {
        const from = jointPositions[i-1];
        const to = pos;
        const dir = new THREE.Vector3(to[0]-from[0], to[1]-from[1], to[2]-from[2]);
        const length = dir.length();
        const linkGeo = new THREE.CylinderGeometry(0.015, 0.02, length, 8);
        const linkMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.2 });
        const link = new THREE.Mesh(linkGeo, linkMat);
        link.position.set((from[0]+to[0])/2, (from[1]+to[1])/2, (from[2]+to[2])/2);
        const up = new THREE.Vector3(0,1,0);
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(up, dir.normalize());
        link.setRotationFromQuaternion(q);
        snapshotGroup.add(link);
      }
    }
    
    this.scene.add(snapshotGroup);
    if (!this.snapshots) this.snapshots = [];
    this.snapshots.push(snapshotGroup);
    return snapshotGroup;
  }

  clearSnapshots() {
    if (this.snapshots) {
      this.snapshots.forEach(s => {
        this.scene.remove(s);
        s.children.forEach(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
      });
      this.snapshots = [];
    }
  }
}

// Export
window.RobotVisualizer = RobotVisualizer;
