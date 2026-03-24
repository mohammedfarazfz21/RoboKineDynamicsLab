/* ===================================================================
   RoboKineDynamics Lab — UI Controller (ui.js)
   Wires up controls, panels, Plotly charts, and the onboarding modal.
   Depends on: kinematics.js, visualizer.js, Plotly.js
   =================================================================== */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let kinematics = null;
  let visualizer = null;
  let currentPlotTab = 'workspace';
  let diffDriveInterval = null;
  let isSimulationActive = false;
  let showTrajectory = true;

  // ── DOM References ─────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Initialization ─────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    // Create kinematics engine
    kinematics = new RobotKinematics('2R_planar');

    // Create 3D visualizer
    const canvasWrap = $('three-canvas-wrap');
    visualizer = new RobotVisualizer(canvasWrap);

    // Initial update
    _fullUpdate();

    // Create planner
    window.rkd_planner = new TrajectoryPlanner(kinematics, () => {
        _buildSliders(); // Update sliders during animation
        _onKinematicsChange();
    });

    // Wire up controls
    _setupRobotSelector();
    _buildSliders();
    _setupButtons();
    _setupPlannerUI();
    _setupPlotTabs();
    _setupOnboardingModal();
    
    // Wire cloud logic to global for auth.js
    window.rkd_save_logic = () => {
        $('save-modal-backdrop').classList.add('active');
        $('config-name').focus();
    };

    window.rkd_load_logic = _showCloudManager;

    // Show onboarding on first visit
    if (!localStorage.getItem('rkd_onboarded')) {
      setTimeout(() => _showModal(), 600);
    }

    // Diff-drive simulation loop
    _startDiffDriveLoop();
  });

  // ── Robot Selector ─────────────────────────────────────────────

  function _setupRobotSelector() {
    const sel = $('robot-select');
    sel.innerHTML = '';
    for (const [id, cfg] of Object.entries(ROBOT_LIBRARY)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = cfg.name;
      sel.appendChild(opt);
    }

    sel.addEventListener('change', () => {
      kinematics.setRobot(sel.value);
      visualizer.buildRobot(sel.value);
      _buildSliders();
      _updateEduInfo();

      // Show/hide simulation button
      const simBtn = $('btn-simulate');
      if (kinematics.type === 'mobile') {
        simBtn.style.display = 'block';
        isSimulationActive = false;
        simBtn.textContent = '▶ Start Simulation';
      } else {
        simBtn.style.display = 'none';
        isSimulationActive = false;
      }

      _fullUpdate();
      _startDiffDriveLoop();
    });
  }

  // ── Slider Generation ──────────────────────────────────────────

  function _buildSliders() {
    const jointContainer = $('joint-sliders');
    const linkContainer  = $('link-sliders');
    jointContainer.innerHTML = '';
    linkContainer.innerHTML = '';

    const cfg = kinematics.config;

    // Joint sliders
    cfg.joints.forEach((joint, i) => {
      jointContainer.appendChild(_createSlider({
        label: joint.name,
        min: joint.min,
        max: joint.max,
        value: kinematics.angles[i],
        step: joint.type === 'velocity' ? 0.01 : 1,
        unit: joint.type === 'velocity' ? 'm/s' : '°',
        onChange: val => {
          kinematics.angles[i] = val;
          _onKinematicsChange();
        }
      }));
    });

    // Link sliders
    cfg.links.forEach((link, i) => {
      linkContainer.appendChild(_createSlider({
        label: link.name,
        min: link.min,
        max: link.max,
        value: kinematics.lengths[i],
        step: 0.01,
        unit: 'm',
        onChange: val => {
          kinematics.lengths[i] = val;
          _onKinematicsChange();
        }
      }));
    });
  }

  function _createSlider({ label, min, max, value, step, unit, onChange }) {
    const group = document.createElement('div');
    group.className = 'slider-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;

    const valueContainer = document.createElement('span');
    valueContainer.style.display = 'flex';
    valueContainer.style.alignItems = 'center';
    valueContainer.style.gap = '6px';

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.min = min;
    numInput.max = max;
    numInput.step = step;
    numInput.value = parseFloat(value.toFixed(2));

    const btnDec = document.createElement('button');
    btnDec.textContent = '-';
    btnDec.className = 'btn';
    btnDec.style.padding = '2px 6px';
    btnDec.style.fontSize = '0.7rem';
    btnDec.style.minWidth = '24px';
    
    const btnInc = document.createElement('button');
    btnInc.textContent = '+';
    btnInc.className = 'btn';
    btnInc.style.padding = '2px 6px';
    btnInc.style.fontSize = '0.7rem';
    btnInc.style.minWidth = '24px';

    const unitSpan = document.createElement('span');
    unitSpan.className = 'value';
    unitSpan.textContent = unit;

    valueContainer.appendChild(btnDec);
    valueContainer.appendChild(numInput);
    valueContainer.appendChild(btnInc);
    valueContainer.appendChild(unitSpan);
    labelRow.appendChild(nameSpan);
    labelRow.appendChild(valueContainer);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;

    const _updateAll = (v) => {
        const fixedV = parseFloat(v.toFixed(step < 1 ? 2 : 0));
        numInput.value = fixedV;
        slider.value = fixedV;
        onChange(fixedV);
    };

    btnDec.addEventListener('click', () => {
        const v = Math.max(min, parseFloat(numInput.value) - (step * 5 || 1));
        _updateAll(v);
    });

    btnInc.addEventListener('click', () => {
        const v = Math.min(max, parseFloat(numInput.value) + (step * 5 || 1));
        _updateAll(v);
    });

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      numInput.value = v.toFixed(step < 1 ? 2 : 0);
      onChange(v);
    });

    numInput.addEventListener('change', () => {
      let v = parseFloat(numInput.value);
      v = Math.max(min, Math.min(max, v));
      numInput.value = v.toFixed(step < 1 ? 2 : 0);
      slider.value = v;
      onChange(v);
    });

    group.appendChild(labelRow);
    group.appendChild(slider);
    return group;
  }

  // ── Buttons ────────────────────────────────────────────────────

  function _setupButtons() {
    $('check-show-trajectory').addEventListener('change', (e) => {
      showTrajectory = e.target.checked;
      _updateTrajectory();
    });

    $('btn-simulate').addEventListener('click', () => {
      isSimulationActive = !isSimulationActive;
      const btn = $('btn-simulate');
      if (isSimulationActive) {
        btn.textContent = '⏸ Pause Simulation';
        btn.style.backgroundColor = 'var(--bg-hover)';
      } else {
        btn.textContent = '▶ Start Simulation';
        btn.style.backgroundColor = '';
      }
    });

    $('btn-reset').addEventListener('click', () => {
      kinematics.reset();
      isSimulationActive = false;
      if (kinematics.type === 'mobile') {
        const btn = $('btn-simulate');
        btn.textContent = '▶ Start Simulation';
        btn.style.backgroundColor = '';
      }
      _buildSliders();
      _fullUpdate();
    });

    $('btn-confirm-save').addEventListener('click', _performCloudSave);
    $('btn-cancel-save').addEventListener('click', () => $('save-modal-backdrop').classList.remove('active'));
    $('btn-close-load').addEventListener('click', () => $('load-modal-backdrop').classList.remove('active'));

    $('btn-recenter').addEventListener('click', () => {
      visualizer.recenterCamera();
    });

    $('btn-snapshot').addEventListener('click', () => {
        if (kinematics.type === 'arm') {
            visualizer.createSnapshot(
                kinematics.getJointPositions(),
                kinematics.getJointRotations(),
                kinematics.config
            );
        }
    });

    $('btn-export').addEventListener('click', _exportJSON);

    $('btn-clear-traj').addEventListener('click', () => {
      kinematics.clearTrajectory();
      visualizer.clearSnapshots();
      _updateTrajectory();
      _updatePlotlyChart();
    });

    // IK target input
    const ikBtn = $('btn-solve-ik');
    if (ikBtn) {
      ikBtn.addEventListener('click', () => {
        const x = parseFloat($('ik-x').value) || 0;
        const y = parseFloat($('ik-y').value) || 0;
        const z = parseFloat($('ik-z').value) || 0;
        const result = kinematics.solveIK([x, y, z]);
        if (result) {
          kinematics.angles = result;
          kinematics.update();
          _buildSliders();
          _fullUpdate();
          visualizer.showGhostTarget([x, y, z]);
          $('ik-status').textContent = '✓ Solution found';
          $('ik-status').style.color = '#34d399';
        } else {
          $('ik-status').textContent = '✗ Unreachable';
          $('ik-status').style.color = '#fb7185';
        }
      });
    }

    // Interactive IK Target
    visualizer.onTargetMove = (pos) => {
        const result = kinematics.solveIK([pos.x, pos.y, pos.z]);
        if (result) {
            kinematics.angles = result;
            kinematics.update();
            _buildSliders();
            _onKinematicsChange();
            $('ik-x').value = pos.x.toFixed(2);
            $('ik-y').value = pos.y.toFixed(2);
            $('ik-z').value = pos.z.toFixed(2);
            $('ik-status').textContent = '✓ Dynamic tracking';
            $('ik-status').style.color = '#34d399';
        } else {
            $('ik-status').textContent = '✗ Target unreachable';
            $('ik-status').style.color = '#fb7185';
        }
    };

    // Help button
    const helpBtn = $('btn-help');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => _showModal());
    }

    // Right panel toggle (for tablets)
    const toggleBtn = $('btn-toggle-right');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('show-right-panel');
      });
    }
  }

  function _setupPlannerUI() {
    const planner = window.rkd_planner;
    if (!planner) return;

    $('btn-set-start').addEventListener('click', () => {
        planner.setStart();
        $('btn-set-start').textContent = '✓ Start Set';
        setTimeout(() => $('btn-set-start').textContent = 'Set Start', 1000);
    });

    $('btn-set-end').addEventListener('click', () => {
        planner.setEnd();
        $('btn-set-end').textContent = '✓ End Set';
        setTimeout(() => $('btn-set-end').textContent = 'Set End', 1000);
    });

    $('btn-play-traj').addEventListener('click', () => {
        const method = $('planner-method').value;
        planner.play(method);
    });

    $('btn-save-traj').addEventListener('click', _saveCurrentTrajectory);

    const btnCloseSetup = $('btn-close-setup');
    if (btnCloseSetup) {
        btnCloseSetup.addEventListener('click', () => {
            $('setup-modal-backdrop').classList.remove('active');
        });
    }
  }

  // ── Core Update Pipeline ───────────────────────────────────────

  function _onKinematicsChange() {
    kinematics.update();
    _updateVisualizer();
    _updateRightPanel();
    _updateTrajectory();
  }

  function _fullUpdate() {
    kinematics.update();
    _updateVisualizer();
    _updateRightPanel();
    _updateTrajectory();
    _updatePlotlyChart();
    _updateEduInfo();
  }

  function _updateVisualizer() {
    if (kinematics.type === 'arm') {
      const positions = kinematics.getJointPositions();
      const rotations = kinematics.getJointRotations();
      visualizer.updateArm(positions, rotations, kinematics.config);
    } else {
      visualizer.buildRobot(kinematics.robotId);
      visualizer.updateDiffDrive(kinematics.pose);
    }
  }

  function _updateTrajectory() {
    const traj = showTrajectory ? kinematics.getTrajectory() : [];
    if (kinematics.type === 'mobile') {
      const pts3d = traj.map(p => [p[0], 0.01, p[1]]);
      visualizer.updateTrajectory(pts3d);
    } else {
      visualizer.updateTrajectory(traj);
    }
    _updatePlotlyChart(); // update plot too
  }

  // ── Right Panel ────────────────────────────────────────────────

  function _updateRightPanel() {
    // End-effector position
    const eePos = kinematics.endEffectorPos;
    const eeBadge = $('ee-position');
    if (eeBadge) {
      eeBadge.innerHTML = `
        <span class="ee-badge">X: ${eePos[0].toFixed(3)}</span>
        <span class="ee-badge">Y: ${eePos[1].toFixed(3)}</span>
        <span class="ee-badge">Z: ${eePos[2].toFixed(3)}</span>
      `;
    }

    if (kinematics.type === 'arm') {
      _updateArmPanel();
    } else {
      _updateMobilePanel();
    }
  }

  function _updateArmPanel() {
    // DH Table
    const dhContainer = $('dh-table');
    if (dhContainer) {
      const dhParams = kinematics.getDHTable();
      let html = '<div class="matrix-title">DH Parameters <span class="badge">Table</span></div>';
      html += '<table><tr><th>i</th><th>θ (°)</th><th>d</th><th>a</th><th>α (°)</th></tr>';
      dhParams.forEach((dh, i) => {
        html += `<tr>
          <td>${i + 1}</td>
          <td>${rad2deg(dh.theta).toFixed(1)}</td>
          <td>${dh.d.toFixed(3)}</td>
          <td>${dh.a.toFixed(3)}</td>
          <td>${rad2deg(dh.alpha).toFixed(1)}</td>
        </tr>`;
      });
      html += '</table>';
      dhContainer.innerHTML = html;
    }

    // Transformation matrices
    const matContainer = $('transform-matrices');
    if (matContainer) {
      let html = '';
      kinematics.jointTransforms.forEach((T, i) => {
        html += `<div class="card">${formatMatrix4x4(T, 'T₀→' + (i+1))}</div>`;
      });
      matContainer.innerHTML = html;
    }

    // Jacobian
    const jacContainer = $('jacobian-display');
    if (jacContainer) {
      const J = kinematics.getJacobianMatrix();
      jacContainer.innerHTML = `<div class="card">${formatMatrix(J, 'Jacobian (J)', '3×' + kinematics.dof)}</div>`;
    }

    // Dynamics
    const dynContainer = $('dynamics-display');
    if (dynContainer) {
      const dyn = kinematics.computeDynamics();
      let html = '<div class="matrix-title">Dynamics <span class="badge">Simplified</span></div>';

      // Gravity torques
      html += '<div style="margin-bottom:8px">';
      html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">Gravity Torques (N·m)</div>';
      dyn.gravityTorques.forEach((t, i) => {
        html += `<div class="dynamics-row"><span class="label">τ${i+1}</span><span class="value">${t.toFixed(3)}</span></div>`;
      });
      html += '</div>';

      // Mass matrix
      html += formatMatrix(dyn.massMatrix, 'Mass Matrix M(q)', kinematics.dof + '×' + kinematics.dof);

      dynContainer.innerHTML = html;
    }

    // Velocity ellipsoid info
    const ellipsoidInfo = $('ellipsoid-info');
    if (ellipsoidInfo) {
      const ell = kinematics.computeVelocityEllipsoid();
      if (ell) {
        let html = '<div class="matrix-title">Velocity Ellipsoid <span class="badge">SVD</span></div>';
        html += '<div style="margin-top:4px">';
        ell.radii.forEach((r, i) => {
          html += `<div class="dynamics-row"><span class="label">σ${i+1}</span><span class="value">${r.toFixed(4)}</span></div>`;
        });
        const manipulability = ell.radii.reduce((p, r) => p * r, 1);
        html += `<div class="dynamics-row" style="border-top:1px solid var(--accent);margin-top:4px;padding-top:4px"><span class="label">Manipulability</span><span class="value" style="color:var(--accent-amber)">${manipulability.toFixed(4)}</span></div>`;
        html += '</div>';
        ellipsoidInfo.innerHTML = html;
      }
    }

    // Equations
    const eqContainer = $('equations-display');
    if (eqContainer) {
      eqContainer.innerHTML = `
        <div class="equation-block">
          T = ∏ᵢ Aᵢ(θᵢ)  where  Aᵢ = Rot(z,θ)·Trans(0,0,d)·Trans(a,0,0)·Rot(x,α)
        </div>
        <div class="equation-block">
          J(q) = ∂p/∂q   →   ẋ = J(q)·q̇
        </div>
        <div class="equation-block">
          τ = M(q)·q̈ + C(q,q̇)·q̇ + g(q)
        </div>
      `;
    }
  }

  function _updateMobilePanel() {
    const matContainer = $('transform-matrices');
    const jacContainer = $('jacobian-display');
    const dynContainer = $('dynamics-display');
    const dhContainer  = $('dh-table');
    const eqContainer  = $('equations-display');
    const ellipsoidInfo = $('ellipsoid-info');

    if (dhContainer) dhContainer.innerHTML = '<div class="matrix-title" style="color:var(--text-muted)">N/A for mobile robots</div>';
    if (matContainer) matContainer.innerHTML = '';

    if (jacContainer) {
      const vl = kinematics.angles[0], vr = kinematics.angles[1];
      const r = kinematics.lengths[0], L = kinematics.lengths[1];
      jacContainer.innerHTML = `
        <div class="card">
          <div class="matrix-title">Kinematic Model <span class="badge">Unicycle</span></div>
          <div class="dynamics-row"><span class="label">v (m/s)</span><span class="value">${((vr+vl)/2).toFixed(3)}</span></div>
          <div class="dynamics-row"><span class="label">ω (rad/s)</span><span class="value">${((vr-vl)/L).toFixed(3)}</span></div>
          <div class="dynamics-row"><span class="label">x</span><span class="value">${kinematics.pose.x.toFixed(3)}</span></div>
          <div class="dynamics-row"><span class="label">y</span><span class="value">${kinematics.pose.y.toFixed(3)}</span></div>
          <div class="dynamics-row"><span class="label">θ (°)</span><span class="value">${rad2deg(kinematics.pose.theta).toFixed(1)}</span></div>
        </div>
      `;
    }

    if (dynContainer) {
      const dyn = kinematics.computeDynamics();
      dynContainer.innerHTML = `
        <div class="card">
          <div class="matrix-title">Dynamics <span class="badge">Mobile</span></div>
          <div class="dynamics-row"><span class="label">Linear Vel</span><span class="value">${dyn.linearVelocity} m/s</span></div>
          <div class="dynamics-row"><span class="label">Angular Vel</span><span class="value">${dyn.angularVelocity} rad/s</span></div>
        </div>
      `;
    }

    if (eqContainer) {
      eqContainer.innerHTML = `
        <div class="equation-block">
          v = (vᵣ + vₗ) / 2
          ω = (vᵣ - vₗ) / L
        </div>
        <div class="equation-block">
          ẋ = v·cos(θ)
          ẏ = v·sin(θ)
          θ̇ = ω
        </div>
      `;
    }

    if (ellipsoidInfo) ellipsoidInfo.innerHTML = '';
  }

  // ── Plotly Charts ──────────────────────────────────────────────

  function _setupPlotTabs() {
    const tabs = document.querySelectorAll('.plot-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentPlotTab = tab.dataset.tab;
        _updatePlotlyChart();
      });
    });
  }

  function _updatePlotlyChart() {
    const chartEl = $('plotly-chart');
    if (!chartEl) return;

    const darkLayout = {
      paper_bgcolor: 'rgba(17,24,39,0)',
      plot_bgcolor:  'rgba(17,24,39,0)',
      font: { color: '#94a3b8', family: 'Inter, sans-serif', size: 11 },
      margin: { l: 50, r: 20, t: 30, b: 40 },
      xaxis: { gridcolor: 'rgba(148,163,184,0.1)', zerolinecolor: 'rgba(148,163,184,0.2)' },
      yaxis: { gridcolor: 'rgba(148,163,184,0.1)', zerolinecolor: 'rgba(148,163,184,0.2)' }
    };

    if (currentPlotTab === 'workspace') {
      _plotWorkspace(chartEl, darkLayout);
    } else if (currentPlotTab === 'ellipsoid') {
      _plotEllipsoid(chartEl, darkLayout);
    } else if (currentPlotTab === 'trajectory') {
      _plotTrajectory(chartEl, darkLayout);
    }
  }

  function _plotWorkspace(el, layout) {
    const points = kinematics.computeWorkspace(600);
    if (points.length === 0) {
      Plotly.purge(el);
      return;
    }

    const is2D = kinematics.robotId === '2R_planar';
    const trace = {
      x: points.map(p => p[0]),
      y: is2D ? points.map(p => p[1]) : points.map(p => p[2]),
      mode: 'markers',
      type: 'scatter',
      marker: {
        size: 2,
        color: points.map(p => Math.sqrt(p[0]**2 + p[1]**2 + (p[2]||0)**2)),
        colorscale: [[0,'#6366f1'],[0.5,'#22d3ee'],[1,'#34d399']],
        showscale: false,
        opacity: 0.6
      },
      name: 'Workspace'
    };

    // Current end-effector
    const ee = kinematics.endEffectorPos;
    const eeTrace = {
      x: [ee[0]],
      y: is2D ? [ee[1]] : [ee[2]],
      mode: 'markers',
      type: 'scatter',
      marker: { size: 10, color: '#fb7185', symbol: 'x' },
      name: 'End-Effector'
    };

    const fullLayout = {
      ...layout,
      title: { text: 'Reachable Workspace', font: { size: 13, color: '#f1f5f9' } },
      xaxis: { ...layout.xaxis, title: 'X (m)', scaleanchor: 'y' },
      yaxis: { ...layout.yaxis, title: is2D ? 'Y (m)' : 'Z (m)' },
      showlegend: false
    };

    Plotly.react(el, [trace, eeTrace], fullLayout, { responsive: true, displayModeBar: false });
  }

  function _plotEllipsoid(el, layout) {
    const ell = kinematics.computeVelocityEllipsoid();
    if (!ell || ell.radii.length < 2) {
      Plotly.purge(el);
      return;
    }

    // Draw 2D ellipse using parametric curve
    const r1 = ell.radii[0] || 0.01;
    const r2 = ell.radii[1] || 0.01;
    const t = [];
    const ex = [], ey = [];
    for (let i = 0; i <= 100; i++) {
      const angle = (2 * Math.PI * i) / 100;
      t.push(angle);
      ex.push(r1 * Math.cos(angle));
      ey.push(r2 * Math.sin(angle));
    }

    const trace = {
      x: ex, y: ey,
      mode: 'lines',
      type: 'scatter',
      line: { color: '#22d3ee', width: 2 },
      fill: 'toself',
      fillcolor: 'rgba(34,211,238,0.1)',
      name: 'Velocity Ellipsoid'
    };

    // Singular value markers on axes
    const svTrace = {
      x: [r1, -r1, 0, 0],
      y: [0, 0, r2, -r2],
      mode: 'markers',
      type: 'scatter',
      marker: { size: 8, color: '#fbbf24', symbol: 'diamond' },
      name: 'Singular Values'
    };

    const fullLayout = {
      ...layout,
      title: { text: 'Velocity Ellipsoid (2D Projection)', font: { size: 13, color: '#f1f5f9' } },
      xaxis: { ...layout.xaxis, title: 'σ₁', scaleanchor: 'y' },
      yaxis: { ...layout.yaxis, title: 'σ₂' },
      showlegend: true,
      legend: { font: { size: 10 }, bgcolor: 'rgba(0,0,0,0)' }
    };

    Plotly.react(el, [trace, svTrace], fullLayout, { responsive: true, displayModeBar: false });
  }

  function _plotTrajectory(el, layout) {
    const traj = showTrajectory ? kinematics.getTrajectory() : [];
    if (!traj || traj.length < 2) {
      Plotly.react(el, [], { 
        ...layout, 
        title: { text: showTrajectory ? 'No Trajectory Data' : 'Trajectory Hidden', font: { size: 13, color: '#f1f5f9' } } 
      }, { responsive: true, displayModeBar: false });
      return;
    }

    const is2D = kinematics.robotId === '2R_planar';
    const isMobile = kinematics.type === 'mobile';

    const trace = {
      x: traj.map(p => p[0]),
      y: isMobile ? traj.map(p => p[1]) : (is2D ? traj.map(p => p[1]) : traj.map(p => p[2])),
      mode: 'lines+markers',
      type: 'scatter',
      line: { color: '#fb7185', width: 1.5 },
      marker: { size: 2, color: '#fb7185' },
      name: 'Path'
    };

    // Start and end markers
    const startEnd = {
      x: [traj[0][0], traj[traj.length-1][0]],
      y: [
        isMobile ? traj[0][1] : (is2D ? traj[0][1] : traj[0][2]),
        isMobile ? traj[traj.length-1][1] : (is2D ? traj[traj.length-1][1] : traj[traj.length-1][2])
      ],
      mode: 'markers',
      type: 'scatter',
      marker: { size: 8, color: ['#34d399', '#fbbf24'], symbol: ['circle', 'star'] },
      name: 'Start / End',
      showlegend: false
    };

    const fullLayout = {
      ...layout,
      title: { text: isMobile ? 'Robot Path' : 'End-Effector Trajectory', font: { size: 13, color: '#f1f5f9' } },
      xaxis: { ...layout.xaxis, title: 'X (m)', scaleanchor: 'y' },
      yaxis: { ...layout.yaxis, title: isMobile ? 'Y (m)' : (is2D ? 'Y (m)' : 'Z (m)') },
      showlegend: false
    };

    Plotly.react(el, [trace, startEnd], fullLayout, { responsive: true, displayModeBar: false });
  }

  // ── Diff-Drive Simulation Loop ─────────────────────────────────

  function _startDiffDriveLoop() {
    if (diffDriveInterval) clearInterval(diffDriveInterval);

    if (kinematics.type === 'mobile') {
      diffDriveInterval = setInterval(() => {
        if (!isSimulationActive) return;
        kinematics.stepDiffDrive(0.05);
        _updateVisualizer();
        _updateRightPanel();
        _updateTrajectory();
      }, 50);
    }
  }

  // ── Export JSON ────────────────────────────────────────────────

  function _exportJSON() {
    const data = kinematics.exportConfig();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot_config_${kinematics.robotId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Show brief feedback
    const btn = $('btn-export');
    const orig = btn.textContent;
    btn.textContent = '✓ Exported!';
    btn.style.borderColor = '#34d399';
    setTimeout(() => { btn.textContent = orig; btn.style.borderColor = ''; }, 1500);
  }

  // ── Educational Info ───────────────────────────────────────────

  function _updateEduInfo() {
    const info = $('edu-info');
    if (!info) return;

    const cfg = kinematics.config;
    const eduTexts = {
      '2R_planar': `<strong>2R Planar Arm:</strong> The simplest serial manipulator. Two revolute joints rotate links in the XY plane. 
      Forward kinematics uses DH parameters (α=0 for all joints). Inverse kinematics has an analytical closed-form solution with "elbow-up" and "elbow-down" configurations.`,

      '3R_manipulator': `<strong>3R Spatial Manipulator:</strong> A 3-DOF arm with joints rotating about Z, Y, and Y axes. 
      The first joint provides base rotation (azimuth). The workspace forms a toroidal volume. 
      Uses the standard DH convention with non-zero α for the first joint.`,

      '6DOF_arm': `<strong>6-DOF Articulated Arm:</strong> With 6 revolute joints, this arm achieves full spatial positioning (3 for position, 3 for orientation). 
      The Jacobian is a 6×6 matrix. Near singular configurations, the manipulability measure drops, causing large joint velocities for small end-effector motions.`,

      'diff_drive': `<strong>Differential-Drive Robot:</strong> A mobile robot with two independently driven wheels. The robot's motion is governed by the unicycle model: 
      v = (vᵣ + vₗ)/2 and ω = (vᵣ - vₗ)/L. This is a non-holonomic system — it cannot move sideways without changing heading.`
    };

    info.innerHTML = eduTexts[kinematics.robotId] || '';
  }

  // ── Onboarding Modal ───────────────────────────────────────────

  const modalSteps = [
    {
      title: '🤖 Welcome to RoboKineDynamics Lab!',
      content: `<p>This interactive tool helps you learn and visualize <strong>robot kinematics and dynamics</strong> in real-time.</p>
      <p>Explore 4 different robot models, adjust parameters, and see how joint angles affect the end-effector position.</p>`
    },
    {
      title: '🦾 Robot Models',
      content: `
        <div class="robot-preview-card"><span class="icon-large">🔗</span><div><h4>2R Planar Arm</h4><p>Two revolute joints — perfect for learning FK/IK basics</p></div></div>
        <div class="robot-preview-card"><span class="icon-large">🦿</span><div><h4>3R Spatial Manipulator</h4><p>Three joints with spatial motion for workspace analysis</p></div></div>
        <div class="robot-preview-card"><span class="icon-large">🤖</span><div><h4>6-DOF Articulated Arm</h4><p>Full 6-axis arm like industrial robots (PUMA-style)</p></div></div>
        <div class="robot-preview-card"><span class="icon-large">🚗</span><div><h4>Differential-Drive Robot</h4><p>Two-wheeled mobile robot with unicycle kinematics</p></div></div>
      `
    },
    {
      title: '🎮 How to Use',
      content: `<p><strong>Left Panel:</strong> Select a robot, adjust joint angles and link lengths with sliders.</p>
      <p><strong>Center:</strong> 3D viewport — orbit, zoom, and pan with your mouse. Click "Recenter" to reset the view.</p>
      <p><strong>Bottom:</strong> Switch between Workspace, Velocity Ellipsoid, and Trajectory plots.</p>
      <p><strong>Right Panel:</strong> View DH parameters, transformation matrices, Jacobian, and dynamics in real-time.</p>
      <p><strong>Export:</strong> Save your current configuration as JSON anytime!</p>`
    }
  ];

  let currentStep = 0;

  function _setupOnboardingModal() {
    const closeBtn = $('modal-close');
    const nextBtn  = $('modal-next');
    const prevBtn  = $('modal-prev');

    if (closeBtn) closeBtn.addEventListener('click', _hideModal);
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (currentStep < modalSteps.length - 1) {
        currentStep++;
        _renderModalStep();
      } else {
        _hideModal();
      }
    });
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        _renderModalStep();
      }
    });

    // Close on backdrop click
    const backdrop = $('modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) _hideModal();
      });
    }
  }

  function _showModal() {
    currentStep = 0;
    _renderModalStep();
    $('modal-backdrop').classList.add('active');
  }

  function _hideModal() {
    $('modal-backdrop').classList.remove('active');
    localStorage.setItem('rkd_onboarded', '1');
  }

  function _renderModalStep() {
    const step = modalSteps[currentStep];
    $('modal-title').innerHTML = step.title;
    $('modal-body').innerHTML = step.content;

    // Step dots
    const dotsContainer = $('step-dots');
    dotsContainer.innerHTML = '';
    modalSteps.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'step-dot' + (i === currentStep ? ' active' : '');
      dotsContainer.appendChild(dot);
    });

    // Button states
    $('modal-prev').style.display = currentStep === 0 ? 'none' : '';
    $('modal-next').textContent = currentStep === modalSteps.length - 1 ? 'Get Started →' : 'Next →';
  }

  async function _performCloudSave() {
    const name = $('config-name').value.trim();
    if (!name) return alert('Please enter a name');
    
    const status = $('save-status');
    status.textContent = 'Saving...';
    status.style.color = 'var(--accent-cyan)';
    
    const configData = kinematics.exportConfig();
    const { error } = await RKD_Auth.saveRobotConfig(name, configData);
    
    if (error) {
        status.textContent = 'Error: ' + error.message;
        status.style.color = 'var(--accent-rose)';
    } else {
        status.textContent = 'Saved successfully!';
        status.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
            $('save-modal-backdrop').classList.remove('active');
            status.textContent = '';
            $('config-name').value = '';
        }, 1500);
    }
  }

  async function _showCloudManager() {
    const modal = $('load-modal-backdrop');
    const list = $('config-list');
    modal.classList.add('active');
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Fetching your lab configurations...</div>';
    
    const configs = await RKD_Auth.loadUserConfigs();
    
    if (configs.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No saved configurations found.</div>';
        return;
    }
    
    list.innerHTML = '';
    configs.forEach(cfg => {
        const item = document.createElement('div');
        item.style.padding = '12px 15px';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.cursor = 'pointer';
        item.className = 'hover-effect';
        
        item.innerHTML = `
            <div>
                <div style="font-weight: 600; font-size: 0.9rem;">${cfg.name}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${cfg.robot_id} • ${new Date(cfg.created_at).toLocaleDateString()}</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-del" style="padding: 4px 8px; font-size: 0.7rem; border-color: var(--accent-rose);">🗑</button>
                <button class="btn btn-primary btn-load" style="padding: 4px 10px; font-size: 0.75rem;">Load</button>
            </div>
        `;
        
        const delBtn = item.querySelector('.btn-del');
        const loadBtn = item.querySelector('.btn-load');
        
        loadBtn.addEventListener('click', () => {
            const data = cfg.config;
            _loadConfigIntoLab(data);
            modal.classList.remove('active');
        });
        
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this configuration?')) {
                await RKD_Auth.deleteConfig(cfg.id);
                _showCloudManager(); // Refresh
            }
        });
        
        list.appendChild(item);
    });
  }

  function _loadConfigIntoLab(data) {
    if (!data) return;
    
    // Switch robot if different
    if (data.robotId !== kinematics.robotId) {
        const select = $('robot-select');
        if (select) {
          select.value = data.robotId;
          // Trigger change manually
          const event = new Event('change');
          select.dispatchEvent(event);
        }
    }
    
    // Set angles and lengths
    setTimeout(() => {
      kinematics.angles = [...data.angles];
      if (data.lengths) kinematics.lengths = [...data.lengths];
      
      _fullUpdate();
      _buildSliders(); // Refresh UI sliders
      
      // Show feedback
      const statusDot = document.querySelector('.status-dot');
      if (statusDot) {
        statusDot.style.background = 'var(--accent-emerald)';
        setTimeout(() => statusDot.style.background = '', 2000);
      }
    }, 100);
  }

  async function _saveCurrentTrajectory() {
    const user = RKD_Auth.getUser();
    if (!user) return alert('Please login to save trajectories');
    
    const traj = kinematics.getTrajectory();
    if (traj.length === 0) return alert('No trajectory to save. Play one first!');
    
    const name = prompt('Enter a name for this trajectory:', `Trajectory ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    
    const { error } = await RKD_Auth.saveTrajectory(name, traj);
    if (error) {
        alert('Error saving trajectory: ' + error.message);
    } else {
        const btn = $('btn-save-traj');
        const orig = btn.textContent;
        btn.textContent = '✓ Saved!';
        btn.style.background = 'rgba(52,211,153,0.2)';
        setTimeout(() => { 
            btn.textContent = orig; 
            btn.style.background = '';
        }, 2000);
    }
  }

})();
