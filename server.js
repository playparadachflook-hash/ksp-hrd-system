require('dotenv').config();
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const session = require('express-session');
const { pool, md5 } = require('./src/db');
const { generateLeavePdf, generateTrainPdf, generateReportPdf } = require('./src/pdf');
const { registerMophProviderRoutes } = require('./src/mophAuth');

const execAsync = promisify(exec);
const app = express();
const PORT = Number(process.env.PORT || 3535);
const PKG = require('./package.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ksp-hrd-system-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ / เจ้าหน้าที่ธุรการเท่านั้น' });
  }
  next();
}

function calcLeaveDays(startDate, endDate, dayTypeId) {
  if (Number(dayTypeId) === 2 || Number(dayTypeId) === 3) return 0.5;
  if (!startDate || !endDate) return 1;
  const s = new Date(String(startDate).slice(0, 10));
  const e = new Date(String(endDate).slice(0, 10));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

function getFiscalYear(isoDate) {
  const d = isoDate ? new Date(String(isoDate).slice(0, 10)) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const ce = m >= 10 ? y + 1 : y;
  return ce + 543;
}

function getFiscalDateRange(fy) {
  const ce = Number(fy) > 2400 ? Number(fy) - 543 : Number(fy);
  return {
    fyStart: `${ce - 1}-10-01`,
    fyEnd: `${ce}-09-30`,
  };
}

function getLeaveRulesByPersonType(personTypeId, annualVacRight, carryOverVac) {
  const pt = Number(personTypeId || 1);
  if (pt === 5 || pt === 6) {
    // ลูกจ้างชั่วคราว (รายเดือน / รายวัน) — ลาได้ตลอด
    return [
      { typeId: 5, name: 'ลาพักผ่อน', icon: '🌴', color: '#0d9488', max: null, unlimited: true },
      { typeId: 1, name: 'ลาป่วย', icon: '🤒', color: '#16a34a', max: null, unlimited: true },
      { typeId: 4, name: 'ลากิจส่วนตัว', icon: '💼', color: '#ea580c', max: null, unlimited: true },
      { typeId: 2, name: 'ลาคลอดบุตร', icon: '🤱', color: '#0284c7', max: null, unlimited: true },
    ];
  }
  if (pt === 3) {
    // พนักงานราชการ
    return [
      { typeId: 5, name: 'ลาพักผ่อน', icon: '🌴', color: '#0d9488', max: annualVacRight + carryOverVac, annual: annualVacRight, carryOver: carryOverVac },
      { typeId: 1, name: 'ลาป่วย', icon: '🤒', color: '#16a34a', max: 30 },
      { typeId: 4, name: 'ลากิจส่วนตัว', icon: '💼', color: '#ea580c', max: 10 },
      { typeId: 2, name: 'ลาคลอดบุตร', icon: '🤱', color: '#0284c7', max: 90 },
    ];
  }
  if (pt === 4) {
    // พนักงานกระทรวงสาธารณสุข (พกส.)
    return [
      { typeId: 5, name: 'ลาพักผ่อน', icon: '🌴', color: '#0d9488', max: annualVacRight + carryOverVac, annual: annualVacRight, carryOver: carryOverVac },
      { typeId: 1, name: 'ลาป่วย', icon: '🤒', color: '#16a34a', max: 45 },
      { typeId: 4, name: 'ลากิจส่วนตัว', icon: '💼', color: '#ea580c', max: 15 },
      { typeId: 2, name: 'ลาคลอดบุตร', icon: '🤱', color: '#0284c7', max: 90 },
      { typeId: 6, name: 'ลาอุปสมบท/ฮัจย์', icon: '🙏', color: '#2563eb', max: 120 },
    ];
  }
  // ข้าราชการ / ลูกจ้างประจำ (1, 2)
  return [
    { typeId: 5, name: 'ลาพักผ่อน', icon: '🌴', color: '#0d9488', max: annualVacRight + carryOverVac, annual: annualVacRight, carryOver: carryOverVac },
    { typeId: 1, name: 'ลาป่วย', icon: '🤒', color: '#16a34a', max: 60 },
    { typeId: 4, name: 'ลากิจส่วนตัว', icon: '💼', color: '#ea580c', max: 45 },
    { typeId: 2, name: 'ลาคลอดบุตร', icon: '🤱', color: '#0284c7', max: 90 },
    { typeId: 3, name: 'ช่วยภริยาคลอด', icon: '👶', color: '#9333ea', max: 15 },
    { typeId: 6, name: 'ลาอุปสมบท/ฮัจย์', icon: '🙏', color: '#2563eb', max: 120 },
  ];
}

// ==================== AUTH ====================
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    const u = String(username).trim();
    const pHash = md5(String(password).trim());
    const [rows] = await pool.query(
      `SELECT p.person_id, p.fname, p.lname, p.phone_number, p.username, p.user_groups_id,
              p.department_id, p.department_sub_id, p.position_id, p.person_type_id,
              p.leave_accumulate, p.leave_accumulate_peryear,
              pn.prename_name, pos.position_name, d.department_name, ds.department_sub_name,
              ug.user_groups_th, pt.person_type_name
       FROM hrd_person p
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = p.department_sub_id
       LEFT JOIN hrd_user_groups ug ON ug.user_groups_id = p.user_groups_id
       LEFT JOIN hrd_person_type pt ON pt.person_type_id = p.person_type_id
       WHERE p.username = ? AND (p.password = ? OR p.password = ?)
       LIMIT 1`,
      [u, pHash, String(password).trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const user = rows[0];
    const fullName = `${user.prename_name || ''}${String(user.fname || '').trim()} ${String(user.lname || '').trim()}`.trim();
    req.session.user = {
      person_id: user.person_id,
      username: user.username,
      fullName,
      phone_number: user.phone_number || '',
      department_id: user.department_id,
      department_name: user.department_name || '',
      department_sub_id: user.department_sub_id,
      department_sub_name: user.department_sub_name || '',
      position_id: user.position_id,
      position_name: user.position_name || '',
      person_type_id: Number(user.person_type_id || 1),
      person_type_name: user.person_type_name || 'ข้าราชการ',
      user_groups_id: Number(user.user_groups_id || 3),
      userGroupLabel: user.user_groups_th || 'ผู้ใช้งานทั่วไป',
      leave_accumulate: Number(user.leave_accumulate || 0),
      leave_accumulate_peryear: user.leave_accumulate_peryear != null ? Number(user.leave_accumulate_peryear) : 10,
      isAdmin: [1, 2].includes(Number(user.user_groups_id)),
    };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

registerMophProviderRoutes(app, {
  resolveSessionUser: async (profile, opdUser) => {
    const hashCid = String(profile.hash_cid || '').trim().toLowerCase();
    const firstTh = String(profile.firstname_th || '').trim();
    const lastTh = String(profile.lastname_th || '').trim();
    const baseSql = `SELECT p.person_id, p.fname, p.lname, p.phone_number, p.username, p.user_groups_id,
              p.department_id, p.department_sub_id, p.position_id, p.person_type_id,
              p.leave_accumulate, p.leave_accumulate_peryear,
              pn.prename_name, pos.position_name, d.department_name, ds.department_sub_name,
              ug.user_groups_th, pt.person_type_name
       FROM hrd_person p
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = p.department_sub_id
       LEFT JOIN hrd_user_groups ug ON ug.user_groups_id = p.user_groups_id
       LEFT JOIN hrd_person_type pt ON pt.person_type_id = p.person_type_id`;
    let rows = [];
    if (hashCid) {
      [rows] = await pool.query(`${baseSql} WHERE LOWER(SHA2(REPLACE(REPLACE(TRIM(p.cid), '-', ''), ' ', ''), 256)) = ? LIMIT 1`, [hashCid]);
    }
    if (!rows.length && opdUser?.cid) {
      [rows] = await pool.query(`${baseSql} WHERE REPLACE(REPLACE(TRIM(p.cid), '-', ''), ' ', '') = ? LIMIT 1`, [String(opdUser.cid).replace(/[-\s]/g, '')]);
    }
    if (!rows.length && opdUser?.loginname) {
      [rows] = await pool.query(`${baseSql} WHERE LOWER(p.username) = LOWER(?) LIMIT 1`, [opdUser.loginname]);
    }
    if (!rows.length && firstTh && lastTh) {
      [rows] = await pool.query(`${baseSql} WHERE TRIM(p.fname) LIKE ? AND TRIM(p.lname) LIKE ? LIMIT 1`, [`%${firstTh}%`, `%${lastTh}%`]);
    }
    if (!rows.length) return null;
    const user = rows[0];
    const fullName = `${user.prename_name || ''}${String(user.fname || '').trim()} ${String(user.lname || '').trim()}`.trim();
    return {
      person_id: user.person_id,
      username: user.username,
      fullName,
      phone_number: user.phone_number || '',
      department_id: user.department_id,
      department_name: user.department_name || '',
      department_sub_id: user.department_sub_id,
      department_sub_name: user.department_sub_name || '',
      position_id: user.position_id,
      position_name: user.position_name || '',
      person_type_id: Number(user.person_type_id || 1),
      person_type_name: user.person_type_name || 'ข้าราชการ',
      user_groups_id: Number(user.user_groups_id || 3),
      userGroupLabel: user.user_groups_th || 'ผู้ใช้งานทั่วไป',
      leave_accumulate: Number(user.leave_accumulate || 0),
      leave_accumulate_peryear: user.leave_accumulate_peryear != null ? Number(user.leave_accumulate_peryear) : 10,
      isAdmin: [1, 2].includes(Number(user.user_groups_id)),
    };
  },
});

// ==================== MASTER LOOKUPS ====================
app.get('/api/master', async (req, res) => {
  try {
    const [
      [leaveTypes],
      [dayTypes],
      [allows],
      [departments],
      [departmentSubs],
      [positions],
      [trainTypes],
      [trainAbouts],
      [trainAreas],
      [trainBudgets],
      [persons],
      [personTypes],
      [travelRates],
    ] = await Promise.all([
      pool.query('SELECT hrd_leave_type_id, hrd_leave_type_name, graph_color FROM hrd_leave_type ORDER BY hrd_leave_type_id'),
      pool.query('SELECT leave_day_type_id, leave_day_type_name, leave_day FROM hrd_leave_day_type ORDER BY leave_day_type_id'),
      pool.query('SELECT allow_id, allow_name FROM hrd_allow ORDER BY allow_id'),
      pool.query('SELECT department_id, department_name, head_department FROM hrd_department WHERE department_status = "Y" ORDER BY department_id'),
      pool.query('SELECT department_sub_id, department_id, department_sub_name, department_head FROM hrd_department_sub WHERE department_sub_status = "Y" ORDER BY department_sub_id'),
      pool.query('SELECT position_id, position_name FROM hrd_position ORDER BY position_name'),
      pool.query('SELECT train_type_id, train_type_name FROM hrd_train_type ORDER BY train_type_id'),
      pool.query('SELECT train_about_id, train_about_name FROM hrd_train_about ORDER BY train_about_id'),
      pool.query('SELECT train_area_id, train_area_name FROM hrd_train_area ORDER BY train_area_id'),
      pool.query('SELECT train_budget_id, train_budget_name FROM hrd_train_budget ORDER BY train_budget_id'),
      pool.query(
        `SELECT p.person_id, CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS full_name,
                p.department_id, p.department_sub_id, p.position_id,
                COALESCE(pos.position_name, '') AS position_name
         FROM hrd_person p
         LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
         LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
         WHERE p.fname IS NOT NULL AND TRIM(p.fname) != ''
         ORDER BY p.fname, p.lname`
      ),
      pool.query('SELECT person_type_id, person_type_name FROM hrd_person_type ORDER BY person_type_id'),
      pool.query('SELECT id, province_id, province_name_th, distance_roundtrip_km, private_car_rate, bus_fare, flight_fare, train_fare FROM hrd_travel_rates ORDER BY province_name_th').catch(() => [[]]),
    ]);
    res.json({
      leaveTypes,
      dayTypes,
      allows,
      departments,
      departmentSubs,
      positions,
      trainTypes,
      trainAbouts,
      trainAreas,
      trainBudgets,
      persons,
      personTypes,
      travelRates,
    });
  } catch (err) {
    console.error('Master error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== STATS & DASHBOARD ====================
async function computePersonEntitlements(personId, fy) {
  const { fyStart, fyEnd } = getFiscalDateRange(fy);
  const { fyStart: prevStart, fyEnd: prevEnd } = getFiscalDateRange(fy - 1);

  const [[personRow]] = await pool.query(
    `SELECT p.person_id, p.person_type_id, p.leave_accumulate, p.leave_accumulate_peryear, pt.person_type_name
     FROM hrd_person p
     LEFT JOIN hrd_person_type pt ON pt.person_type_id = p.person_type_id
     WHERE p.person_id = ? LIMIT 1`,
    [Number(personId)]
  );

  const personTypeId = Number(personRow?.person_type_id || 1);
  const personTypeName = personRow?.person_type_name || 'ข้าราชการ';

  const [myRows] = await pool.query(
    `SELECT hrd_leave_type_id, leave_startdate, leave_enddate, leave_day, leave_day_type, allow_id
     FROM hrd_leave_data
     WHERE person_id = ? AND leave_startdate BETWEEN ? AND ? AND allow_id IN (1, 2)`,
    [Number(personId), fyStart, fyEnd]
  );
  const [prevVacRows] = await pool.query(
    `SELECT leave_startdate, leave_enddate, leave_day, leave_day_type
     FROM hrd_leave_data
     WHERE person_id = ? AND hrd_leave_type_id = 5 AND leave_startdate BETWEEN ? AND ? AND allow_id IN (1, 2)`,
    [Number(personId), prevStart, prevEnd]
  );

  let prevUsedVac = 0;
  prevVacRows.forEach((r) => {
    prevUsedVac += Number(r.leave_day || calcLeaveDays(r.leave_startdate, r.leave_enddate, r.leave_day_type));
  });

  const usedMap = {};
  myRows.forEach((r) => {
    const d = Number(r.leave_day || calcLeaveDays(r.leave_startdate, r.leave_enddate, r.leave_day_type));
    const tid = Number(r.hrd_leave_type_id);
    usedMap[tid] = (usedMap[tid] || 0) + d;
  });

  const baseAcc = Number(personRow?.leave_accumulate || 0);
  const annualRight = personRow?.leave_accumulate_peryear != null ? Number(personRow.leave_accumulate_peryear) : 10;
  const carryOver = Math.max(0, annualRight - prevUsedVac) + baseAcc;
  const usedVacation = usedMap[5] || 0;
  const remainCurrent = Math.max(0, annualRight - usedVacation);
  const usedFromAcc = Math.max(0, usedVacation - annualRight);
  const remainAcc = Math.max(0, carryOver - usedFromAcc);

  const rules = getLeaveRulesByPersonType(personTypeId, annualRight, carryOver);
  const entitlements = rules.map((r) => {
    const used = usedMap[r.typeId] || 0;
    if (r.unlimited) {
      return {
        ...r,
        used,
        remain: null,
        subText: `ใช้แล้ว ${used} วัน • ลาได้ตลอด (${personTypeName})`,
      };
    }
    const remain = Math.max(0, r.max - used);
    const subText = r.typeId === 5
      ? `ปีนี้ ${annualRight} (เหลือ ${remainCurrent}) + สะสม ${carryOver} (เหลือ ${remainAcc})`
      : `ใช้แล้ว ${used} / สิทธิ์ ${r.max} วัน`;
    return { ...r, used, remain, subText };
  });

  return {
    fiscalYear: fy,
    personTypeId,
    personTypeName,
    accumulate: carryOver,
    annualRight,
    totalRight: annualRight + carryOver,
    usedVacation,
    remainingVacation: remainCurrent + remainAcc,
    entitlements,
  };
}

app.get('/api/leaves/stats', async (req, res) => {
  try {
    const fy = Number(req.query.year_name || getFiscalYear());
    const { fyStart, fyEnd } = getFiscalDateRange(fy);
    const uid = req.session.user ? Number(req.session.user.person_id) : null;

    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN allow_id = 1 THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN allow_id = 2 THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN allow_id = 3 THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN allow_id = 9 THEN 1 ELSE 0 END) AS cancelled
       FROM hrd_leave_data
       WHERE leave_startdate BETWEEN ? AND ? ${uid !== null ? 'AND person_id = ?' : ''}`,
      uid !== null ? [fyStart, fyEnd, uid] : [fyStart, fyEnd]
    );
    const [byType] = await pool.query(
      `SELECT lt.hrd_leave_type_id, lt.hrd_leave_type_name, lt.graph_color, COUNT(l.hrd_leave_id) AS cnt
       FROM hrd_leave_type lt
       LEFT JOIN hrd_leave_data l
         ON l.hrd_leave_type_id = lt.hrd_leave_type_id
        AND l.leave_startdate BETWEEN ? AND ?
        AND l.allow_id IN (1, 2)
        ${uid !== null ? 'AND l.person_id = ?' : ''}
       WHERE lt.hrd_leave_type_id != 12
       GROUP BY lt.hrd_leave_type_id, lt.hrd_leave_type_name, lt.graph_color
       ORDER BY cnt DESC`,
      uid !== null ? [fyStart, fyEnd, uid] : [fyStart, fyEnd]
    );
    const [[trainStats]] = await pool.query('SELECT COUNT(*) AS total_trains FROM hrd_train_data');
    const [[personStats]] = await pool.query('SELECT COUNT(*) AS total_persons FROM hrd_person');
    const [[pendingAll]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM hrd_leave_data WHERE leave_startdate BETWEEN ? AND ? AND allow_id = 1',
      [fyStart, fyEnd]
    );
    let myTrains = 0;
    if (uid !== null) {
      const [[myTr]] = await pool.query('SELECT COUNT(*) AS cnt FROM hrd_train_data WHERE person_id = ?', [uid]);
      myTrains = Number(myTr?.cnt || 0);
    }

    let myBalance = null;
    if (req.session.user) {
      myBalance = await computePersonEntitlements(req.session.user.person_id, fy);
    }

    res.json({
      fiscalYear: fy,
      isPersonal: uid !== null,
      totals: {
        total: Number(totals?.total || 0),
        pending: Number(totals?.pending || 0),
        globalPending: Number(pendingAll?.cnt || 0),
        approved: Number(totals?.approved || 0),
        rejected: Number(totals?.rejected || 0),
        totalTrains: Number(trainStats?.total_trains || 0),
        totalPersons: Number(personStats?.total_persons || 0),
        myTrains,
      },
      byType,
      myBalance,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== LEAVES CRUD ====================
function buildLeaveWhere(query, user) {
  const { q, year_name, month, type_id, allow_id, department_id, mine, exact_date } = query;
  const where = [];
  const params = [];

  if (exact_date) {
    where.push('? BETWEEN l.leave_startdate AND l.leave_enddate');
    params.push(exact_date);
  } else {
    if (year_name) {
      const { fyStart, fyEnd } = getFiscalDateRange(year_name);
      where.push('l.leave_startdate BETWEEN ? AND ?');
      params.push(fyStart, fyEnd);
    }
    if (month && Number(month) > 0) {
      where.push('MONTH(l.leave_startdate) = ?');
      params.push(Number(month));
    }
  }
  if (type_id) {
    where.push('l.hrd_leave_type_id = ?');
    params.push(Number(type_id));
  }
  if (allow_id) {
    where.push('l.allow_id = ?');
    params.push(Number(allow_id));
  }
  if (department_id) {
    where.push('COALESCE(NULLIF(l.department_id, 0), p.department_id) = ?');
    params.push(Number(department_id));
  }
  const canViewAll = Boolean(user?.isAdmin && query.all === '1');
  if (!canViewAll && user) {
    where.push('l.person_id = ?');
    params.push(user.person_id);
  } else if (mine === '1' && user) {
    where.push('l.person_id = ?');
    params.push(user.person_id);
  }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push('(p.fname LIKE ? OR p.lname LIKE ? OR l.leave_because LIKE ? OR CAST(l.hrd_leave_id AS CHAR) LIKE ?)');
    params.push(like, like, like, like);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

app.get('/api/leaves/calendar', async (req, res) => {
  try {
    if (!req.session.user) return res.json({ items: [] });
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    const params = [end, start];
    let extra = '';
    if (req.query.type_id) {
      extra += ' AND l.hrd_leave_type_id = ?';
      params.push(Number(req.query.type_id));
    }
    if (req.query.department_id) {
      extra += ' AND COALESCE(NULLIF(l.department_id, 0), p.department_id) = ?';
      params.push(Number(req.query.department_id));
    }
    const canViewAll = Boolean(req.session.user.isAdmin && req.query.all === '1');
    if (!canViewAll || req.query.mine === '1') {
      extra += ' AND l.person_id = ?';
      params.push(req.session.user.person_id);
    }
    const [rows] = await pool.query(
      `SELECT l.hrd_leave_id, l.person_id, l.hrd_leave_type_id, l.leave_startdate, l.leave_enddate,
              l.allow_id, l.leave_day, l.leave_day_type,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS full_name,
              COALESCE(d.department_name, '') AS department_name,
              COALESCE(a.allow_name, 'รออนุมัติ') AS allow_name,
              lt.hrd_leave_type_name, lt.graph_color
       FROM hrd_leave_data l
       LEFT JOIN hrd_person p ON p.person_id = l.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id, 0), p.department_id)
       LEFT JOIN hrd_allow a ON a.allow_id = l.allow_id
       LEFT JOIN hrd_leave_type lt ON lt.hrd_leave_type_id = l.hrd_leave_type_id
       WHERE l.leave_startdate <= ? AND l.leave_enddate >= ? ${extra}
       ORDER BY l.leave_startdate ASC, l.hrd_leave_id DESC
       LIMIT 500`,
      params
    );
    const items = rows.map((r) => ({
      ...r,
      calc_days: r.leave_day != null ? Number(r.leave_day) : calcLeaveDays(r.leave_startdate, r.leave_enddate, r.leave_day_type),
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaves', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ items: [], total: 0, page: 1, totalPages: 1 });
    }
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const { whereSql, params } = buildLeaveWhere(req.query, req.session.user);

    const [[cntRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM hrd_leave_data l
       LEFT JOIN hrd_person p ON p.person_id = l.person_id
       ${whereSql}`,
      params
    );
    const total = Number(cntRow?.cnt || 0);

    const [items] = await pool.query(
      `SELECT l.hrd_leave_id, l.person_id, l.hrd_leave_type_id, l.leave_startdate, l.leave_enddate,
              l.leave_day, l.leave_day_type, l.leave_because, l.leave_because_cancel,
              l.allow_id, l.leave_save, l.leave_check_doc, l.year_name,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS full_name,
              pos.position_name, d.department_name, ds.department_sub_name,
              lt.hrd_leave_type_name, lt.graph_color, a.allow_name, ldt.leave_day_type_name
       FROM hrd_leave_data l
       LEFT JOIN hrd_person p ON p.person_id = l.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = COALESCE(NULLIF(l.position_id,0), p.position_id)
       LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id,0), p.department_id)
       LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = COALESCE(NULLIF(l.department_sub_id,0), p.department_sub_id)
       LEFT JOIN hrd_leave_type lt ON lt.hrd_leave_type_id = l.hrd_leave_type_id
       LEFT JOIN hrd_allow a ON a.allow_id = l.allow_id
       LEFT JOIN hrd_leave_day_type ldt ON ldt.leave_day_type_id = l.leave_day_type
       ${whereSql}
       ORDER BY l.hrd_leave_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const enriched = items.map((r) => ({
      ...r,
      calc_days: r.leave_day != null ? Number(r.leave_day) : calcLeaveDays(r.leave_startdate, r.leave_enddate, r.leave_day_type),
    }));

    res.json({
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error('GET /api/leaves error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function getLeaveWithStats(id) {
  const [rows] = await pool.query(
    `SELECT l.*,
            pn.prename_name, TRIM(p.fname) AS fname, TRIM(p.lname) AS lname,
            p.phone_number, p.leave_accumulate,
            pos.position_name, d.department_name, ds.department_sub_name,
            lt.hrd_leave_type_name, a.allow_name,
            CONCAT(COALESCE(pnh.prename_name,''), TRIM(ph.fname), ' ', TRIM(ph.lname)) AS head_name,
            CONCAT(COALESCE(pna.prename_name,''), TRIM(pa.fname), ' ', TRIM(pa.lname)) AS assigned_name,
            CONCAT(COALESCE(pnc.prename_name,''), TRIM(pc.fname), ' ', TRIM(pc.lname)) AS checker_name
     FROM hrd_leave_data l
     LEFT JOIN hrd_person p ON p.person_id = l.person_id
     LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
     LEFT JOIN hrd_position pos ON pos.position_id = COALESCE(NULLIF(l.position_id,0), p.position_id)
     LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id,0), p.department_id)
     LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = COALESCE(NULLIF(l.department_sub_id,0), p.department_sub_id)
     LEFT JOIN hrd_leave_type lt ON lt.hrd_leave_type_id = l.hrd_leave_type_id
     LEFT JOIN hrd_allow a ON a.allow_id = l.allow_id
     LEFT JOIN hrd_person ph ON ph.person_id = d.head_department
     LEFT JOIN hrd_prename pnh ON pnh.prename_id = ph.prename_id
     LEFT JOIN hrd_person pa ON pa.person_id = l.leave_assigned_person_id
     LEFT JOIN hrd_prename pna ON pna.prename_id = pa.prename_id
     LEFT JOIN hrd_person pc ON pc.person_id = l.leave_check
     LEFT JOIN hrd_prename pnc ON pnc.prename_id = pc.prename_id
     WHERE l.hrd_leave_id = ?
     LIMIT 1`,
    [Number(id)]
  );
  if (!rows.length) return null;
  const leave = rows[0];
  leave.calc_days = leave.leave_day != null ? Number(leave.leave_day) : calcLeaveDays(leave.leave_startdate, leave.leave_enddate, leave.leave_day_type);

  const fy = getFiscalYear(leave.leave_startdate);
  const { fyStart, fyEnd } = getFiscalDateRange(fy);
  const [hist] = await pool.query(
    `SELECT hrd_leave_id, hrd_leave_type_id, leave_startdate, leave_enddate, leave_day, leave_day_type
     FROM hrd_leave_data
     WHERE person_id = ? AND leave_startdate BETWEEN ? AND ? AND hrd_leave_id < ? AND allow_id IN (1, 2)
     ORDER BY hrd_leave_id DESC`,
    [leave.person_id, fyStart, fyEnd, leave.hrd_leave_id]
  );
  let prevVacation = 0;
  let prevSick = 0;
  let prevBusiness = 0;
  let prevMaternity = 0;
  hist.forEach((h) => {
    const d = h.leave_day != null ? Number(h.leave_day) : calcLeaveDays(h.leave_startdate, h.leave_enddate, h.leave_day_type);
    if (Number(h.hrd_leave_type_id) === 5) prevVacation += d;
    else if (Number(h.hrd_leave_type_id) === 1) prevSick += d;
    else if (Number(h.hrd_leave_type_id) === 4) prevBusiness += d;
    else if (Number(h.hrd_leave_type_id) === 2) prevMaternity += d;
  });

  const lastLeave = hist.length
    ? {
        ...hist[0],
        days: hist[0].leave_day != null ? Number(hist[0].leave_day) : calcLeaveDays(hist[0].leave_startdate, hist[0].leave_enddate, hist[0].leave_day_type),
      }
    : null;

  return { leave, stats: { prevVacation, prevSick, prevBusiness, prevMaternity, lastLeave } };
}

app.get('/api/leaves/:id', requireAuth, async (req, res) => {
  try {
    const data = await getLeaveWithStats(req.params.id);
    if (!data) return res.status(404).json({ error: 'ไม่พบข้อมูลใบลา' });
    const isOwner = Number(data.leave.person_id) === Number(req.session.user.person_id);
    if (!req.session.user.isAdmin && !isOwner) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดูข้อมูลใบลาของผู้อื่น' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaves/:id/pdf', requireAuth, async (req, res) => {
  try {
    const data = await getLeaveWithStats(req.params.id);
    if (!data) return res.status(404).json({ error: 'ไม่พบข้อมูลใบลา' });
    const isOwner = Number(data.leave.person_id) === Number(req.session.user.person_id);
    if (!req.session.user.isAdmin && !isOwner) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดาวน์โหลดเอกสารของผู้อื่น' });
    }
    generateLeavePdf(data.leave, data.stats, res, req.query.download === '1');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leaves', requireAuth, async (req, res) => {
  try {
    const b = req.body;
    const personId = req.session.user.isAdmin && b.person_id ? Number(b.person_id) : req.session.user.person_id;
    const [pRows] = await pool.query(
      'SELECT person_id, position_id, department_id, department_sub_id, phone_number FROM hrd_person WHERE person_id = ? LIMIT 1',
      [personId]
    );
    const p = pRows[0] || {};
    const days = b.leave_day ? Number(b.leave_day) : calcLeaveDays(b.leave_startdate, b.leave_enddate, b.leave_day_type);
    const fy = b.year_name ? Number(b.year_name) : getFiscalYear(b.leave_startdate);
    const leaveTypeId = Number(b.hrd_leave_type_id);

    // Enforce leave entitlement rules based on person_type_id (non-admin)
    if (!req.session.user.isAdmin && [1, 2, 3, 4, 5, 6].includes(leaveTypeId)) {
      const bal = await computePersonEntitlements(personId, fy);
      const rule = bal.entitlements.find((e) => Number(e.typeId) === leaveTypeId);
      if (!rule) {
        return res.status(400).json({ error: `ประเภทบุคลากร "${bal.personTypeName}" ไม่มีสิทธิ์ยื่นประเภทการลานี้` });
      }
      if (!rule.unlimited && days > rule.remain) {
        return res.status(400).json({
          error: `สิทธิ์${rule.name} (${bal.personTypeName}) คงเหลือ ${rule.remain} วัน ไม่เพียงพอสำหรับการลา ${days} วัน`,
        });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO hrd_leave_data (
        person_id, position_id, department_id, department_sub_id,
        hrd_leave_type_id, leave_startdate, leave_enddate, leave_day, leave_day_type,
        leave_because, leave_because_cancel, allow_id, leave_contact, leave_contact_tel,
        leave_assigned_person_id, user_login, leave_save, leave_check_doc, year_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURDATE(), 'N', ?)`,
      [
        personId,
        p.position_id || req.session.user.position_id || 0,
        p.department_id || req.session.user.department_id || 0,
        p.department_sub_id || req.session.user.department_sub_id || 0,
        Number(b.hrd_leave_type_id),
        b.leave_startdate,
        b.leave_enddate,
        days,
        Number(b.leave_day_type || 1),
        b.leave_because || '',
        b.leave_because_cancel || '',
        b.leave_contact || '',
        b.leave_contact_tel || p.phone_number || '',
        b.leave_assigned_person_id ? Number(b.leave_assigned_person_id) : null,
        req.session.user.username,
        fy,
      ]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('POST /api/leaves error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/leaves/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existingRows] = await pool.query('SELECT * FROM hrd_leave_data WHERE hrd_leave_id = ? LIMIT 1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'ไม่พบข้อมูลใบลา' });
    const existing = existingRows[0];
    const isOwner = Number(existing.person_id) === Number(req.session.user.person_id);
    if (!req.session.user.isAdmin && !isOwner) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้' });
    }
    const b = req.body;
    const days = b.leave_day ? Number(b.leave_day) : calcLeaveDays(b.leave_startdate, b.leave_enddate, b.leave_day_type);
    await pool.query(
      `UPDATE hrd_leave_data
       SET hrd_leave_type_id = ?, leave_startdate = ?, leave_enddate = ?, leave_day = ?, leave_day_type = ?,
           leave_because = ?, leave_because_cancel = ?, leave_contact = ?, leave_contact_tel = ?,
           leave_assigned_person_id = ?, year_name = ?
       WHERE hrd_leave_id = ?`,
      [
        Number(b.hrd_leave_type_id || existing.hrd_leave_type_id),
        b.leave_startdate || existing.leave_startdate,
        b.leave_enddate || existing.leave_enddate,
        days,
        Number(b.leave_day_type || existing.leave_day_type || 1),
        b.leave_because ?? existing.leave_because,
        b.leave_because_cancel ?? existing.leave_because_cancel,
        b.leave_contact ?? existing.leave_contact,
        b.leave_contact_tel ?? existing.leave_contact_tel,
        b.leave_assigned_person_id ? Number(b.leave_assigned_person_id) : null,
        Number(b.year_name || existing.year_name || getFiscalYear(b.leave_startdate)),
        id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/leaves/:id/approve', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { allow_id, leave_check_doc } = req.body;
    await pool.query(
      `UPDATE hrd_leave_data
       SET allow_id = ?, leave_check = ?, leave_check_doc = ?, leave_check_date = CURDATE()
       WHERE hrd_leave_id = ?`,
      [Number(allow_id || 2), req.session.user.person_id, leave_check_doc === 'Y' ? 'Y' : 'N', id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/leaves/:id/cancel', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT hrd_leave_id, person_id, allow_id, leave_because_cancel FROM hrd_leave_data WHERE hrd_leave_id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบข้อมูลใบลา' });
    const leave = rows[0];
    const isOwner = Number(leave.person_id) === Number(req.session.user.person_id);
    if (!req.session.user.isAdmin && !isOwner) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกใบลาของผู้อื่น' });
    }
    const reason = String(req.body?.reason || '').trim() || leave.leave_because_cancel || 'ยกเลิกใบลา';
    await pool.query(
      `UPDATE hrd_leave_data
       SET allow_id = 9, leave_because_cancel = ?
       WHERE hrd_leave_id = ?`,
      [reason, id]
    );
    res.json({ ok: true, id, allow_id: 9 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/leaves/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM hrd_leave_data WHERE hrd_leave_id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TRAINING DATA ====================
(async function ensureTrainSchema() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM hrd_train_data LIKE 'train_travel'");
    if (!cols.length) {
      await pool.query("ALTER TABLE hrd_train_data ADD COLUMN train_travel VARCHAR(100) NULL DEFAULT '' AFTER train_order");
    }
    const [distCols] = await pool.query("SHOW COLUMNS FROM hrd_train_data LIKE 'train_distance_km'");
    if (!distCols.length) {
      await pool.query("ALTER TABLE hrd_train_data ADD COLUMN train_distance_km DECIMAL(10,2) NULL DEFAULT 0 AFTER train_travel");
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hrd_train_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        train_data_id INT NOT NULL UNIQUE,
        mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
        file_name VARCHAR(255) DEFAULT '',
        image_data MEDIUMTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hrd_train_memo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        train_data_id INT NOT NULL UNIQUE,
        memo_date DATE NULL,
        request_dept VARCHAR(255) DEFAULT '',
        companions_json TEXT NULL,
        org_budget_text VARCHAR(255) DEFAULT '',
        hospital_budget DECIMAL(10,2) DEFAULT 0,
        director_name VARCHAR(255) DEFAULT 'นางณัฐปภัสร์ นวัตชัยศิริกุล',
        director_pos1 VARCHAR(255) DEFAULT 'นายแพทย์ชำนาญการพิเศษ รักษาการในตำแหน่ง',
        director_pos2 VARCHAR(255) DEFAULT 'ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.warn('ensureTrainSchema skipped:', err.message);
  }
})();

async function saveTrainMemo(trainDataId, b) {
  const list = Array.isArray(b.companions)
    ? b.companions
        .slice(0, 6)
        .map((c) => ({ name: String(c?.name || '').trim(), position: String(c?.position || '').trim() }))
        .filter((c) => c.name || c.position)
    : [];
  const dirName = String(b.director_name || '').trim() || 'นางณัฐปภัสร์ นวัตชัยศิริกุล';
  const dirPos1 = String(b.director_pos1 || '').trim() || 'นายแพทย์ชำนาญการพิเศษ รักษาการในตำแหน่ง';
  const dirPos2 = String(b.director_pos2 || '').trim() || 'ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ';
  await pool.query(
    `INSERT INTO hrd_train_memo (
      train_data_id, memo_date, request_dept, companions_json, org_budget_text, hospital_budget,
      director_name, director_pos1, director_pos2
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      memo_date = VALUES(memo_date),
      request_dept = VALUES(request_dept),
      companions_json = VALUES(companions_json),
      org_budget_text = VALUES(org_budget_text),
      hospital_budget = VALUES(hospital_budget),
      director_name = VALUES(director_name),
      director_pos1 = VALUES(director_pos1),
      director_pos2 = VALUES(director_pos2)`,
    [
      trainDataId,
      b.memo_date ? String(b.memo_date).slice(0, 10) : null,
      String(b.request_dept || '').trim(),
      JSON.stringify(list),
      String(b.org_budget_text || '').trim(),
      Number(b.hospital_budget || 0),
      dirName,
      dirPos1,
      dirPos2,
    ]
  );
}

async function saveTrainImage(trainDataId, trainImage, fileName = '') {
  if (trainImage === '__REMOVE__') {
    await pool.query('DELETE FROM hrd_train_images WHERE train_data_id = ?', [trainDataId]);
    return;
  }
  const s = String(trainImage || '').trim();
  const m = s.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  if (!m) return;
  await pool.query(
    `INSERT INTO hrd_train_images (train_data_id, mime_type, file_name, image_data)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), file_name = VALUES(file_name), image_data = VALUES(image_data)`,
    [trainDataId, m[1], String(fileName || ''), s]
  );
}

app.get('/api/trains', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const where = [];
    const params = [];
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      where.push('(t.train_topic LIKE ? OR t.train_org LIKE ? OR t.train_place LIKE ? OR t.train_order LIKE ?)');
      params.push(like, like, like, like);
    }
    if (req.query.year) {
      where.push('YEAR(t.train_startdate) = ?');
      params.push(Number(req.query.year));
    }
    if (req.query.train_type_id) {
      where.push('t.train_type_id = ?');
      params.push(Number(req.query.train_type_id));
    }
    if (req.query.mine === '1' && req.session.user) {
      where.push('t.person_id = ?');
      params.push(Number(req.session.user.person_id));
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS cnt FROM hrd_train_data t ${whereSql}`, params);
    const total = Number(cntRow?.cnt || 0);
    const [items] = await pool.query(
      `SELECT t.*, tt.train_type_name, ta.train_about_name, ar.train_area_name, tb.train_budget_name,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS full_name,
              CASE WHEN ti.id IS NOT NULL THEN 1 ELSE 0 END AS has_image
       FROM hrd_train_data t
       LEFT JOIN hrd_train_type tt ON tt.train_type_id = t.train_type_id
       LEFT JOIN hrd_train_about ta ON ta.train_about_id = t.train_about_id
       LEFT JOIN hrd_train_area ar ON ar.train_area_id = t.train_area_id
       LEFT JOIN hrd_train_budget tb ON tb.train_budget_id = t.train_budget_id
       LEFT JOIN hrd_person p ON p.person_id = t.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_train_images ti ON ti.train_data_id = t.train_data_id
       ${whereSql}
       ORDER BY t.train_data_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trains/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, tt.train_type_name, ta.train_about_name, ar.train_area_name, tb.train_budget_name,
              ti.image_data AS train_image, ti.file_name AS train_image_name,
              m.memo_date, m.request_dept, m.companions_json, m.org_budget_text, m.hospital_budget,
              m.director_name, m.director_pos1, m.director_pos2,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS requester_name,
              COALESCE(pos.position_name, '') AS requester_position,
              COALESCE(d.department_name, '') AS requester_dept
       FROM hrd_train_data t
       LEFT JOIN hrd_train_type tt ON tt.train_type_id = t.train_type_id
       LEFT JOIN hrd_train_about ta ON ta.train_about_id = t.train_about_id
       LEFT JOIN hrd_train_area ar ON ar.train_area_id = t.train_area_id
       LEFT JOIN hrd_train_budget tb ON tb.train_budget_id = t.train_budget_id
       LEFT JOIN hrd_train_images ti ON ti.train_data_id = t.train_data_id
       LEFT JOIN hrd_train_memo m ON m.train_data_id = t.train_data_id
       LEFT JOIN hrd_person p ON p.person_id = t.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       WHERE t.train_data_id = ? LIMIT 1`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบข้อมูลอบรม' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trains/:id/image', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ti.train_data_id, ti.mime_type, ti.file_name, ti.image_data, t.train_topic
       FROM hrd_train_images ti
       JOIN hrd_train_data t ON t.train_data_id = ti.train_data_id
       WHERE ti.train_data_id = ? LIMIT 1`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบรูปภาพประกอบการอบรมนี้' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trains/:id/pdf', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, tt.train_type_name, ta.train_about_name, ar.train_area_name, tb.train_budget_name,
              m.memo_date, m.request_dept, m.companions_json, m.org_budget_text, m.hospital_budget,
              m.director_name, m.director_pos1, m.director_pos2,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS requester_name,
              COALESCE(pos.position_name, '') AS requester_position,
              COALESCE(d.department_name, '') AS requester_dept
       FROM hrd_train_data t
       LEFT JOIN hrd_train_type tt ON tt.train_type_id = t.train_type_id
       LEFT JOIN hrd_train_about ta ON ta.train_about_id = t.train_about_id
       LEFT JOIN hrd_train_area ar ON ar.train_area_id = t.train_area_id
       LEFT JOIN hrd_train_budget tb ON tb.train_budget_id = t.train_budget_id
       LEFT JOIN hrd_train_memo m ON m.train_data_id = t.train_data_id
       LEFT JOIN hrd_person p ON p.person_id = t.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       WHERE t.train_data_id = ? LIMIT 1`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'ไม่พบข้อมูลอบรม' });
    generateTrainPdf(rows[0], res, req.query.download === '1');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trains', requireAuth, async (req, res) => {
  try {
    const b = req.body;
    const days = b.train_sum_day ? Number(b.train_sum_day) : calcLeaveDays(b.train_startdate, b.train_enddate, 1);
    const [result] = await pool.query(
      `INSERT INTO hrd_train_data (
        train_topic, train_org, train_place, province_id, train_startdate, train_enddate, train_sum_day,
        train_type_id, train_about_id, train_area_id, train_budget_id, train_order, train_travel, train_distance_km,
        train_pay_register, train_pay_apartment, train_pay_allowance, train_pay_travel, train_pay_other,
        allow_id, person_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        b.train_topic,
        b.train_org || '',
        b.train_place || '',
        b.province_id ? Number(b.province_id) : null,
        b.train_startdate,
        b.train_enddate,
        days,
        b.train_type_id ? Number(b.train_type_id) : null,
        b.train_about_id ? Number(b.train_about_id) : null,
        b.train_area_id ? Number(b.train_area_id) : null,
        b.train_budget_id ? Number(b.train_budget_id) : null,
        b.train_order || '',
        b.train_travel || '',
        Number(b.train_distance_km || 0),
        Number(b.train_pay_register || 0),
        Number(b.train_pay_apartment || 0),
        Number(b.train_pay_allowance || 0),
        Number(b.train_pay_travel || 0),
        Number(b.train_pay_other || 0),
        req.session.user.person_id,
      ]
    );
    await saveTrainImage(result.insertId, b.train_image, b.train_image_name);
    await saveTrainMemo(result.insertId, b);
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trains/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await pool.query('SELECT person_id FROM hrd_train_data WHERE train_data_id = ? LIMIT 1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'ไม่พบข้อมูลอบรม' });
    if (!req.session.user.isAdmin && Number(existing[0].person_id) !== Number(req.session.user.person_id)) {
      return res.status(403).json({ error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลของผู้อื่น' });
    }
    const b = req.body;
    const days = b.train_sum_day ? Number(b.train_sum_day) : calcLeaveDays(b.train_startdate, b.train_enddate, 1);
    await pool.query(
      `UPDATE hrd_train_data
       SET train_topic = ?, train_org = ?, train_place = ?, province_id = ?, train_startdate = ?, train_enddate = ?, train_sum_day = ?,
           train_type_id = ?, train_area_id = ?, train_budget_id = ?, train_order = ?, train_travel = ?, train_distance_km = ?,
           train_pay_register = ?, train_pay_apartment = ?, train_pay_allowance = ?, train_pay_travel = ?
       WHERE train_data_id = ?`,
      [
        b.train_topic,
        b.train_org || '',
        b.train_place || '',
        b.province_id ? Number(b.province_id) : null,
        b.train_startdate,
        b.train_enddate,
        days,
        b.train_type_id ? Number(b.train_type_id) : null,
        b.train_area_id ? Number(b.train_area_id) : null,
        b.train_budget_id ? Number(b.train_budget_id) : null,
        b.train_order || '',
        b.train_travel || '',
        Number(b.train_distance_km || 0),
        Number(b.train_pay_register || 0),
        Number(b.train_pay_apartment || 0),
        Number(b.train_pay_allowance || 0),
        Number(b.train_pay_travel || 0),
        id,
      ]
    );
    await saveTrainImage(id, b.train_image, b.train_image_name);
    await saveTrainMemo(id, b);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trains/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM hrd_train_images WHERE train_data_id = ?', [id]);
    await pool.query('DELETE FROM hrd_train_memo WHERE train_data_id = ?', [id]);
    await pool.query('DELETE FROM hrd_train_data WHERE train_data_id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== USER PROFILE & HRD RECORD SECTIONS (SCREENSHOT MENUS) ====================
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเดิม และรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร' });
    }
    const [rows] = await pool.query(
      'SELECT person_id FROM hrd_person WHERE person_id = ? AND (password = ? OR password = ?) LIMIT 1',
      [req.session.user.person_id, md5(String(oldPassword).trim()), String(oldPassword).trim()]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }
    await pool.query('UPDATE hrd_person SET password = ? WHERE person_id = ?', [
      md5(String(newPassword).trim()),
      req.session.user.person_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hrd/record', requireAuth, async (req, res) => {
  try {
    const personId = req.session.user.isAdmin && req.query.person_id
      ? Number(req.query.person_id)
      : Number(req.session.user.person_id);

    const [[general]] = await pool.query(
      `SELECT p.person_id, p.cid, p.fname, p.lname, p.nickname, p.phone_number, p.email,
              p.birthday, p.startwork_date, p.work_register_date, p.address_no, p.moo, p.village_name,
              p.zipcode, p.salary, p.money_position, p.leave_accumulate, p.username,
              pn.prename_name, pos.position_name, d.department_name, ds.department_sub_name,
              pt.person_type_name, ps.person_status_name
       FROM hrd_person p
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = p.department_sub_id
       LEFT JOIN hrd_person_type pt ON pt.person_type_id = p.person_type_id
       LEFT JOIN hrd_person_status ps ON ps.person_status_id = p.person_status_id
       WHERE p.person_id = ? LIMIT 1`,
      [personId]
    );

    const [
      [positions],
      [salaries],
      [educations],
      [insignias],
      [awards],
      [disciplines],
      [duties],
      [welfares],
      [statuses],
    ] = await Promise.all([
      pool.query(
        `SELECT pd.*, pos.position_name, d.department_name, ds.department_sub_name
         FROM hrd_position_data pd
         LEFT JOIN hrd_position pos ON pos.position_id = pd.position_id
         LEFT JOIN hrd_department d ON d.department_id = pd.department_id
         LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = pd.department_sub_id
         WHERE pd.person_id = ? ORDER BY pd.position_date DESC, pd.position_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT salary_id, salary_date, salary, salary_position, salary_pts, salary_ch8, salary_percent, salary_startdate, salary_enddate
         FROM hrd_salary_data WHERE person_id = ? ORDER BY salary_date DESC, salary_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT t.education_data_id, t.education_date, t.grade, t.study_year, t.education_high,
                ed.education_name, ins.institute_name
         FROM hrd_education_data t
         LEFT JOIN hrd_education ed ON ed.education_id = t.education_id
         LEFT JOIN hrd_institute ins ON ins.institute_id = t.institute_id
         WHERE t.person_id = ? ORDER BY t.education_date DESC, t.education_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT t.insignia_data_id, t.insignia_date, t.insignia_date_receive, t.insignia_book_number,
                t.insignia_part, t.insignia_page, ins.insignia_name, ins.insignia_name_acronym
         FROM hrd_insignia_data t
         LEFT JOIN hrd_insignia ins ON ins.insignia_id = t.insignia_id
         WHERE t.person_id = ? ORDER BY t.insignia_date DESC, t.insignia_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT t.award_data_id, t.award_date, t.award_name, t.award_from, t.award_give, t.award_place, t.award_detail,
                at.award_type_name
         FROM hrd_award_data t
         LEFT JOIN hrd_award_type at ON at.award_type_id = t.award_type_id
         WHERE t.person_id = ? ORDER BY t.award_date DESC, t.award_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT discipline_data_id, discipline_date, discipline_name, discipline_detail
         FROM hrd_discipline_data WHERE person_id = ? ORDER BY discipline_date DESC, discipline_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT d.duty_data_id, d.duty_name, d.duty_startdate, d.duty_enddate, dt.duty_type_name
         FROM hrd_duty_data d
         LEFT JOIN hrd_duty_type dt ON dt.duty_type_id = d.duty_type_id
         WHERE d.person_id = ? ORDER BY d.duty_startdate DESC, d.duty_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT w.welfare_data_id, w.welfare_date, w.welfare_name, wt.welfare_type_name
         FROM hrd_welfare_data w
         LEFT JOIN hrd_welfare_type wt ON wt.welfare_type_id = w.welfare_type
         WHERE w.person_id = ? ORDER BY w.welfare_date DESC, w.welfare_data_id DESC`,
        [personId]
      ),
      pool.query(
        `SELECT s.person_status_data_id, s.person_status_date, ps.person_status_name, pt.person_type_name,
                d.department_name, ds.department_sub_name
         FROM hrd_person_status_data s
         LEFT JOIN hrd_person_status ps ON ps.person_status_id = s.person_status_id
         LEFT JOIN hrd_person_type pt ON pt.person_type_id = s.person_type_id
         LEFT JOIN hrd_department d ON d.department_id = s.department_id
         LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = s.department_sub_id
         WHERE s.person_id = ? ORDER BY s.person_status_date DESC`,
        [personId]
      ),
    ]);

    res.json({
      general,
      positions,
      salaries,
      educations,
      insignias,
      awards,
      disciplines,
      duties,
      welfares,
      statuses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REPORTS ====================
app.get('/api/reports/summary', async (req, res) => {
  try {
    const fy = Number(req.query.year_name || getFiscalYear());
    const { fyStart, fyEnd } = getFiscalDateRange(fy);
    const [byDepartment] = await pool.query(
      `SELECT COALESCE(d.department_name, 'ไม่ระบุกลุ่มงาน') AS name,
              COUNT(*) AS total,
              SUM(COALESCE(l.leave_day, DATEDIFF(l.leave_enddate, l.leave_startdate) + 1)) AS total_days
       FROM hrd_leave_data l
       LEFT JOIN hrd_person p ON p.person_id = l.person_id
       LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id, 0), p.department_id)
       WHERE l.leave_startdate BETWEEN ? AND ?
       GROUP BY COALESCE(NULLIF(l.department_id, 0), p.department_id), d.department_name
       ORDER BY total DESC`,
      [fyStart, fyEnd]
    );
    const [byType] = await pool.query(
      `SELECT COALESCE(lt.hrd_leave_type_name, 'ไม่ระบุ') AS name,
              COUNT(*) AS total,
              SUM(COALESCE(l.leave_day, DATEDIFF(l.leave_enddate, l.leave_startdate) + 1)) AS total_days
       FROM hrd_leave_data l
       LEFT JOIN hrd_leave_type lt ON lt.hrd_leave_type_id = l.hrd_leave_type_id
       WHERE l.leave_startdate BETWEEN ? AND ?
       GROUP BY l.hrd_leave_type_id, lt.hrd_leave_type_name
       ORDER BY total DESC`,
      [fyStart, fyEnd]
    );
    const [topPersons] = await pool.query(
      `SELECT CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS name,
              COALESCE(d.department_name, '-') AS dept,
              COUNT(*) AS total,
              SUM(COALESCE(l.leave_day, DATEDIFF(l.leave_enddate, l.leave_startdate) + 1)) AS total_days
       FROM hrd_leave_data l
       LEFT JOIN hrd_person p ON p.person_id = l.person_id
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id, 0), p.department_id)
       WHERE l.leave_startdate BETWEEN ? AND ?
       GROUP BY l.person_id, p.fname, p.lname, pn.prename_name, d.department_name
       ORDER BY total_days DESC
       LIMIT 20`,
      [fyStart, fyEnd]
    );
    res.json({ fiscalYear: fy, byDepartment, byType, topPersons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/pdf', requireAdmin, async (req, res) => {
  try {
    const fy = Number(req.query.year_name || getFiscalYear());
    const { fyStart, fyEnd } = getFiscalDateRange(fy);
    const section = req.query.section || 'department';
    const [summary] = await Promise.all([
      (async () => {
        const [byDepartment] = await pool.query(
          `SELECT COALESCE(d.department_name, 'ไม่ระบุกลุ่มงาน') AS name, COUNT(*) AS total,
                  ROUND(SUM(COALESCE(l.leave_day, DATEDIFF(l.leave_enddate, l.leave_startdate) + 1)), 1) AS total_days
           FROM hrd_leave_data l
           LEFT JOIN hrd_person p ON p.person_id = l.person_id
           LEFT JOIN hrd_department d ON d.department_id = COALESCE(NULLIF(l.department_id, 0), p.department_id)
           WHERE l.leave_startdate BETWEEN ? AND ?
           GROUP BY COALESCE(NULLIF(l.department_id, 0), p.department_id), d.department_name ORDER BY total DESC`,
          [fyStart, fyEnd]
        );
        const [byType] = await pool.query(
          `SELECT COALESCE(lt.hrd_leave_type_name, 'ไม่ระบุ') AS name, COUNT(*) AS total,
                  ROUND(SUM(COALESCE(l.leave_day, DATEDIFF(l.leave_enddate, l.leave_startdate) + 1)), 1) AS total_days
           FROM hrd_leave_data l
           LEFT JOIN hrd_leave_type lt ON lt.hrd_leave_type_id = l.hrd_leave_type_id
           WHERE l.leave_startdate BETWEEN ? AND ? GROUP BY l.hrd_leave_type_id, lt.hrd_leave_type_name ORDER BY total DESC`,
          [fyStart, fyEnd]
        );
        return { byDepartment, byType };
      })(),
    ]);

    if (section === 'type') {
      const cols = [
        { label: 'ลำดับ', w: 50, align: 'center' },
        { label: 'ประเภทการลา', w: 285 },
        { label: 'จำนวนครั้ง', w: 90, align: 'center' },
        { label: 'รวมวันลา', w: 90, align: 'center' },
      ];
      const rows = summary.byType.map((r, i) => [i + 1, r.name, r.total, r.total_days || 0]);
      return generateReportPdf('รายงานสรุปการลาตามประเภทการลา', `ปีงบประมาณ พ.ศ. ${fy}`, cols, rows, res, req.query.download === '1');
    }

    const cols = [
      { label: 'ลำดับ', w: 50, align: 'center' },
      { label: 'กลุ่มงาน', w: 285 },
      { label: 'จำนวนครั้ง', w: 90, align: 'center' },
      { label: 'รวมวันลา', w: 90, align: 'center' },
    ];
    const rows = summary.byDepartment.map((r, i) => [i + 1, r.name, r.total, r.total_days || 0]);
    return generateReportPdf('รายงานสรุปการลาตามกลุ่มงาน', `ปีงบประมาณ พ.ศ. ${fy}`, cols, rows, res, req.query.download === '1');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PERSONNEL (ADMIN) ====================
app.get('/api/persons', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const deptId = req.query.department_id ? Number(req.query.department_id) : 0;
    const ptypeId = req.query.person_type_id ? Number(req.query.person_type_id) : 0;
    const grpId = req.query.user_groups_id ? Number(req.query.user_groups_id) : 0;

    const where = ["COALESCE(TRIM(p.fname), '') != ''"];
    const params = [];
    if (q) {
      where.push('(p.fname LIKE ? OR p.lname LIKE ? OR p.username LIKE ? OR CAST(p.person_id AS CHAR) = ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, q);
    }
    if (deptId) {
      where.push('p.department_id = ?');
      params.push(deptId);
    }
    if (ptypeId) {
      where.push('p.person_type_id = ?');
      params.push(ptypeId);
    }
    if (grpId) {
      where.push('p.user_groups_id = ?');
      params.push(grpId);
    }

    const [rows] = await pool.query(
      `SELECT p.person_id, p.username, p.user_groups_id, p.person_type_id, p.leave_accumulate, p.phone_number,
              CONCAT(COALESCE(pn.prename_name,''), TRIM(p.fname), ' ', TRIM(p.lname)) AS full_name,
              pos.position_name, d.department_name, ds.department_sub_name,
              ug.user_groups_th, pt.person_type_name
       FROM hrd_person p
       LEFT JOIN hrd_prename pn ON pn.prename_id = p.prename_id
       LEFT JOIN hrd_position pos ON pos.position_id = p.position_id
       LEFT JOIN hrd_department d ON d.department_id = p.department_id
       LEFT JOIN hrd_department_sub ds ON ds.department_sub_id = p.department_sub_id
       LEFT JOIN hrd_user_groups ug ON ug.user_groups_id = p.user_groups_id
       LEFT JOIN hrd_person_type pt ON pt.person_type_id = p.person_type_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.fname, p.lname
       LIMIT 500`,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/persons/:id', requireAdmin, async (req, res) => {
  try {
    const { user_groups_id, leave_accumulate, person_type_id } = req.body;
    if (person_type_id != null) {
      await pool.query(
        'UPDATE hrd_person SET user_groups_id = ?, leave_accumulate = ?, person_type_id = ? WHERE person_id = ?',
        [Number(user_groups_id || 3), Number(leave_accumulate || 0), Number(person_type_id || 1), Number(req.params.id)]
      );
    } else {
      await pool.query(
        'UPDATE hrd_person SET user_groups_id = ?, leave_accumulate = ? WHERE person_id = ?',
        [Number(user_groups_id || 3), Number(leave_accumulate || 0), Number(req.params.id)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TRAVEL RATES (ADMIN) ====================
app.get('/api/travel-rates', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const where = q ? 'WHERE province_name_th LIKE ?' : '';
    const params = q ? [`%${q}%`] : [];
    const [rows] = await pool.query(
      `SELECT id, origin_province, province_id, province_name_th,
              distance_roundtrip_km, private_car_rate, bus_fare, flight_fare, train_fare, updated_at
       FROM hrd_travel_rates ${where} ORDER BY province_name_th`,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/travel-rates/:id', requireAdmin, async (req, res) => {
  try {
    const { distance_roundtrip_km, private_car_rate, bus_fare, flight_fare, train_fare } = req.body;
    await pool.query(
      `UPDATE hrd_travel_rates
       SET distance_roundtrip_km = ?, private_car_rate = ?, bus_fare = ?, flight_fare = ?, train_fare = ?
       WHERE id = ?`,
      [
        Number(distance_roundtrip_km || 0),
        Number(private_car_rate ?? 4),
        Number(bus_fare || 0),
        Number(flight_fare || 0),
        Number(train_fare || 0),
        Number(req.params.id),
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AUTO UPDATE SYSTEM ====================
app.get('/api/system/version', async (req, res) => {
  let commit = 'unknown';
  let commitDate = '';
  let commitMsg = '';
  try {
    const { stdout } = await execAsync('git log -1 --format="%h|%ci|%s"', { cwd: __dirname });
    const parts = stdout.trim().split('|');
    commit = parts[0] || 'unknown';
    commitDate = parts[1] || '';
    commitMsg = parts[2] || '';
  } catch {}
  res.json({
    name: PKG.name,
    version: PKG.version,
    commit,
    commitDate,
    commitMsg,
    nodeVersion: process.version,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get('/api/system/check-update', requireAdmin, async (req, res) => {
  try {
    await execAsync('git fetch origin main', { cwd: __dirname, timeout: 15000 });
    const { stdout: localHash } = await execAsync('git rev-parse --short HEAD', { cwd: __dirname });
    const { stdout: remoteHash } = await execAsync('git rev-parse --short origin/main', { cwd: __dirname });
    const { stdout: behindStr } = await execAsync('git rev-list --count HEAD..origin/main', { cwd: __dirname });
    const { stdout: latestMsg } = await execAsync('git log -1 --format="%s" origin/main', { cwd: __dirname });
    const behindCount = Number(behindStr.trim() || 0);
    res.json({
      hasUpdate: behindCount > 0,
      behindCount,
      localCommit: localHash.trim(),
      remoteCommit: remoteHash.trim(),
      latestMessage: latestMsg.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: `ตรวจสอบอัปเดตไม่สำเร็จ: ${err.message}` });
  }
});

app.post('/api/system/update', requireAdmin, async (req, res) => {
  try {
    const { stdout: diffFiles } = await execAsync('git diff --name-only HEAD..origin/main', { cwd: __dirname });
    const { stdout: pullOut } = await execAsync('git pull origin main', { cwd: __dirname, timeout: 30000 });
    if (diffFiles.includes('package.json')) {
      await execAsync('npm install --omit=dev', { cwd: __dirname, timeout: 60000 });
    }
    res.json({ ok: true, output: pullOut.trim(), restarting: true });
    setTimeout(() => process.exit(0), 800);
  } catch (err) {
    res.status(500).json({ error: `อัปเดตไม่สำเร็จ: ${err.message}` });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KSP HRD System running at http://0.0.0.0:${PORT}`);
});
