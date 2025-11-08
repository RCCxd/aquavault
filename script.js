/* main script for Marine Dex / AquaVault
   Extracted from original HTML to keep structure clean.
*/

// ====== Dark mode ======
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  document.documentElement.classList.toggle('dark', event.matches);
});

// ====== Data & Persistence ======
const STORAGE_KEY = 'aquavault_species_v2';
const nowTs = () => Date.now();

const SAMPLE_SPECIES = [
  {
    id: 1,
    name: 'Baleia-franca-austral',
    scientificName: 'Eubalaena australis',
    image: `https://raw.githubusercontent.com/RCCxd/imagensvault/main/${encodeURIComponent('Baleia-franca-austral')}.png`,
    riskLevel: 'Em Perigo',
    characteristics: 'Baleia de grande porte, até 18 m. Calosidades brancas na cabeça e ausência de barbatana dorsal.',
    location: 'Costa sul e sudeste do Brasil (SC e RS)',
    habitat: 'Águas costeiras temperadas; áreas protegidas para reprodução',
    diet: 'Filtradora: copépodes e pequenos crustáceos',
    riskDetails: 'Ameaças: colisão com embarcações, poluição sonora, mudanças climáticas e pesca acidental.',
    ecologicalRole: 'Dispersora de nutrientes entre áreas oceânicas; contribui para a produtividade marinha.',
    createdAt: nowTs() - 3000,
  }
];

let species = loadSpecies();
let currentSpecies = null;
let editingId = null;
let lastActiveElement = null;

// ====== GitHub Config & Upload ======
const GH_CFG_KEY = 'aquavault_github_cfg_v1';
function getGitHubConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(GH_CFG_KEY) || '{}');
    return {
      owner: saved.owner || 'RCCxd',
      repo: saved.repo || 'imagensvault',
      branch: saved.branch || 'main',
      token: saved.token || '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'
    };
  } catch (_) {
    return { owner: 'RCCxd', repo: 'imagensvault', branch: 'main', token: '' };
  }
}
function saveGitHubConfig(cfg) { localStorage.setItem(GH_CFG_KEY, JSON.stringify(cfg)); }
async function toBase64(file) { const dataUrl = await readAsDataURL(file); return dataUrl.split(',')[1]; }
async function uploadImageToGitHub(speciesName, file) {
  const cfg = getGitHubConfig();
  if (!cfg.token) throw new Error('Configure o token do GitHub nas configurações.');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const fileName = `${speciesName}.${ext}`;
  const path = `${fileName}`;
  const content = await toBase64(file);
  const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;

  // try to get sha first
  let sha;
  try {
    const metaRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(cfg.branch)}`, { headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' } });
    if (metaRes.ok) { const meta = await metaRes.json(); sha = meta.sha; }
  } catch (_) {}

  const body = { message: sha ? `chore(images): update ${speciesName}` : `feat(images): add ${speciesName}`, content, branch: cfg.branch, ...(sha ? { sha } : {}) };
  const res = await fetch(apiUrl, { method: 'PUT', headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' }, body: JSON.stringify(body) });
  if (!res.ok) { const txt = await res.text(); throw new Error(`Falha ao enviar imagem ao GitHub: ${res.status} ${txt}`); }
  return { fileName, rawUrl: `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encodeURIComponent(path)}` };
}

async function deleteImageFromGitHub(sp) {
  const cfg = getGitHubConfig();
  if (!cfg.token) return { ok: false, reason: 'no-token' };

  let candidates = [];
  if (sp.image) {
    try {
      const u = new URL(sp.image);
      if (u.hostname === 'raw.githubusercontent.com') {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 4 && parts[0] === cfg.owner && parts[1] === cfg.repo) {
          const filePath = decodeURIComponent(parts.slice(3).join('/'));
          candidates.push(filePath);
        }
      }
    } catch (_) {}
  }
  if (candidates.length === 0) {
    const base = sp.name;
    ['png','jpg','jpeg','webp'].forEach(ext => candidates.push(`${base}.${ext}`));
  }

  for (const file of candidates) {
    const path = encodeURIComponent(file);
    const metaUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`;
    const metaRes = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' } });
    if (!metaRes.ok) continue;
    const meta = await metaRes.json();
    if (!meta.sha) continue;
    const delUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
    const body = { message: `chore(images): remove ${sp.name}`, sha: meta.sha, branch: cfg.branch };
    const delRes = await fetch(delUrl, { method: 'DELETE', headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (delRes.ok) return { ok: true, file };
  }
  return { ok: false };
}

function loadSpecies() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : SAMPLE_SPECIES;
  } catch (e) {
    console.warn('Falha ao carregar do storage', e);
    return SAMPLE_SPECIES;
  }
}
function saveAll() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(species)); } catch (e) { console.warn('Falha ao salvar', e); } }

// ====== Utils ======
const debounce = (fn, ms = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); } };
const riskOrder = {
  'Criticamente em Perigo': 6,
  'Em Perigo': 5,
  'Vulnerável': 4,
  'Quase Ameaçada': 3,
  'Pouco Preocupante': 2,
  'Superpopulação': 1
};
function getRiskColor(riskLevel) {
  const colors = {
    'Criticamente em Perigo': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'Em Perigo': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'Vulnerável': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'Quase Ameaçada': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Pouco Preocupante': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Superpopulação': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return colors[riskLevel] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
}
function hashColor(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i); const palette = ['#4281a4', '#2d5016', '#8b5cf6', '#059669', '#dc2626']; return palette[Math.abs(h) % palette.length]; }
function generatePlaceholderImage(name) {
  const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 200; const ctx = canvas.getContext('2d'); const bgColor = hashColor(name); ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 200, 200); ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const words = name.split(' '); const maxWidth = 160; let line = ''; let y = 90; for (let n = 0; n < words.length; n++) { const test = line + words[n] + ' '; const w = ctx.measureText(test).width; if (w > maxWidth && n > 0) { ctx.fillText(line, 100, y); line = words[n] + ' '; y += 20; } else { line = test; } } ctx.fillText(line, 100, y); return canvas.toDataURL();
}
const readAsDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

// ====== Render ======
function renderSpecies(list = species) {
  const grid = document.getElementById('speciesGrid');
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-6xl mb-4">🔍</div>
        <h3 class="text-xl font-medium text-gray-500 dark:text-gray-400 mb-2">Nenhuma espécie encontrada</h3>
        <p class="text-gray-400 dark:text-gray-500">Tente ajustar os filtros de busca</p>
      </div>`;
    return;
  }
  list.forEach((sp) => {
    const card = document.createElement('article');
    card.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-shadow';
    card.tabIndex = 0; // acessibilidade
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => openSpeciesModal(sp));
    card.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSpeciesModal(sp); } });
    const imageUrl = sp.image || generatePlaceholderImage(sp.name);
    card.innerHTML = `
      <div class="relative">
        <img src="${imageUrl}" alt="${sp.name}" class="w-full h-48 object-cover rounded-t-xl" loading="lazy" decoding="async" />
        <div class="absolute top-3 right-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(sp.riskLevel)}">${sp.riskLevel}</span></div>
      </div>
      <div class="p-6">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">${sp.name}</h3>
        <p class="text-gray-600 dark:text-gray-400 italic mb-3">${sp.scientificName}</p>
        <p class="text-gray-700 dark:text-gray-300 text-sm line-clamp-3">${sp.characteristics || ''}</p>
      </div>`;
    const imgEl = card.querySelector('img');
    if (imgEl) {
      imgEl.setAttribute('sizes', '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px');
      imgEl.setAttribute('srcset', `${imageUrl} 1x`);
      imgEl.width = 768; // layout hint to reduce CLS
      imgEl.height = 192;
      imgEl.addEventListener('error', () => { imgEl.src = generatePlaceholderImage(sp.name); });
    }
    grid.appendChild(card);
  });
}

// ====== Filters & Sort ======
function applyFilters() {
  const term = document.getElementById('searchInput').value.trim().toLowerCase();
  const risk = document.getElementById('riskFilter').value;
  const sort = document.getElementById('sortSelect').value;

  let filtered = species.filter((sp) => {
    const inText = `${sp.name} ${sp.scientificName}`.toLowerCase();
    const matchesSearch = !term || inText.includes(term);
    const matchesRisk = !risk || sp.riskLevel === risk;
    return matchesSearch && matchesRisk;
  });

  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'risk') filtered.sort((a, b) => (riskOrder[b.riskLevel] || 0) - (riskOrder[a.riskLevel] || 0));
  if (sort === 'recent') filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  renderSpecies(filtered);
}

// ====== Modal (view) ======
function openSpeciesModal(sp) {
  currentSpecies = sp;
  const modalImg = document.getElementById('modalImage');
  const src = sp.image || generatePlaceholderImage(sp.name);
  modalImg.src = src;
  modalImg.setAttribute('sizes', '(max-width: 640px) 25vw, 80px');
  modalImg.setAttribute('srcset', `${src} 1x`);
  modalImg.width = 80;
  modalImg.height = 80;
  modalImg.onerror = () => { modalImg.onerror = null; modalImg.src = generatePlaceholderImage(sp.name); };
  document.getElementById('modalTitle').textContent = sp.name;
  document.getElementById('modalScientificName').textContent = sp.scientificName;
  document.getElementById('modalRiskBadge').innerHTML = `<span class="px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(sp.riskLevel)}">${sp.riskLevel}</span>`;
  if (sp.audioUrl) {
    document.getElementById('audioSection').classList.remove('hidden');
    document.getElementById('audioSource').src = sp.audioUrl;
    document.getElementById('audioPlayer').load();
  } else {
    document.getElementById('audioSection').classList.add('hidden');
  }
  switchTab('caracteristicas');
  openDialog('speciesModal');
}
function closeSpeciesModal() { closeDialog('speciesModal'); currentSpecies = null; }

function switchTab(tabName) {
  document.querySelectorAll('#tabsNav .tab-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('border-primary', isActive);
    btn.classList.toggle('text-primary', isActive);
    btn.classList.toggle('border-transparent', !isActive);
    btn.classList.toggle('text-gray-500', !isActive);
  });
  const sp = currentSpecies;
  const content = document.getElementById('tabContent');
  const tabContent = {
    caracteristicas: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Características Físicas</h3><p class="text-gray-700 dark:text-gray-300 leading-relaxed">${sp.characteristics || '—'}</p></div>`,
    localizacao: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Localização no Brasil</h3><p class="text-gray-700 dark:text-gray-300 leading-relaxed">${sp.location || '—'}</p></div>`,
    habitat: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Habitat Natural</h3><p class="text-gray-700 dark:text-gray-300 leading-relaxed">${sp.habitat || '—'}</p></div>`,
    alimentacao: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Hábitos Alimentares</h3><p class="text-gray-700 dark:text-gray-300 leading-relaxed">${sp.diet || '—'}</p></div>`,
    risco: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Status de Conservação</h3><div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"><div class="flex items-center mb-2"><i class="fas fa-exclamation-triangle text-red-500 mr-2"></i><span class="font-medium text-red-800 dark:text-red-200">${sp.riskLevel}</span></div><p class="text-red-700 dark:text-red-300 leading-relaxed">${sp.riskDetails || '—'}</p></div></div>`,
    nicho: `<div class="space-y-4"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">Papel Ecológico</h3><p class="text-gray-700 dark:text-gray-300 leading-relaxed">${sp.ecologicalRole || '—'}</p></div>`,
  };
  content.innerHTML = tabContent[tabName] || '<p>Conteúdo não disponível</p>';
}

// ====== Modal (edit) ======
function openEditModal(id = null) {
  editingId = id;
  const isEditing = id !== null;
  document.getElementById('editModalTitle').textContent = isEditing ? 'Editar Espécie' : 'Adicionar Espécie';
  const form = document.getElementById('speciesForm');
  form.reset();
  if (isEditing) {
    const sp = species.find((s) => s.id === id);
    document.getElementById('formName').value = sp.name || '';
    document.getElementById('formScientificName').value = sp.scientificName || '';
    document.getElementById('formRisk').value = sp.riskLevel || '';
    document.getElementById('formCharacteristics').value = sp.characteristics || '';
    document.getElementById('formLocation').value = sp.location || '';
    document.getElementById('formHabitat').value = sp.habitat || '';
    document.getElementById('formDiet').value = sp.diet || '';
    document.getElementById('formRiskDetails').value = sp.riskDetails || '';
    document.getElementById('formEcologicalRole').value = sp.ecologicalRole || '';
  }
  openDialog('editModal');
}
function closeEditModal() { closeDialog('editModal'); editingId = null; }

// ====== Dialog helpers (focus trap + restore) ======
function openDialog(id) {
  lastActiveElement = document.activeElement;
  document.getElementById(id).classList.remove('hidden');
  // rudimentary focus trap: focus first button/input inside
  const trap = document.querySelector(`#${id} [data-focus-trap]`);
  const focusable = trap.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus();
  document.addEventListener('keydown', escClose);
}
function closeDialog(id) { document.getElementById(id).classList.add('hidden'); document.removeEventListener('keydown', escClose); if (lastActiveElement) lastActiveElement.focus(); }
function escClose(e) { if (e.key === 'Escape') { if (!document.getElementById('editModal').classList.contains('hidden')) closeEditModal(); else if (!document.getElementById('speciesModal').classList.contains('hidden')) closeSpeciesModal(); } }

// ====== Create/Update/Delete ======
async function saveSpecies(e) {
  e.preventDefault();
  const audioFile = document.getElementById('formAudio').files[0];
  const imageFile = document.getElementById('formImage').files[0];

  let speciesData = {
    name: document.getElementById('formName').value.trim(),
    scientificName: document.getElementById('formScientificName').value.trim(),
    riskLevel: document.getElementById('formRisk').value,
    characteristics: document.getElementById('formCharacteristics').value.trim(),
    location: document.getElementById('formLocation').value.trim(),
    habitat: document.getElementById('formHabitat').value.trim(),
    diet: document.getElementById('formDiet').value.trim(),
    riskDetails: document.getElementById('formRiskDetails').value.trim(),
    ecologicalRole: document.getElementById('formEcologicalRole').value.trim(),
  };

  if (!speciesData.name || !speciesData.scientificName || !speciesData.riskLevel) { showAlert('Preencha os campos obrigatórios.', 'error'); return; }

  try {
    const audData = audioFile ? await readAsDataURL(audioFile) : null;
    if (audData) speciesData.audioUrl = audData;
  } catch (err) { console.warn('Falha ao ler arquivos', err); }

  const baseNameCheck = (file) => {
    const base = file.name.replace(/\.[^.]+$/, '').trim();
    const typed = speciesData.name.trim();
    const match = base.localeCompare(typed, undefined, { sensitivity: 'base' }) === 0 || base.toLowerCase() === typed.toLowerCase();
    return match;
  };

  if (editingId) {
    const idx = species.findIndex((s) => s.id === editingId);
    if (idx === -1) { showAlert('Espécie não encontrada.', 'error'); return; }
    // Upload image first if provided
    if (imageFile) {
      if (!baseNameCheck(imageFile)) { showAlert('O nome do arquivo deve ser exatamente o nome da espécie.', 'error'); return; }
      try {
        const { rawUrl } = await uploadImageToGitHub(species[idx].name, imageFile);
        speciesData.image = rawUrl;
      } catch (err) {
        console.error(err);
        showAlert(err.message || 'Falha ao enviar imagem ao GitHub.', 'error');
        return;
      }
    }
    species[idx] = { ...species[idx], ...speciesData };
    showAlert('Espécie atualizada com sucesso!');
    saveAll();
  } else {
    // Create first so it's "on the code" before uploading image
    const newId = Date.now();
    const createdAt = nowTs();
    const newSp = { id: newId, createdAt, ...speciesData };
    species.push(newSp);
    saveAll();
    // Then upload image if provided
    if (imageFile) {
      if (!baseNameCheck(imageFile)) { showAlert('O nome do arquivo deve ser exatamente o nome da espécie.', 'error'); return; }
      try {
        const { rawUrl } = await uploadImageToGitHub(newSp.name, imageFile);
        const j = species.findIndex((s) => s.id === newId);
        if (j !== -1) { species[j].image = rawUrl; saveAll(); }
      } catch (err) {
        console.error(err);
        showAlert(err.message || 'Falha ao enviar imagem ao GitHub.', 'error');
        // keep species without image
      }
    }
    showAlert('Espécie adicionada com sucesso!');
  }
  renderSpecies();
  closeEditModal();
}

async function deleteCurrentSpecies() {
  if (!currentSpecies) return;
  if (!confirm(`Excluir "${currentSpecies.name}"?`)) return;
  species = species.filter((s) => s.id !== currentSpecies.id);
  saveAll();
  renderSpecies();
  closeSpeciesModal();
  showAlert('Espécie excluída.');
}

// ====== Import/Export JSON ======
function exportJSON() { const blob = new Blob([JSON.stringify(species, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'aquavault_species.json'; a.click(); URL.revokeObjectURL(url); }
async function importJSON(file) { try { const text = await file.text(); const data = JSON.parse(text); if (!Array.isArray(data)) throw new Error('Formato inválido'); species = data.map((d) => ({ createdAt: d.createdAt || nowTs(), ...d })); saveAll(); applyFilters(); showAlert('Dados importados com sucesso!'); } catch (e) { showAlert('Falha ao importar JSON.', 'error'); } }

// ====== Audio ======
function playAudio() { const audioPlayer = document.getElementById('audioPlayer'); if (audioPlayer && currentSpecies && currentSpecies.audioUrl) { audioPlayer.play(); } else { showAlert('Áudio não disponível para esta espécie', 'error'); } }
function pauseAudio() {
  const audioPlayer = document.getElementById('audioPlayer');
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
    showAlert('Áudio pausado.', 'success');
  }
}

function resumeAudio() {
  const audioPlayer = document.getElementById('audioPlayer');
  if (audioPlayer && audioPlayer.paused) {
    audioPlayer.play();
    showAlert('Áudio retomado.', 'success');
  }
}

// ====== Alerts ======
function showAlert(message, type = 'success') { const alertDiv = document.createElement('div'); const base = 'fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all toast-show'; const color = type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'; alertDiv.className = `${base} ${color}`; alertDiv.textContent = message; document.body.appendChild(alertDiv); setTimeout(() => { alertDiv.style.opacity = '0'; setTimeout(() => alertDiv.remove(), 300); }, 2500); }

// ====== Events ======
function setupEventListeners() {
  document.getElementById('addSpeciesBtn').addEventListener('click', () => openEditModal());
  document.getElementById('closeModal').addEventListener('click', closeSpeciesModal);
  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('editSpeciesBtn').addEventListener('click', () => currentSpecies && openEditModal(currentSpecies.id));
  document.getElementById('deleteSpeciesBtn').addEventListener('click', (e) => { e.preventDefault(); performDeleteSpecies(); });
  document.getElementById('playAudioBtn').addEventListener('click', playAudio);
  document.getElementById('pauseAudioBtn').addEventListener('click', pauseAudio);
  document.getElementById('resumeAudioBtn').addEventListener('click', resumeAudio);

  document.getElementById('tabsNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  document.getElementById('speciesForm').addEventListener('submit', saveSpecies);

  document.getElementById('speciesModal').addEventListener('click', (e) => { if (e.target.id === 'speciesModal') closeSpeciesModal(); });
  document.getElementById('editModal').addEventListener('click', (e) => { if (e.target.id === 'editModal') closeEditModal(); });

  document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 150));
  document.getElementById('riskFilter').addEventListener('change', applyFilters);
  document.getElementById('sortSelect').addEventListener('change', applyFilters);

  document.getElementById('exportBtn').addEventListener('click', exportJSON);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
  document.getElementById('importInput').addEventListener('change', (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });

  // GitHub settings modal
  const ghBtn = document.getElementById('githubSettingsBtn');
  const ghModal = document.getElementById('githubSettingsModal');
  const ghClose = document.getElementById('closeGithubSettings');
  const ghSave = document.getElementById('saveGithubSettings');
  const ghOwner = document.getElementById('ghOwner');
  const ghRepo = document.getElementById('ghRepo');
  const ghBranch = document.getElementById('ghBranch');
  const ghToken = document.getElementById('ghToken');

  const openGh = () => { const c = getGitHubConfig(); ghOwner.value = c.owner; ghRepo.value = c.repo; ghBranch.value = c.branch; ghToken.value = c.token; ghModal.classList.remove('hidden'); };
  const closeGh = () => ghModal.classList.add('hidden');
  if (ghBtn) ghBtn.addEventListener('click', openGh);
  if (ghClose) ghClose.addEventListener('click', closeGh);
  if (ghModal) ghModal.addEventListener('click', (e) => { if (e.target.id === 'githubSettingsModal') closeGh(); });
  if (ghSave) ghSave.addEventListener('click', () => {
    const cfg = { owner: ghOwner.value.trim(), repo: ghRepo.value.trim(), branch: ghBranch.value.trim() || 'main', token: ghToken.value.trim() };
    if (!cfg.owner || !cfg.repo) { showAlert('Owner e Repo são obrigatórios.', 'error'); return; }
    saveGitHubConfig(cfg);
    showAlert('Configurações do GitHub salvas.');
    closeGh();
  });

  // Upload logo handler
  const logoInput = document.getElementById('ghLogoFile');
  const logoBtn = document.getElementById('uploadLogoBtn');
  if (logoBtn) logoBtn.addEventListener('click', async () => {
    if (!logoInput || !logoInput.files || !logoInput.files[0]) { showAlert('Selecione um arquivo de imagem para o logo.', 'error'); return; }
    const file = logoInput.files[0];
    const cfg = getGitHubConfig();
    if (!cfg.token) { showAlert('Configure o token do GitHub primeiro.', 'error'); return; }
    try {
      const content = await toBase64(file);
      const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent('logo.png')}`;
      let sha;
      const metaRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(cfg.branch)}`, { headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' } });
      if (metaRes.ok) { const meta = await metaRes.json(); sha = meta.sha; }
      const body = { message: sha ? 'chore(logo): update logo.png' : 'feat(logo): add logo.png', content, branch: cfg.branch, ...(sha ? { sha } : {}) };
      const put = await fetch(apiUrl, { method: 'PUT', headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' }, body: JSON.stringify(body) });
      if (!put.ok) { const txt = await put.text(); throw new Error(`${put.status} ${txt}`); }
      const ts = Date.now();
      const logoEl = document.getElementById('siteLogoImg');
      if (logoEl) logoEl.src = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/logo.png`;
      showAlert('Logo enviado para o GitHub.');
    } catch (err) {
      console.error(err);
      showAlert('Falha ao enviar o logo.', 'error');
    }
  });

  // About / Quem somos modal with editable content
  const ABOUT_KEY = 'aquavault_about_v1';
  const aboutBtn = document.getElementById('aboutBtn');
  const aboutModal = document.getElementById('aboutModal');
  const closeAboutBtn = document.getElementById('closeAboutBtn');
  const closeAboutBtnText = document.getElementById('closeAboutBtnText');
  const editAboutBtn = document.getElementById('editAboutBtn');
  const saveAboutBtn = document.getElementById('saveAboutBtn');
  const aboutContent = document.getElementById('aboutContent');

  const loadAbout = () => {
    try {
      const saved = localStorage.getItem(ABOUT_KEY);
      if (saved) aboutContent.innerHTML = saved;
    } catch (_) {}
  };
  const openAbout = () => { loadAbout(); aboutModal.classList.remove('hidden'); };
  const closeAbout = () => {
    aboutModal.classList.add('hidden');
    // ensure editing off when closing
    if (aboutContent && aboutContent.isContentEditable) {
      aboutContent.contentEditable = 'false';
      editAboutBtn.classList.remove('hidden');
      saveAboutBtn.classList.add('hidden');
    }
  };
  const enableEdit = () => {
    if (!aboutContent) return;
    aboutContent.contentEditable = 'true';
    aboutContent.focus();
    editAboutBtn.classList.add('hidden');
    saveAboutBtn.classList.remove('hidden');
  };
  const saveAbout = () => {
    try { localStorage.setItem(ABOUT_KEY, aboutContent.innerHTML); } catch (_) {}
    aboutContent.contentEditable = 'false';
    editAboutBtn.classList.remove('hidden');
    saveAboutBtn.classList.add('hidden');
    showAlert('Informações salvas.');
  };

  // Open on hover and click (for accessibility)
  if (aboutBtn) {
    aboutBtn.addEventListener('mouseenter', openAbout);
    aboutBtn.addEventListener('click', (e) => { e.preventDefault(); openAbout(); });
  }
  if (closeAboutBtn) closeAboutBtn.addEventListener('click', closeAbout);
  if (closeAboutBtnText) closeAboutBtnText.addEventListener('click', closeAbout);
  if (aboutModal) aboutModal.addEventListener('click', (e) => { if (e.target.id === 'aboutModal') closeAbout(); });
  if (aboutModal) aboutModal.addEventListener('mouseleave', closeAbout);
  if (editAboutBtn) editAboutBtn.addEventListener('click', enableEdit);
  if (saveAboutBtn) saveAboutBtn.addEventListener('click', saveAbout);

  // Fullscreen toggle with F11
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    } else if (e.key === 'Escape') {
      // ESC closes About panel if open
      if (aboutModal && !aboutModal.classList.contains('hidden')) {
        e.preventDefault();
        closeAbout();
      }
    }
  });
}

// Delete species + image via GitHub
async function performDeleteSpecies() {
  if (!currentSpecies) return;
  if (!confirm(`Excluir "${currentSpecies.name}"?`)) return;
  try {
    const res = await deleteImageFromGitHub(currentSpecies);
    if (res && res.ok) showAlert('Imagem removida do GitHub.');
  } catch (err) {
    console.warn('Falha ao remover imagem no GitHub', err);
  }
  species = species.filter((s) => s.id !== currentSpecies.id);
  saveAll();
  renderSpecies();
  closeSpeciesModal();
  showAlert('Espécie excluída.');
}

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => { renderSpecies(); setupEventListeners(); applyFilters(); });
