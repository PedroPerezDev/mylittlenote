'use strict';

/* ===== SUPABASE ===== */
const SUPABASE_URL  = 'https://bqseuzjuktilkcqyeugf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxc2V1emp1a3RpbGtjcXlldWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NjAyMTMsImV4cCI6MjA4OTQzNjIxM30.zYSq7-g2CaxKW0QQTzHCPM_etalLMmZN6At39VMPX0Q';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ===== ESTADO GLOBAL ===== */
let state = { habits: [], completions: {}, skips: {}, diary: {}, mood: {} };
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let diaryModalDay = null;
let chartYear  = null;
let chartMonth = null;
let currentUser = null;
let authMode    = 'login';

const STORAGE_KEY = 'habitTracker_v1';

// Hábitos del mes anterior, disponibles para copiar al navegar a un mes nuevo
let prevMonthHabits = [];

// Caché de hábitos por mes (necesario para estadísticas de meses pasados)
let habitsByMonth = {};

// Estado del modal de estadísticas
let statsYear = null, statsMonth = null;

/* ===== SUPABASE: GUARDAR MES ACTUAL ===== */
async function saveMonthToSupabase(y = currentYear, m = currentMonth) {
  if (!currentUser) return;
  const monthKey = getMonthKey(y, m);
  const data = {
    habits:      state.habits,
    completions: state.completions[monthKey] || {},
    skips:       state.skips[monthKey]       || {},
    diary:       state.diary[monthKey]       || {},
    mood:        state.mood[monthKey]        || {},
  };
  const { error } = await db.from('habits_monthly').upsert(
    { user_id: currentUser.id, month: monthKey, data },
    { onConflict: 'user_id,month' }
  );
  if (error) console.warn('Error guardando en Supabase:', error.message);
}

/* ===== SUPABASE: CARGAR UN MES (al navegar) ===== */
async function cargarMesDesdeSupabase() {
  if (!currentUser) return;
  const mk = getMonthKey();
  const { data: row, error } = await db.from('habits_monthly')
    .select('data')
    .eq('user_id', currentUser.id)
    .eq('month', mk)
    .maybeSingle();
  if (error) { console.warn('Error cargando mes:', error.message); return; }
  if (row) {
    // Mes con datos: cargar tal cual, sin tocar nada más
    state.habits          = row.data.habits      || [];
    habitsByMonth[mk]     = state.habits;
    state.completions[mk] = row.data.completions || {};
    state.skips[mk]       = row.data.skips       || {};
    state.diary[mk]       = row.data.diary       || {};
    state.mood[mk]        = row.data.mood        || {};
    saveState();
  } else {
    // Sin registro en Supabase: mes completamente nuevo → empezar vacío
    state.habits          = [];
    state.completions[mk] = {};
    state.skips[mk]       = {};
    state.diary[mk]       = {};
    state.mood[mk]        = {};
  }
}

/* ===== SUPABASE: CARGAR TODO (al hacer login) ===== */
async function cargarTodoDesdeSupabase() {
  if (!currentUser) return;
  const { data: rows, error } = await db.from('habits_monthly')
    .select('month, data')
    .eq('user_id', currentUser.id)
    .order('month', { ascending: false });
  if (error) { console.warn('Error cargando datos:', error.message); return; }

  // Sin datos en Supabase: cuenta nueva, empezar vacío
  if (!rows || rows.length === 0) {
    state = { habits: [], completions: {}, skips: {}, diary: {}, mood: {} };
    return;
  }

  // Reconstruir state desde Supabase
  state.completions = {};
  state.skips       = {};
  state.diary       = {};
  state.mood        = {};

  for (const row of rows) {
    const mk = row.month;
    habitsByMonth[mk]     = row.data.habits      || [];
    state.completions[mk] = row.data.completions || {};
    state.skips[mk]       = row.data.skips       || {};
    state.diary[mk]       = row.data.diary       || {};
    state.mood[mk]        = row.data.mood        || {};
  }

  // Hábitos del mes actual (o del más reciente si el actual no existe)
  const currentMK  = getMonthKey();
  const currentRow = rows.find(r => r.month === currentMK);
  if (currentRow) {
    state.habits = currentRow.data.habits || [];
  } else if (rows.length > 0) {
    state.habits = rows[0].data.habits || [];
  }
}


/* ===== AUTH ===== */
function updateAuthIndicator() {
  const btn = document.getElementById('btn-auth');
  if (!btn) return;
  if (currentUser) {
    btn.textContent = '✓ conectado';
    btn.classList.add('connected');
  } else {
    btn.textContent = 'entrar';
    btn.classList.remove('connected');
  }
}

function updateByline() {
  const byline = document.getElementById('app-byline');
  const nameEl = document.getElementById('app-username');
  const name   = currentUser?.user_metadata?.full_name;
  if (name) {
    nameEl.textContent = name;
    byline.hidden = false;
  } else {
    byline.hidden = true;
  }
}

function openAuthModal() {
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-error').style.color = '';
  document.getElementById('auth-name').value     = '';
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-submit').hidden      = false;
  document.getElementById('auth-logout').hidden      = true;
  document.getElementById('auth-modal-close').hidden = true;
  document.getElementById('auth-user-info').hidden   = true;
  document.querySelectorAll('.auth-tab').forEach(t => t.hidden = false);
  document.getElementById('auth-email').hidden    = false;
  document.getElementById('auth-password').hidden = false;
  setAuthMode('login');
  document.getElementById('auth-modal').hidden = false;
}

function closeAuthModal() {
  document.getElementById('auth-modal').hidden = true;
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === mode);
  });
  document.getElementById('auth-submit').textContent = mode === 'login' ? 'entrar' : 'crear cuenta';
  document.getElementById('auth-name').hidden = mode !== 'register';
}

async function submitAuth() {
  const email     = document.getElementById('auth-email').value.trim();
  const password  = document.getElementById('auth-password').value;
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');
  errorEl.textContent = '';
  errorEl.style.color = '';

  if (!email || !password) { errorEl.textContent = 'Rellena los dos campos'; return; }

  submitBtn.disabled = true;
  try {
    let result;
    if (authMode === 'login') {
      result = await db.auth.signInWithPassword({ email, password });
    } else {
      const name = document.getElementById('auth-name').value.trim();
      result = await db.auth.signUp({ email, password, options: { data: { full_name: name || null } } });
    }

    if (result.error) {
      errorEl.textContent = traducirErrorAuth(result.error.message);
      return;
    }

    // Registro con confirmación de email pendiente
    if (authMode === 'register' && !result.data.session) {
      errorEl.textContent = '¡Cuenta creada! Revisa tu email para confirmar.';
      errorEl.style.color = '#2a6e2a';
      return;
    }

    currentUser = result.data.user;
    closeAuthModal();
    updateAuthIndicator();
    updateByline();
    await cargarTodoDesdeSupabase();
    saveState();
    render();
  } catch {
    errorEl.textContent = 'Error de conexión';
  } finally {
    submitBtn.disabled = false;
  }
}

function traducirErrorAuth(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (msg.includes('User already registered'))   return 'Ya existe una cuenta con ese email';
  if (msg.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres';
  if (msg.includes('Unable to validate'))        return 'Email no válido';
  return msg;
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  habitsByMonth = {};
  state = { habits: [], completions: {}, skips: {}, diary: {}, mood: {} };
  saveState(); // limpia también el localStorage
  updateAuthIndicator();
  updateByline();
  render();
  openAuthModal();
}

/* ===== PERSISTENCIA LOCAL ===== */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
    if (!state.diary) state.diary = {};
    if (!state.mood)  state.mood  = {};
  } catch (e) {
    console.warn('Error al cargar estado:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Error al guardar estado:', e);
  }
}

/* ===== UTILIDADES ===== */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getMonthKey(y = currentYear, m = currentMonth) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getDaysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
function getDayLetter(y, m, d) {
  return DAY_LETTERS[new Date(y, m - 1, d).getDay()];
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function isToday(d) {
  const now = new Date();
  return (
    now.getFullYear() === currentYear &&
    now.getMonth() + 1 === currentMonth &&
    now.getDate() === d
  );
}

/* ===== HELPERS DIARIO ===== */
function getDiaryText(day) {
  const key = getMonthKey();
  return (state.diary[key] && state.diary[key][day]) || '';
}

function setDiaryText(day, text) {
  const key = getMonthKey();
  if (!state.diary[key]) state.diary[key] = {};
  const trimmed = text.trim();
  if (trimmed) {
    state.diary[key][day] = trimmed;
  } else {
    delete state.diary[key][day];
  }
  saveState();
  saveMonthToSupabase();
}

/* ===== HELPERS HUMOR ===== */
function getMoodValue(day, type) {
  const key = getMonthKey();
  if (!state.mood[key] || !state.mood[key][day]) return null;
  const v = state.mood[key][day][type];
  return v != null ? v : null;
}

function setMoodValue(day, type, val) {
  const key = getMonthKey();
  if (!state.mood[key])      state.mood[key] = {};
  if (!state.mood[key][day]) state.mood[key][day] = {};
  state.mood[key][day][type] = val;
  saveState();
  saveMonthToSupabase();
}

function clearMoodValue(day, type) {
  const key = getMonthKey();
  if (!state.mood[key] || !state.mood[key][day]) return;
  delete state.mood[key][day][type];
  saveState();
  saveMonthToSupabase();
}

function getDiaryPreview(day) {
  const text = getDiaryText(day);
  if (!text) return '';
  return text.split('\n')[0].trim();
}

/* ===== CONSULTAS DE ESTADO ===== */
function isCompleted(habitId, day) {
  const key = getMonthKey();
  return !!(
    state.completions[key] &&
    state.completions[key][habitId] &&
    state.completions[key][habitId].includes(day)
  );
}

function isSkipped(habitId, day) {
  const key = getMonthKey();
  return !!(
    state.skips[key] &&
    state.skips[key][habitId] &&
    state.skips[key][habitId].includes(day)
  );
}

/* ===== ACCIONES ===== */
function toggleCell(habitId, day) {
  const key = getMonthKey();
  if (!state.completions[key]) state.completions[key] = {};
  if (!state.skips[key])       state.skips[key] = {};
  if (!state.completions[key][habitId]) state.completions[key][habitId] = [];
  if (!state.skips[key][habitId])       state.skips[key][habitId] = [];

  const done    = state.completions[key][habitId];
  const skipped = state.skips[key][habitId];
  const di = done.indexOf(day);
  const si = skipped.indexOf(day);

  if (di === -1 && si === -1) {
    done.push(day);
  } else if (di !== -1) {
    done.splice(di, 1);
    skipped.push(day);
  } else {
    skipped.splice(si, 1);
  }
  saveState();
  saveMonthToSupabase();
}

async function addHabit(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  state.habits.push({ id: generateId(), name: trimmed });
  habitsByMonth[getMonthKey()] = state.habits;
  saveState();
  await saveMonthToSupabase();
  render();
}

async function deleteHabit(id) {
  const idx = state.habits.findIndex(h => h.id === id);
  if (idx === -1) return;
  state.habits.splice(idx, 1);
  habitsByMonth[getMonthKey()] = state.habits;
  // Solo limpia el mes actual — cada mes tiene sus propios hábitos
  const key = getMonthKey();
  if (state.completions[key]) delete state.completions[key][id];
  if (state.skips[key])       delete state.skips[key][id];
  saveState();
  await saveMonthToSupabase();
  render();
}

function renameHabit(id, name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return false;
  habit.name = trimmed;
  habitsByMonth[getMonthKey()] = state.habits;
  saveState();
  saveMonthToSupabase();
  return true;
}

// Devuelve true si el mes no tiene ningún dato (ni hábitos, ni completions, ni diario, ni humor)
function esMesNuevo() {
  const mk = getMonthKey();
  if (state.habits.length > 0) return false;
  const tieneCompletions = Object.values(state.completions[mk] || {}).some(arr => arr.length > 0);
  const tieneDiario      = Object.keys(state.diary[mk]        || {}).length > 0;
  const tieneMood        = Object.keys(state.mood[mk]         || {}).length > 0;
  return !tieneCompletions && !tieneDiario && !tieneMood;
}

function mostrarBotonCopiar() {
  const banner = document.getElementById('copy-habits-banner');
  if (!banner) return;
  // Mostrar solo si no hay hábitos aún y hay hábitos del mes anterior disponibles
  banner.hidden = !(state.habits.length === 0 && prevMonthHabits.length > 0 && esMesNuevo());
}

async function copiarHabitsMesAnterior() {
  state.habits = prevMonthHabits.map(h => ({ ...h }));
  habitsByMonth[getMonthKey()] = state.habits;
  saveState();
  await saveMonthToSupabase();
  document.getElementById('copy-habits-banner').hidden = true;
  render();
}

async function prevMonth() {
  if (currentUser) await saveMonthToSupabase();
  prevMonthHabits = [...state.habits];
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  await cargarMesDesdeSupabase();
  render();
}

async function nextMonth() {
  if (currentUser) await saveMonthToSupabase();
  prevMonthHabits = [...state.habits];
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  await cargarMesDesdeSupabase();
  render();
}

/* ===== SINCRONIZACIÓN DE ALINEACIÓN ===== */
function syncDiaryAlignment() {
  if (window.innerWidth < 700) {
    const diaryRows = document.getElementById('diary-rows');
    if (diaryRows) diaryRows.style.paddingTop = '0px';
    return;
  }
  const diaryRows    = document.getElementById('diary-rows');
  const gridBody     = document.getElementById('grid-body');
  const leftContent  = document.getElementById('left-content');
  const rightContent = document.getElementById('right-content');
  if (!diaryRows || !gridBody || !leftContent || !rightContent) return;

  diaryRows.style.paddingTop = '0px';

  const leftTop     = leftContent.getBoundingClientRect().top;
  const rightTop    = rightContent.getBoundingClientRect().top;
  const diaryTop    = diaryRows.getBoundingClientRect().top;
  const gridBodyTop = gridBody.getBoundingClientRect().top;

  const diaryOffset = diaryTop    - leftTop;
  const gridOffset  = gridBodyTop - rightTop;
  const needed = Math.max(0, gridOffset - diaryOffset);

  diaryRows.style.paddingTop = needed + 'px';
}

/* ===== MODAL DIARIO ===== */
function openDiaryModal(day) {
  diaryModalDay = day;
  const label = `${day} de ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
  document.getElementById('diary-modal-day-label').textContent = label;
  document.getElementById('diary-modal-text').value = getDiaryText(day);
  document.getElementById('diary-modal').hidden = false;
  setTimeout(() => document.getElementById('diary-modal-text').focus(), 30);
}

function closeDiaryModal() {
  if (diaryModalDay === null) return;
  const text = document.getElementById('diary-modal-text').value;
  setDiaryText(diaryModalDay, text);
  updateDiaryRowPreview(diaryModalDay);
  diaryModalDay = null;
  document.getElementById('diary-modal').hidden = true;
}

function updateDiaryRowPreview(day) {
  const row = document.querySelector(`.diary-row[data-day="${day}"]`);
  if (!row) return;
  const preview = row.querySelector('.diary-preview');
  if (!preview) return;
  const text = getDiaryText(day);
  preview.textContent = getDiaryPreview(day);
  row.classList.toggle('has-entry', !!text);
}

/* ===== HUMOR: EDICIÓN INLINE ===== */
function updateMoodSquare(day, type) {
  const td = document.querySelector(`td[data-action="mood-sq"][data-day="${day}"][data-type="${type}"]`);
  if (!td) return;
  const val = getMoodValue(day, type);
  const valSpan = td.querySelector('.mood-value');
  if (val !== null) {
    td.classList.add('has-value');
    if (valSpan) valSpan.textContent = Number.isInteger(val) ? String(val) : val.toFixed(1);
  } else {
    td.classList.remove('has-value');
    if (valSpan) valSpan.textContent = '';
  }
}

function openMoodInline(td) {
  if (td.querySelector('.mood-input')) return;
  const day  = parseInt(td.dataset.day, 10);
  const type = td.dataset.type;
  const inner   = td.querySelector('.cell-inner');
  const valSpan = td.querySelector('.mood-value');
  if (!inner) return;

  const input = document.createElement('input');
  input.className = 'mood-input';
  input.type  = 'number';
  input.min   = '0';
  input.max   = '10';
  input.step  = '1';
  const existing = getMoodValue(day, type);
  input.value = existing !== null ? existing : '';

  if (valSpan) valSpan.style.visibility = 'hidden';
  inner.appendChild(input);

  let cancelled = false;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { cancelled = true; input.blur(); }
  });

  input.addEventListener('blur', () => {
    if (!cancelled) {
      const raw = input.value.trim();
      if (raw === '') {
        clearMoodValue(day, type);
      } else {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) setMoodValue(day, type, Math.max(0, Math.min(10, parsed)));
      }
      updateMoodSquare(day, type);
    }
    if (valSpan) valSpan.style.visibility = '';
    input.remove();
  }, { once: true });

  setTimeout(() => { input.focus(); input.select(); }, 10);
}

/* ===== HUMOR: GRÁFICO ===== */
function openMoodChart() {
  chartYear  = currentYear;
  chartMonth = currentMonth;
  renderMoodChart();
  document.getElementById('mood-chart-modal').hidden = false;
}

function closeMoodChart() {
  document.getElementById('mood-chart-modal').hidden = true;
}

function prevChartMonth() {
  chartMonth--;
  if (chartMonth < 1) { chartMonth = 12; chartYear--; }
  renderMoodChart();
}

function nextChartMonth() {
  chartMonth++;
  if (chartMonth > 12) { chartMonth = 1; chartYear++; }
  renderMoodChart();
}

function renderMoodChart() {
  const totalDays = getDaysInMonth(chartYear, chartMonth);
  const moodData  = (state.mood[getMonthKey(chartYear, chartMonth)] || {});

  const W = 420, H = 260;
  const PAD = { top: 20, right: 20, bottom: 28, left: 32 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  const pointsH = [], pointsA = [];
  for (let d = 1; d <= totalDays; d++) {
    const dd = moodData[d];
    if (dd) {
      if (dd.h != null) pointsH.push({ x: d, y: dd.h });
      if (dd.a != null) pointsA.push({ x: d, y: dd.a });
    }
  }

  const toX = d   => PAD.left + ((d - 1) / Math.max(totalDays - 1, 1)) * plotW;
  const toY = val => PAD.top  + (1 - val / 10) * plotH;

  // Spline cúbico tipo Cardinal — curva suave entre los puntos reales
  function buildPath(pts) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${toX(pts[0].x).toFixed(1)} ${toY(pts[0].y).toFixed(1)}`;
    const t = 0.4;
    let d = `M ${toX(pts[0].x).toFixed(1)} ${toY(pts[0].y).toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = toX(p1.x) + t * (toX(p2.x) - toX(p0.x)) / 3;
      const cp1y = toY(p1.y) + t * (toY(p2.y) - toY(p0.y)) / 3;
      const cp2x = toX(p2.x) - t * (toX(p3.x) - toX(p1.x)) / 3;
      const cp2y = toY(p2.y) - t * (toY(p3.y) - toY(p1.y)) / 3;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${toX(p2.x).toFixed(1)} ${toY(p2.y).toFixed(1)}`;
    }
    return d;
  }

  // Colores más cercanos a la paleta del cuaderno
  const colorH = '#2d5c22'; // verde oscuro — como tinta de pluma botánica
  const colorA = '#b52c1e'; // rojo margen (--today-red, ya en el diseño)

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;overflow:visible">`;

  // Filtro de turbulencia: temblor sutil de trazo a mano
  svg += `<defs>
    <filter id="rough" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.065" numOctaves="2" seed="9" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.9" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>`;

  // Cuadrícula de fondo
  for (let v = 0; v <= 10; v += 2) {
    const y = toY(v).toFixed(1);
    svg += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="rgba(28,36,97,0.13)" stroke-width="1"/>`;
    svg += `<text x="${PAD.left - 5}" y="${parseFloat(y) + 4}" text-anchor="end" fill="rgba(28,36,97,0.5)" font-family="Caveat,cursive" font-size="12">${v}</text>`;
  }
  for (let d = 1; d <= totalDays; d += 5) {
    svg += `<text x="${toX(d).toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="rgba(28,36,97,0.5)" font-family="Caveat,cursive" font-size="12">${d}</text>`;
  }

  // Líneas y puntos con filtro hand-drawn
  const pathH = buildPath(pointsH);
  const pathA = buildPath(pointsA);

  svg += `<g filter="url(#rough)">`;
  if (pathH) svg += `<path d="${pathH}" fill="none" stroke="${colorH}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
  if (pathA) svg += `<path d="${pathA}" fill="none" stroke="${colorA}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
  for (const p of pointsH) svg += `<circle cx="${toX(p.x).toFixed(1)}" cy="${toY(p.y).toFixed(1)}" r="3" fill="${colorH}" opacity="0.9"/>`;
  for (const p of pointsA) svg += `<circle cx="${toX(p.x).toFixed(1)}" cy="${toY(p.y).toFixed(1)}" r="3" fill="${colorA}" opacity="0.9"/>`;
  svg += `</g>`;

  svg += '</svg>';

  document.getElementById('mood-chart-title').textContent = MONTH_NAMES[chartMonth - 1] + ' ' + chartYear;
  document.getElementById('mood-chart-svg-wrap').innerHTML = svg;
}

/* ===== ESTADÍSTICAS ===== */
function openStatsModal() {
  statsYear  = currentYear;
  statsMonth = currentMonth;
  renderStats();
  document.getElementById('stats-modal').hidden = false;
}

function closeStatsModal() {
  document.getElementById('stats-modal').hidden = true;
}

async function prevStatsMonth() {
  statsMonth--;
  if (statsMonth < 1) { statsMonth = 12; statsYear--; }
  await renderStats();
}

async function nextStatsMonth() {
  statsMonth++;
  if (statsMonth > 12) { statsMonth = 1; statsYear++; }
  await renderStats();
}

async function renderStats() {
  const mk = getMonthKey(statsYear, statsMonth);

  // Cargar datos del mes si no están en caché
  if (currentUser && !habitsByMonth[mk]) {
    const { data: row } = await db.from('habits_monthly')
      .select('data').eq('user_id', currentUser.id).eq('month', mk).maybeSingle();
    if (row) {
      habitsByMonth[mk]     = row.data.habits      || [];
      state.completions[mk] = row.data.completions || {};
      state.skips[mk]       = row.data.skips       || {};
    } else {
      habitsByMonth[mk] = [];
    }
  }

  const habits      = habitsByMonth[mk] || (mk === getMonthKey() ? state.habits : []);
  const completions = state.completions[mk] || {};
  const skips       = state.skips[mk]       || {};
  const totalDays   = getDaysInMonth(statsYear, statsMonth);
  const hoy         = new Date();
  const diasBase    = (statsYear === hoy.getFullYear() && statsMonth === hoy.getMonth() + 1)
    ? hoy.getDate()
    : totalDays;

  const items = habits.map(h => {
    const done        = (completions[h.id] || []).length;
    const saltados    = (skips[h.id] || []).filter(d => d <= diasBase).length;
    const aplicables  = diasBase - saltados;
    const rate        = aplicables > 0 ? Math.round((done / aplicables) * 100) : 0;
    return { name: h.name, done, total: aplicables, rate };
  }).sort((a, b) => b.rate - a.rate);

  document.getElementById('stats-title').textContent =
    MONTH_NAMES[statsMonth - 1].toUpperCase() + ' ' + statsYear;

  const container = document.getElementById('stats-bars');
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p class="stats-empty">sin tareas este mes</p>';
    document.getElementById('stats-message').textContent = '';
    return;
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'stats-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'stats-name';
    nameEl.textContent = item.name;

    const track = document.createElement('div');
    track.className = 'stats-track';

    const fill = document.createElement('div');
    fill.className = 'stats-fill';
    fill.style.width = item.rate + '%';
    if      (item.rate >= 70) fill.classList.add('good');
    else if (item.rate >= 40) fill.classList.add('mid');
    else                      fill.classList.add('bad');

    const pct = document.createElement('span');
    pct.className = 'stats-pct';
    pct.textContent = item.rate + '%';

    track.appendChild(fill);
    row.appendChild(nameEl);
    row.appendChild(track);
    row.appendChild(pct);
    container.appendChild(row);
  }

  document.getElementById('stats-message').textContent = generarMensaje(items);
}

function generarMensaje(items) {
  if (!items.length) return '';
  const avg   = Math.round(items.reduce((s, i) => s + i.rate, 0) / items.length);
  const cero  = items.filter(i => i.rate === 0).map(i => i.name);
  const malos = items.filter(i => i.rate > 0 && i.rate < 40).map(i => i.name);
  const medi  = items.filter(i => i.rate >= 40 && i.rate < 65).map(i => i.name);

  if (avg >= 80) return `¡Qué bien! Llevas un ${avg}% de media. Sigue así.`;
  if (avg >= 65) {
    if (malos.length) return `Vas muy bien (${avg}%). Dale un poco más de atención a: ${malos.join(', ')}.`;
    return `Buen ritmo (${avg}%). ¡Casi en la cima!`;
  }
  if (avg >= 40) {
    if (cero.length) return `Va tomando forma (${avg}%). Aún no has arrancado con: ${cero.slice(0, 2).join(', ')}. Sin prisa.`;
    const flojos = [...malos, ...medi].slice(0, 3).join(', ');
    return `Va bien la cosa (${avg}%). Un poco más de atención a: ${flojos}.`;
  }
  // avg < 40
  if (cero.length) return `Empezar siempre es lo más difícil. Elige uno y dale: ${cero.slice(0, 2).join(', ')}.`;
  return `Aún queda mes (${avg}%). Puedes con esto, empieza por: ${malos.slice(0, 3).join(', ')}.`;
}

/* ===== RENDER ===== */
function render() {
  const totalDays = getDaysInMonth(currentYear, currentMonth);

  /* ---- PÁGINA IZQUIERDA: Diario ---- */
  const monthLabel = MONTH_NAMES[currentMonth - 1].toUpperCase() + ' ' + currentYear;
  document.getElementById('diary-month-title').textContent  = monthLabel;
  document.getElementById('mobile-month-title').textContent = monthLabel;

  const diaryContainer = document.getElementById('diary-rows');
  diaryContainer.innerHTML = '';

  for (let d = 1; d <= 31; d++) {
    const inactive = d > totalDays;
    const row = document.createElement('div');
    row.className = 'diary-row';
    row.dataset.day = d;

    if (inactive) {
      row.classList.add('inactive');
    } else {
      if (isToday(d))       row.classList.add('today');
      if (getDiaryText(d))  row.classList.add('has-entry');
    }

    const dayNum = document.createElement('span');
    dayNum.className = 'diary-day-num';
    dayNum.textContent = d;

    const dayLetter = document.createElement('span');
    dayLetter.className = 'diary-day-letter';
    dayLetter.textContent = inactive ? '' : getDayLetter(currentYear, currentMonth, d);

    const preview = document.createElement('span');
    preview.className = 'diary-preview';
    if (!inactive) preview.textContent = getDiaryPreview(d);

    row.appendChild(dayNum);
    row.appendChild(dayLetter);
    row.appendChild(preview);
    diaryContainer.appendChild(row);
  }

  /* ---- PÁGINA DERECHA: Hábitos ---- */
  const habits  = state.habits;
  const emptyEl = document.getElementById('empty-state');

  if (habits.length === 0) {
    emptyEl.hidden = false;
    const thead = document.getElementById('grid-head');
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    tr.appendChild(makeAddHabitTh());
    thead.appendChild(tr);
    document.getElementById('grid-body').innerHTML = '';
    requestAnimationFrame(syncDiaryAlignment);
    mostrarBotonCopiar();
    return;
  }

  emptyEl.hidden = true;

  /* -- Cabecera -- */
  const thead = document.getElementById('grid-head');
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');

  // Columna día: solo visible en móvil
  const thDay = document.createElement('th');
  thDay.className = 'grid-day-col';
  headerRow.appendChild(thDay);

  for (const habit of habits) {
    const th = document.createElement('th');
    th.dataset.habitId = habit.id;

    const wrapper = document.createElement('div');
    wrapper.className = 'habit-header';

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-delete-habit';
    btnDel.dataset.action = 'delete-habit';
    btnDel.dataset.habitId = habit.id;
    btnDel.title = 'Eliminar hábito';
    btnDel.innerHTML = '&#10005;';

    const nameEl = document.createElement('span');
    nameEl.className = 'habit-name';
    nameEl.contentEditable = 'true';
    nameEl.dataset.action = 'rename-habit';
    nameEl.dataset.habitId = habit.id;
    nameEl.dataset.original = habit.name;
    nameEl.textContent = habit.name;
    nameEl.setAttribute('spellcheck', 'false');

    wrapper.appendChild(btnDel);
    wrapper.appendChild(nameEl);
    th.appendChild(wrapper);
    headerRow.appendChild(th);
  }

  headerRow.appendChild(makeMoodTh('h'));
  headerRow.appendChild(makeMoodTh('a'));
  headerRow.appendChild(makeAddHabitTh());
  thead.appendChild(headerRow);

  /* -- Cuerpo -- */
  const tbody = document.getElementById('grid-body');
  tbody.innerHTML = '';

  for (let d = 1; d <= 31; d++) {
    const tr = document.createElement('tr');
    const inactive = d > totalDays;
    if (isToday(d)) tr.classList.add('today');

    // Celda de día (solo visible en móvil)
    const tdDay = document.createElement('td');
    tdDay.className = 'grid-day-col';
    if (inactive) {
      tdDay.classList.add('inactive');
    } else {
      tdDay.textContent = d;
      if (isToday(d)) tdDay.classList.add('today-num');
    }
    tr.appendChild(tdDay);

    for (const habit of habits) {
      const td = document.createElement('td');
      td.className = 'cell';
      td.dataset.action  = inactive ? '' : 'toggle-cell';
      td.dataset.habitId = habit.id;
      td.dataset.day     = d;

      if (inactive) {
        td.classList.add('inactive');
      } else if (isCompleted(habit.id, d)) {
        td.classList.add('done');
      } else if (isSkipped(habit.id, d)) {
        td.classList.add('skipped');
      }

      const inner = document.createElement('div');
      inner.className = 'cell-inner';
      td.appendChild(inner);
      tr.appendChild(td);
    }

    for (const type of ['h', 'a']) {
      const td = document.createElement('td');
      td.className = `cell mood-${type}`;
      td.dataset.action = inactive ? '' : 'mood-sq';
      td.dataset.day    = d;
      td.dataset.type   = type;

      if (inactive) {
        td.classList.add('inactive');
      } else {
        const val = getMoodValue(d, type);
        if (val !== null) td.classList.add('has-value');
        const inner = document.createElement('div');
        inner.className = 'cell-inner';
        const valSpan = document.createElement('span');
        valSpan.className = 'mood-value';
        valSpan.textContent = val !== null ? (Number.isInteger(val) ? String(val) : val.toFixed(1)) : '';
        inner.appendChild(valSpan);
        td.appendChild(inner);
      }

      if (inactive) {
        const inner = document.createElement('div');
        inner.className = 'cell-inner';
        td.appendChild(inner);
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  requestAnimationFrame(syncDiaryAlignment);
  mostrarBotonCopiar();
}

/* ===== HELPERS DE RENDER ===== */
function makeMoodTh(type) {
  const th = document.createElement('th');
  const wrapper = document.createElement('div');
  wrapper.className = 'habit-header';
  const face = document.createElement('span');
  face.className = 'mood-face';
  face.textContent = type === 'h' ? ':)' : '>:(';
  wrapper.appendChild(face);
  th.appendChild(wrapper);
  return th;
}

function makeAddHabitTh() {
  const th = document.createElement('th');
  const btn = document.createElement('button');
  btn.className = 'btn-add-habit';
  btn.dataset.action = 'add-habit';
  btn.title = 'Añadir hábito';
  btn.textContent = '＋';
  th.appendChild(btn);
  return th;
}

/* ===== EVENTOS ===== */
function setupEvents() {
  document.getElementById('btn-prev').addEventListener('click', prevMonth);
  document.getElementById('btn-next').addEventListener('click', nextMonth);
  document.getElementById('btn-copy-habits').addEventListener('click', copiarHabitsMesAnterior);

  const grid = document.getElementById('habit-grid');

  grid.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-action="add-habit"]');
    if (addBtn) {
      const name = prompt('Nombre del nuevo hábito:');
      if (name !== null) addHabit(name);
      return;
    }

    const delBtn = e.target.closest('[data-action="delete-habit"]');
    if (delBtn) {
      const id = delBtn.dataset.habitId;
      const habit = state.habits.find(h => h.id === id);
      if (habit && confirm(`¿Eliminar el hábito "${habit.name}"?`)) deleteHabit(id);
      return;
    }

    const cell = e.target.closest('[data-action="toggle-cell"]');
    if (cell) {
      const { habitId, day } = cell.dataset;
      toggleCell(habitId, parseInt(day, 10));
      updateCellClass(cell, habitId, parseInt(day, 10));
      return;
    }

    const moodTd = e.target.closest('[data-action="mood-sq"]');
    if (moodTd) {
      openMoodInline(moodTd);
      return;
    }
  });

  grid.addEventListener('focusout', (e) => {
    const nameEl = e.target.closest('[data-action="rename-habit"]');
    if (!nameEl) return;
    const { habitId, original } = nameEl.dataset;
    const ok = renameHabit(habitId, nameEl.textContent);
    if (!ok) {
      nameEl.textContent = original;
    } else {
      nameEl.dataset.original = nameEl.textContent.trim();
    }
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const nameEl = e.target.closest('[data-action="rename-habit"]');
      if (nameEl) { e.preventDefault(); nameEl.blur(); }
    }
    if (e.key === 'Escape') {
      const nameEl = e.target.closest('[data-action="rename-habit"]');
      if (nameEl) { nameEl.textContent = nameEl.dataset.original; nameEl.blur(); }
    }
  });

  document.getElementById('diary-rows').addEventListener('click', (e) => {
    const row = e.target.closest('.diary-row');
    if (!row || row.classList.contains('inactive')) return;
    openDiaryModal(parseInt(row.dataset.day, 10));
  });

  document.getElementById('diary-modal-close').addEventListener('click', closeDiaryModal);
  document.getElementById('diary-modal-backdrop').addEventListener('click', closeDiaryModal);

  document.getElementById('btn-show-chart').addEventListener('click', openMoodChart);
  document.getElementById('btn-show-stats').addEventListener('click', openStatsModal);
  document.getElementById('stats-close').addEventListener('click', closeStatsModal);
  document.getElementById('stats-backdrop').addEventListener('click', closeStatsModal);
  document.getElementById('stats-prev').addEventListener('click', prevStatsMonth);
  document.getElementById('stats-next').addEventListener('click', nextStatsMonth);

  // Gear: sin funcionalidad por ahora

  document.getElementById('btn-auth').addEventListener('click', () => {
    if (currentUser) logout();
    else openAuthModal();
  });
  document.getElementById('auth-backdrop').addEventListener('click', () => { if (currentUser) closeAuthModal(); });
  document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
  document.getElementById('auth-submit').addEventListener('click', submitAuth);
  document.getElementById('auth-logout').addEventListener('click', logout);
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => setAuthMode(btn.dataset.tab));
  });
  document.getElementById('auth-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAuth();
  });

  document.getElementById('btn-toggle-password').addEventListener('click', () => {
    const input = document.getElementById('auth-password');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    document.getElementById('eye-open').style.display   = isPassword ? 'none' : '';
    document.getElementById('eye-closed').style.display = isPassword ? '' : 'none';
  });

  document.getElementById('mood-chart-close').addEventListener('click', closeMoodChart);
  document.getElementById('mood-chart-backdrop').addEventListener('click', closeMoodChart);
  document.getElementById('mood-chart-prev').addEventListener('click', prevChartMonth);
  document.getElementById('mood-chart-next').addEventListener('click', nextChartMonth);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (diaryModalDay !== null) { closeDiaryModal(); return; }
      if (!document.getElementById('stats-modal').hidden) { closeStatsModal(); return; }
      if (!document.getElementById('mood-chart-modal').hidden) { closeMoodChart(); return; }
    }
  });

  // Resaltado de columna al pasar el cursor
  grid.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('td.cell[data-habit-id]');
    if (!cell || cell.classList.contains('inactive')) return;
    const id = cell.dataset.habitId;
    if (grid.dataset.hoverCol === id) return;
    document.querySelectorAll('.col-hover').forEach(el => el.classList.remove('col-hover'));
    document.querySelectorAll(`[data-habit-id="${id}"]`).forEach(el => el.classList.add('col-hover'));
    grid.dataset.hoverCol = id;
  });
  grid.addEventListener('mouseleave', () => {
    document.querySelectorAll('.col-hover').forEach(el => el.classList.remove('col-hover'));
    delete grid.dataset.hoverCol;
  });

  if (window.ResizeObserver) {
    new ResizeObserver(() => syncDiaryAlignment())
      .observe(document.getElementById('grid-head'));
  }

  window.addEventListener('resize', () => requestAnimationFrame(syncDiaryAlignment));

}

/* ===== ACTUALIZACIÓN PARCIAL DE CELDA ===== */
function updateCellClass(td, habitId, day) {
  td.classList.remove('done', 'skipped');
  if (isCompleted(habitId, day))      td.classList.add('done');
  else if (isSkipped(habitId, day))   td.classList.add('skipped');
}

/* ===== INIT ===== */
async function init() {
  loadState();
  setupEvents();

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;
  updateAuthIndicator();
  updateByline();

  if (currentUser) {
    // Resetear antes de cargar: Supabase es la única fuente de verdad cuando hay sesión
    state = { habits: [], completions: {}, skips: {}, diary: {}, mood: {} };
    await cargarTodoDesdeSupabase();
    saveState();
  }

  render();

  // Escuchar cambios de sesión (p.ej. token expirado, otra pestaña)
  db.auth.onAuthStateChange(async (event, session) => {
    const prevUser = currentUser;
    currentUser = session?.user ?? null;
    if (!prevUser && currentUser) {
      await cargarTodoDesdeSupabase();
      saveState();
      render();
    }
    updateAuthIndicator();
    updateByline();
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncDiaryAlignment);
  }
}

init();

window.addEventListener('load', () => {
  const todayRow = document.querySelector('#grid-body tr.today');
  if (todayRow) todayRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
