const state = {
  user: null,
  master: null,
  fiscalYear: 2570,
  currentTab: 'leaves',
  viewMode: 'calendar',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  adminCalYear: new Date().getFullYear(),
  adminCalMonth: new Date().getMonth() + 1,
  page: 1,
  trainPage: 1,
  trainsMineOnly: true,
  adminPage: 1,
  myEntitlements: [],
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
      <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${esc(state.user.position_name || state.user.userGroupLabel)}</div>
      <div style="font-size:10.5px;color:#5eead4;margin-bottom:8px;">ประเภท: ${esc(state.user.person_type_name || 'บุคลากร')}</div>
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

  fill('filterType', m.leaveTypes.filter((x) => Number(x.hrd_leave_type_id) !== 12), 'hrd_leave_type_id', 'hrd_leave_type_name', 'ทุกประเภทการลา');
  fill('adminFilterDept', m.departments, 'department_id', 'department_name', 'ทุกกลุ่มงาน');
  fill('adminFilterType', m.leaveTypes.filter((x) => Number(x.hrd_leave_type_id) !== 12), 'hrd_leave_type_id', 'hrd_leave_type_name', 'ทุกประเภทการลา');
  fill('adminCalDept', m.departments, 'department_id', 'department_name', 'ทุกกลุ่มงาน');
  fill('adminCalType', m.leaveTypes.filter((x) => Number(x.hrd_leave_type_id) !== 12), 'hrd_leave_type_id', 'hrd_leave_type_name', 'ทุกประเภทการลา');
  fill('personDeptFilter', m.departments, 'department_id', 'department_name', 'ทุกกลุ่มงาน');
  if (m.personTypes) fill('personTypeFilter', m.personTypes, 'person_type_id', 'person_type_name', 'ทุกประเภทบุคลากร');
  if (m.travelRates) fill('tProvince', m.travelRates, 'province_id', 'province_name_th', '-- เลือกจังหวัดปลายทาง --');
  fill('fTypeId', m.leaveTypes, 'hrd_leave_type_id', 'hrd_leave_type_name');
  fill('fDayType', m.dayTypes, 'leave_day_type_id', 'leave_day_type_name');
  fill('fAssignedId', m.persons, 'person_id', 'full_name', '-- ไม่ระบุ --');
  fill('fPersonId', m.persons, 'person_id', 'full_name', '-- ตัวเอง --');
  fill('hrdPersonSelect', m.persons, 'person_id', 'full_name', '-- ข้อมูลของฉัน --');

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
  if (state.user) {
    const cnt = Number(data.totals.myTrains || 0);
    document.getElementById('kpiTrainPerson').textContent = cnt > 0 ? `เคยอบรม ${cnt} ครั้ง` : 'ยังไม่เคยอบรม';
  } else {
    document.getElementById('kpiTrainPerson').textContent = `${data.totals.totalTrains.toLocaleString()} / ${data.totals.totalPersons}`;
  }

  // Admin pending approval badge
  const adminBadge = document.getElementById('adminPendingBadge');
  if (adminBadge) {
    const gp = Number(data.totals.globalPending || 0);
    if (state.user?.isAdmin && gp > 0) {
      adminBadge.textContent = gp > 99 ? '99+' : String(gp);
      adminBadge.classList.remove('hidden');
    } else {
      adminBadge.classList.add('hidden');
    }
  }

  // All Leave Entitlements Strip (by person_type_id)
  state.myEntitlements = data.myBalance?.entitlements || [];
  populateLeaveTypeSelect();
  const entGrid = document.getElementById('entitlementsGrid');
  if (data.myBalance && Array.isArray(data.myBalance.entitlements) && data.myBalance.entitlements.length) {
    entGrid.classList.remove('hidden');
    entGrid.innerHTML = data.myBalance.entitlements.map((e) => {
      const remainLabel = e.unlimited ? 'ไม่จำกัด' : e.remain;
      const remainUnit = e.unlimited ? `(ใช้แล้ว ${e.used} วัน)` : 'วันคงเหลือ';
      const remainPct = e.unlimited ? 100 : (e.max > 0 ? Math.round((e.remain / e.max) * 100) : 0);
      return `
        <div class="ent-card" onclick="openMyLeavesFilter('${e.typeId}', '')" title="คลิกเพื่อดูรายการ${esc(e.name)}">
          <div class="ent-top"><span>${e.icon} ${esc(e.name)}</span></div>
          <div class="ent-nums"><strong style="${e.unlimited ? 'font-size:19px;' : ''}">${remainLabel}</strong><span>${remainUnit}</span></div>
          <div class="ent-bar"><div class="ent-bar-fill" style="width:${remainPct}%;background:${e.color};"></div></div>
          <div class="ent-sub">${esc(e.subText || `ใช้แล้ว ${e.used} / สิทธิ์ ${e.max} วัน`)}</div>
        </div>
      `;
    }).join('');
  } else {
    entGrid.classList.add('hidden');
  }

  // Breakdown bars (User's Top 5)
  const top5 = data.byType.slice(0, 5);
  const maxCnt = Math.max(1, ...top5.map((t) => Number(t.cnt || 0)));
  const totalTyped = top5.reduce((s, t) => s + Number(t.cnt || 0), 0);
  if (state.user && totalTyped === 0) {
    document.getElementById('typeBreakdownBars').innerHTML = '<div style="color:#64748b;font-size:13px;padding:18px 0;text-align:center;">ยังไม่มีประวัติการลาในปีงบประมาณนี้</div>';
  } else {
    document.getElementById('typeBreakdownBars').innerHTML = top5
      .map((t) => {
        const pct = Math.round((Number(t.cnt || 0) / maxCnt) * 100);
        const color = t.graph_color || '#0d9488';
        return `
          <div class="bar-row" style="cursor:pointer;" onclick="openMyLeavesFilter('${t.hrd_leave_type_id}', '')">
            <div class="bar-meta"><span>${esc(t.hrd_leave_type_name)}</span><strong>${Number(t.cnt).toLocaleString()} ครั้ง</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${esc(color)};"></div></div>
          </div>
        `;
      })
      .join('');
  }
}

function openMyLeavesFilter(typeId, statusId) {
  if (!state.user) return openLoginModal();
  document.getElementById('filterType').value = typeId || '';
  document.getElementById('filterStatus').value = statusId || '';
  switchTab('mine');
}

function openMyTrains() {
  if (!state.user) return openLoginModal();
  window.location.href = `${window.location.protocol}//${window.location.hostname}:3534/?tab=mine`;
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
    document.getElementById('leavesPanelTitle').textContent = state.viewMode === 'calendar' ? 'ปฏิทินการลาของฉัน' : 'รายการใบลาของฉัน';
    if (state.viewMode === 'calendar') loadCalendar();
    else loadLeaves(1);
  } else {
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'create') resetLeaveForm();
    if (tab === 'account') loadHrdRecord('general');
    if (tab === 'trains') loadTrains(1);
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

let dayModalItems = [];

function renderCalendarGrid(gridId, items, year, month, source) {
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1;
    const d = new Date(year, month - 1, dayNum);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isOther = dayNum < 1 || dayNum > daysInMonth;
    const dayItems = items.filter((x) => iso >= String(x.leave_startdate).slice(0, 10) && iso <= String(x.leave_enddate).slice(0, 10));
    const hasMulti = dayItems.length > 1;
    const cellClick = hasMulti
      ? `onclick="openDayLeavesModal('${iso}', '${source}')"`
      : (dayItems.length === 1 ? `onclick="openLeaveDetail(${dayItems[0].hrd_leave_id})"` : '');

    const chips = dayItems.slice(0, 2).map((r) => {
      const isCancelled = Number(r.allow_id) === 9;
      const chipColor = isCancelled ? '#dc2626' : (r.graph_color || '#0d9488');
      return `
      <div class="cal-chip ${isCancelled ? 'is-cancelled' : ''}" style="border-left-color:${esc(chipColor)}"
           title="${esc(r.full_name)} - ${esc(r.hrd_leave_type_name)}${isCancelled ? ' (ยกเลิกใบลา)' : ''}"
           onclick="event.stopPropagation();openLeaveDetail(${r.hrd_leave_id})">
        <span style="width:7px;height:7px;border-radius:50%;background:${esc(chipColor)};flex-shrink:0;"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;">${esc(r.full_name)}</span>
      </div>
    `;
    }).join('');

    const more = hasMulti
      ? `<div class="cal-more-pill" onclick="event.stopPropagation();openDayLeavesModal('${iso}', '${source}')">👥 ดูทั้งหมด ${dayItems.length} คน</div>`
      : '';

    html += `
      <div class="cal-cell ${isOther ? 'other-month' : ''} ${iso === todayIso ? 'today' : ''} ${dayItems.length ? 'clickable-day' : ''} ${hasMulti ? 'has-multi' : ''}" ${cellClick}>
        <div class="cal-cell-top">
          <span>${d.getDate()}</span>
          ${dayItems.length ? `<span class="cal-count ${hasMulti ? 'multi' : ''}">${dayItems.length}${hasMulti ? ' คน' : ''}</span>` : ''}
        </div>
        ${chips}${more}
      </div>
    `;
  }
  document.getElementById(gridId).innerHTML = html;
}

function openDayLeavesModal(iso, source) {
  const list = source === 'admin' ? (state.adminCalItems || []) : (state.calItems || []);
  dayModalItems = list.filter((x) => iso >= String(x.leave_startdate).slice(0, 10) && iso <= String(x.leave_enddate).slice(0, 10));
  const p = iso.split('-');
  const thaiDate = p.length === 3 ? `${Number(p[2])} ${THAI_FULL_MONTHS[Number(p[1]) - 1]} ${Number(p[0]) + 543}` : iso;
  document.getElementById('dayLeavesTitle').textContent = `📅 รายชื่อผู้ลาวันที่ ${thaiDate} (${dayModalItems.length} รายการ)`;
  document.getElementById('dayLeavesSearch').value = '';
  renderDayLeavesList(dayModalItems);
  document.getElementById('dayLeavesModal').classList.remove('hidden');
}

function filterDayLeavesModal() {
  const q = String(document.getElementById('dayLeavesSearch').value || '').trim().toLowerCase();
  if (!q) return renderDayLeavesList(dayModalItems);
  const filtered = dayModalItems.filter((r) =>
    `${r.full_name || ''} ${r.department_name || ''} ${r.hrd_leave_type_name || ''}`.toLowerCase().includes(q)
  );
  renderDayLeavesList(filtered);
}

function renderDayLeavesList(items) {
  const body = document.getElementById('dayLeavesBody');
  if (!items.length) {
    body.innerHTML = '<div style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายชื่อผู้ลาที่ตรงกับคำค้นหา</div>';
    return;
  }
  body.innerHTML = items.map((r) => {
    const isCancelled = Number(r.allow_id) === 9;
    const itemColor = isCancelled ? '#dc2626' : (r.graph_color || '#0d9488');
    const statusText = isCancelled ? 'ยกเลิกใบลา' : (r.allow_name || 'รออนุมัติ');
    const initial = (String(r.full_name || '').replace(/^(นาย|นางสาว|นาง|ดร\.|พญ\.|นพ\.)\s*/i, '').trim()[0] || '?');
    const dateTxt = String(r.leave_startdate).slice(0, 10) === String(r.leave_enddate).slice(0, 10)
      ? fmtThaiDate(r.leave_startdate)
      : `${fmtThaiDate(r.leave_startdate)} - ${fmtThaiDate(r.leave_enddate)}`;
    return `
      <div class="day-leave-item ${isCancelled ? 'is-cancelled' : ''}" style="border-left-color:${esc(itemColor)}"
           onclick="closeModal('dayLeavesModal');openLeaveDetail(${r.hrd_leave_id})">
        <div class="day-leave-left">
          <div class="person-avatar" style="background:${esc(itemColor)}">${esc(initial)}</div>
          <div style="min-width:0;">
            <div style="font-weight:700;color:${isCancelled ? '#b91c1c' : '#0f172a'};font-size:14.5px;">${esc(r.full_name)}</div>
            <div style="font-size:12px;color:${isCancelled ? '#dc2626' : '#64748b'};margin-top:2px;">
              ${esc(r.department_name || '-')} • ${dateTxt} (${r.calc_days || 1} วัน)
            </div>
          </div>
        </div>
        <div class="day-leave-right">
          <span class="badge" style="background:${isCancelled ? '#fee2e2' : '#f1f5f9'};color:${isCancelled ? '#b91c1c' : 'inherit'};border-left:3px solid ${esc(itemColor)}">${esc(r.hrd_leave_type_name)}</span>
          <span class="badge badge-${r.allow_id || 1}">${esc(statusText)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function loadCalendar() {
  document.getElementById('calMonthTitle').textContent =
    `${THAI_FULL_MONTHS[state.calMonth - 1]} พ.ศ. ${state.calYear + 543}`;
  const params = new URLSearchParams({
    year: state.calYear,
    month: state.calMonth,
    type_id: document.getElementById('filterType').value,
    mine: '1',
  });
  const data = await api(`/api/leaves/calendar?${params.toString()}`);
  state.calItems = data.items || [];
  renderCalendarGrid('calendarGrid', state.calItems, state.calYear, state.calMonth, 'user');
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
  applyFilters();
}

async function loadLeaves(page = 1, exactDate = '', forceMine = false) {
  state.page = page;
  if (!state.user) {
    document.getElementById('leavesTbody').innerHTML =
      '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:24px;">กรุณา <a href="#" onclick="openLoginModal();return false;">เข้าสู่ระบบ</a> เพื่อดูรายการใบลาของคุณ</td></tr>';
    document.getElementById('leavesPagination').innerHTML = '';
    return;
  }
  const params = new URLSearchParams({
    page,
    limit: 25,
    exact_date: exactDate,
    q: document.getElementById('filterQ').value,
    year_name: exactDate ? '' : state.fiscalYear,
    type_id: document.getElementById('filterType').value,
    allow_id: document.getElementById('filterStatus').value,
    mine: '1',
  });
  const data = await api(`/api/leaves?${params.toString()}`);
  const tbody = document.getElementById('leavesTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการใบลา</td></tr>';
  } else {
    tbody.innerHTML = data.items.map((r) => {
      const isCancelled = Number(r.allow_id) === 9;
      const statusText = isCancelled ? 'ยกเลิกใบลา' : (r.allow_name || 'รออนุมัติ');
      const canPrint = state.user && (state.user.isAdmin || Number(r.person_id) === Number(state.user.person_id));
      const canCancel = canPrint && [1, 2].includes(Number(r.allow_id)) && Number(r.hrd_leave_type_id) !== 12;
      const dateTxt = r.leave_startdate === r.leave_enddate
        ? fmtThaiDate(r.leave_startdate)
        : `${fmtThaiDate(r.leave_startdate)} - ${fmtThaiDate(r.leave_enddate)}`;
      const typeColor = isCancelled ? '#dc2626' : (r.graph_color || '#0d9488');
      return `
        <tr class="${isCancelled ? 'row-cancelled' : ''}">
          <td><strong>#${r.hrd_leave_id}</strong></td>
          <td>${esc(r.full_name || '-')}</td>
          <td><small>${esc(r.department_name || '-')}</small></td>
          <td><span class="badge" style="background:${isCancelled ? '#fee2e2' : '#f1f5f9'};color:${isCancelled ? '#b91c1c' : 'inherit'};border-left:3px solid ${esc(typeColor)}">${esc(r.hrd_leave_type_name)}</span></td>
          <td style="white-space:nowrap">${dateTxt}</td>
          <td>${r.calc_days} วัน</td>
          <td><span class="badge badge-${r.allow_id || 1}">${esc(statusText)}</span></td>
          <td style="white-space:nowrap">
            <button class="btn-soft btn-sm" onclick="openLeaveDetail(${r.hrd_leave_id})">ดูรายละเอียด</button>
            ${canPrint ? `<button class="btn-aurora btn-sm" onclick="openPdfModal('แบบฟอร์มใบลา #${r.hrd_leave_id}', '/api/leaves/${r.hrd_leave_id}/pdf')">🖨️ PDF</button>` : ''}
            ${canCancel ? `<button class="btn-danger btn-sm" onclick="requestCancelLeave(${r.hrd_leave_id})" title="ยกเลิกใบลาเดิมนี้และคืนวันลา">✕ ยกเลิกใบลา</button>` : ''}
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
  const isCancelled = Number(r.allow_id) === 9;
  const statusText = isCancelled ? 'ยกเลิกใบลา' : (r.allow_name || 'รออนุมัติ');
  const canPrint = state.user && (state.user.isAdmin || Number(r.person_id) === Number(state.user.person_id));
  const canEdit = canPrint && (state.user.isAdmin || Number(r.allow_id) === 1);
  const canCancel = canPrint && [1, 2].includes(Number(r.allow_id)) && Number(r.hrd_leave_type_id) !== 12;

  document.getElementById('ldTitle').textContent = `รายละเอียดใบลา #${r.hrd_leave_id} • ${r.hrd_leave_type_name}`;
  document.getElementById('ldBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;">
      <div><strong>ผู้ขอลา:</strong> ${esc(fullName)}</div>
      <div><strong>สถานะ:</strong> <span class="badge badge-${r.allow_id || 1}">${esc(statusText)}</span></div>
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
    ${canCancel ? `<button class="btn-danger" onclick="closeModal('leaveDetailModal');requestCancelLeave(${r.hrd_leave_id})">✕ ยกเลิกใบลานี้</button>` : ''}
    <button class="btn-ghost" onclick="closeModal('leaveDetailModal')">ปิด</button>
  `;
  document.getElementById('leaveDetailModal').classList.remove('hidden');
}

// ==================== CREATE / EDIT LEAVE MODAL ====================
function populateAssignedSelect(deptId, excludePersonId, selectedVal = '') {
  const el = document.getElementById('fAssignedId');
  if (!el || !state.master?.persons) return;
  let list = state.master.persons;
  if (deptId) {
    const sameDept = list.filter((p) => Number(p.department_id) === Number(deptId));
    if (sameDept.length) list = sameDept;
  }
  if (excludePersonId != null) {
    list = list.filter((p) => Number(p.person_id) !== Number(excludePersonId));
  }
  el.innerHTML = '<option value="">-- ไม่ระบุ --</option>' +
    list.map((p) => `<option value="${p.person_id}">${esc(p.full_name)}</option>`).join('');
  if (selectedVal) el.value = String(selectedVal);
}

function onLeavePersonChange() {
  const pid = document.getElementById('fPersonId').value;
  if (pid && state.master?.persons) {
    const person = state.master.persons.find((p) => Number(p.person_id) === Number(pid));
    if (person) {
      populateAssignedSelect(person.department_id, person.person_id);
      return;
    }
  }
  populateAssignedSelect(state.user?.department_id, state.user?.person_id);
}

function populateLeaveTypeSelect(selectedVal = '') {
  const el = document.getElementById('fTypeId');
  if (!el || !state.master?.leaveTypes) return;
  let types = state.master.leaveTypes.filter((t) => Number(t.hrd_leave_type_id) !== 12);
  // Filter by logged-in user's person_type_id entitlements (non-admin), always keeping 7 (ตรวจเลือก)
  if (state.user && !state.user.isAdmin && state.myEntitlements.length) {
    const allowedIds = new Set(state.myEntitlements.map((e) => Number(e.typeId)));
    allowedIds.add(7);
    const filtered = types.filter((t) => allowedIds.has(Number(t.hrd_leave_type_id)));
    if (filtered.length) types = filtered;
  }
  const prev = selectedVal || el.value;
  el.innerHTML = types.map((x) => `<option value="${x.hrd_leave_type_id}">${esc(x.hrd_leave_type_name)}</option>`).join('');
  if (prev && [...el.options].some((o) => o.value === String(prev))) {
    el.value = String(prev);
  }
}

function openLeaveFormModal(typeId = 1) {
  if (!state.user) return openLoginModal();
  resetLeaveForm();
  populateLeaveTypeSelect(typeId);
  onLeaveTypeChange();
  populateAssignedSelect(state.user.department_id, state.user.person_id);
  document.getElementById('leaveFormModal').classList.remove('hidden');
}

async function requestCancelLeave(id) {
  if (!state.user) return openLoginModal();
  if (!confirm(`ยืนยันการยกเลิกใบลาเลขที่ #${id} ?\n(ระบบจะเปลี่ยนสถานะเป็น "ยกเลิกใบลา" และคืนสิทธิ์วันลาโดยไม่สร้างเลขที่เอกสารใหม่)`)) return;
  try {
    await api(`/api/leaves/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'ยกเลิกใบลา' }),
    });
    await loadDashboardStats();
    applyFilters();
    if (state.currentTab === 'admin') loadAdminLeaves(state.adminPage || 1);
  } catch (err) {
    alert(err.message);
  }
}

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
  if (document.getElementById('fPersonId')) document.getElementById('fPersonId').value = '';
  populateLeaveTypeSelect();
  populateAssignedSelect(state.user?.department_id, state.user?.person_id);
  onLeaveTypeChange();
  recalcDays();
}

function onLeaveTypeChange() {
  const typeId = Number(document.getElementById('fTypeId').value);
  const isCancel = typeId === 12;
  document.getElementById('fgBecause').classList.toggle('hidden', isCancel);
  document.getElementById('fgBecauseCancel').classList.toggle('hidden', !isCancel);

  const hint = document.getElementById('leaveTypeBalanceHint');
  if (!hint) return;
  const rule = state.myEntitlements.find((e) => Number(e.typeId) === typeId);
  if (rule) {
    hint.className = 'form-group full balance-hint-box' + (!rule.unlimited && rule.remain <= 0 ? ' danger' : (!rule.unlimited && rule.remain <= 3 ? ' warn' : ''));
    hint.innerHTML = rule.unlimited
      ? `<span>${rule.icon} <strong>${esc(rule.name)}</strong> (${esc(state.user?.person_type_name || 'สิทธิ์ของคุณ')})</span><span>สิทธิ์: <strong>ลาได้ตลอด</strong> • ใช้แล้ว ${rule.used} วัน</span>`
      : `<span>${rule.icon} <strong>${esc(rule.name)}</strong> (${esc(state.user?.person_type_name || 'สิทธิ์ของคุณ')})</span><span>คงเหลือ: <strong>${rule.remain} วัน</strong> • ${esc(rule.subText || `ใช้แล้ว ${rule.used} / ${rule.max} วัน`)}</span>`;
  } else if (isCancel) {
    hint.className = 'form-group full balance-hint-box warn';
    hint.innerHTML = '<span>🔄 <strong>ขอยกเลิกวันลา</strong></span><span>ระบุช่วงวันที่ต้องการขอยกเลิกและเหตุผล (เมื่ออนุมัติแล้วระบบจะคืนวันลาให้ตามสิทธิ์)</span>';
  } else {
    hint.className = 'form-group full hidden';
    hint.innerHTML = '';
  }
}

function recalcDays() {
  const startVal = document.getElementById('fStartDate').value;
  if (startVal) {
    const sd = new Date(startVal);
    if (!Number.isNaN(sd.getTime())) {
      const ce = sd.getMonth() + 1 >= 10 ? sd.getFullYear() + 1 : sd.getFullYear();
      document.getElementById('fYearName').value = String(ce + 543);
    }
  }
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
  populateAssignedSelect(r.department_id || state.user?.department_id, r.person_id, r.leave_assigned_person_id || '');
  document.getElementById('fContactTel').value = r.leave_contact_tel || '';
  document.getElementById('fContactAddr').value = r.leave_contact || '';
  onLeaveTypeChange();
  document.getElementById('leaveFormModal').classList.remove('hidden');
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
    closeModal('leaveFormModal');
    await loadDashboardStats();
    applyFilters();
  } catch (err) {
    alert(err.message);
  }
}

// ==================== TRAINING ====================
function setTrainsMineMode(mineOnly) {
  state.trainsMineOnly = Boolean(mineOnly);
  loadTrains(1, state.trainsMineOnly);
}

async function loadTrains(page = 1, mineOnly = state.trainsMineOnly) {
  state.trainPage = page;
  state.trainsMineOnly = Boolean(mineOnly);
  const btnMine = document.getElementById('btnTrainsMine');
  const btnAll = document.getElementById('btnTrainsAll');
  if (btnMine) btnMine.classList.toggle('active', state.trainsMineOnly);
  if (btnAll) btnAll.classList.toggle('active', !state.trainsMineOnly);
  const params = new URLSearchParams({
    page,
    limit: 20,
    q: document.getElementById('trainQ').value,
    train_type_id: document.getElementById('trainTypeFilter').value,
    mine: state.trainsMineOnly && state.user ? '1' : '0',
  });
  const data = await api(`/api/trains?${params.toString()}`);
  document.getElementById('trainsTbody').innerHTML = data.items.map((t) => {
    const isOwner = state.user && Number(t.person_id) === Number(state.user.person_id);
    const isComp = Boolean(t.is_companion);
    const canEdit = state.user && (state.user.isAdmin || isOwner || isComp);
    const compHint = !isOwner && isComp
      ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;margin-top:4px;">👥 ผู้ร่วมเดินทาง (บันทึกโดย ${esc(t.full_name || '-')})</span>`
      : (t.companions_summary ? `<div style="font-size:11.5px;color:#0f766e;margin-top:3px;">👥 ผู้เดินทาง: ${esc(t.companions_summary)}</div>` : '');
    return `
    <tr>
      <td><strong>#${t.train_data_id}</strong></td>
      <td>${t.train_order ? `<code>${esc(t.train_order)}</code>` : '<span style="color:#94a3b8">-</span>'}</td>
      <td><strong>${esc(t.train_topic)}</strong>${t.train_type_name ? `<br><small style="color:#64748b">${esc(t.train_type_name)}</small>` : ''}${compHint ? `<br>${compHint}` : ''}</td>
      <td>${esc(t.train_org || '-')}<br><small style="color:#64748b">${esc(t.train_place || '')}</small></td>
      <td>${t.train_travel ? `<span class="badge" style="background:#f0fdfa;color:#0f766e;border:1px solid #99f6e4">${esc(t.train_travel)}</span>` : '<span style="color:#94a3b8">-</span>'}</td>
      <td style="white-space:nowrap">${fmtThaiDate(t.train_startdate)} - ${fmtThaiDate(t.train_enddate)}</td>
      <td>${t.train_sum_day || '-'} วัน</td>
      <td style="white-space:nowrap">
        ${t.has_image ? `<button class="btn-soft btn-sm" onclick="openTrainImageModal(${t.train_data_id})">🖼️ ดูรูปภาพ</button>` : ''}
        ${state.user ? `<button class="btn-soft btn-sm" onclick="openPdfModal('บันทึกข้อความขออนุมัติไปราชการ #${t.train_data_id}', '/api/trains/${t.train_data_id}/pdf')">🖨️ PDF</button>` : '-'}
        ${canEdit ? `<button class="btn-ghost btn-sm" onclick="editTrain(${t.train_data_id})">✏️ แก้ไข</button>` : ''}
        ${state.user?.isAdmin ? `<button class="btn-danger btn-sm" onclick="deleteTrain(${t.train_data_id})">ลบ</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;">ไม่พบข้อมูลอบรม</td></tr>';

  document.getElementById('trainsPagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn-soft btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadTrains(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn-soft btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadTrains(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

function resolvePersonByName(nameStr) {
  const clean = String(nameStr || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const bare = clean.replace(/^(นาย|นางสาว|นาง|ดร\.|พญ\.|นพ\.|ทพ\.|ทพญ\.|ภก\.|ภญ\.)\s*/i, '').trim();
  return (state.master?.persons || []).find((p) => {
    const fn = String(p.full_name || '').replace(/\s+/g, ' ').trim();
    const fnBare = fn.replace(/^(นาย|นางสาว|นาง|ดร\.|พญ\.|นพ\.|ทพ\.|ทพญ\.|ภก\.|ภญ\.)\s*/i, '').trim();
    return fn === clean || fnBare === clean || fnBare === bare;
  }) || null;
}

function renderCompanionRows(companions = []) {
  const box = document.getElementById('tCompanionsList');
  if (!box) return;
  let html = '';
  for (let i = 1; i <= 6; i++) {
    const c = companions[i - 1] || {};
    const matched = c.person_id
      ? (state.master?.persons || []).find((p) => Number(p.person_id) === Number(c.person_id))
      : resolvePersonByName(c.name);
    const pid = c.person_id || matched?.person_id || '';
    const hasName = Boolean(c.name || c.position);
    html += `
      <div class="companion-row">
        <span class="companion-num">${i}.</span>
        <input type="hidden" id="tCompPid_${i}" value="${esc(pid)}" />
        <div class="comp-ac-wrap">
          <input type="text" id="tCompName_${i}" class="table-input comp-name-input"
                 placeholder="🔍 พิมพ์ชื่อ-นามสกุล คนที่ ${i} เพื่อค้นหาอัตโนมัติ..."
                 value="${esc(c.name || '')}"
                 autocomplete="off"
                 onfocus="onCompanionSearchInput(${i})"
                 oninput="onCompanionSearchInput(${i}, true)"
                 onkeydown="onCompanionKeydown(event, ${i})"
                 onblur="hideCompanionDropdownDelay(${i})" />
          <button type="button" id="tCompClear_${i}" class="comp-clear-btn ${hasName ? '' : 'hidden'}"
                  title="ล้างรายชื่อนี้" onclick="clearCompanionRow(${i})">✕</button>
          <div id="tCompDrop_${i}" class="comp-ac-dropdown hidden"></div>
        </div>
        <input type="text" id="tCompPos_${i}" class="table-input" placeholder="ตำแหน่ง (ดึงอัตโนมัติเมื่อเลือกชื่อ)" value="${esc(c.position || '')}" />
      </div>
    `;
  }
  box.innerHTML = html;
}

function clearCompanionRow(idx) {
  const pidEl = document.getElementById(`tCompPid_${idx}`);
  const nameEl = document.getElementById(`tCompName_${idx}`);
  const posEl = document.getElementById(`tCompPos_${idx}`);
  const clearBtn = document.getElementById(`tCompClear_${idx}`);
  const dropEl = document.getElementById(`tCompDrop_${idx}`);
  if (pidEl) pidEl.value = '';
  if (nameEl) nameEl.value = '';
  if (posEl) posEl.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (dropEl) dropEl.classList.add('hidden');
}

function onCompanionSearchInput(idx, isTyping = false) {
  const nameEl = document.getElementById(`tCompName_${idx}`);
  const pidEl = document.getElementById(`tCompPid_${idx}`);
  const posEl = document.getElementById(`tCompPos_${idx}`);
  const clearBtn = document.getElementById(`tCompClear_${idx}`);
  const dropEl = document.getElementById(`tCompDrop_${idx}`);
  if (!nameEl || !dropEl) return;

  const q = String(nameEl.value || '').trim();
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);

  if (isTyping) {
    const exact = resolvePersonByName(q);
    if (exact) {
      if (pidEl) pidEl.value = exact.person_id;
      if (posEl && !posEl.value) posEl.value = exact.position_name || '';
    } else if (pidEl) {
      pidEl.value = '';
    }
  }

  const persons = state.master?.persons || [];
  const qLower = q.toLowerCase();
  const matches = (qLower
    ? persons.filter((p) =>
        `${p.full_name || ''} ${p.position_name || ''}`.toLowerCase().includes(qLower)
      )
    : persons
  ).slice(0, 30);

  if (!matches.length) {
    dropEl.innerHTML = '<div class="comp-ac-empty">ไม่พบรายชื่อในระบบ (สามารถพิมพ์ชื่อ-ตำแหน่งเองได้)</div>';
    dropEl.classList.remove('hidden');
    return;
  }

  dropEl.innerHTML = matches.map((p, mIdx) => `
    <div class="comp-ac-item ${mIdx === 0 ? 'active' : ''}"
         data-pid="${p.person_id}"
         onmousedown="event.preventDefault();selectCompanionPerson(${idx}, ${p.person_id})">
      <div class="comp-ac-name">${esc(p.full_name)}</div>
      <div class="comp-ac-pos">${esc(p.position_name || '-')}</div>
    </div>
  `).join('');
  dropEl.classList.remove('hidden');
}

function selectCompanionPerson(idx, personId) {
  const p = (state.master?.persons || []).find((x) => Number(x.person_id) === Number(personId));
  if (!p) return;
  const pidEl = document.getElementById(`tCompPid_${idx}`);
  const nameEl = document.getElementById(`tCompName_${idx}`);
  const posEl = document.getElementById(`tCompPos_${idx}`);
  const clearBtn = document.getElementById(`tCompClear_${idx}`);
  const dropEl = document.getElementById(`tCompDrop_${idx}`);
  if (pidEl) pidEl.value = p.person_id;
  if (nameEl) nameEl.value = p.full_name || '';
  if (posEl) posEl.value = p.position_name || '';
  if (clearBtn) clearBtn.classList.remove('hidden');
  if (dropEl) dropEl.classList.add('hidden');
}

function onCompanionKeydown(e, idx) {
  const dropEl = document.getElementById(`tCompDrop_${idx}`);
  if (!dropEl || dropEl.classList.contains('hidden')) return;
  const items = [...dropEl.querySelectorAll('.comp-ac-item')];
  if (!items.length) return;
  let activeIdx = items.findIndex((el) => el.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items.forEach((el) => el.classList.remove('active'));
    activeIdx = (activeIdx + 1) % items.length;
    items[activeIdx].classList.add('active');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items.forEach((el) => el.classList.remove('active'));
    activeIdx = (activeIdx - 1 + items.length) % items.length;
    items[activeIdx].classList.add('active');
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const activeEl = items[activeIdx >= 0 ? activeIdx : 0];
    if (activeEl && activeEl.dataset.pid) {
      e.preventDefault();
      selectCompanionPerson(idx, Number(activeEl.dataset.pid));
    }
  } else if (e.key === 'Escape') {
    dropEl.classList.add('hidden');
  }
}

function hideCompanionDropdownDelay(idx) {
  setTimeout(() => {
    const dropEl = document.getElementById(`tCompDrop_${idx}`);
    if (dropEl) dropEl.classList.add('hidden');
  }, 160);
}

function openTrainModal() {
  if (!state.user) return openLoginModal();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('tId').value = '';
  document.getElementById('trainModalTitle').textContent = 'บันทึกข้อมูลฝึกอบรม / ประชุมวิชาการ';
  document.getElementById('tTopic').value = '';
  document.getElementById('tOrder').value = '';
  document.getElementById('tProvince').value = '';
  document.getElementById('tTravel').value = '';
  document.getElementById('tOrg').value = '';
  document.getElementById('tPlace').value = '';
  document.getElementById('tStart').value = today;
  document.getElementById('tEnd').value = today;
  document.getElementById('tType').value = '';
  document.getElementById('tArea').value = '';
  document.getElementById('tBudget').value = '';
  document.getElementById('tPayReg').value = '0';
  document.getElementById('tPayApt').value = '0';
  document.getElementById('tPayAllow').value = '0';
  document.getElementById('tPayTravel').value = '0';
  document.getElementById('tDistanceKm').value = '0';
  document.getElementById('tMemoDate').value = today;
  document.getElementById('tRequestDept').value = state.user?.department_name || '';
  document.getElementById('tOrgBudgetText').value = '';
  document.getElementById('tDirName').value = 'นางณัฐปภัสร์ นวัตชัยศิริกุล';
  document.getElementById('tDirPos1').value = 'นายแพทย์ชำนาญการพิเศษ รักษาการในตำแหน่ง';
  document.getElementById('tDirPos2').value = 'ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ';
  renderCompanionRows([{ person_id: state.user?.person_id || '', name: state.user?.fullName || '', position: state.user?.position_name || '' }]);
  document.getElementById('tImageData').value = '';
  document.getElementById('tImageName').value = '';
  document.getElementById('tImageFile').value = '';
  document.getElementById('tImagePreview').src = '';
  document.getElementById('tImagePreviewWrap').classList.add('hidden');
  recalcTrainTotalCost();
  document.getElementById('trainModal').classList.remove('hidden');
}

function onTrainImageSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1200;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('tImageData').value = dataUrl;
      document.getElementById('tImageName').value = file.name || 'image.jpg';
      document.getElementById('tImagePreview').src = dataUrl;
      document.getElementById('tImagePreviewWrap').classList.remove('hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function removeTrainImage() {
  document.getElementById('tImageData').value = '__REMOVE__';
  document.getElementById('tImageName').value = '';
  document.getElementById('tImageFile').value = '';
  document.getElementById('tImagePreview').src = '';
  document.getElementById('tImagePreviewWrap').classList.add('hidden');
}

async function openTrainImageModal(id) {
  try {
    const data = await api(`/api/trains/${id}/image`);
    document.getElementById('trainImageModalTitle').textContent = `🖼️ ${data.train_topic || `รูปภาพอบรม #${id}`}`;
    document.getElementById('trainImageModalImg').src = data.image_data;
    document.getElementById('trainImageModal').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
}

function recalcTrainTotalCost() {
  const num = (id) => {
    const v = Number(document.getElementById(id)?.value || 0);
    return Number.isFinite(v) ? v : 0;
  };
  const total = num('tPayReg') + num('tPayApt') + num('tPayAllow') + num('tPayTravel');
  const el = document.getElementById('tTotalCost');
  if (el) {
    el.value = total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

function onTrainDistanceInput() {
  const mode = document.getElementById('tTravel').value;
  if (mode === 'รถยนต์ส่วนตัว') {
    const provId = Number(document.getElementById('tProvince').value || 0);
    const rates = state.master?.travelRates || [];
    const rate = provId ? rates.find((r) => Number(r.province_id) === provId) : null;
    const perKm = rate ? Number(rate.private_car_rate || 4) : 4;
    const dist = Number(document.getElementById('tDistanceKm').value || 0);
    document.getElementById('tPayTravel').value = dist > 0 ? String(Math.round(dist * perKm * 100) / 100) : '0';
  }
  recalcTrainTotalCost();
}

function onTrainTravelAutoCalc() {
  const provId = Number(document.getElementById('tProvince').value || 0);
  const mode = document.getElementById('tTravel').value;
  const rates = state.master?.travelRates || [];
  const rate = provId ? rates.find((r) => Number(r.province_id) === provId) : null;
  if (rate && Number(rate.distance_roundtrip_km || 0) > 0) {
    document.getElementById('tDistanceKm').value = Number(rate.distance_roundtrip_km);
  }
  const dist = Number(document.getElementById('tDistanceKm').value || 0);
  if (mode === 'รถยนต์ส่วนตัว') {
    const perKm = rate ? Number(rate.private_car_rate || 4) : 4;
    if (dist > 0) document.getElementById('tPayTravel').value = String(Math.round(dist * perKm * 100) / 100);
  } else if (mode === 'รถประจำทาง' || mode === 'รถโดยสาร') {
    if (rate && Number(rate.bus_fare || 0) > 0) document.getElementById('tPayTravel').value = String(Number(rate.bus_fare));
  } else if (mode === 'เครื่องบิน') {
    if (rate && Number(rate.flight_fare || 0) > 0) document.getElementById('tPayTravel').value = String(Number(rate.flight_fare));
  } else if (mode === 'รถไฟ') {
    if (rate && Number(rate.train_fare || 0) > 0) document.getElementById('tPayTravel').value = String(Number(rate.train_fare));
  } else if (mode === 'รถโรงพยาบาล' || mode === 'เดินทางไปเอง') {
    document.getElementById('tPayTravel').value = '0';
  }
  recalcTrainTotalCost();
}

async function editTrain(id) {
  if (!state.user) return openLoginModal();
  const t = await api(`/api/trains/${id}`);
  document.getElementById('tId').value = t.train_data_id;
  document.getElementById('trainModalTitle').textContent = `แก้ไขข้อมูลอบรม #${t.train_data_id}`;
  document.getElementById('tTopic').value = t.train_topic || '';
  document.getElementById('tOrder').value = t.train_order || '';
  document.getElementById('tProvince').value = t.province_id || '';
  document.getElementById('tTravel').value = t.train_travel || '';
  document.getElementById('tOrg').value = t.train_org || '';
  document.getElementById('tPlace').value = t.train_place || '';
  document.getElementById('tStart').value = String(t.train_startdate || '').slice(0, 10);
  document.getElementById('tEnd').value = String(t.train_enddate || '').slice(0, 10);
  document.getElementById('tType').value = t.train_type_id || '';
  document.getElementById('tArea').value = t.train_area_id || '';
  document.getElementById('tBudget').value = t.train_budget_id || '';
  document.getElementById('tPayReg').value = t.train_pay_register || 0;
  document.getElementById('tPayApt').value = t.train_pay_apartment || 0;
  document.getElementById('tPayAllow').value = t.train_pay_allowance || 0;
  document.getElementById('tPayTravel').value = t.train_pay_travel || 0;
  document.getElementById('tDistanceKm').value = t.train_distance_km || 0;
  const fallbackDate = String(t.train_startdate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  document.getElementById('tMemoDate').value = t.memo_date ? String(t.memo_date).slice(0, 10) : fallbackDate;
  document.getElementById('tRequestDept').value = t.request_dept || t.requester_dept || '';
  document.getElementById('tOrgBudgetText').value = t.org_budget_text || '';
  document.getElementById('tDirName').value = t.director_name || 'นางณัฐปภัสร์ นวัตชัยศิริกุล';
  document.getElementById('tDirPos1').value = t.director_pos1 || 'นายแพทย์ชำนาญการพิเศษ รักษาการในตำแหน่ง';
  document.getElementById('tDirPos2').value = t.director_pos2 || 'ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ';
  let comps = [];
  if (t.companions_json) {
    try {
      const parsed = JSON.parse(t.companions_json);
      if (Array.isArray(parsed)) comps = parsed;
    } catch {}
  }
  if (!comps.length && t.requester_name) {
    comps = [{ name: t.requester_name, position: t.requester_position || '' }];
  }
  renderCompanionRows(comps);
  document.getElementById('tImageFile').value = '';
  document.getElementById('tImageData').value = t.train_image || '';
  document.getElementById('tImageName').value = t.train_image_name || '';
  if (t.train_image) {
    document.getElementById('tImagePreview').src = t.train_image;
    document.getElementById('tImagePreviewWrap').classList.remove('hidden');
  } else {
    document.getElementById('tImagePreview').src = '';
    document.getElementById('tImagePreviewWrap').classList.add('hidden');
  }
  recalcTrainTotalCost();
  document.getElementById('trainModal').classList.remove('hidden');
}

async function submitTrain(e) {
  e.preventDefault();
  const id = document.getElementById('tId').value;
  const companions = [];
  for (let i = 1; i <= 6; i++) {
    const name = String(document.getElementById(`tCompName_${i}`)?.value || '').trim();
    const position = String(document.getElementById(`tCompPos_${i}`)?.value || '').trim();
    let person_id = Number(document.getElementById(`tCompPid_${i}`)?.value || 0);
    if (!person_id && name) {
      const matched = resolvePersonByName(name);
      if (matched) person_id = Number(matched.person_id);
    }
    if (name || position) companions.push({ person_id: person_id || null, name, position });
  }
  const num = (elId) => {
    const v = Number(document.getElementById(elId)?.value || 0);
    return Number.isFinite(v) ? v : 0;
  };
  const hospBudget = num('tPayReg') + num('tPayApt') + num('tPayAllow') + num('tPayTravel');
  const payload = {
    train_topic: document.getElementById('tTopic').value,
    train_order: document.getElementById('tOrder').value,
    province_id: document.getElementById('tProvince').value,
    train_travel: document.getElementById('tTravel').value,
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
    train_pay_travel: document.getElementById('tPayTravel').value,
    train_distance_km: document.getElementById('tDistanceKm').value,
    memo_date: document.getElementById('tMemoDate').value,
    request_dept: document.getElementById('tRequestDept').value,
    org_budget_text: document.getElementById('tOrgBudgetText').value,
    hospital_budget: hospBudget,
    companions,
    director_name: document.getElementById('tDirName').value,
    director_pos1: document.getElementById('tDirPos1').value,
    director_pos2: document.getElementById('tDirPos2').value,
    train_image: document.getElementById('tImageData').value,
    train_image_name: document.getElementById('tImageName').value,
  };
  try {
    if (id) {
      await api(`/api/trains/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/trains', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('trainModal');
    loadTrains(state.trainPage || 1);
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

// ==================== HRD RECORD SECTIONS & SCREENSHOT MENUS ====================
let currentHrdSection = 'general';

const HRD_SECTION_TITLES = {
  general: '👤 ข้อมูลทั่วไป',
  position: '🪪 ข้อมูลตำแหน่ง กพ.7',
  salary: '💰 ข้อมูลเงินเดือน',
  education: '🎓 ข้อมูลการศึกษา',
  insignia: '🎖️ ข้อมูลเครื่องราชอิสริยาภรณ์',
  award: '🏆 ข้อมูลผลงานที่ภาคภูมิใจ',
  discipline: '⚖️ ข้อมูลโทษทางวินัย',
  duty: '📋 หน้าที่รับผิดชอบหลัก รอง',
  welfare: '🛟 ข้อมูลสวัสดิการ',
  status: '📈 ข้อมูลสถานะการทำงาน',
};

function openLeaveFormType(leaveTypeId, btn) {
  openLeaveFormModal(leaveTypeId);
}

function openHrdSection(sec, btn) {
  if (!state.user) return openLoginModal();
  currentHrdSection = sec;
  document.querySelectorAll('.nav-pill').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById('tab-hrd-record').classList.remove('hidden');
  document.getElementById('hrdSecTitle').textContent = HRD_SECTION_TITLES[sec] || 'ข้อมูลบุคลากร';
  loadHrdRecord(sec);
}

async function loadHrdRecord(sec) {
  const box = document.getElementById('hrdRecordContent');
  box.innerHTML = '<div style="padding:20px;color:#64748b;">⏳ กำลังโหลดข้อมูล...</div>';
  const pid = document.getElementById('hrdPersonSelect')?.value || '';
  const data = await api(`/api/hrd/record${pid ? `?person_id=${pid}` : ''}`);

  const tbl = (headers, rowsHtml) => `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="${headers.length}" style="text-align:center;color:#64748b;padding:20px;">ไม่พบข้อมูล</td></tr>`}</tbody>
      </table>
    </div>
  `;

  if (sec === 'general') {
    const g = data.general || {};
    const name = `${g.prename_name || ''}${g.fname || ''} ${g.lname || ''}`.trim();
    const addr = [g.address_no, g.moo ? `ม.${g.moo}` : '', g.village_name, g.zipcode].filter(Boolean).join(' ') || '-';
    box.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;font-size:14px;background:#fff;padding:18px;border-radius:14px;border:1px solid #e2e8f0;">
        <div><strong>ชื่อ-นามสกุล:</strong> ${esc(name || '-')}</div>
        <div><strong>เลขบัตรประชาชน:</strong> ${esc(g.cid || '-')}</div>
        <div><strong>ตำแหน่ง:</strong> ${esc(g.position_name || '-')}</div>
        <div><strong>กลุ่มงาน:</strong> ${esc(g.department_name || '-')} / ${esc(g.department_sub_name || '-')}</div>
        <div><strong>ประเภทบุคลากร:</strong> ${esc(g.person_type_name || '-')}</div>
        <div><strong>สถานะการทำงาน:</strong> ${esc(g.person_status_name || '-')}</div>
        <div><strong>วันเกิด:</strong> ${fmtThaiDate(g.birthday)}</div>
        <div><strong>วันที่เริ่มบรรจุ/ทำงาน:</strong> ${fmtThaiDate(g.startwork_date || g.work_register_date)}</div>
        <div><strong>เบอร์โทรศัพท์:</strong> ${esc(g.phone_number || '-')}</div>
        <div><strong>อีเมล:</strong> ${esc(g.email || '-')}</div>
        <div><strong>เงินเดือนปัจจุบัน:</strong> ${Number(g.salary || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</div>
        <div><strong>วันลาพักผ่อนสะสม:</strong> ${Number(g.leave_accumulate || 0)} วัน</div>
        <div style="grid-column:1/-1;"><strong>ที่อยู่:</strong> ${esc(addr)}</div>
      </div>
    `;
  } else if (sec === 'position') {
    const rows = data.positions.map((r) => `<tr><td>${fmtThaiDate(r.position_date)}</td><td>${esc(r.position_number || '-')}</td><td><strong>${esc(r.position_name || '-')}</strong></td><td>${esc(r.department_name || '-')}</td><td>${Number(r.position_salary || 0).toLocaleString()}</td><td>${esc(r.position_reference || '-')}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่', 'เลขที่ตำแหน่ง', 'ตำแหน่ง', 'กลุ่มงาน', 'เงินเดือน', 'อ้างอิง/คำสั่ง'], rows);
  } else if (sec === 'salary') {
    const rows = data.salaries.map((r) => `<tr><td>${fmtThaiDate(r.salary_date)}</td><td><strong>${Number(r.salary || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></td><td>${Number(r.salary_position || 0).toLocaleString()}</td><td>${Number(r.salary_pts || 0).toLocaleString()}</td><td>${r.salary_percent ?? '-'}%</td><td>${fmtThaiDate(r.salary_startdate)} - ${fmtThaiDate(r.salary_enddate)}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่', 'เงินเดือน', 'เงินประจำตำแหน่ง', 'พ.ต.ส.', 'ร้อยละเลื่อน', 'ช่วงเวลา'], rows);
  } else if (sec === 'education') {
    const rows = data.educations.map((r) => `<tr><td>${fmtThaiDate(r.education_date)}</td><td><strong>${esc(r.education_name || '-')}</strong></td><td>${esc(r.institute_name || '-')}</td><td>${r.grade || '-'}</td><td>${r.education_high === 'Y' ? 'วุฒิสูงสุด' : '-'}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่สำเร็จ', 'ระดับการศึกษา', 'สถาบันการศึกษา', 'เกรดเฉลี่ย', 'หมายเหตุ'], rows);
  } else if (sec === 'insignia') {
    const rows = data.insignias.map((r) => `<tr><td>${fmtThaiDate(r.insignia_date)}</td><td><strong>${esc(r.insignia_name || r.insignia_name_acronym || '-')}</strong></td><td>${esc(r.insignia_book_number || '-')}</td><td>${esc(r.insignia_part || '-')} / ${esc(r.insignia_page || '-')}</td><td>${fmtThaiDate(r.insignia_date_receive)}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่', 'ชั้นตราเครื่องราชฯ', 'เล่มที่', 'ตอน / หน้า', 'วันที่ได้รับ'], rows);
  } else if (sec === 'award') {
    const rows = data.awards.map((r) => `<tr><td>${fmtThaiDate(r.award_date)}</td><td><strong>${esc(r.award_name || '-')}</strong></td><td>${esc(r.award_type_name || '-')}</td><td>${esc(r.award_from || '-')}</td><td>${esc(r.award_place || '-')}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่ได้รับ', 'ชื่อรางวัล/ผลงาน', 'ประเภท', 'หน่วยงานที่มอบ', 'สถานที่'], rows);
  } else if (sec === 'discipline') {
    const rows = data.disciplines.map((r) => `<tr><td>${fmtThaiDate(r.discipline_date)}</td><td><strong>${esc(r.discipline_name || '-')}</strong></td><td>${esc(r.discipline_detail || '-')}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่', 'หัวข้อ', 'รายละเอียด'], rows);
  } else if (sec === 'duty') {
    const rows = data.duties.map((r) => `<tr><td><strong>${esc(r.duty_type_name || '-')}</strong></td><td>${esc(r.duty_name || '-')}</td><td style="white-space:nowrap">${fmtThaiDate(r.duty_startdate)} - ${fmtThaiDate(r.duty_enddate)}</td></tr>`).join('');
    box.innerHTML = tbl(['ประเภทหน้าที่', 'หน้าที่รับผิดชอบ', 'ช่วงเวลา'], rows);
  } else if (sec === 'welfare') {
    const rows = data.welfares.map((r) => `<tr><td>${fmtThaiDate(r.welfare_date)}</td><td>${esc(r.welfare_type_name || '-')}</td><td><strong>${esc(r.welfare_name || '-')}</strong></td></tr>`).join('');
    box.innerHTML = tbl(['วันที่', 'ประเภทสวัสดิการ', 'รายละเอียด'], rows);
  } else if (sec === 'status') {
    const rows = data.statuses.map((r) => `<tr><td>${fmtThaiDate(r.person_status_date)}</td><td><strong>${esc(r.person_status_name || '-')}</strong></td><td>${esc(r.person_type_name || '-')}</td><td>${esc(r.department_name || '-')} / ${esc(r.department_sub_name || '-')}</td></tr>`).join('');
    box.innerHTML = tbl(['วันที่มีผล', 'สถานะการทำงาน', 'ประเภทบุคลากร', 'สังกัด'], rows);
  }
}

async function submitChangePassword(e) {
  e.preventDefault();
  if (!state.user) return openLoginModal();
  const oldPassword = document.getElementById('cpOld').value;
  const newPassword = document.getElementById('cpNew').value;
  const confirmPass = document.getElementById('cpConfirm').value;
  if (newPassword !== confirmPass) {
    alert('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
    return;
  }
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    document.getElementById('cpOld').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
  } catch (err) {
    alert(err.message);
  }
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

// ==================== ADMIN BACKEND & AUTO UPDATE ====================
function switchAdminPane(pane, btn) {
  document.querySelectorAll('.admin-subtabs .seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  ['approve', 'calendar', 'persons', 'travelRates', 'update'].forEach((p) => {
    document.getElementById(`adminPane-${p}`).classList.toggle('hidden', p !== pane);
  });
  if (pane === 'approve') loadAdminLeaves(1);
  if (pane === 'calendar') loadAdminCalendar();
  if (pane === 'persons') loadPersons();
  if (pane === 'travelRates') loadTravelRates();
  if (pane === 'update') checkSystemUpdate();
}

async function loadTravelRates() {
  const q = document.getElementById('trSearchQ')?.value || '';
  const data = await api(`/api/travel-rates?q=${encodeURIComponent(q)}`);
  const items = data.items || [];
  document.getElementById('travelRatesTbody').innerHTML = items.map((r) => `
    <tr>
      <td><strong>${esc(r.province_name_th)}</strong></td>
      <td><input type="number" step="0.1" min="0" id="trDist_${r.id}" class="table-input table-input-num" value="${Number(r.distance_roundtrip_km || 0)}" /></td>
      <td><input type="number" step="0.25" min="0" id="trCar_${r.id}" class="table-input table-input-num" value="${Number(r.private_car_rate ?? 4)}" /></td>
      <td><input type="number" step="1" min="0" id="trBus_${r.id}" class="table-input table-input-num" value="${Number(r.bus_fare || 0)}" /></td>
      <td><input type="number" step="1" min="0" id="trFlight_${r.id}" class="table-input table-input-num" value="${Number(r.flight_fare || 0)}" /></td>
      <td><input type="number" step="1" min="0" id="trTrain_${r.id}" class="table-input table-input-num" value="${Number(r.train_fare || 0)}" /></td>
      <td style="text-align:center;">
        <button class="btn-save-row" onclick="saveTravelRate(${r.id}, this)">💾 บันทึก</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">ไม่พบข้อมูลจังหวัด</td></tr>';
}

async function saveTravelRate(id, btn) {
  await api(`/api/travel-rates/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      distance_roundtrip_km: document.getElementById(`trDist_${id}`).value,
      private_car_rate: document.getElementById(`trCar_${id}`).value,
      bus_fare: document.getElementById(`trBus_${id}`).value,
      flight_fare: document.getElementById(`trFlight_${id}`).value,
      train_fare: document.getElementById(`trTrain_${id}`).value,
    }),
  });
  const fresh = await api('/api/travel-rates');
  if (state.master) state.master.travelRates = fresh.items || [];
  if (btn) {
    const oldText = btn.textContent;
    btn.textContent = '✓ บันทึกแล้ว';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = oldText;
      btn.classList.remove('saved');
    }, 1800);
  }
}

function changeAdminCalMonth(delta) {
  state.adminCalMonth += delta;
  if (state.adminCalMonth < 1) { state.adminCalMonth = 12; state.adminCalYear--; }
  if (state.adminCalMonth > 12) { state.adminCalMonth = 1; state.adminCalYear++; }
  loadAdminCalendar();
}

function goAdminCalToday() {
  const n = new Date();
  state.adminCalYear = n.getFullYear();
  state.adminCalMonth = n.getMonth() + 1;
  loadAdminCalendar();
}

async function loadAdminCalendar() {
  document.getElementById('adminCalMonthTitle').textContent =
    `${THAI_FULL_MONTHS[state.adminCalMonth - 1]} พ.ศ. ${state.adminCalYear + 543}`;
  const params = new URLSearchParams({
    year: state.adminCalYear,
    month: state.adminCalMonth,
    department_id: document.getElementById('adminCalDept').value,
    type_id: document.getElementById('adminCalType').value,
    all: '1',
  });
  const data = await api(`/api/leaves/calendar?${params.toString()}`);
  state.adminCalItems = data.items || [];

  const legendMap = new Map();
  state.adminCalItems.forEach((x) => {
    if (!legendMap.has(x.hrd_leave_type_name)) {
      legendMap.set(x.hrd_leave_type_name, x.graph_color || '#0d9488');
    }
  });
  const legEl = document.getElementById('adminCalLegend');
  if (legEl) {
    legEl.innerHTML = [...legendMap.entries()].map(([name, color]) => `
      <span class="cal-legend-item">
        <span class="cal-legend-dot" style="background:${esc(color)}"></span>
        <span>${esc(name)}</span>
      </span>
    `).join('');
  }

  renderCalendarGrid('adminCalendarGrid', state.adminCalItems, state.adminCalYear, state.adminCalMonth, 'admin');
}

async function loadAdminLeaves(page = 1) {
  state.adminPage = page;
  const params = new URLSearchParams({
    page,
    limit: 20,
    all: '1',
    allow_id: document.getElementById('adminFilterAllow').value,
    department_id: document.getElementById('adminFilterDept').value,
    type_id: document.getElementById('adminFilterType').value,
    q: document.getElementById('adminLeaveQ').value,
    year_name: state.fiscalYear,
  });
  const data = await api(`/api/leaves?${params.toString()}`);
  document.getElementById('adminLeavesTbody').innerHTML = data.items.map((r) => {
    const isCancelled = Number(r.allow_id) === 9;
    const statusText = isCancelled ? 'ยกเลิกใบลา' : (r.allow_name || 'รออนุมัติ');
    return `
    <tr class="${isCancelled ? 'row-cancelled' : ''}">
      <td><strong>#${r.hrd_leave_id}</strong></td>
      <td>${esc(r.full_name)}<br><small style="color:${isCancelled ? '#dc2626' : '#64748b'}">${esc(r.department_name || '-')}</small></td>
      <td>${esc(r.hrd_leave_type_name)}</td>
      <td style="white-space:nowrap">${fmtThaiDate(r.leave_startdate)} - ${fmtThaiDate(r.leave_enddate)}</td>
      <td>${r.calc_days} วัน</td>
      <td><span class="badge badge-${r.allow_id || 1}">${esc(statusText)}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-soft btn-sm" onclick="openLeaveDetail(${r.hrd_leave_id})">ดู</button>
        <button class="btn-aurora btn-sm" onclick="approveLeave(${r.hrd_leave_id}, 2)">✓ อนุญาต</button>
        <button class="btn-danger btn-sm" onclick="approveLeave(${r.hrd_leave_id}, 3)">✕ ไม่อนุญาต</button>
        ${!isCancelled ? `<button class="btn-danger btn-sm" onclick="requestCancelLeave(${r.hrd_leave_id})">ยกเลิกใบลา</button>` : ''}
        <button class="btn-soft btn-sm" onclick="openPdfModal('ใบลา #${r.hrd_leave_id}', '/api/leaves/${r.hrd_leave_id}/pdf')">🖨️ PDF</button>
      </td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;">ไม่มีรายการ</td></tr>';

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

function resetPersonFilters() {
  document.getElementById('personSearchQ').value = '';
  document.getElementById('personDeptFilter').value = '';
  document.getElementById('personTypeFilter').value = '';
  document.getElementById('personGroupFilter').value = '';
  loadPersons();
}

async function loadPersons() {
  const params = new URLSearchParams({
    q: document.getElementById('personSearchQ').value,
    department_id: document.getElementById('personDeptFilter').value,
    person_type_id: document.getElementById('personTypeFilter').value,
    user_groups_id: document.getElementById('personGroupFilter').value,
  });
  const data = await api(`/api/persons?${params.toString()}`);
  const items = data.items || [];

  const adminCnt = items.filter((p) => [1, 2].includes(Number(p.user_groups_id))).length;
  const accCnt = items.filter((p) => Number(p.leave_accumulate || 0) > 0).length;
  const sumBar = document.getElementById('personsSummaryBar');
  if (sumBar) {
    sumBar.innerHTML = `
      <span class="person-stat-pill teal">👥 แสดง ${items.length.toLocaleString()} คน</span>
      <span class="person-stat-pill amber">🛡️ Admin / ธุรการ ${adminCnt} คน</span>
      <span class="person-stat-pill">🏖️ มีวันลาสะสม ${accCnt} คน</span>
    `;
  }

  const pTypes = state.master?.personTypes || [];
  document.getElementById('personsTbody').innerHTML = items.map((p) => {
    const isAdm = [1, 2].includes(Number(p.user_groups_id));
    const initial = (String(p.full_name || '').replace(/^(นาย|นางสาว|นาง|ดร\.|พญ\.|นพ\.)\s*/i, '').trim()[0] || '?');
    const typeOpts = pTypes.length
      ? pTypes.map((pt) => `<option value="${pt.person_type_id}" ${Number(p.person_type_id) === Number(pt.person_type_id) ? 'selected' : ''}>${esc(pt.person_type_name)}</option>`).join('')
      : `<option value="${Number(p.person_type_id || 1)}">${esc(p.person_type_name || 'ข้าราชการ')}</option>`;
    return `
      <tr>
        <td>
          <div class="person-cell">
            <div class="person-avatar ${isAdm ? 'is-admin' : ''}">${esc(initial)}</div>
            <div>
              <strong>${esc(p.full_name)}</strong>
              <div class="person-meta">
                <span class="person-id-tag">#${p.person_id}</span>
                <span><code>${esc(p.username || 'ไม่มี Username')}</code></span>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight:500;color:#1e293b;">${esc(p.position_name || '-')}</div>
          <small style="color:#64748b;">${esc(p.department_name || '-')}</small>
        </td>
        <td>
          <select id="pType_${p.person_id}" class="table-select">${typeOpts}</select>
        </td>
        <td>
          <input type="number" step="0.5" min="0" id="pAcc_${p.person_id}" class="table-input table-input-num" value="${Number(p.leave_accumulate || 0)}" />
        </td>
        <td>
          <select id="pGrp_${p.person_id}" class="table-select">
            <option value="3" ${Number(p.user_groups_id) === 3 ? 'selected' : ''}>ผู้ใช้ทั่วไป</option>
            <option value="2" ${Number(p.user_groups_id) === 2 ? 'selected' : ''}>ธุรการ (Admin)</option>
            <option value="1" ${Number(p.user_groups_id) === 1 ? 'selected' : ''}>ผู้ดูแลระบบ</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button class="btn-save-row" onclick="savePerson(${p.person_id}, this)">💾 บันทึก</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:28px;">ไม่พบข้อมูลบุคลากรที่ค้นหา</td></tr>';
}

async function savePerson(id, btn) {
  await api(`/api/persons/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      leave_accumulate: document.getElementById(`pAcc_${id}`).value,
      user_groups_id: document.getElementById(`pGrp_${id}`).value,
      person_type_id: document.getElementById(`pType_${id}`).value,
    }),
  });
  if (btn) {
    const oldText = btn.textContent;
    btn.textContent = '✓ บันทึกแล้ว';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = oldText;
      btn.classList.remove('saved');
    }, 1800);
  }
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
