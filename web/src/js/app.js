/**
 * Missile 3D Simulation & Realtime Telemetry Controller
 */

// Global State
let allMissileData = {};
let currentMissile = 'Khalij_Fars';
let currentSimId = 1;
let currentTrajectory = [];
let currentStepIndex = 0;
let isPlaying = true;
let playSpeed = 1;
let lastFrameTime = performance.now();

// Three.js State
let scene, camera, renderer, controls;
let missileMesh, trajectoryLine, flameMesh;
let launchPadMesh, targetPadMesh;
let maxAltitude = 0;
let maxDistance = 0;
let totalFlightTime = 0;

// Missile Specs metadata for info panel
const MISSILE_META = {
  Khalij_Fars: { name: 'Khalij Fars', type: '단거리 대함 탄도미사일 (ASBM)', range: '300 km', solid: true },
  Qiam_1: { name: 'Qiam-1', type: '단거리 지대지 탄도미사일 (SRBM)', range: '700~800 km', solid: false },
  Shahab_3: { name: 'Shahab-3', type: '중거리 탄도미사일 (MRBM)', range: '1,000~2,000 km', solid: false },
  Zolfaghar: { name: 'Zolfaghar', type: '중거리 고체추진 탄도미사일 (MRBM)', range: '700 km', solid: true }
};

// Coordinate Scale: 1 unit in 3D = 1000m (1km)
const WORLD_SCALE = 0.001;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  init3D();
  setupUIEvents();
  await loadSimulationData();
});

// Setup 3D Scene
function init3D() {
  const container = document.getElementById('canvas-container');
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090e);
  scene.fog = new THREE.FogExp2(0x06090e, 0.0006);

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  camera.position.set(-150, 180, 260);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 3000;
  controls.minDistance = 2;

  // Lights
  const ambientLight = new THREE.AmbientLight(0x223344, 1.2);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(200, 400, 200);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x00e5ff, 1.5);
  rimLight.position.set(-200, 200, -200);
  scene.add(rimLight);

  // Grid ground & Radar rings
  createEnvironment();

  // Create Missile Object & Rocket Plume
  createMissileModel();

  // Resize handler
  window.addEventListener('resize', onWindowResize);

  // Animation Loop
  animate();
}

function createEnvironment() {
  // Ground grid (1000km x 1000km range, 50km cells)
  const gridHelper = new THREE.GridHelper(1000, 50, 0x00e5ff, 0x112233);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  // Launch Site Indicator
  const launchGeo = new THREE.CylinderGeometry(4, 5, 1, 32);
  const launchMat = new THREE.MeshBasicMaterial({ color: 0x00e676, wireframe: true });
  launchPadMesh = new THREE.Mesh(launchGeo, launchMat);
  launchPadMesh.position.set(0, 0, 0);
  scene.add(launchPadMesh);

  // Target Site Ring Indicator
  const targetRingGeo = new THREE.RingGeometry(2, 6, 32);
  const targetRingMat = new THREE.MeshBasicMaterial({ color: 0xff3d71, side: THREE.DoubleSide });
  targetPadMesh = new THREE.Mesh(targetRingGeo, targetRingMat);
  targetPadMesh.rotation.x = -Math.PI / 2;
  targetPadMesh.position.set(0, 0.5, 0);
  scene.add(targetPadMesh);
}

function createMissileModel() {
  missileMesh = new THREE.Group();

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.8, 0.8, 8, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 0.8,
    roughness: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 4;
  missileMesh.add(body);

  // Nose Cone
  const noseGeo = new THREE.ConeGeometry(0.8, 3, 16);
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    metalness: 0.9,
    roughness: 0.1
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.y = 9.5;
  missileMesh.add(nose);

  // Fins (4 wings)
  const finGeo = new THREE.BoxGeometry(0.1, 2.0, 1.8);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x223344 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.rotation.y = (i * Math.PI) / 2;
    fin.position.y = 1;
    missileMesh.add(fin);
  }

  // Rocket Plume (Thrust Flame)
  const flameGeo = new THREE.ConeGeometry(0.6, 6, 16);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7700,
    transparent: true,
    opacity: 0.85
  });
  flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.rotation.x = Math.PI;
  flameMesh.position.y = -3;
  missileMesh.add(flameMesh);

  scene.add(missileMesh);
}

// Load JSON data
async function loadSimulationData() {
  try {
    const response = await fetch('../data/missiles_data.json');
    allMissileData = await response.json();

    // Populate sim IDs dropdown
    populateSimIds();

    // Load active simulation
    selectSimulation(currentMissile, currentSimId);
  } catch (err) {
    console.error('Failed to load JSON data:', err);
  }
}

function populateSimIds() {
  const simSelect = document.getElementById('sim-select');
  simSelect.innerHTML = '';
  const sims = allMissileData[currentMissile] || {};
  const simIds = Object.keys(sims);

  simIds.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `Simulation #${id}`;
    simSelect.appendChild(opt);
  });
}

function selectSimulation(missileName, simId) {
  currentMissile = missileName;
  currentSimId = simId;
  const simDict = allMissileData[missileName] || {};
  currentTrajectory = simDict[simId] || [];

  if (currentTrajectory.length === 0) return;

  currentStepIndex = 0;

  // Build 3D Trajectory ribbon/line
  buildTrajectoryVisuals();

  // Update Mission Info Box
  updateMissionOverview();

  // Setup Timeline slider
  const slider = document.getElementById('time-slider');
  slider.max = currentTrajectory.length - 1;
  slider.value = 0;

  totalFlightTime = currentTrajectory[currentTrajectory.length - 1].time_step;
  document.getElementById('time-total').textContent = formatSeconds(totalFlightTime);

  // Position target indicator
  const targetX = currentTrajectory[0].Target_X * WORLD_SCALE;
  const targetY = currentTrajectory[0].Target_Y * WORLD_SCALE;
  targetPadMesh.position.set(targetX, 0.5, -targetY); // Three.js Y is up, Z is depth

  // Update Telemetry on step 0
  updateTelemetryUI(currentTrajectory[0]);
}

function buildTrajectoryVisuals() {
  if (trajectoryLine) scene.remove(trajectoryLine);

  const points = [];
  maxAltitude = 0;
  maxDistance = 0;

  currentTrajectory.forEach((step) => {
    // Coordinate mapping: 
    // Data: X=downrange, Y=crossrange, Z=altitude
    // Three.js: X=downrange (X), Y=altitude (Z), Z=crossrange (-Y)
    const posX = step.x * WORLD_SCALE;
    const posY = step.z * WORLD_SCALE;
    const posZ = -step.y * WORLD_SCALE;

    points.push(new THREE.Vector3(posX, posY, posZ));

    if (step.z > maxAltitude) maxAltitude = step.z;
    const dist = Math.sqrt(step.x * step.x + step.y * step.y);
    if (dist > maxDistance) maxDistance = dist;
  });

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    linewidth: 2,
    transparent: true,
    opacity: 0.75
  });

  trajectoryLine = new THREE.Line(geometry, material);
  scene.add(trajectoryLine);
}

function updateMissionOverview() {
  const meta = MISSILE_META[currentMissile] || {};
  document.getElementById('info-type').textContent = meta.name || currentMissile;
  document.getElementById('info-class').textContent = meta.type || '-';
  document.getElementById('info-apogee').textContent = (maxAltitude / 1000).toFixed(2) + ' km';
  document.getElementById('info-duration').textContent = totalFlightTime.toFixed(1) + ' s';
  document.getElementById('info-tot-dist').textContent = (maxDistance / 1000).toFixed(2) + ' km';

  const lastStep = currentTrajectory[currentTrajectory.length - 1];
  if (lastStep) {
    const errX = lastStep.x - lastStep.Target_X;
    const errY = lastStep.y - lastStep.Target_Y;
    const errTotal = Math.sqrt(errX * errX + errY * errY);
    document.getElementById('info-impact-err').textContent = errTotal.toFixed(1) + ' m';
  }
}

// UI Event Handlers
function setupUIEvents() {
  // Missile Select
  document.getElementById('missile-select').addEventListener('change', (e) => {
    currentMissile = e.target.value;
    populateSimIds();
    const firstSim = document.getElementById('sim-select').value;
    selectSimulation(currentMissile, firstSim);
  });

  // Sim Select
  document.getElementById('sim-select').addEventListener('change', (e) => {
    selectSimulation(currentMissile, e.target.value);
  });

  // Play / Pause
  const playBtn = document.getElementById('btn-play');
  playBtn.addEventListener('click', togglePlay);

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    currentStepIndex = 0;
    updateSimulationStep(0);
  });

  // Prev / Next
  document.getElementById('btn-prev').addEventListener('click', () => {
    currentStepIndex = Math.max(0, currentStepIndex - 1);
    updateSimulationStep(currentStepIndex);
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    currentStepIndex = Math.min(currentTrajectory.length - 1, currentStepIndex + 1);
    updateSimulationStep(currentStepIndex);
  });

  // Timeline slider
  const slider = document.getElementById('time-slider');
  slider.addEventListener('input', (e) => {
    currentStepIndex = parseInt(e.target.value, 10);
    updateSimulationStep(currentStepIndex);
  });

  // Speed buttons
  const speedBtns = document.querySelectorAll('.speed-btn');
  speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      speedBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      playSpeed = parseFloat(btn.dataset.speed);
    });
  });
}

function togglePlay() {
  isPlaying = !isPlaying;
  const icon = document.getElementById('play-icon');
  if (isPlaying) {
    icon.setAttribute('data-lucide', 'pause');
  } else {
    icon.setAttribute('data-lucide', 'play');
  }
  if (window.lucide) lucide.createIcons();
}

// Simulation update per frame
function updateSimulationStep(index) {
  if (!currentTrajectory || currentTrajectory.length === 0) return;
  const step = currentTrajectory[index];
  if (!step) return;

  // 1. Position missile in 3D
  const posX = step.x * WORLD_SCALE;
  const posY = Math.max(0, step.z * WORLD_SCALE);
  const posZ = -step.y * WORLD_SCALE;
  missileMesh.position.set(posX, posY, posZ);

  // 2. Missile Orientation based on velocity vector
  const vel = new THREE.Vector3(step.vx, step.vz, -step.vy).normalize();
  if (vel.lengthSq() > 0.001) {
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, vel);
    missileMesh.quaternion.copy(quat);
  }

  // 3. Flame effect (only while thrusting, z acceleration high or early flight)
  if (step.time_step < 75 && step.mach < 5.0) {
    flameMesh.visible = true;
    flameMesh.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.5, 1 + Math.random() * 0.4);
  } else {
    flameMesh.visible = false;
  }

  // 4. Camera view modes
  updateCameraView(step, posX, posY, posZ);

  // 5. Update Time displays & Slider
  document.getElementById('time-current').textContent = formatSeconds(step.time_step);
  const slider = document.getElementById('time-slider');
  slider.value = index;
  const progressPercent = (index / (currentTrajectory.length - 1)) * 100;
  document.getElementById('slider-progress').style.width = `${progressPercent}%`;

  // 6. Update Top-Right HUD Telemetry
  updateTelemetryUI(step);
}

function updateCameraView(step, posX, posY, posZ) {
  const mode = document.getElementById('camera-mode').value;

  if (mode === 'follow') {
    // Smooth follow behind missile
    const vel = new THREE.Vector3(step.vx, step.vz, -step.vy).normalize();
    const offset = vel.clone().multiplyScalar(-30).add(new THREE.Vector3(0, 15, 0));
    camera.position.lerp(new THREE.Vector3(posX + offset.x, posY + offset.y, posZ + offset.z), 0.1);
    controls.target.set(posX, posY, posZ);
  } else if (mode === 'top') {
    camera.position.set(posX, posY + 200, posZ);
    controls.target.set(posX, 0, posZ);
  } else if (mode === 'launch') {
    controls.target.set(posX, posY, posZ);
  } else if (mode === 'target') {
    const targetX = step.Target_X * WORLD_SCALE;
    const targetY = step.Target_Y * WORLD_SCALE;
    camera.position.set(targetX + 50, 40, -targetY + 50);
    controls.target.set(targetX, 0, -targetY);
  }
}

// Update the Top-Right Column Values HUD
function updateTelemetryUI(step) {
  // Timestamp
  document.getElementById('telemetry-timestamp').textContent = `T+ ${step.time_step.toFixed(1)}s | REC #${step.sim_id}`;

  // Highlight Cards
  const speed = Math.sqrt(step.vx * step.vx + step.vy * step.vy + step.vz * step.vz);
  const altitudeKm = step.z / 1000;
  const downrangeKm = Math.sqrt(step.x * step.x + step.y * step.y) / 1000;

  document.getElementById('val-mach').textContent = step.mach.toFixed(2);
  document.getElementById('val-altitude').textContent = altitudeKm.toFixed(2);
  document.getElementById('val-speed').textContent = speed.toFixed(1);
  document.getElementById('val-distance').textContent = downrangeKm.toFixed(2);

  // Section 1: Coordinates
  document.getElementById('col-x').textContent = step.x.toLocaleString(undefined, { maximumFractionDigits: 1 });
  document.getElementById('col-y').textContent = step.y.toLocaleString(undefined, { maximumFractionDigits: 1 });
  document.getElementById('col-z').textContent = step.z.toLocaleString(undefined, { maximumFractionDigits: 1 });

  const distToTarget = Math.sqrt(Math.pow(step.Target_X - step.x, 2) + Math.pow(step.Target_Y - step.y, 2)) / 1000;
  document.getElementById('col-dist-target').textContent = distToTarget.toFixed(2);

  // Section 2: Velocity
  document.getElementById('col-vx').textContent = step.vx.toFixed(1);
  document.getElementById('col-vy').textContent = step.vy.toFixed(1);
  document.getElementById('col-vz').textContent = step.vz.toFixed(1);
  document.getElementById('col-mach').textContent = step.mach.toFixed(2);

  // Section 3: Acceleration
  document.getElementById('col-ax').textContent = step.ax.toFixed(2);
  document.getElementById('col-ay').textContent = step.ay.toFixed(2);
  document.getElementById('col-az').textContent = step.az.toFixed(2);
  const totalG = Math.sqrt(step.ax * step.ax + step.ay * step.ay + step.az * step.az) / 9.80665;
  document.getElementById('col-atot').textContent = totalG.toFixed(2);

  // Section 4: Attitude & Aerodynamics
  document.getElementById('col-pitch').textContent = step.pitch.toFixed(2);
  document.getElementById('col-yaw').textContent = step.yaw.toFixed(2);
  document.getElementById('col-dynamic-pressure').textContent = step.dynamic_pressure.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('col-drag-force').textContent = step.drag_force.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('col-current-mass').textContent = step.current_mass.toFixed(1);
  document.getElementById('col-cd-factor').textContent = step.cd_factor.toFixed(3);

  // Section 5: Weather & Atmosphere
  document.getElementById('col-air-density').textContent = step.air_density.toFixed(4);
  document.getElementById('col-weather-pressure').textContent = step.weather_pressure.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('col-weather-temp').textContent = step.weather_temperature.toFixed(1);
  document.getElementById('col-wind-speed').textContent = step.weather_wind_speed.toFixed(1);
  document.getElementById('col-wind-uv').textContent = `${step.wind_u.toFixed(1)} / ${step.wind_v.toFixed(1)}`;

  // Section 6: Target & Launch
  document.getElementById('col-target-x').textContent = step.Target_X.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('col-target-y').textContent = step.Target_Y.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('col-target-t').textContent = step.Target_T.toFixed(1);
  document.getElementById('col-launch-elev').textContent = step.launch_elevation.toFixed(1);
  document.getElementById('col-launch-azim').textContent = step.launch_azimuth.toFixed(1);
}

// Helpers
function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (isPlaying && currentTrajectory.length > 0) {
    // Advance simulation step proportional to playSpeed
    currentStepIndex += dt * 30 * playSpeed;
    if (currentStepIndex >= currentTrajectory.length - 1) {
      currentStepIndex = currentTrajectory.length - 1;
      isPlaying = false;
      const icon = document.getElementById('play-icon');
      if (icon) {
        icon.setAttribute('data-lucide', 'rotate-ccw');
        if (window.lucide) lucide.createIcons();
      }
    }
    updateSimulationStep(Math.floor(currentStepIndex));
  }

  controls.update();
  renderer.render(scene, camera);
}
