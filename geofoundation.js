/* ---------- Soil Layer Management ---------- */
const defaultLayers = [
  { from: 0.0, to: 1.5, desc: 'Lateritic Clay', gamma: 18, c: 25, phi: 20, spt: 12 },
  { from: 1.5, to: 4.0, desc: 'Sandy Clay', gamma: 19, c: 15, phi: 25, spt: 18 },
  { from: 4.0, to: 8.0, desc: 'Medium Dense Sand', gamma: 20, c: 0, phi: 32, spt: 30 }
];

const soilOptions = [
  'Lateritic Clay','Fill','Sandy Clay','Clay','Sand','Medium Dense Sand','Dense Sand','Gravel','Silt'
];

const GAMMA_WATER = 9.81; // kN/m³

function renderLayers() {
  const tbody = document.getElementById('soilLayersBody');
  tbody.innerHTML = '';
  window.layers.forEach((layer, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="layer-num">${String(i+1).padStart(2,'0')}</div></td>
      <td><input type="number" step="0.1" value="${layer.from}" onchange="updateLayer(${i},'from',this.value)" style="width:80px"></td>
      <td><input type="number" step="0.1" value="${layer.to}" onchange="updateLayer(${i},'to',this.value)" style="width:80px"></td>
      <td>
        <select onchange="updateLayer(${i},'desc',this.value)">
          ${soilOptions.map(o => `<option ${o===layer.desc?'selected':''}>${o}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" value="${layer.gamma}" onchange="updateLayer(${i},'gamma',this.value)" style="width:70px"></td>
      <td><input type="number" value="${layer.c}" onchange="updateLayer(${i},'c',this.value)" style="width:70px"></td>
      <td><input type="number" value="${layer.phi}" onchange="updateLayer(${i},'phi',this.value)" style="width:70px"></td>
      <td><input type="number" value="${layer.spt}" onchange="updateLayer(${i},'spt',this.value)" style="width:70px"></td>
      <td>
        <button type="button" class="btn-remove" onclick="removeLayer(${i})" title="Remove layer" ${window.layers.length<=1?'disabled':''}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateLayer(index, key, value) {
  if (['from','to','gamma','c','phi','spt'].includes(key)) {
    window.layers[index][key] = parseFloat(value) || 0;
  } else {
    window.layers[index][key] = value;
  }
}

function addLayer() {
  const last = window.layers[window.layers.length - 1];
  const newFrom = last ? last.to : 0;
  window.layers.push({
    from: newFrom,
    to: newFrom + 2,
    desc: 'Sand',
    gamma: 19,
    c: 0,
    phi: 30,
    spt: 20
  });
  renderLayers();
}

function removeLayer(index) {
  if (window.layers.length <= 1) return;
  window.layers.splice(index, 1);
  renderLayers();
}

/* ---------- Standard toggle ---------- */
function toggleStandardInputs() {
  const std = document.getElementById('designStandard').value;
  const fosGroup = document.getElementById('fosGroup');
  const gammaRGroup = document.getElementById('gammaRGroup');
  const note = document.getElementById('methodNote');

  if (std === 'eurocode7') {
    fosGroup.style.display = 'none';
    gammaRGroup.style.display = 'block';
    note.innerHTML = 'Eurocode 7 selected: Design Approach 2 (A1 + M1 + R2). Characteristic resistance per Annex D (drained), divided by γ<sub>R</sub> = 1.4. Design action ≈ 1.35 × service pressure. Groundwater reduces effective unit weight when at/above founding level.';
  } else {
    fosGroup.style.display = 'block';
    gammaRGroup.style.display = 'none';
    note.textContent = 'Classical method selected: Ultimate bearing capacity (Vesić-style factors) divided by Factor of Safety. Groundwater reduces effective unit weight when at/above founding level.';
  }
}

/* ---------- Calculations ---------- */
function getFoundingLayer() {
  const depth = parseFloat(document.getElementById('foundationDepth').value) || 1.5;
  for (const layer of window.layers) {
    if (depth >= layer.from && depth <= layer.to) return layer;
  }
  return window.layers[window.layers.length - 1];
}

/**
 * Returns effective unit weights accounting for groundwater.
 * - gamma_surcharge: unit weight used for overburden q' above foundation base
 * - gamma_base: unit weight used for the 0.5 γ B Nγ term (soil below base)
 *
 * Simplified approach (common for preliminary design):
 * - If GWL is well below base → use bulk γ everywhere
 * - If GWL is at or above base → use submerged γ' = γ − 9.81 for soil below water
 * - Partial submergence of the surcharge zone is approximated
 */
function getEffectiveUnitWeights(bulkGamma, foundationDepth, gwlDepth) {
  const gammaPrime = Math.max(bulkGamma - GAMMA_WATER, 8); // avoid unrealistically low values

  // Case 1: GWL below founding level → dry
  if (gwlDepth > foundationDepth + 0.05) {
    return {
      gammaSurcharge: bulkGamma,
      gammaBase: bulkGamma,
      submerged: false,
      note: 'Groundwater is below founding level – bulk unit weight used.'
    };
  }

  // Case 2: GWL at or above founding level → submerged conditions dominate
  // Surcharge: if GWL is above ground surface (or very shallow), full buoyancy on surcharge
  // Simplified: use γ' for both when water is at/above base (conservative for capacity)
  return {
    gammaSurcharge: gammaPrime,
    gammaBase: gammaPrime,
    submerged: true,
    note: 'Groundwater at or above founding level – submerged unit weight γ′ = γ − 9.81 used (reduced capacity).'
  };
}

function bearingFactors(phiDeg) {
  if (phiDeg <= 0) return { Nc: 5.14, Nq: 1.0, Ngamma: 0.0 };
  const phi = phiDeg * Math.PI / 180;
  const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
  const Nc = (Nq - 1) / Math.tan(phi);
  const Ngamma = 2 * (Nq - 1) * Math.tan(phi);
  return { Nc, Nq, Ngamma };
}

function shapeFactors(phiDeg, Nq) {
  if (phiDeg <= 0) return { sc: 1.2, sq: 1.0, sgamma: 0.7 };
  const phi = phiDeg * Math.PI / 180;
  const sq = 1 + Math.sin(phi);
  const sc = (sq * Nq - 1) / (Nq - 1);
  const sgamma = 0.7;
  return { sc, sq, sgamma };
}

function calculateClassical(layer) {
  const bulkGamma = layer.gamma;
  const cohesion = layer.c;
  const friction = layer.phi;
  const depth = parseFloat(document.getElementById('foundationDepth').value);
  const width = parseFloat(document.getElementById('footingWidth').value);
  const fos = parseFloat(document.getElementById('fos').value) || 3;
  const gwl = parseFloat(document.getElementById('groundwater').value);

  const { gammaSurcharge, gammaBase, submerged, note } = getEffectiveUnitWeights(bulkGamma, depth, gwl);

  const phi = friction * Math.PI / 180;
  let Nc, Nq, Ngamma;
  if (friction === 0) {
    Nc = 5.7; Nq = 1.0; Ngamma = 0.0;
  } else {
    Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
    Nc = (1 / Math.tan(phi)) * (Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2) - 1);
    Ngamma = 2 * (Nq + 1) * Math.tan(phi);
  }

  const surcharge = gammaSurcharge * depth;
  const ultimate = cohesion * Nc + surcharge * Nq + 0.5 * gammaBase * width * Ngamma;
  return { ultimate, allowable: ultimate / fos, submerged, gwNote: note };
}

function calculateEurocode(layer) {
  const bulkGamma = layer.gamma;
  const cohesion = layer.c;
  const friction = layer.phi;
  const depth = parseFloat(document.getElementById('foundationDepth').value);
  const width = parseFloat(document.getElementById('footingWidth').value);
  const gammaR = parseFloat(document.getElementById('gammaR').value) || 1.4;
  const gwl = parseFloat(document.getElementById('groundwater').value);

  const { gammaSurcharge, gammaBase, submerged, note } = getEffectiveUnitWeights(bulkGamma, depth, gwl);

  const { Nc, Nq, Ngamma } = bearingFactors(friction);
  const { sc, sq, sgamma } = shapeFactors(friction, Nq);
  const qPrime = gammaSurcharge * depth;

  const q_ult_k = cohesion * Nc * sc + qPrime * Nq * sq + 0.5 * gammaBase * width * Ngamma * sgamma;
  return { ultimate: q_ult_k, allowable: q_ult_k / gammaR, submerged, gwNote: note };
}

function runAssessment() {
  const columnLoad = parseFloat(document.getElementById('columnLoad').value) || 0;
  const width = parseFloat(document.getElementById('footingWidth').value) || 2;
  const floors = parseFloat(document.getElementById('floors').value) || 1;
  const area = width * width;
  const servicePressure = columnLoad / area;
  const standard = document.getElementById('designStandard').value;
  const layer = getFoundingLayer();
  const gwl = parseFloat(document.getElementById('groundwater').value);
  const fd = parseFloat(document.getElementById('foundationDepth').value);

  let result, designPressure;
  if (standard === 'eurocode7') {
    result = calculateEurocode(layer);
    designPressure = 1.35 * servicePressure;
    document.getElementById('ultimateLabel').textContent = "Characteristic Resistance Rk/A'";
    document.getElementById('allowableLabel').textContent = 'Design Resistance Rd (Rk/γR)';
    document.getElementById('requiredLabel').textContent = 'Design Pressure Ed (≈1.35·qserv)';
  } else {
    result = calculateClassical(layer);
    designPressure = servicePressure;
    document.getElementById('ultimateLabel').textContent = 'Ultimate Bearing Capacity';
    document.getElementById('allowableLabel').textContent = 'Allowable Bearing Capacity';
    document.getElementById('requiredLabel').textContent = 'Required Pressure';
  }

  document.getElementById('ultimate').textContent = result.ultimate.toFixed(0) + ' kPa';
  document.getElementById('allowable').textContent = result.allowable.toFixed(0) + ' kPa';
  document.getElementById('required').textContent = designPressure.toFixed(0) + ' kPa';

  // --- Multi-criteria decision logic (now includes groundwater) ---
  const capacityRatio = designPressure / (result.allowable || 1);
  const weakSoil = layer.phi < 22 || layer.spt < 12 || (layer.c < 15 && layer.phi < 25);
  const highRise = floors >= 8;
  const mediumRise = floors >= 5;
  const heavyLoad = columnLoad >= 1200;
  const veryHeavyLoad = columnLoad >= 2500;
  const largeFootingNeeded = capacityRatio > 1.0;
  const marginallyOK = capacityRatio > 0.75 && capacityRatio <= 1.0;
  const highWaterTable = gwl <= fd;           // GWL at or above founding level
  const veryHighWaterTable = gwl <= Math.max(fd - 0.5, 0); // well above base or near surface

  const qAllow = result.allowable || 100;
  const requiredB = Math.sqrt(columnLoad / (qAllow / (standard === 'eurocode7' ? 1.35 : 1)));
  const impracticalFooting = requiredB > 4.5;

  let recommendation = 'Isolated Footing';
  let description = '';
  let isolatedStatus = 'Suitable';
  let stripStatus = 'Suitable';
  let raftStatus = 'Consider';
  let pileStatus = 'Not Required';
  let isolatedComment = 'Adequate preliminary bearing capacity';
  let stripComment = 'Potentially suitable for wall loads';
  let raftComment = 'May be unnecessary for current loading';
  let pileComment = 'No immediate indication for deep foundation';

  // Decision tree – groundwater can escalate the recommendation
  if (veryHeavyLoad || (highRise && (weakSoil || largeFootingNeeded || highWaterTable)) || (impracticalFooting && capacityRatio > 1.3)) {
    recommendation = 'Pile Foundation';
    description = 'High structural loads, weak founding conditions and/or high groundwater make shallow foundations impractical. Pile foundations (or piled raft) are recommended for further detailed design.';
    isolatedStatus = 'Inadequate';
    isolatedComment = 'Footing size would be impractical or capacity insufficient';
    stripStatus = 'Inadequate';
    stripComment = 'Not suitable for these load levels';
    raftStatus = 'Consider';
    raftComment = 'Piled raft may be an alternative';
    pileStatus = 'Recommended';
    pileComment = 'Primary option given loads / soil / water table / height';
  } else if (largeFootingNeeded || (mediumRise && weakSoil) || (heavyLoad && capacityRatio > 0.9) || (highWaterTable && capacityRatio > 0.85) || veryHighWaterTable) {
    recommendation = 'Raft Foundation';
    description = highWaterTable
      ? 'Groundwater is at or above founding level, reducing effective bearing capacity and introducing buoyancy concerns. A raft foundation is preferred; piles remain an option if settlement or soft layers are critical.'
      : 'The trial isolated footing does not provide adequate capacity (or would become excessively large). A raft foundation is the preferred shallow option; piles remain a possible alternative if settlement is critical.';
    isolatedStatus = 'Inadequate';
    isolatedComment = 'Trial size fails, required pad too large, or high water table';
    stripStatus = 'Review';
    stripComment = 'May help only for lightly loaded walls';
    raftStatus = 'Recommended';
    raftComment = highWaterTable ? 'Best option given capacity + groundwater' : 'Best shallow foundation option';
    pileStatus = 'Consider';
    pileComment = 'Investigate if raft settlement is excessive';
  } else if (marginallyOK || (mediumRise && !weakSoil) || (highWaterTable && capacityRatio > 0.65)) {
    recommendation = 'Isolated Footing (review size)';
    description = highWaterTable
      ? 'Isolated footings may still be feasible but groundwater reduces capacity. Enlarge pads, verify buoyancy and settlement, or consider ground beams / raft.'
      : 'Isolated footings are still feasible but utilisation is relatively high. Increase trial width, verify settlement, or consider pads with ground beams.';
    isolatedStatus = 'Marginal';
    isolatedComment = 'Capacity OK but utilisation high or water table present – enlarge pads';
    stripStatus = 'Suitable';
    stripComment = 'Good for walls';
    raftStatus = 'Consider';
    raftComment = 'Optional if differential settlement or buoyancy is a concern';
    pileStatus = 'Not Required';
    pileComment = 'No strong need for deep foundations';
  } else {
    recommendation = 'Isolated Footing';
    description = standard === 'eurocode7'
      ? 'The preliminary Eurocode 7 (DA2) assessment indicates that an isolated footing is feasible. Design action Ed is within design resistance Rd for the trial dimensions.'
      : 'The preliminary assessment indicates that an isolated footing is feasible. Service pressure is within the estimated allowable bearing capacity.';
    if (result.submerged) {
      description += ' Note: submerged unit weight was used because groundwater is at/above founding level.';
    }
    isolatedStatus = 'Suitable';
    isolatedComment = 'Adequate preliminary bearing capacity';
    stripStatus = 'Suitable';
    stripComment = 'Potentially suitable for wall loads';
    raftStatus = 'Consider';
    raftComment = 'May be unnecessary for current loading';
    pileStatus = 'Not Required';
    pileComment = 'No immediate indication for deep foundation';
  }

  const badge = (s) => {
    if (s === 'Suitable' || s === 'Recommended') return 'green';
    if (s === 'Consider' || s === 'Marginal' || s === 'Review') return 'yellow';
    return 'red';
  };

  document.getElementById('recommendationTitle').textContent = recommendation;
  document.getElementById('recommendationText').textContent = description;

  document.getElementById('assessmentBody').innerHTML = `
    <tr><td>Isolated Footing</td><td><span class="badge ${badge(isolatedStatus)}">${isolatedStatus}</span></td><td>${isolatedComment}</td></tr>
    <tr><td>Strip Footing</td><td><span class="badge ${badge(stripStatus)}">${stripStatus}</span></td><td>${stripComment}</td></tr>
    <tr><td>Raft Foundation</td><td><span class="badge ${badge(raftStatus)}">${raftStatus}</span></td><td>${raftComment}</td></tr>
    <tr><td>Pile Foundation</td><td><span class="badge ${badge(pileStatus)}">${pileStatus}</span></td><td>${pileComment}</td></tr>`;

  const utilNote = capacityRatio <= 1
    ? `Utilisation ratio ≈ ${(capacityRatio*100).toFixed(0)}% of available resistance.`
    : `Trial footing is over-utilised (ratio ≈ ${(capacityRatio*100).toFixed(0)}%). Estimated required width ≈ ${requiredB.toFixed(1)} m.`;

  document.getElementById('notesList').innerHTML = `
    <li>Founding layer: ${layer.desc} (γ=${layer.gamma} kN/m³, c=${layer.c} kPa, φ=${layer.phi}°, SPT N=${layer.spt}).</li>
    <li>${result.gwNote}</li>
    <li>${utilNote}</li>
    <li>Building height: ${floors} floors · Column load: ${columnLoad} kN.</li>
    <li>Settlement assessment should be verified with laboratory parameters.</li>
    <li>Final dimensions require detailed structural and geotechnical design${standard === 'eurocode7' ? ' to the relevant National Annex' : ''}.</li>
  `;

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- Init ---------- */
window.layers = JSON.parse(JSON.stringify(defaultLayers));
document.addEventListener('DOMContentLoaded', () => {
  renderLayers();
  toggleStandardInputs();
});
