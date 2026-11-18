const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtThaiFullDate(iso) {
  if (!iso || String(iso).startsWith('0000')) return '......../..................../..........';
  const s = String(iso).slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return s;
  const d = Number(p[2]);
  const m = THAI_MONTHS_FULL[Number(p[1]) - 1] || p[1];
  const y = Number(p[0]) + 543;
  return `วันที่  ${d}  เดือน  ${m}  พ. ศ.  ${y}`;
}

function fmtPrintDatetime() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function drawCheckbox(doc, x, y, checked, size = 10) {
  doc.save();
  doc.lineWidth(0.9).rect(x, y, size, size).stroke('#111827');
  if (checked) {
    doc.lineWidth(1.3)
      .moveTo(x + 2, y + size * 0.52)
      .lineTo(x + size * 0.42, y + size - 2.5)
      .lineTo(x + size - 2, y + 2.5)
      .stroke('#111827');
  }
  doc.restore();
}

function sendPdf(doc, filename, res, isDownload) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${isDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  doc.pipe(res);
  doc.end();
}

function drawFooterTimestamp(doc) {
  doc.font('ThaiBold').fontSize(9).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 795, {
    align: 'right',
    width: 500,
    lineBreak: false,
  });
}

function drawSupervisorAndOrder(doc, supY, ordY, headName, deptName, allowId) {
  doc.font('ThaiBold').fontSize(10.5).text('ความเห็นของผู้บังคับบัญชา', 325, supY, { width: 220, align: 'center', lineBreak: false });
  doc.font('Thai').fontSize(10.5);
  doc.text('......................................................................', 325, supY + 20, { width: 225, lineBreak: false });
  doc.text('......................................................................', 325, supY + 38, { width: 225, lineBreak: false });
  doc.text('ลงชื่อ....................................................', 325, supY + 62, { width: 225, lineBreak: false });
  doc.text(`( ${headName} )`, 325, supY + 80, { width: 220, align: 'center', lineBreak: false });
  doc.text(`( หัวหน้า ${deptName || 'กลุ่มงาน'} )`, 325, supY + 98, { width: 220, align: 'center', lineBreak: false });
  doc.text('วันที่........../........................../............', 325, supY + 118, { width: 225, lineBreak: false });

  doc.font('ThaiBold').fontSize(10.5).text('คำสั่ง', 325, ordY, { underline: true });
  drawCheckbox(doc, 332, ordY + 22, allowId === 2, 10);
  doc.font('Thai').fontSize(10.5).text('อนุญาต', 348, ordY + 19, { lineBreak: false });
  drawCheckbox(doc, 408, ordY + 22, allowId === 3, 10);
  doc.text('ไม่อนุญาต', 424, ordY + 19, { lineBreak: false });

  doc.text('ลงชื่อ....................................................', 325, ordY + 50, { width: 225, lineBreak: false });
  doc.text('ตำแหน่ง ( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 310, ordY + 76, { width: 245, align: 'center', lineBreak: false });
  doc.text('วันที่........../........................../............', 325, ordY + 98, { width: 225, lineBreak: false });
}

/**
 * Generates exact original A4 Leave Form PDF matching E:\iwxe7\Report layouts (1 single A4 page)
 */
function generateLeavePdf(leave, stats, res, isDownload = false) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, bottom: 20, left: 48, right: 48 },
  });
  doc.registerFont('Thai', FONT_REG);
  doc.registerFont('ThaiBold', FONT_BOLD);

  const typeId = Number(leave.hrd_leave_type_id);
  const fullName = `${leave.prename_name || ''}${leave.fname || ''} ${leave.lname || ''}`.trim();
  const posName = leave.position_name || '-';
  const deptFull = [leave.department_name, leave.department_sub_name].filter(Boolean).join('/') || '-';
  const saveDateStr = fmtThaiFullDate(leave.leave_save || new Date().toISOString().slice(0, 10));
  const startStr = fmtThaiFullDate(leave.leave_startdate);
  const endStr = fmtThaiFullDate(leave.leave_enddate);
  const days = Number(leave.calc_days || leave.leave_day || 1);
  const daysText = Number.isInteger(days) ? String(days) : days.toFixed(1);
  const contactAddr = (leave.leave_contact || '').trim() || '-';
  const contactTel = (leave.leave_contact_tel || leave.phone_number || '').trim() || '-';
  const checkerName = (leave.checker_name || 'นายสุวัฒชัย จันทร์คต').trim();
  const headName = (leave.head_name || '').trim() || '........................................';
  const assignedName = (leave.assigned_name || '').trim() || '........................................';
  const allowId = Number(leave.allow_id || 1);

  if (typeId === 5) {
    // ==================== แบบใบลาพักผ่อน ====================
    doc.font('ThaiBold').fontSize(14.5).text('แบบใบลาพักผ่อน', 48, 38, { align: 'center', width: 500, underline: true });

    doc.font('ThaiBold').fontSize(10.5).text('เขียนที่', 310, 68, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

    let y = 114;
    doc.font('ThaiBold').fontSize(10.5).text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอลาพักผ่อน');
    y += 20;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการ  โรงพยาบาลโคกศรีสุพรรณ');
    y += 22;
    doc.text(`ข้าพเจ้า   ${fullName}`, 84, y, { continued: true });
    doc.font('ThaiBold').text('          ตำแหน่ง   ', { continued: true });
    doc.font('Thai').text(posName);
    y += 20;
    doc.font('ThaiBold').text('สังกัด  ', 48, y, { continued: true });
    doc.font('Thai').text(`${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`);
    y += 24;

    const acc = Number(leave.leave_accumulate || 0);
    const annualRight = 10;
    const totalRight = acc + annualRight;
    doc.text(
      `มีวันลาพักผ่อนสะสม   ${acc || '     '}   วัน     มีสิทธิ์การลาพักผ่อนประจำปี   ${annualRight}   วันทำการ     รวมเป็น   ${totalRight}   วันทำการ`,
      48,
      y,
      { width: 505 }
    );
    y += 24;
    doc.text(`ขอลาพักผ่อนตั้งแต่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 68, y, { width: 485 });
    y += 26;
    doc.text(`ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่   ${contactAddr}`, 48, y, { width: 500 });
    y += 20;
    doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 64, y);

    // Middle Section: Left = Leave Stats Table, Right = Applicant Signature
    const midY = 340;
    doc.font('ThaiBold').fontSize(11).text('สถิติการลาในปีงบประมาณนี้', 48, midY);

    const tblX = 48;
    const tblY = midY + 24;
    const colW = [62, 62, 62];
    const rowH1 = 34;
    const rowH2 = 32;

    doc.lineWidth(0.9).rect(tblX, tblY, 186, rowH1 + rowH2).stroke('#111827');
    doc.moveTo(tblX + colW[0], tblY).lineTo(tblX + colW[0], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX + colW[0] + colW[1], tblY).lineTo(tblX + colW[0] + colW[1], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX, tblY + rowH1).lineTo(tblX + 186, tblY + rowH1).stroke();

    doc.font('ThaiBold').fontSize(10);
    doc.text('ลามาแล้ว\n(วันทำการ)', tblX, tblY + 5, { width: colW[0], align: 'center' });
    doc.text('ลาครั้งนี้\n(วันทำการ)', tblX + colW[0], tblY + 5, { width: colW[1], align: 'center' });
    doc.text('รวมเป็น\n(วันทำการ)', tblX + colW[0] + colW[1], tblY + 5, { width: colW[2], align: 'center' });

    const prevVac = Number(stats.prevVacation || 0);
    const totalVac = prevVac + days;
    doc.font('Thai').fontSize(10.5);
    doc.text(prevVac ? String(prevVac) : '0', tblX, tblY + rowH1 + 9, { width: colW[0], align: 'center' });
    doc.text(daysText, tblX + colW[0], tblY + rowH1 + 9, { width: colW[1], align: 'center' });
    doc.text(Number.isInteger(totalVac) ? String(totalVac) : totalVac.toFixed(1), tblX + colW[0] + colW[1], tblY + rowH1 + 9, { width: colW[2], align: 'center' });

    // Right: Applicant signature
    doc.font('Thai').fontSize(10.5).text('ขอแสดงความนับถือ', 325, midY - 6, { width: 220, align: 'center' });
    doc.text('ลงชื่อ....................................................', 325, midY + 32, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 325, midY + 50, { width: 220, align: 'center' });

    // Supervisor + Director Order (Right)
    drawSupervisorAndOrder(doc, midY + 82, midY + 230, headName, leave.department_name, allowId);

    // Checker (Left)
    const chkY = midY + 144;
    doc.font('Thai').fontSize(10.5).text('ลงชื่อ......................................ผู้ตรวจสอบ', 48, chkY);
    doc.text(`( ${checkerName} )`, 56, chkY + 18, { width: 170, align: 'center' });
    doc.text('ตำแหน่ง   พนักงานธุรการ', 48, chkY + 36);
    doc.text('วันที่........../..................../............', 48, chkY + 54);

    // Handover / Assigned Person (Left bottom)
    const hndY = chkY + 82;
    doc.font('ThaiBold').fontSize(10.5).text('ในระหว่างที่ข้าพเจ้าลาครั้งนี้ขอมอบงานในหน้าที่ให้', 48, hndY);
    doc.font('Thai').text('ลงชื่อ...........................................ผู้มอบ', 48, hndY + 20);
    doc.text('วันที่........../..................../............', 48, hndY + 38);
    doc.text('ลงชื่อ...........................................ผู้รับมอบ', 48, hndY + 58);
    doc.text(`( ${assignedName} )`, 56, hndY + 76, { width: 170, align: 'center' });
    doc.text('วันที่........../..................../............', 48, hndY + 94);

    drawFooterTimestamp(doc);
    return sendPdf(doc, `leave-vacation-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  if (typeId === 12) {
    // ==================== แบบใบขอยกเลิกวันลา ====================
    doc.font('ThaiBold').fontSize(14.5).text('แบบใบขอยกเลิกวันลา', 48, 38, { align: 'center', width: 500, underline: true });
    doc.font('ThaiBold').fontSize(10.5).text('เขียนที่', 310, 68, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

    let y = 118;
    doc.font('ThaiBold').text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอยกเลิกวันลา');
    y += 20;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการ  โรงพยาบาลโคกศรีสุพรรณ');
    y += 24;
    doc.text(`ข้าพเจ้า   ${fullName}          ตำแหน่ง   ${posName}`, 74, y);
    y += 20;
    doc.text(`สังกัด   ${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`, 48, y);
    y += 24;
    doc.text(`ขอแจ้งยกเลิกวันลาตั้งแต่วันที่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 68, y, { width: 485 });
    y += 24;
    doc.text(`เนื่องจาก   ${(leave.leave_because_cancel || leave.leave_because || '-').trim()}`, 48, y, { width: 495 });

    const sigY = 330;
    doc.text('ขอแสดงความนับถือ', 325, sigY, { width: 220, align: 'center' });
    doc.text('ลงชื่อ....................................................', 325, sigY + 36, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 325, sigY + 54, { width: 220, align: 'center' });

    drawSupervisorAndOrder(doc, sigY + 86, sigY + 234, headName, leave.department_name, allowId === 9 ? 2 : allowId);
    drawFooterTimestamp(doc);
    return sendPdf(doc, `leave-cancel-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  // ==================== แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว ====================
  const typeTitle = leave.hrd_leave_type_name || 'ลาป่วย / ลากิจส่วนตัว / ลาคลอดบุตร';
  doc.font('ThaiBold').fontSize(14.5).text('แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว', 48, 38, { align: 'center', width: 500, underline: true });

  doc.font('ThaiBold').fontSize(10.5).text('เขียนที่', 310, 68, { continued: true });
  doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
  doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

  let y = 114;
  doc.font('ThaiBold').fontSize(10.5).text('เรื่อง', 48, y, { continued: true });
  doc.font('Thai').text(`    ขอ${typeTitle}`);
  y += 20;
  doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
  doc.font('Thai').text('    ผู้อำนวยการ  โรงพยาบาลโคกศรีสุพรรณ');
  y += 20;
  doc.text(`ข้าพเจ้า   ${fullName}`, 84, y, { continued: true });
  doc.font('ThaiBold').text('          ตำแหน่ง   ', { continued: true });
  doc.font('Thai').text(posName);
  y += 20;
  doc.font('ThaiBold').text('สังกัด  ', 48, y, { continued: true });
  doc.font('Thai').text(`${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`);
  y += 24;

  doc.text('ขอลา', 74, y);
  drawCheckbox(doc, 114, y + 3, typeId === 1, 10);
  doc.text('ป่วย', 130, y);
  drawCheckbox(doc, 174, y + 3, typeId === 4, 10);
  doc.text('กิจส่วนตัว', 190, y);
  drawCheckbox(doc, 264, y + 3, typeId === 2, 10);
  doc.text('คลอดบุตร', 280, y);
  const isOther = ![1, 2, 4].includes(typeId);
  drawCheckbox(doc, 350, y + 3, isOther, 10);
  doc.text(isOther ? `อื่นๆ (${typeTitle})` : 'อื่นๆ', 366, y);

  y += 22;
  doc.text(`เนื่องจาก   ${(leave.leave_because || '-').trim()}`, 48, y, { width: 495 });
  y += 26;
  doc.text(`ตั้งแต่วันที่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 48, y, { width: 505 });
  y += 22;
  doc.text(`ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่   ${contactAddr}`, 48, y, { width: 500 });
  y += 20;
  doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 64, y);

  // Stats table (4 columns x 4 rows)
  const midY = 340;
  doc.font('ThaiBold').fontSize(11).text('สถิติการลาในปีงบประมาณนี้', 48, midY);
  const tblX = 48;
  const tblY = midY + 22;
  const widths = [74, 48, 48, 48];
  const rowH = 25;
  const totalW = widths.reduce((a, b) => a + b, 0);

  doc.lineWidth(0.9).rect(tblX, tblY, totalW, rowH * 4).stroke('#111827');
  let cx = tblX;
  for (let i = 0; i < widths.length - 1; i++) {
    cx += widths[i];
    doc.moveTo(cx, tblY).lineTo(cx, tblY + rowH * 4).stroke();
  }
  for (let r = 1; r <= 3; r++) {
    doc.moveTo(tblX, tblY + rowH * r).lineTo(tblX + totalW, tblY + rowH * r).stroke();
  }

  const headers = ['ประเภทลา', 'ลามาแล้ว', 'ลาครั้งนี้', 'รวมเป็น'];
  cx = tblX;
  doc.font('ThaiBold').fontSize(9.5);
  headers.forEach((h, i) => {
    doc.text(h, cx, tblY + 7, { width: widths[i], align: 'center' });
    cx += widths[i];
  });

  const statRows = [
    ['ป่วย', stats.prevSick || 0, typeId === 1 ? daysText : '-', typeId === 1 ? (Number(stats.prevSick || 0) + days) : (stats.prevSick || 0)],
    ['กิจส่วนตัว', stats.prevBusiness || 0, typeId === 4 ? daysText : '-', typeId === 4 ? (Number(stats.prevBusiness || 0) + days) : (stats.prevBusiness || 0)],
    ['คลอดบุตร', stats.prevMaternity || 0, typeId === 2 ? daysText : '-', typeId === 2 ? (Number(stats.prevMaternity || 0) + days) : (stats.prevMaternity || 0)],
  ];
  doc.font('Thai').fontSize(10);
  statRows.forEach((sr, rIdx) => {
    cx = tblX;
    sr.forEach((val, cIdx) => {
      doc.text(String(val), cx + (cIdx === 0 ? 4 : 0), tblY + rowH * (rIdx + 1) + 6, { width: widths[cIdx] - (cIdx === 0 ? 4 : 0), align: cIdx === 0 ? 'left' : 'center' });
      cx += widths[cIdx];
    });
  });

  doc.font('Thai').fontSize(10.5).text('ขอแสดงความนับถือ', 325, midY - 6, { width: 220, align: 'center' });
  doc.text('ลงชื่อ....................................................', 325, midY + 32, { width: 220, align: 'center' });
  doc.text(`( ${fullName} )`, 325, midY + 50, { width: 220, align: 'center' });

  const chkY = tblY + rowH * 4 + 26;
  doc.text('ลงชื่อ......................................ผู้ตรวจสอบ', 48, chkY);
  doc.text(`( ${checkerName} )`, 56, chkY + 18, { width: 170, align: 'center' });
  doc.text('ตำแหน่ง   พนักงานธุรการ', 48, chkY + 36);
  doc.text('วันที่........../..................../............', 48, chkY + 54);

  drawSupervisorAndOrder(doc, midY + 82, midY + 230, headName, leave.department_name, allowId);
  drawFooterTimestamp(doc);
  return sendPdf(doc, `leave-${leave.hrd_leave_id}.pdf`, res, isDownload);
}

/**
 * Generates Training / Conference Report PDF (A4)
 */
function generateTrainPdf(train, res, isDownload = false) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 20, left: 48, right: 48 } });
  doc.registerFont('Thai', FONT_REG);
  doc.registerFont('ThaiBold', FONT_BOLD);

  doc.font('ThaiBold').fontSize(15).text('แบบรายงานการฝึกอบรม / ประชุมวิชาการ / ไปราชการ', 48, 42, { align: 'center', width: 500, underline: true });
  doc.font('Thai').fontSize(11.5).text('โรงพยาบาลโคกศรีสุพรรณ จังหวัดสกลนคร', 48, 66, { align: 'center', width: 500 });

  let y = 104;
  const row = (label, val) => {
    doc.font('ThaiBold').fontSize(11).text(label, 48, y, { width: 150 });
    doc.font('Thai').text(String(val || '-'), 200, y, { width: 345 });
    y += Math.max(22, doc.heightOfString(String(val || '-'), { width: 345 }) + 8);
  };

  row('รหัสอ้างอิง:', `#${train.train_data_id}`);
  row('หัวข้อ / หลักสูตร:', train.train_topic);
  row('หน่วยงานที่จัด:', train.train_org);
  row('สถานที่:', train.train_place);
  row('วันที่ดำเนินการ:', `${fmtThaiFullDate(train.train_startdate)} ถึง ${fmtThaiFullDate(train.train_enddate)}`);
  row('จำนวนวัน:', `${train.train_sum_day || '-'} วัน`);
  row('ประเภทการอบรม:', train.train_type_name);
  row('ด้าน / ความเกี่ยวข้อง:', train.train_about_name);
  row('พื้นที่:', train.train_area_name);
  row('แหล่งงบประมาณ:', train.train_budget_name);
  row('เลขที่คำสั่ง:', train.train_order);

  y += 10;
  doc.font('ThaiBold').fontSize(11.5).text('รายละเอียดค่าใช้จ่าย (บาท)', 48, y);
  y += 22;
  const costs = [
    ['ค่าลงทะเบียน', Number(train.train_pay_register || 0)],
    ['ค่าที่พัก', Number(train.train_pay_apartment || 0)],
    ['ค่าเบี้ยเลี้ยง', Number(train.train_pay_allowance || 0)],
    ['ค่าพาหนะ/เดินทาง', Number(train.train_pay_travel || 0)],
    ['ค่าใช้จ่ายอื่นๆ', Number(train.train_pay_other || 0)],
  ];
  const totalCost = costs.reduce((s, c) => s + c[1], 0);
  doc.font('Thai').fontSize(11);
  costs.forEach(([k, v]) => {
    doc.text(k, 64, y, { width: 220 });
    doc.text(v.toLocaleString('th-TH', { minimumFractionDigits: 2 }), 300, y, { width: 120, align: 'right' });
    y += 20;
  });
  doc.font('ThaiBold').text('รวมเป็นเงินทั้งสิ้น', 64, y + 4, { width: 220 });
  doc.text(`${totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`, 300, y + 4, { width: 120, align: 'right' });

  doc.font('Thai').fontSize(11).text('ลงชื่อ....................................................ผู้รายงาน', 300, 620, { width: 240, align: 'center' });
  doc.text('ลงชื่อ....................................................', 300, 690, { width: 240, align: 'center' });
  doc.text('( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 300, 710, { width: 240, align: 'center' });
  drawFooterTimestamp(doc);

  return sendPdf(doc, `train-${train.train_data_id}.pdf`, res, isDownload);
}

/**
 * Generates Summary Report PDF (A4)
 */
function generateReportPdf(title, subtitle, cols, rows, res, isDownload = false) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.registerFont('Thai', FONT_REG);
  doc.registerFont('ThaiBold', FONT_BOLD);

  doc.font('ThaiBold').fontSize(15).text(title, 40, 38, { align: 'center', width: 515 });
  doc.font('Thai').fontSize(11).text(`โรงพยาบาลโคกศรีสุพรรณ | ${subtitle}`, 40, 60, { align: 'center', width: 515 });

  let y = 90;
  const drawHeader = () => {
    doc.save().rect(40, y, 515, 24).fill('#0f172a').restore();
    let cx = 40;
    doc.font('ThaiBold').fontSize(10.5).fillColor('#ffffff');
    cols.forEach((c) => {
      doc.text(c.label, cx + 4, y + 6, { width: c.w - 8, align: c.align || 'left' });
      cx += c.w;
    });
    doc.fillColor('#111827');
    y += 24;
  };
  drawHeader();

  doc.font('Thai').fontSize(10);
  rows.forEach((r, idx) => {
    let maxH = 22;
    r.forEach((cell, i) => {
      const h = doc.heightOfString(String(cell ?? '-'), { width: cols[i].w - 8 }) + 10;
      if (h > maxH) maxH = h;
    });
    if (y + maxH > 770) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
    if (idx % 2 === 1) {
      doc.save().rect(40, y, 515, maxH).fill('#f8fafc').restore();
    }
    doc.lineWidth(0.5).rect(40, y, 515, maxH).stroke('#cbd5e1');
    let cx = 40;
    r.forEach((cell, i) => {
      doc.text(String(cell ?? '-'), cx + 4, y + 5, { width: cols[i].w - 8, align: cols[i].align || 'left' });
      cx += cols[i].w;
    });
    y += maxH;
  });

  if (y + 90 > 770) {
    doc.addPage();
    y = 60;
  } else {
    y += 30;
  }
  doc.font('Thai').fontSize(11).text('ลงชื่อ....................................................', 310, y, { width: 240, align: 'center' });
  doc.text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', 310, y + 20, { width: 240, align: 'center' });
  doc.font('ThaiBold').text('นายแพทย์ชำนาญการพิเศษ', 310, y + 38, { width: 240, align: 'center' });
  doc.font('Thai').text('รักษาการในตำแหน่ง ผู้อำนวยการ รพ.โคกศรีสุพรรณ', 310, y + 54, { width: 240, align: 'center' });

  return sendPdf(doc, `hrd-report.pdf`, res, isDownload);
}

module.exports = { generateLeavePdf, generateTrainPdf, generateReportPdf };
