const state = {
  user: null,
  master: null,
  fiscalYear: 2570,
  currentTab: 'leaves',
  viewMode: 'calendar',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  page: 1,
  trainPage: 1,
  adminPage: 1,
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtThaiDate(iso) {
  if (!iso || String(iso).startsWith('0000')) return '-';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return `${Number(p[2])} ${THAI_MONTHS[Number(p[1]) - 1] || p[1]} ${String(Number(p[0]) + 543).slice(-2)}`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
  return data;
}

function getDefaultFiscalYear() {
  const d = new Date();
  const ce = d.getMonth() + 1 >= 10 ? d.getFullYear() + 1 : d.getFullYear();
  return ce + 543;
}

async function init() {
  state.fiscalYear = getDefaultFiscalYear();
  const fySel = document.getElementById('globalFiscalYear');
  if ([...fySel.options].some((o) => Number(o.value) === state.fiscalYear)) {
    fySel.value = String(state.fiscalYear);
  }
  await Promise.all([loadAuth(), loadMaster(), loadVersion()]);
  await loadDashboardStats();
  setViewMode('calendar');
  if (!state.user) openLoginModal();
}

async function loadVersion() {
  try {
    const v = await api('/api/system/version');
    document.getElementById('sysVersionBadge').textContent = `v${v.version} • ${v.commit} • db_hrd`;
  } catch {}
}

async function loadAuth() {
  const data = await api('/api/auth/me');
  state.user = data.user;
  renderAuth();
}

function renderAuth() {
  const box = document.getElementById('authSidebarBox');
  const adminEls = document.querySelectorAll('.admin-only');
  const navMine = document.getElementById('navMine');
  const notice = document.getElementById('createAuthNotice');

  if (state.user) {
    box.innerHTML = `
      <div style="font-weight:600;color:#fff;margin-bottom:2px;">${esc(state.user.fullName)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">${esc(state.user.position_name || state.user.userGroupLabel)}</div>
      <button class="btn-soft btn-sm full-w" onclick="logout()">ออกจากระบบ</button>
    `;
    navMine.classList.remove('hidden');
    notice.classList.add('hidden');
    adminEls.forEach((el) => el.classList.toggle('hidden', !state.user.isAdmin));
    if (!document.getElementById('fLeaveId').value) {
      document.getElementById('fContactTel').value = state.user.phone_number || '';
    }
  } else {
    box.innerHTML = `
      <div style="color:#cbd5e1;margin-bottom:8px;">ยังไม่ได้เข้าสู่ระบบ</div>
      <button class="btn-aurora btn-sm full-w" onclick="openLoginModal()">🔐 เข้าสู่ระบบ</button>
    `;
    navMine.classList.add('hidden');
    notice.classList.remove('hidden');
    adminEls.forEach((el) => el.classList.add('hidden'));
  }
}

async function loadMaster() {
  const m = await api('/api/master');
  state.master = m;

  const fill = (id, items, valKey, labelKey, firstOpt) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (firstOpt ? `<option value="">${firstOpt}</option>` : '') +
      items.map((x) => `<option value="${x[valKey]}">${esc(x[labelKey])}</option>`).join('');
  };

  fill('filterType', m.leaveTypes, 'hrd_leave_type_id', 'hrd_leave_type_name', 'ทุกประเภทการลา');
  fill('filterDept', m.departments, 'department_id', 'department_name', 'ทุกกลุ่มงาน');
  fill('fTypeId', m.leaveTypes, 'hrd_leave_type_id', 'hrd_leave_type_name');
  fill('fDayType', m.dayTypes, 'leave_day_type_id', 'leave_day_type_name');
  fill('fAssignedId', m.persons, 'person_id', 'full_name', '-- ไม่ระบุ --');
  fill('fPersonId', m.persons, 'person_id', 'full_name', '-- ตัวเอง --');

  fill('trainTypeFilter', m.trainTypes, 'train_type_id', 'train_type_name', 'ทุกประเภทการอบรม');
  fill('tType', m.trainTypes, 'train_type_id', 'train_type_name', '-- เลือกประเภท --');
  fill('tArea', m.trainAreas, 'train_area_id', 'train_area_name', '-- เลือกพื้นที่ --');
  fill('tBudget', m.trainBudgets, 'train_budget_id', 'train_budget_name', '-- เลือกงบประมาณ --');
}

async function onFiscalYearChange() {
  state.fiscalYear = Number(document.getElementById('globalFiscalYear').value);
  await loadDashboardStats();
  if (state.currentTab === 'leaves' && state.viewMode === 'table') loadLeaves(1);
  if (state.currentTab === 'reports') loadReports();
}

async function loadDashboardStats() {
  const data = await api(`/api/leaves/stats?year_name=${state.fiscalYear}`);
  document.getElementById('kpiTotal').textContent = data.totals.total.toLocaleString();
  document.getElementById('kpiPending').textContent = data.totals.pending.toLocaleString();
  document.getElementById('kpiApproved').textContent = data.totals.approved.toLocaleString();
  document.getElementById('kpiTrainPerson').textContent = `${data.totals.totalTrains.toLocaleString()} / ${data.totals.totalPersons}`;

  // Circular Ring for Vacation Balance
  const fg = document.getElementById('vacRingFg');
  const circ = 314.16;
  if (data.myBalance) {
    const b = data.myBalance;
    const pct = b.totalRight > 0 ? Math.min(1, b.remainingVacation / b.totalRight) : 0;
    fg.style.strokeDashoffset = String(circ * (1 - pct));
    document.getElementById('vacRemainNum').textContent = b.remainingVacation;
    document.getElementById('vacBalanceDetail').innerHTML =
      `สะสม ${b.accumulate} + ปีนี้ ${b.annualRight} = <strong>${b.totalRight}</strong> วัน (ใช้แล้ว ${b.usedVacation} วัน)`;
  } else {
    fg.style.strokeDashoffset = String(circ * 0.65);
    document.getElementById('vacRemainNum').textContent = '-';
    document.getElementById('vacBalanceDetail').textContent = 'เข้าสู่ระบบเพื่อดูยอดวันลาพักผ่อน';
  }

  // Breakdown bars
  const top5 = data.byType.slice(0, 5);
  const maxCnt = Math.max(1, ...top5.map((t) => Number(t.cnt || 0)));
  document.getElementById('typeBreakdownBars').innerHTML = top5
    .map((t) => {
      const pct = Math.round((Number(t.cnt || 0) / maxCnt) * 100);
      const color = t.graph_color || '#0d9488';
      return `
        <div class="bar-row">
          <div class="bar-meta"><span>${esc(t.hrd_leave_type_name)}</span><strong>${Number(t.cnt).toLocaleString()}</strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${esc(color)};"></div></div>
        </div>
      `;
    })
    .join('');
}

// ==================== TABS ====================
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-pill').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));

  if (tab === 'mine') {
    document.getElementById('tab-leaves').classList.remove('hidden');
    document.getElementById('leavesPanelTitle').textContent = 'ประวัติการลาของฉัน';
    setViewMode('table', true);
  } else if (tab === 'leaves') {
    document.getElementById('tab-leaves').classList.remove('hidden');
    document.getElementById('leavesPanelTitle').textContent = state.viewMode === 'calendar' ? 'ปฏิทินการลาบุคลากร' : 'รายการใบลาบุคลากร';
    if (state.viewMode === 'calendar') loadCalendar();
    else loadLeaves(1);
  } else {
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'create') resetLeaveForm();
    if (tab === 'trains') loadTrains(1);
    if (tab === 'duty') loadDuties();
    if (tab === 'portfolio') loadPortfolio();
    if (tab === 'reports') loadReports();
    if (tab === 'admin') loadAdminLeaves(1);
  }
}

function setViewMode(mode, mineOnly = false) {
  state.viewMode = mode;
  document.getElementById('btnViewCal').classList.toggle('active', mode === 'calendar');
  document.getElementById('btnViewTable').classList.toggle('active', mode === 'table');
  document.getElementById('calendarView').classList.toggle('hidden', mode !== 'calendar');
  document.getElementById('tableView').classList.toggle('hidden', mode !== 'table');
  if (mode === 'calendar') loadCalendar();
  else loadLeaves(1, '', mineOnly);
}

// ==================== CALENDAR ====================
function changeCalMonth(delta) {
  state.calMonth += delta;
  if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
  if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
  loadCalendar();
}

function goCalToday() {
  const n = new Date();
  state.calYear = n.getFullYear();
  state.calMonth = n.getMonth() + 1;
  loadCalendar();
}

async function loadCalendar() {
  document.getElementById('calMonthTitle').textContent =
    `${THAI_FULL_MONTHS[state.calMonth - 1]} พ.ศ. ${state.calYear + 543}`;
  const params = new URLSearchParams({
    year: state.calYear,
    month: state.calMonth,
    type_id: document.getElementById('filterType').value,
    mine: state.currentTab === 'mine' ? '1' : '0',
  });
  const data = await api(`/api/leaves/calendar?${params.toString()}`);
  const firstDay = new Date(state.calYear, state.calMonth - 1, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1;
    const d = new Date(state.calYear, state.calMonth - 1, dayNum);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isOther = dayNum < 1 || dayNum > daysInMonth;
    const dayItems = data.items.filter((x) => iso >= String(x.leave_startdate).slice(0, 10) && iso <= String(x.leave_enddate).slice(0, 10));

    const chips = dayItems.slice(0, 3).map((r) => `
      <div class="cal-chip" style="border-left-color:${esc(r.graph_color || '#0d9488')}"
           title="${esc(r.full_name)} - ${esc(r.hrd_leave_type_name)}"
           onclick="openLeaveDetail(${r.hrd_leave_id})">
        ${esc(r.full_name)}
      </div>
    `).join('');
    const more = dayItems.length > 3 ? `<div class="cal-more" onclick="openDayInTable('${iso}')">+ อีก ${dayItems.length - 3} คน</div>` : '';

    html += `
      <div class="cal-cell ${isOther ? 'other-month' : ''} ${iso === todayIso ? 'today' : ''}">
        <div class="cal-cell-top">
          <span>${d.getDate()}</span>
          ${dayItems.length ? `<span class="cal-count">${dayItems.length}</span>` : ''}
        </div>
        ${chips}${more}
      </div>
    `;
  }
  document.getElementById('calendarGrid').innerHTML = html;
}

function openDayInTable(iso) {
  setViewMode('table');
  loadLeaves(1, iso);
}

// ==================== LEAVES TABLE ====================
function applyFilters() {
  if (state.viewMode === 'calendar') loadCalendar();
  else loadLeaves(1);
}

function resetFilters() {
  document.getElementById('filterQ').value = '';
  document.getElementById('filterType').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterDept').value = '';
  applyFilters();
}

async function loadLeaves(page = 1, exactDate = '', forceMine = false) {
  state.page = page;
  const mine = forceMine || state.currentTab === 'mine' ? '1' : '0';
  const params = new URLSearchParams({
    page,
    limit: 25,
    exact_date: exactDate,
    q: document.getElementById('filterQ').value,
    year_name: exactDate ? '' : state.fiscalYear,
    type_id: document.getElementById('filterType').value,
    allow_id: document.getElementById('filterStatus').value,
    department_id: document.getElementById('filterDept').value,
    mine,
  });
  const data = await api(`/api/leaves?${params.toString()}`);
  const tbody = document.getElementById('leavesTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการใบลา</td></tr>';
  } else {
    tbody.innerHTML = data.items.map((r) => {
      const canPrint = state.user && (state.user.isAdmin || Number(r.person_id) === Number(state.user.person_id));
      const dateTxt = r.leave_startdate === r.leave_enddate
        ? fmtThaiDate(r.leave_startdate)
        : `${fmtThaiDate(r.leave_startdate)} - ${fmtThaiDate(r.leave_enddate)}`;
      return `
        <tr>
          <td><strong>#${r.hrd_leave_id}</strong></td>
          <td>${esc(r.full_name || '-')}</td>
          <td><small>${esc(r.department_name || '-')}</small></td>
          <td><span class="badge" style="background:#f1f5f9;border-left:3px solid ${esc(r.graph_color || '#0d9488')}">${esc(r.hrd_leave_type_name)}</span></td>
          <td style="white-space:nowrap">${dateTxt}</td>
          <td>${r.calc_days} วัน</td>
          <td><span class="badge badge-${r.allow_id || 1}">${esc(r.allow_name || 'รออนุมัติ')}</span></td>
          <td style="white-space:nowrap">
            <button class="btn-soft btn-sm" onclick="openLeaveDetail(${r.hrd_leave_id})">ดูรายละเอียด</button>
            ${canPrint ? `<button class="btn-aurora btn-sm" onclick="openPdfModal('แบบฟอร์มใบลา #${r.hrd_leave_id}', '/api/leaves/${r.hrd_leave_id}/pdf')">🖨️ PDF</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('leavesPagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn-soft btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadLeaves(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn-soft btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadLeaves(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

async function openLeaveDetail(id) {
  const { leave: r, stats } = await api(`/api/leaves/${id}`);
  const fullName = `${r.prename_name || ''}${r.fname || ''} ${r.lname || ''}`.trim();
  const canPrint = state.user && (state.user.isAdmin || Number(r.person_id) === Number(state.user.person_id));
  const canEdit = canPrint && (state.user.isAdmin || Number(r.allow_id) === 1);

  document.getElementById('ldTitle').textContent = `รายละเอียดใบลา #${r.hrd_leave_id} • ${r.hrd_leave_type_name}`;
  document.getElementById('ldBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;">
      <div><strong>ผู้ขอลา:</strong> ${esc(fullName)}</div>
      <div><strong>สถานะ:</strong> <span class="badge badge-${r.allow_id || 1}">${esc(r.allow_name)}</span></div>
      <div><strong>ตำแหน่ง:</strong> ${esc(r.position_name || '-')}</div>
      <div><strong>สังกัด:</strong> ${esc(r.department_name || '-')} / ${esc(r.department_sub_name || '-')}</div>
      <div><strong>ตั้งแต่วันที่:</strong> ${fmtThaiDate(r.leave_startdate)}</div>
      <div><strong>ถึงวันที่:</strong> ${fmtThaiDate(r.leave_enddate)} (${r.calc_days} วัน)</div>
      <div style="grid-column:1/-1;"><strong>เหตุผล:</strong> ${esc(r.leave_because_cancel || r.leave_because || '-')}</div>
      <div><strong>ผู้รับมอบหมายงาน:</strong> ${esc(r.assigned_name || '-')}</div>
      <div><strong>เบอร์โทรติดต่อ:</strong> ${esc(r.leave_contact_tel || r.phone_number || '-')}</div>
      <div style="grid-column:1/-1;"><strong>สถิติปีงบฯ ${r.year_name}:</strong> พักผ่อนใช้แล้ว ${stats.prevVacation} วัน | ป่วย ${stats.prevSick} วัน | กิจ ${stats.prevBusiness} วัน</div>
    </div>
  `;
  const actions = document.getElementById('ldActions');
  actions.innerHTML = `
    ${canPrint ? `<button class="btn-aurora" onclick="closeModal('leaveDetailModal');openPdfModal('แบบฟอร์มใบลา #${r.hrd_leave_id}', '/api/leaves/${r.hrd_leave_id}/pdf')">🖨️ พิมพ์แบบฟอร์ม PDF เดิม</button>` : ''}
    ${canEdit ? `<button class="btn-soft" onclick="closeModal('leaveDetailModal');editLeave(${r.hrd_leave_id})">✏️ แก้ไข</button>` : ''}
    <button class="btn-ghost" onclick="closeModal('leaveDetailModal')">ปิด</button>
  `;
  document.getElementById('leaveDetailModal').classList.remove('hidden');
}

// ==================== CREATE / EDIT LEAVE ====================
function resetLeaveForm() {
  document.getElementById('fLeaveId').value = '';
  document.getElementById('formLeaveTitle').textContent = 'แบบฟอร์มยื่นใบลาออนไลน์';
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('fStartDate').value = today;
  document.getElementById('fEndDate').value = today;
  document.getElementById('fYearName').value = state.fiscalYear;
  document.getElementById('fBecause').value = '';
  document.getElementById('fBecauseCancel').value = '';
  document.getElementById('fContactAddr').value = '';
  document.getElementById('fContactTel').value = state.user?.phone_number || '';
  onLeaveTypeChange();
  recalcDays();
}

function onLeaveTypeChange() {
  const isCancel = Number(document.getElementById('fTypeId').value) === 12;
  document.getElementById('fgBecause').classList.toggle('hidden', isCancel);
  document.getElementById('fgBecauseCancel').classList.toggle('hidden', !isCancel);
}

function recalcDays() {
  const dayType = Number(document.getElementById('fDayType').value || 1);
  if (dayType === 2 || dayType === 3) {
    document.getElementById('fLeaveDay').value = '0.5';
    return;
  }
  const s = new Date(document.getElementById('fStartDate').value);
  const e = new Date(document.getElementById('fEndDate').value);
  if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    document.getElementById('fLeaveDay').value = String(diff > 0 ? diff : 1);
  }
}

async function editLeave(id) {
  const { leave: r } = await api(`/api/leaves/${id}`);
  switchTab('create');
  document.getElementById('fLeaveId').value = r.hrd_leave_id;
  document.getElementById('formLeaveTitle').textContent = `แก้ไขใบลา #${r.hrd_leave_id}`;
  document.getElementById('fTypeId').value = r.hrd_leave_type_id;
  document.getElementById('fDayType').value = r.leave_day_type || 1;
  document.getElementById('fStartDate').value = String(r.leave_startdate).slice(0, 10);
  document.getElementById('fEndDate').value = String(r.leave_enddate).slice(0, 10);
  document.getElementById('fLeaveDay').value = r.calc_days;
  document.getElementById('fYearName').value = r.year_name || state.fiscalYear;
  document.getElementById('fBecause').value = r.leave_because || '';
  document.getElementById('fBecauseCancel').value = r.leave_because_cancel || '';
  document.getElementById('fAssignedId').value = r.leave_assigned_person_id || '';
  document.getElementById('fContactTel').value = r.leave_contact_tel || '';
  document.getElementById('fContactAddr').value = r.leave_contact || '';
  onLeaveTypeChange();
}

async function submitLeave(e) {
  e.preventDefault();
  if (!state.user) return openLoginModal();
  const id = document.getElementById('fLeaveId').value;
  const body = {
    person_id: document.getElementById('fPersonId').value || undefined,
    hrd_leave_type_id: document.getElementById('fTypeId').value,
    leave_day_type: document.getElementById('fDayType').value,
    leave_startdate: document.getElementById('fStartDate').value,
    leave_enddate: document.getElementById('fEndDate').value,
    leave_day: document.getElementById('fLeaveDay').value,
    year_name: document.getElementById('fYearName').value,
    leave_because: document.getElementById('fBecause').value,
    leave_because_cancel: document.getElementById('fBecauseCancel').value,
    leave_assigned_person_id: document.getElementById('fAssignedId').value,
    leave_contact_tel: document.getElementById('fContactTel').value,
    leave_contact: document.getElementById('fContactAddr').value,
  };
  try {
    if (id) await api(`/api/leaves/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/leaves', { method: 'POST', body: JSON.stringify(body) });
    await loadDashboardStats();
    switchTab('leaves');
    setViewMode('table');
  } catch (err) {
    alert(err.message);
  }
}

// ==================== TRAINING ====================
async function loadTrains(page = 1) {
  state.trainPage = page;
  const params = new URLSearchParams({
    page,
    limit: 20,
    q: document.getElementById('trainQ').value,
    train_type_id: document.getElementById('trainTypeFilter').value,
  });
  const data = await api(`/api/trains?${params.toString()}`);
  document.getElementById('trainsTbody').innerHTML = data.items.map((t) => `
    <tr>
      <td><strong>#${t.train_data_id}</strong></td>
      <td><strong>${esc(t.train_topic)}</strong></td>
      <td>${esc(t.train_org || '-')}<br><small style="color:#64748b">${esc(t.train_place || '')}</small></td>
      <td style="white-space:nowrap">${fmtThaiDate(t.train_startdate)} - ${fmtThaiDate(t.train_enddate)}</td>
      <td>${t.train_sum_day || '-'} วัน</td>
      <td>${esc(t.train_type_name || '-')}</td>
      <td style="white-space:nowrap">
        ${state.user ? `<button class="btn-soft btn-sm" onclick="openPdfModal('รายงานอบรม #${t.train_data_id}', '/api/trains/${t.train_data_id}/pdf')">🖨️ PDF</button>` : '-'}
        ${state.user?.isAdmin ? `<button class="btn-danger btn-sm" onclick="deleteTrain(${t.train_data_id})">ลบ</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;">ไม่พบข้อมูลอบรม</td></tr>';

  document.getElementById('trainsPagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn-soft btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadTrains(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn-soft btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadTrains(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

function openTrainModal() {
  if (!state.user) return openLoginModal();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('tStart').value = today;
  document.getElementById('tEnd').value = today;
  document.getElementById('trainModal').classList.remove('hidden');
}

async function submitTrain(e) {
  e.preventDefault();
  try {
    await api('/api/trains', {
      method: 'POST',
      body: JSON.stringify({
        train_topic: document.getElementById('tTopic').value,
        train_org: document.getElementById('tOrg').value,
        train_place: document.getElementById('tPlace').value,
        train_startdate: document.getElementById('tStart').value,
        train_enddate: document.getElementById('tEnd').value,
        train_type_id: document.getElementById('tType').value,
        train_area_id: document.getElementById('tArea').value,
        train_budget_id: document.getElementById('tBudget').value,
        train_pay_register: document.getElementById('tPayReg').value,
        train_pay_apartment: document.getElementById('tPayApt').value,
        train_pay_allowance: document.getElementById('tPayAllow').value,
      }),
    });
    closeModal('trainModal');
    loadTrains(1);
    loadDashboardStats();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTrain(id) {
  if (!confirm(`ลบข้อมูลอบรม #${id}?`)) return;
  await api(`/api/trains/${id}`, { method: 'DELETE' });
  loadTrains(state.trainPage);
}

// ==================== DUTY & ACTIVITIES ====================
function switchDutyPane(pane, btn) {
  document.querySelectorAll('#tab-duty .seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('dutyPane-duty').classList.toggle('hidden', pane !== 'duty');
  document.getElementById('dutyPane-activity').classList.toggle('hidden', pane !== 'activity');
  if (pane === 'duty') loadDuties();
  else loadActivities();
}

async function loadDuties() {
  const q = document.getElementById('dutyQ').value;
  const data = await api(`/api/duties?q=${encodeURIComponent(q)}`);
  const dSel = document.getElementById('dType');
  if (dSel && data.dutyTypes) {
    dSel.innerHTML = data.dutyTypes.map((t) => `<option value="${t.duty_type_id}">${esc(t.duty_type_name)}</option>`).join('');
  }
  document.getElementById('dutiesTbody').innerHTML = data.items.map((d) => `
    <tr>
      <td>#${d.duty_data_id}</td>
      <td><strong>${esc(d.duty_name)}</strong></td>
      <td>${esc(d.duty_type_name || '-')}</td>
      <td>${esc(d.full_name || '-')}</td>
      <td><small>${esc(d.department_sub_name || '-')}</small></td>
      <td style="white-space:nowrap">${fmtThaiDate(d.duty_startdate)} - ${fmtThaiDate(d.duty_enddate)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;">ไม่พบข้อมูลเวร</td></tr>';
}

function openDutyModal() {
  if (!state.user) return openLoginModal();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('dStart').value = today;
  document.getElementById('dEnd').value = today;
  document.getElementById('dutyModal').classList.remove('hidden');
}

async function submitDuty(e) {
  e.preventDefault();
  await api('/api/duties', {
    method: 'POST',
    body: JSON.stringify({
      duty_name: document.getElementById('dName').value,
      duty_type_id: document.getElementById('dType').value,
      duty_startdate: document.getElementById('dStart').value,
      duty_enddate: document.getElementById('dEnd').value,
    }),
  });
  closeModal('dutyModal');
  loadDuties();
}

async function loadActivities() {
  const q = document.getElementById('actQ').value;
  const data = await api(`/api/activities?q=${encodeURIComponent(q)}`);
  const aSel = document.getElementById('aType');
  if (aSel && data.activityTypes) {
    aSel.innerHTML = data.activityTypes.map((t) => `<option value="${t.activities_type_id}">${esc(t.activities_type_name)}</option>`).join('');
  }
  document.getElementById('activitiesTbody').innerHTML = data.items.map((a) => `
    <tr>
      <td>#${a.activities_data_id}</td>
      <td><strong>${esc(a.activities_detail || '-')}</strong></td>
      <td>${esc(a.activities_type_name || '-')}</td>
      <td>${esc(a.full_name || '-')}</td>
      <td style="white-space:nowrap">${fmtThaiDate(a.activities_start_date)} - ${fmtThaiDate(a.activities_end_date)}</td>
      <td>${a.activities_day || 1} วัน</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;">ไม่พบข้อมูลกิจกรรม</td></tr>';
}

function openActivityModal() {
  if (!state.user) return openLoginModal();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('aStart').value = today;
  document.getElementById('aEnd').value = today;
  document.getElementById('activityModal').classList.remove('hidden');
}

async function submitActivity(e) {
  e.preventDefault();
  await api('/api/activities', {
    method: 'POST',
    body: JSON.stringify({
      activities_detail: document.getElementById('aDetail').value,
      activities_type_id: document.getElementById('aType').value,
      activities_start_date: document.getElementById('aStart').value,
      activities_end_date: document.getElementById('aEnd').value,
    }),
  });
  closeModal('activityModal');
  loadActivities();
}

// ==================== PORTFOLIO ====================
async function loadPortfolio() {
  const q = document.getElementById('portQ').value;
  const mine = document.getElementById('portMine').checked ? '1' : '0';
  const data = await api(`/api/portfolio?q=${encodeURIComponent(q)}&mine=${mine}`);

  const box = (title, headers, rows) => `
    <div class="report-box">
      <h3>${title}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${headers.length}" style="text-align:center;color:#64748b;">ไม่มีข้อมูล</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const eduRows = data.educations.map((e) => `<tr><td>${esc(e.full_name)}</td><td>${esc(e.education_name || '-')}</td><td>${esc(e.institute_name || '-')}</td><td>${e.grade || '-'}</td></tr>`).join('');
  const awdRows = data.awards.map((a) => `<tr><td>${esc(a.full_name)}</td><td>${esc(a.award_name || '-')}</td><td>${esc(a.award_from || '-')}</td><td>${fmtThaiDate(a.award_date)}</td></tr>`).join('');
  const insRows = data.insignias.map((i) => `<tr><td>${esc(i.full_name)}</td><td>${esc(i.insignia_name || i.insignia_name_acronym || '-')}</td><td>${esc(i.insignia_book_number || '-')}</td><td>${fmtThaiDate(i.insignia_date_receive)}</td></tr>`).join('');
  const nurRows = data.nursings.map((n) => `<tr><td>${esc(n.full_name)}</td><td>${esc(n.nursing_council_license_number || '-')}</td><td>${fmtThaiDate(n.nursing_council_enddate)}</td><td>${n.cneu_demand || '-'}</td></tr>`).join('');

  document.getElementById('portfolioContent').innerHTML =
    box('🎓 ประวัติการศึกษา (hrd_education_data)', ['บุคลากร', 'ระดับการศึกษา', 'สถาบัน', 'เกรด'], eduRows) +
    box('🏆 รางวัลเชิดชูเกียรติ (hrd_award_data)', ['บุคลากร', 'ชื่อรางวัล', 'หน่วยงานที่มอบ', 'วันที่'], awdRows) +
    box('🎖️ เครื่องราชอิสริยาภรณ์ (hrd_insignia_data)', ['บุคลากร', 'ชั้นตรา', 'เลขที่/เล่ม', 'วันที่รับ'], insRows) +
    box('🩺 สภาการพยาบาล / CNEU (hrd_nursing_council_data)', ['บุคลากร', 'เลขใบอนุญาต', 'วันหมดอายุ', 'CNEU'], nurRows);
}

// ==================== REPORTS ====================
async function loadReports() {
  const data = await api(`/api/reports/summary?year_name=${state.fiscalYear}`);
  const tbl = (title, headers, rowsHtml) => `
    <div class="report-box">
      <h3>${title} (ปีงบฯ ${data.fiscalYear})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="3">ไม่มีข้อมูล</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  const deptRows = data.byDepartment.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.total_days || 0).toFixed(1)}</td></tr>`).join('');
  const typeRows = data.byType.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.total_days || 0).toFixed(1)}</td></tr>`).join('');
  const topRows = data.topPersons.map((r) => `<tr><td>${esc(r.name)}<br><small style="color:#64748b">${esc(r.dept)}</small></td><td>${r.total}</td><td>${Number(r.total_days || 0).toFixed(1)}</td></tr>`).join('');

  document.getElementById('reportsGrid').innerHTML =
    tbl('สรุปตามกลุ่มงาน', ['กลุ่มงาน', 'ครั้ง', 'วันลา'], deptRows) +
    tbl('สรุปตามประเภทการลา', ['ประเภทการลา', 'ครั้ง', 'วันลา'], typeRows) +
    tbl('บุคลากรที่ลาสูงสุด 20 อันดับ', ['ชื่อ-สกุล / กลุ่มงาน', 'ครั้ง', 'วันลา'], topRows);
}

// ==================== ADMIN & AUTO UPDATE ====================
function switchAdminPane(pane, btn) {
  document.querySelectorAll('.admin-subtabs .seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  ['approve', 'persons', 'update'].forEach((p) => {
    document.getElementById(`adminPane-${p}`).classList.toggle('hidden', p !== pane);
  });
  if (pane === 'approve') loadAdminLeaves(1);
  if (pane === 'persons') loadPersons();
  if (pane === 'update') checkSystemUpdate();
}

async function loadAdminLeaves(page = 1) {
  state.adminPage = page;
  const allow = document.getElementById('adminFilterAllow').value;
  const data = await api(`/api/leaves?page=${page}&limit=20&allow_id=${allow}&year_name=${state.fiscalYear}`);
  document.getElementById('adminLeavesTbody').innerHTML = data.items.map((r) => `
    <tr>
      <td><strong>#${r.hrd_leave_id}</strong></td>
      <td>${esc(r.full_name)}<br><small style="color:#64748b">${esc(r.department_name || '-')}</small></td>
      <td>${esc(r.hrd_leave_type_name)}</td>
      <td style="white-space:nowrap">${fmtThaiDate(r.leave_startdate)} - ${fmtThaiDate(r.leave_enddate)}</td>
      <td>${r.calc_days} วัน</td>
      <td><span class="badge badge-${r.allow_id || 1}">${esc(r.allow_name)}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-aurora btn-sm" onclick="approveLeave(${r.hrd_leave_id}, 2)">✓ อนุญาต</button>
        <button class="btn-danger btn-sm" onclick="approveLeave(${r.hrd_leave_id}, 3)">✕ ไม่อนุญาต</button>
        <button class="btn-soft btn-sm" onclick="openPdfModal('ใบลา #${r.hrd_leave_id}', '/api/leaves/${r.hrd_leave_id}/pdf')">🖨️ PDF</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;">ไม่มีรายการ</td></tr>';

  document.getElementById('adminLeavesPag').innerHTML = `
    <div>ทั้งหมด ${data.total.toLocaleString()} รายการ</div>
    <div style="display:flex;gap:6px;">
      <button class="btn-soft btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadAdminLeaves(${data.page - 1})">◀</button>
      <button class="btn-soft btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadAdminLeaves(${data.page + 1})">▶</button>
    </div>
  `;
}

async function approveLeave(id, allowId) {
  await api(`/api/leaves/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ allow_id: allowId, leave_check_doc: 'Y' }),
  });
  loadAdminLeaves(state.adminPage);
  loadDashboardStats();
}

async function loadPersons() {
  const q = document.getElementById('personSearchQ').value;
  const data = await api(`/api/persons?q=${encodeURIComponent(q)}`);
  document.getElementById('personsTbody').innerHTML = data.items.map((p) => `
    <tr>
      <td>${p.person_id}</td>
      <td><strong>${esc(p.full_name)}</strong></td>
      <td><code>${esc(p.username || '-')}</code></td>
      <td><small>${esc(p.position_name || '-')}</small></td>
      <td><small>${esc(p.department_name || '-')}</small></td>
      <td><input type="number" id="pAcc_${p.person_id}" value="${Number(p.leave_accumulate || 0)}" style="width:70px;padding:4px 6px;" /></td>
      <td>
        <select id="pGrp_${p.person_id}" style="padding:4px 6px;">
          <option value="3" ${Number(p.user_groups_id) === 3 ? 'selected' : ''}>ผู้ใช้ทั่วไป</option>
          <option value="2" ${Number(p.user_groups_id) === 2 ? 'selected' : ''}>ธุรการ (Admin)</option>
          <option value="1" ${Number(p.user_groups_id) === 1 ? 'selected' : ''}>ผู้ดูแลระบบ</option>
        </select>
      </td>
      <td><button class="btn-soft btn-sm" onclick="savePerson(${p.person_id})">บันทึก</button></td>
    </tr>
  `).join('');
}

async function savePerson(id) {
  await api(`/api/persons/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      leave_accumulate: document.getElementById(`pAcc_${id}`).value,
      user_groups_id: document.getElementById(`pGrp_${id}`).value,
    }),
  });
  alert('บันทึกข้อมูลบุคลากรเรียบร้อย');
}

async function checkSystemUpdate() {
  const box = document.getElementById('updateStatusBox');
  box.innerHTML = '⏳ กำลังตรวจสอบเวอร์ชันจาก GitHub...';
  try {
    const info = await api('/api/system/check-update');
    if (info.hasUpdate) {
      box.innerHTML = `
        <div style="color:#0f766e;font-weight:600;margin-bottom:8px;">✨ พบเวอร์ชันใหม่บน GitHub! (ห่าง ${info.behindCount} commit)</div>
        <div>เวอร์ชันปัจจุบัน: <code>${info.localCommit}</code> → เวอร์ชันล่าสุด: <code>${info.remoteCommit}</code></div>
        <div style="margin:6px 0 14px;color:#475569;">รายละเอียด: ${esc(info.latestMessage)}</div>
        <button class="btn-aurora" onclick="runSystemUpdate()">🚀 อัปเดตระบบอัตโนมัติและรีสตาร์ตเดี๋ยวนี้</button>
      `;
    } else {
      box.innerHTML = `
        <div style="color:#166534;font-weight:600;">✅ ระบบเป็นเวอร์ชันล่าสุดแล้ว (<code>${info.localCommit}</code>)</div>
        <div style="margin-top:4px;color:#64748b;">ข้อความล่าสุด: ${esc(info.latestMessage)}</div>
      `;
    }
  } catch (err) {
    box.innerHTML = `<div style="color:#dc2626;">❌ ${esc(err.message)}</div>`;
  }
}

async function runSystemUpdate() {
  if (!confirm('ยืนยันการดึงโค้ดล่าสุดจาก GitHub และรีสตาร์ตเซิร์ฟเวอร์อัตโนมัติ?')) return;
  const box = document.getElementById('updateStatusBox');
  box.innerHTML = '⏳ กำลังอัปเดตระบบและรีสตาร์ตบริการ...';
  try {
    const res = await api('/api/system/update', { method: 'POST' });
    box.innerHTML = `<div style="color:#166534;font-weight:600;">✅ อัปเดตสำเร็จ! กำลังรีโหลดหน้าเว็บ...</div><pre>${esc(res.output)}</pre>`;
    setTimeout(() => location.reload(), 3000);
  } catch (err) {
    box.innerHTML = `<div style="color:#dc2626;">❌ ${esc(err.message)}</div>`;
  }
}

// ==================== PDF & MODALS ====================
function openPdfModal(title, url) {
  document.getElementById('pdfModalTitle').textContent = title;
  const sep = url.includes('?') ? '&' : '?';
  document.getElementById('pdfDownloadBtn').href = `${url}${sep}download=1`;
  document.getElementById('pdfNewTabBtn').href = url;
  document.getElementById('pdfFrame').src = url;
  document.getElementById('pdfModal').classList.remove('hidden');
}

function closePdfModal() {
  document.getElementById('pdfFrame').src = 'about:blank';
  closeModal('pdfModal');
}

function printPdfFrame() {
  const frame = document.getElementById('pdfFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch {
    window.open(document.getElementById('pdfNewTabBtn').href, '_blank');
  }
}

function toggleLoginPass() {
  const el = document.getElementById('loginPass');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function openLoginModal() {
  document.getElementById('loginError').classList.add('hidden');
  const saved = localStorage.getItem('ksp_hrd_user');
  if (saved) {
    document.getElementById('loginUser').value = saved;
    document.getElementById('loginRemember').checked = true;
  }
  const closeBtn = document.querySelector('#loginModal .login-close-btn');
  if (closeBtn) closeBtn.classList.toggle('hidden', !state.user);
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginUser').focus();
}

function closeModal(id) {
  if (id === 'loginModal' && !state.user) return;
  document.getElementById(id).classList.add('hidden');
}

async function submitLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  try {
    const u = document.getElementById('loginUser').value.trim();
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: document.getElementById('loginPass').value }),
    });
    if (document.getElementById('loginRemember').checked) localStorage.setItem('ksp_hrd_user', u);
    else localStorage.removeItem('ksp_hrd_user');
    await loadAuth();
    closeModal('loginModal');
    await loadDashboardStats();
    applyFilters();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  renderAuth();
  await loadDashboardStats();
  switchTab('leaves');
  openLoginModal();
}

init();
