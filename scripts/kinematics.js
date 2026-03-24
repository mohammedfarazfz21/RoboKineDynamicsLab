/* ===================================================================
   RoboKineDynamics Lab — Mathematical Engine (kinematics.js)
   Pure math module: FK, IK, Jacobian, workspace, dynamics.
   No DOM dependencies.
   =================================================================== */

// ── Utility Math ─────────────────────────────────────────────────────
const deg2rad = d => d * Math.PI / 180;
const rad2deg = r => r * 180 / Math.PI;
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 4×4 identity matrix (flat array, column-major for Three.js compat) */
function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

/** Multiply two 4×4 matrices (row-major) */
function mat4Mul(A, B) {
  const R = new Array(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      for (let k = 0; k < 4; k++)
        R[r*4+c] += A[r*4+k] * B[k*4+c];
  return R;
}

/** DH transformation matrix (row-major) */
function dhMatrix(theta, d, a, alpha) {
  const ct = Math.cos(theta), st = Math.sin(theta);
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  return [
    ct,  -st*ca,  st*sa,  a*ct,
    st,   ct*ca, -ct*sa,  a*st,
    0,    sa,     ca,     d,
    0,    0,      0,      1
  ];
}

/** Extract position [x, y, z] from a 4×4 row-major matrix */
function mat4Pos(M) { return [M[3], M[7], M[11]]; }

/** Extract 3×3 rotation from 4×4 row-major matrix */
function mat4Rot(M) {
  return [
    [M[0], M[1], M[2]],
    [M[4], M[5], M[6]],
    [M[8], M[9], M[10]]
  ];
}

/** Transpose NxN matrix (array of arrays) */
function transpose(M) {
  const n = M.length, m = M[0].length;
  const T = [];
  for (let j = 0; j < m; j++) {
    T[j] = [];
    for (let i = 0; i < n; i++) T[j][i] = M[i][j];
  }
  return T;
}

/** Dot product of two vectors */
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

/** Cross product of two 3-vectors */
function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

/** Vector subtraction */
function vsub(a, b) { return a.map((v, i) => v - b[i]); }

/** Vector norm */
function vnorm(v) { return Math.sqrt(v.reduce((s, x) => s + x*x, 0)); }

/** Scale vector */
function vscale(v, s) { return v.map(x => x * s); }

// ── Robot Definitions ────────────────────────────────────────────────

const ROBOT_LIBRARY = {

  '2R_planar': {
    name: '2R Planar Arm',
    description: 'A two-revolute-joint planar manipulator operating in the XY plane. Great for learning FK/IK basics.',
    dof: 2,
    type: 'arm',
    joints: [
      { name: 'θ₁', type: 'revolute', min: -180, max: 180, default: 45 },
      { name: 'θ₂', type: 'revolute', min: -180, max: 180, default: -30 }
    ],
    links: [
      { name: 'L₁', default: 1.0, min: 0.2, max: 3.0 },
      { name: 'L₂', default: 0.8, min: 0.2, max: 3.0 }
    ],
    // DH params are computed dynamically from joint angles & link lengths
    getDH(angles, lengths) {
      return [
        { theta: deg2rad(angles[0]), d: 0, a: lengths[0], alpha: 0 },
        { theta: deg2rad(angles[1]), d: 0, a: lengths[1], alpha: 0 }
      ];
    },
    masses: [1.0, 0.8],
    gravity: [0, -9.81, 0]
  },

  '3R_manipulator': {
    name: '3R Spatial Manipulator',
    description: 'A three-revolute-joint manipulator with joints rotating about Z, Y, and Y axes respectively.',
    dof: 3,
    type: 'arm',
    joints: [
      { name: 'θ₁', type: 'revolute', min: -180, max: 180, default: 0 },
      { name: 'θ₂', type: 'revolute', min: -180, max: 180, default: 45 },
      { name: 'θ₃', type: 'revolute', min: -180, max: 180, default: -30 }
    ],
    links: [
      { name: 'L₁', default: 0.5, min: 0.1, max: 2.0 },
      { name: 'L₂', default: 1.0, min: 0.2, max: 3.0 },
      { name: 'L₃', default: 0.8, min: 0.2, max: 3.0 }
    ],
    getDH(angles, lengths) {
      return [
        { theta: deg2rad(angles[0]), d: lengths[0], a: 0,          alpha: Math.PI/2 },
        { theta: deg2rad(angles[1]), d: 0,          a: lengths[1], alpha: 0 },
        { theta: deg2rad(angles[2]), d: 0,          a: lengths[2], alpha: 0 }
      ];
    },
    masses: [1.5, 1.0, 0.8],
    gravity: [0, -9.81, 0]
  },

  '6DOF_arm': {
    name: '6-DOF Articulated Arm',
    description: 'A six-degree-of-freedom articulated robot arm (similar to a PUMA 560). Full spatial dexterity.',
    dof: 6,
    type: 'arm',
    joints: [
      { name: 'θ₁', type: 'revolute', min: -180, max: 180, default: 0 },
      { name: 'θ₂', type: 'revolute', min: -135, max: 135, default: -30 },
      { name: 'θ₃', type: 'revolute', min: -135, max: 135, default: 60 },
      { name: 'θ₄', type: 'revolute', min: -180, max: 180, default: 0 },
      { name: 'θ₅', type: 'revolute', min: -120, max: 120, default: -45 },
      { name: 'θ₆', type: 'revolute', min: -180, max: 180, default: 0 }
    ],
    links: [
      { name: 'd₁', default: 0.4, min: 0.1, max: 1.0 },
      { name: 'a₂', default: 0.8, min: 0.2, max: 2.0 },
      { name: 'a₃', default: 0.6, min: 0.1, max: 1.5 },
      { name: 'd₄', default: 0.1, min: 0.0, max: 0.5 },
      { name: 'd₅', default: 0.0, min: 0.0, max: 0.3 },
      { name: 'd₆', default: 0.2, min: 0.05, max: 0.5 }
    ],
    getDH(angles, lengths) {
      return [
        { theta: deg2rad(angles[0]), d: lengths[0], a: 0,          alpha: Math.PI/2 },
        { theta: deg2rad(angles[1]), d: 0,          a: lengths[1], alpha: 0 },
        { theta: deg2rad(angles[2]), d: 0,          a: lengths[2], alpha: -Math.PI/2 },
        { theta: deg2rad(angles[3]), d: lengths[3], a: 0,          alpha: Math.PI/2 },
        { theta: deg2rad(angles[4]), d: lengths[4], a: 0,          alpha: -Math.PI/2 },
        { theta: deg2rad(angles[5]), d: lengths[5], a: 0,          alpha: 0 }
      ];
    },
    masses: [2.0, 1.5, 1.2, 0.8, 0.6, 0.4],
    gravity: [0, -9.81, 0]
  },

  'diff_drive': {
    name: 'Differential-Drive Robot',
    description: 'A two-wheeled mobile robot. Control left/right wheel velocities to move and turn.',
    dof: 2,
    type: 'mobile',
    joints: [
      { name: 'vₗ (m/s)',  type: 'velocity', min: -2, max: 2, default: 0.0 },
      { name: 'vᵣ (m/s)',  type: 'velocity', min: -2, max: 2, default: 0.0 }
    ],
    links: [
      { name: 'Wheel Radius', default: 0.05, min: 0.02, max: 0.15 },
      { name: 'Axle Length',   default: 0.3,  min: 0.1,  max: 0.8 }
    ],
    // Diff drive doesn't use DH but has its own kinematics
    wheelRadius: 0.05,
    axleLength: 0.3,
    mass: 2.0,
    gravity: [0, -9.81, 0]
  }
};

// ── RobotKinematics Class ────────────────────────────────────────────

class RobotKinematics {
  constructor(robotId) {
    this.setRobot(robotId);
  }

  /** Switch to a different robot model */
  setRobot(robotId) {
    this.robotId = robotId;
    this.config  = ROBOT_LIBRARY[robotId];
    this.dof     = this.config.dof;
    this.type    = this.config.type;

    // Current state
    this.angles  = this.config.joints.map(j => j.default);
    this.lengths = this.config.links.map(l => l.default);
    this.velocities = new Array(this.dof).fill(0);

    // Computed data (populated by update())
    this.jointTransforms = [];   // array of 4×4 row-major matrices
    this.endEffectorMat  = mat4Identity();
    this.endEffectorPos  = [0, 0, 0];
    this.jacobian        = [];
    this.trajectoryPath  = [];

    // Diff-drive specific
    if (this.type === 'mobile') {
      this.pose = { x: 0, y: 0, theta: 0 };
      this.mobilePath = [];
    }

    this.update();
  }

  /** Recompute all kinematics quantities */
  update() {
    if (this.type === 'arm') {
      this._computeFK();
      this._computeJacobian();
    } else {
      this._computeDiffDrive();
    }
  }

  // ── Forward Kinematics ──────────────────────────────────────────

  _computeFK() {
    const dhParams = this.config.getDH(this.angles, this.lengths);
    this.jointTransforms = [];
    let T = mat4Identity(); // base

    for (const dh of dhParams) {
      const Ti = dhMatrix(dh.theta, dh.d, dh.a, dh.alpha);
      T = mat4Mul(T, Ti);
      this.jointTransforms.push([...T]);
    }

    this.endEffectorMat = [...T];
    this.endEffectorPos = mat4Pos(T);

    // Record trajectory
    this.trajectoryPath.push([...this.endEffectorPos]);
    if (this.trajectoryPath.length > 1000) this.trajectoryPath.shift();
  }

  /** Get DH parameters table for display */
  getDHTable() {
    if (this.type !== 'arm') return [];
    return this.config.getDH(this.angles, this.lengths);
  }

  /** Get all joint positions (for 3D rendering) */
  getJointPositions() {
    if (this.type !== 'arm') return [];
    const positions = [[0, 0, 0]]; // base
    for (const T of this.jointTransforms) {
      positions.push(mat4Pos(T));
    }
    return positions;
  }

  /** Get joint rotation matrices */
  getJointRotations() {
    if (this.type !== 'arm') return [];
    const rotations = [[[1,0,0],[0,1,0],[0,0,1]]]; // base identity
    for (const T of this.jointTransforms) {
      rotations.push(mat4Rot(T));
    }
    return rotations;
  }

  // ── Inverse Kinematics ──────────────────────────────────────────

  /**
   * Solve IK for target position [x, y, z].
   * Returns joint angles (degrees) or null if unreachable.
   */
  solveIK(target) {
    if (this.robotId === '2R_planar') return this._ik2R(target);
    if (this.robotId === '3R_manipulator') return this._ik3R(target);
    return this._ikJacobianIterative(target);
  }

  /** Analytical IK for 2R planar arm */
  _ik2R(target) {
    const [px, py] = target;
    const l1 = this.lengths[0], l2 = this.lengths[1];
    const r2 = px*px + py*py;
    const cosTheta2 = (r2 - l1*l1 - l2*l2) / (2*l1*l2);

    if (Math.abs(cosTheta2) > 1) return null; // unreachable

    const sinTheta2 = Math.sqrt(1 - cosTheta2*cosTheta2); // elbow-up
    const theta2 = Math.atan2(sinTheta2, cosTheta2);
    const theta1 = Math.atan2(py, px) - Math.atan2(l2*sinTheta2, l1 + l2*cosTheta2);

    return [rad2deg(theta1), rad2deg(theta2)];
  }

  /** Analytical IK for 3R (position only, orientation ignored) */
  _ik3R(target) {
    const [px, py, pz] = target;
    const theta1 = Math.atan2(py, px);

    const r = Math.sqrt(px*px + py*py);
    const s = pz - this.lengths[0];
    const l2 = this.lengths[1], l3 = this.lengths[2];
    const d2 = r*r + s*s;
    const cosTheta3 = (d2 - l2*l2 - l3*l3) / (2*l2*l3);

    if (Math.abs(cosTheta3) > 1) return null;

    const sinTheta3 = Math.sqrt(1 - cosTheta3*cosTheta3);
    const theta3 = Math.atan2(sinTheta3, cosTheta3);
    const theta2 = Math.atan2(s, r) - Math.atan2(l3*sinTheta3, l2 + l3*cosTheta3);

    return [rad2deg(theta1), rad2deg(theta2), rad2deg(theta3)];
  }

  /** Iterative Jacobian pseudo-inverse IK (for 6-DOF) */
  _ikJacobianIterative(target, maxIter = 100, tol = 0.005) {
    const savedAngles = [...this.angles];
    let angles = [...this.angles];

    for (let i = 0; i < maxIter; i++) {
      this.angles = angles;
      this._computeFK();
      const pos = this.endEffectorPos;
      const err = vsub(target.slice(0, 3), pos);
      if (vnorm(err) < tol) {
        const result = [...angles];
        this.angles = savedAngles;
        this._computeFK();
        return result;
      }

      this._computeJacobian();
      const J = this.jacobian; // 3×n (position rows only)
      const Jt = transpose(J);
      // Δq = Jᵀ · (J·Jᵀ)⁻¹ · err  ≈  α · Jᵀ · err (damped)
      const step = Jt.map(row => 0.5 * dot(row, err));
      angles = angles.map((a, k) => a + rad2deg(step[k]));

      // Clamp to joint limits
      angles = angles.map((a, k) => clamp(a, this.config.joints[k].min, this.config.joints[k].max));
    }

    this.angles = savedAngles;
    this._computeFK();
    return null; // did not converge
  }

  // ── Jacobian ────────────────────────────────────────────────────

  _computeJacobian() {
    if (this.type !== 'arm') {
      this.jacobian = [];
      return;
    }
    const n = this.dof;
    const eps = 0.001; // finite‐difference step (radians → degrees)
    const J = [[], [], []]; // 3 rows (x, y, z)

    const basePos = [...this.endEffectorPos];

    for (let j = 0; j < n; j++) {
      const saved = this.angles[j];
      this.angles[j] = saved + rad2deg(eps);
      this._computeFK();
      const posPlus = [...this.endEffectorPos];
      this.angles[j] = saved;
      this._computeFK();

      for (let r = 0; r < 3; r++) {
        J[r][j] = (posPlus[r] - basePos[r]) / eps;
      }
    }

    this.jacobian = J;
  }

  /** Get Jacobian as a formatted 2D array for display */
  getJacobianMatrix() {
    return this.jacobian;
  }

  // ── Velocity Ellipsoid ──────────────────────────────────────────

  /**
   * Compute the velocity ellipsoid from J·Jᵀ.
   * Returns { radii: [r1,r2,r3], axes: [[ax1],[ax2],[ax3]] }
   */
  computeVelocityEllipsoid() {
    const J = this.jacobian;
    if (!J || J.length === 0) return null;

    const m = J.length; // 3
    const n = J[0].length;

    // A = J·Jᵀ (m×m)
    const A = [];
    for (let i = 0; i < m; i++) {
      A[i] = [];
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += J[i][k] * J[j][k];
        A[i][j] = s;
      }
    }

    // Simple eigenvalue estimation for 2×2 or 3×3
    // For 3×3 we use power iteration (simplified for real-time)
    const eigenvalues = this._eigenvalues3x3(A);
    const radii = eigenvalues.map(ev => Math.sqrt(Math.max(0, ev)));

    return { radii, A };
  }

  /** Approximate eigenvalues of a 3×3 symmetric matrix */
  _eigenvalues3x3(A) {
    const n = A.length;
    if (n === 0) return [];
    // Use Jacobi-like approach for small matrices
    const trace = A.reduce((s, row, i) => s + row[i], 0);
    const sum2 = A.reduce((s, row, i) =>
      s + row.reduce((s2, v, j) => s2 + (i !== j ? v*v : 0), 0), 0) / 2;

    if (n === 2) {
      const disc = Math.sqrt(Math.max(0, (A[0][0]-A[1][1])**2 + 4*A[0][1]**2));
      return [(trace + disc)/2, (trace - disc)/2];
    }

    // For 3×3, compute characteristic polynomial roots
    const q = trace / 3;
    const p2 = A.reduce((s, row, i) => s + row.reduce((s2, v, j) =>
      s2 + (i === j ? (v - q)**2 : v*v), 0), 0) / 6;
    const p = Math.sqrt(Math.max(0, p2));

    if (p < 1e-12) return [q, q, q];

    const B = A.map((row, i) => row.map((v, j) => (v - (i === j ? q : 0)) / p));
    const detB = B[0][0]*(B[1][1]*B[2][2]-B[1][2]*B[2][1])
               - B[0][1]*(B[1][0]*B[2][2]-B[1][2]*B[2][0])
               + B[0][2]*(B[1][0]*B[2][1]-B[1][1]*B[2][0]);
    const r = clamp(detB / 2, -1, 1);
    const phi = Math.acos(r) / 3;

    return [
      q + 2*p*Math.cos(phi),
      q + 2*p*Math.cos(phi + 2*Math.PI/3),
      q + 2*p*Math.cos(phi + 4*Math.PI/3)
    ];
  }

  // ── Workspace ──────────────────────────────────────────────────

  /** Monte Carlo workspace sampling → array of [x,y,z] */
  computeWorkspace(numSamples = 500) {
    if (this.type !== 'arm') return [];
    const saved = [...this.angles];
    const points = [];

    for (let i = 0; i < numSamples; i++) {
      const randAngles = this.config.joints.map(j =>
        j.min + Math.random() * (j.max - j.min)
      );
      this.angles = randAngles;
      this._computeFK();
      points.push([...this.endEffectorPos]);
    }

    this.angles = saved;
    this._computeFK();
    return points;
  }

  // ── Dynamics (Simplified) ──────────────────────────────────────

  /**
   * Compute simplified dynamic quantities.
   * Returns { M, C, G, torques } where
   *   M = mass matrix (n×n), C = Coriolis (n×1), G = gravity (n×1),
   *   torques = M·qddot + C·qdot + G  (static torques when qdot=qddot=0)
   */
  computeDynamics() {
    if (this.type !== 'arm') return this._computeMobileDynamics();

    const n = this.dof;
    const masses = this.config.masses || new Array(n).fill(1);
    const g = this.config.gravity || [0, -9.81, 0];

    // Simplified: each joint's torque ≈ gravity torques only
    const positions = this.getJointPositions();
    const torques = new Array(n).fill(0);

    // Gravity vector contribution at each joint
    for (let i = 0; i < n; i++) {
      let tau = 0;
      // Sum torques from link i to end
      for (let j = i; j < n; j++) {
        const pos = positions[j + 1]; // end of link j
        const comPos = [
          (positions[j][0] + pos[0]) / 2,
          (positions[j][1] + pos[1]) / 2,
          (positions[j][2] + pos[2]) / 2
        ];
        // Simplified gravity torque contribution
        tau += masses[j] * Math.abs(g[1]) * Math.sqrt(comPos[0]**2 + comPos[2]**2);
      }
      torques[i] = parseFloat(tau.toFixed(4));
    }

    // Simplified mass matrix (diagonal approximation)
    const M = [];
    for (let i = 0; i < n; i++) {
      M[i] = new Array(n).fill(0);
      let mass = 0;
      for (let j = i; j < n; j++) mass += masses[j];
      M[i][i] = parseFloat(mass.toFixed(4));
    }

    return {
      massMatrix: M,
      gravityTorques: torques,
      masses: masses
    };
  }

  _computeMobileDynamics() {
    const vl = this.angles[0], vr = this.angles[1];
    const r = this.lengths[0], L = this.lengths[1];
    const v = (vr + vl) / 2;
    const omega = (vr - vl) / L;
    return {
      linearVelocity: parseFloat(v.toFixed(4)),
      angularVelocity: parseFloat(omega.toFixed(4)),
      wheelRadius: r,
      axleLength: L
    };
  }

  // ── Differential Drive ─────────────────────────────────────────

  _computeDiffDrive() {
    const vl = this.angles[0]; // left wheel velocity
    const vr = this.angles[1]; // right wheel velocity
    const r = this.lengths[0]; // wheel radius
    const L = this.lengths[1]; // axle length

    const v = (vr + vl) / 2;
    const omega = (vr - vl) / L;

    // Integrate pose (simple Euler)
    const dt = 0.05;
    this.pose.x += v * Math.cos(this.pose.theta) * dt;
    this.pose.y += v * Math.sin(this.pose.theta) * dt;
    this.pose.theta += omega * dt;

    this.endEffectorPos = [this.pose.x, 0, this.pose.y];
    this.mobilePath.push([this.pose.x, this.pose.y, this.pose.theta]);
    if (this.mobilePath.length > 2000) this.mobilePath.shift();
  }

  /** Step the diff-drive simulation forward */
  stepDiffDrive(dt = 0.05) {
    if (this.type !== 'mobile') return;
    this._computeDiffDrive();
  }

  // ── Trajectory ─────────────────────────────────────────────────

  getTrajectory() {
    if (this.type === 'mobile') return this.mobilePath;
    return this.trajectoryPath;
  }

  clearTrajectory() {
    this.trajectoryPath = [];
    if (this.type === 'mobile') {
      this.mobilePath = [];
      this.pose = { x: 0, y: 0, theta: 0 };
    }
  }

  // ── Export / Reset ─────────────────────────────────────────────

  /** Serialize current state to JSON-friendly object */
  exportConfig() {
    return {
      robotId: this.robotId,
      robotName: this.config.name,
      angles: [...this.angles],
      lengths: [...this.lengths],
      endEffectorPos: [...this.endEffectorPos],
      timestamp: new Date().toISOString(),
      dhTable: this.getDHTable().map(dh => ({
        theta: parseFloat(rad2deg(dh.theta).toFixed(2)),
        d: parseFloat(dh.d.toFixed(4)),
        a: parseFloat(dh.a.toFixed(4)),
        alpha: parseFloat(rad2deg(dh.alpha).toFixed(2))
      })),
      jacobian: this.jacobian.map(row => row.map(v => parseFloat(v.toFixed(6)))),
      dynamics: this.computeDynamics()
    };
  }

  /** Reset to default joint angles */
  reset() {
    this.angles = this.config.joints.map(j => j.default);
    this.lengths = this.config.links.map(l => l.default);
    this.velocities = new Array(this.dof).fill(0);
    this.clearTrajectory();
    this.update();
  }
}

// ── Matrix formatting utilities ──────────────────────────────────────

/** Format a 4×4 row-major matrix as an HTML table string */
function formatMatrix4x4(M, label = 'T') {
  let html = `<div class="matrix-title">${label} <span class="badge">4×4</span></div>`;
  html += '<table>';
  for (let r = 0; r < 4; r++) {
    html += '<tr>';
    for (let c = 0; c < 4; c++) {
      const val = M[r * 4 + c];
      html += `<td>${val.toFixed(3)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

/** Format a generic 2D matrix */
function formatMatrix(M, label = 'J', badge = '') {
  if (!M || M.length === 0) return '<div class="matrix-title">N/A</div>';
  const rows = M.length, cols = M[0].length;
  let html = `<div class="matrix-title">${label} <span class="badge">${badge || rows+'×'+cols}</span></div>`;
  html += '<table>';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td>${M[r][c].toFixed(4)}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

// ── Exports ──────────────────────────────────────────────────────────
// Using window globals for simplicity (no bundler)
window.RobotKinematics = RobotKinematics;
window.ROBOT_LIBRARY   = ROBOT_LIBRARY;
window.formatMatrix4x4 = formatMatrix4x4;
window.formatMatrix    = formatMatrix;
window.deg2rad = deg2rad;
window.rad2deg = rad2deg;
