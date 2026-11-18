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

/**
 * Generates exact original A4 Leave Form PDF matching E:\iwxe7\Report layouts
 */
function generateLeavePdf(leave, stats, res, isDownload = false) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
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
    // ==================== แบบใบลาพักผ่อน (Matches RepLeaveVacation.rtm / ofxFij7YgewdLOOeGFcHvW.PDF) ====================
    doc.font('ThaiBold').fontSize(15).text('แบบใบลาพักผ่อน', 48, 42, { align: 'center', width: 500, underline: true });

    doc.font('ThaiBold').fontSize(11.5).text('เขียนที่', 300, 74, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 92, { align: 'right', width: 295 });

    let y = 120;
    doc.font('ThaiBold').fontSize(11.5).text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอลาพักผ่อน');
    y += 22;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการ  โรงพยาบาลโคกศรีสุพรรณ');
    y += 22;
    doc.text(`ข้าพเจ้า   ${fullName}`, 84, y, { continued: true });
    doc.font('ThaiBold').text('          ตำแหน่ง   ', { continued: true });
    doc.font('Thai').text(posName);
    y += 22;
    doc.font('ThaiBold').text('สังกัด  ', 48, y, { continued: true });
    doc.font('Thai').text(`${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`);
    y += 26;

    const acc = Number(leave.leave_accumulate || 0);
    const annualRight = 10;
    const totalRight = acc + annualRight;
    doc.text(
      `มีวันลาพักผ่อนสะสม   ${acc || '     '}   วัน       มีสิทธิ์การลาพักผ่อนประจำปี   ${annualRight}   วันทำการ       รวมเป็น   ${totalRight}   วันทำการ`,
      48,
      y
    );
    y += 26;
    doc.text(`ขอลาพักผ่อนตั้งแต่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 78, y);
    y += 26;
    doc.text(`ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่   ${contactAddr}`, 48, y);
    y += 22;
    doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 62, y);

    // Middle Section: Left = Leave Stats Table, Right = Applicant Signature
    const midY = 345;
    doc.font('ThaiBold').fontSize(12).text('สถิติการลาในปีงบประมาณนี้', 48, midY);

    const tblX = 48;
    const tblY = midY + 26;
    const colW = [62, 62, 62];
    const rowH1 = 36;
    const rowH2 = 34;

    doc.lineWidth(0.9).rect(tblX, tblY, 186, rowH1 + rowH2).stroke('#111827');
    doc.moveTo(tblX + colW[0], tblY).lineTo(tblX + colW[0], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX + colW[0] + colW[1], tblY).lineTo(tblX + colW[0] + colW[1], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX, tblY + rowH1).lineTo(tblX + 186, tblY + rowH1).stroke();

    doc.font('ThaiBold').fontSize(10.5);
    doc.text('ลามาแล้ว\n(วันทำการ)', tblX, tblY + 5, { width: colW[0], align: 'center' });
    doc.text('ลาครั้งนี้\n(วันทำการ)', tblX + colW[0], tblY + 5, { width: colW[1], align: 'center' });
    doc.text('รวมเป็น\n(วันทำการ)', tblX + colW[0] + colW[1], tblY + 5, { width: colW[2], align: 'center' });

    const prevVac = Number(stats.prevVacation || 0);
    const totalVac = prevVac + days;
    doc.font('Thai').fontSize(11);
    doc.text(prevVac ? String(prevVac) : '0', tblX, tblY + rowH1 + 10, { width: colW[0], align: 'center' });
    doc.text(daysText, tblX + colW[0], tblY + rowH1 + 10, { width: colW[1], align: 'center' });
    doc.text(Number.isInteger(totalVac) ? String(totalVac) : totalVac.toFixed(1), tblX + colW[0] + colW[1], tblY + rowH1 + 10, { width: colW[2], align: 'center' });

    // Right: Applicant signature
    doc.font('Thai').fontSize(11.5).text('ขอแสดงความนับถือ', 345, midY - 6, { width: 190, align: 'center' });
    doc.text('ลงชื่อ.........................................................', 330, midY + 34, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 330, midY + 54, { width: 220, align: 'center' });

    // Supervisor Opinion (Right)
    const supY = midY + 86;
    doc.font('ThaiBold').fontSize(11.5).text('ความเห็นของผู้บังคับบัญชา', 340, supY, { width: 205, align: 'center' });
    doc.font('Thai').text('.....................................................................................', 325, supY + 22);
    doc.text('.....................................................................................', 325, supY + 42);
    doc.text('ลงชื่อ.........................................................', 325, supY + 68);
    doc.text(`( ${headName} )`, 335, supY + 88, { width: 205, align: 'center' });
    doc.text(`( หัวหน้า ${leave.department_name || 'กลุ่มงาน'} )`, 335, supY + 106, { width: 205, align: 'center' });
    doc.text('วันที่............/............................/.............', 325, supY + 126);

    // Checker (Left)
    const chkY = supY + 68;
    doc.font('Thai').fontSize(11.5).text('ลงชื่อ...........................................ผู้ตรวจสอบ', 48, chkY);
    doc.text(`( ${checkerName} )`, 60, chkY + 20, { width: 170, align: 'center' });
    doc.text('ตำแหน่ง   พนักงานธุรการ', 48, chkY + 40);
    doc.text('วันที่............/...................../.............', 48, chkY + 60);

    // Handover / Assigned Person (Left bottom)
    const hndY = chkY + 88;
    doc.font('ThaiBold').fontSize(11).text('ในระหว่างที่ข้าพเจ้าลาครั้งนี้ขอมอบงานในหน้าที่ให้', 48, hndY);
    doc.font('Thai').text('ลงชื่อ................................................ผู้มอบ', 48, hndY + 20);
    doc.text('วันที่............/...................../.............', 48, hndY + 40);
    doc.text('ลงชื่อ................................................ผู้รับมอบ', 48, hndY + 62);
    doc.text(`( ${assignedName} )`, 60, hndY + 82, { width: 170, align: 'center' });
    doc.text('วันที่............/...................../.............', 48, hndY + 102);

    // Director Order (Right bottom)
    const ordY = supY + 152;
    doc.font('ThaiBold').fontSize(11.5).text('คำสั่ง', 325, ordY, { underline: true });
    drawCheckbox(doc, 332, ordY + 22, allowId === 2, 11);
    doc.font('Thai').text('อนุญาต', 350, ordY + 20);
    drawCheckbox(doc, 412, ordY + 22, allowId === 3, 11);
    doc.text('ไม่อนุญาต', 430, ordY + 20);

    doc.text('ลงชื่อ.........................................................', 325, ordY + 52);
    doc.text('ตำแหน่ง ( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 320, ordY + 82, { width: 230, align: 'center' });
    doc.text('วันที่............/............................/.............', 325, ordY + 104);

    // Footer timestamp
    doc.font('ThaiBold').fontSize(9.5).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 782, { align: 'right', width: 500 });

    return sendPdf(doc, `leave-vacation-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  if (typeId === 12) {
    // ==================== แบบใบขอยกเลิกวันลา ====================
    doc.font('ThaiBold').fontSize(15).text('แบบใบขอยกเลิกวันลา', 48, 42, { align: 'center', width: 500, underline: true });
    doc.font('ThaiBold').fontSize(11.5).text('เขียนที่', 300, 74, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 92, { align: 'right', width: 295 });

    let y = 124;
    doc.font('ThaiBold').text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอยกเลิกวันลา');
    y += 22;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการ  โรงพยาบาลโคกศรีสุพรรณ');
    y += 26;
    doc.text(`ข้าพเจ้า   ${fullName}          ตำแหน่ง   ${posName}`, 78, y);
    y += 22;
    doc.text(`สังกัด   ${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`, 48, y);
    y += 26;
    doc.text(`ขอแจ้งยกเลิกวันลาตั้งแต่วันที่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 78, y);
    y += 24;
    doc.text(`เนื่องจาก   ${(leave.leave_because_cancel || leave.leave_because || '-').trim()}`, 48, y, { width: 495 });

    const sigY = 330;
    doc.text('ขอแสดงความนับถือ', 345, sigY, { width: 190, align: 'center' });
    doc.text('ลงชื่อ.........................................................', 330, sigY + 40, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 330, sigY + 60, { width: 220, align: 'center' });

    const supY = sigY + 100;
    doc.font('ThaiBold').text('ความเห็นของผู้บังคับบัญชา', 340, supY, { width: 205, align: 'center' });
    doc.font('Thai').text('.....................................................................................', 325, supY + 24);
    doc.text('ลงชื่อ.........................................................', 325, supY + 62);
    doc.text(`( ${headName} )`, 335, supY + 82, { width: 205, align: 'center' });
    doc.text(`( หัวหน้า ${leave.department_name || 'กลุ่มงาน'} )`, 335, supY + 100, { width: 205, align: 'center' });
    doc.text('วันที่............/............................/.............', 325, supY + 120);

    const ordY = supY + 156;
    doc.font('ThaiBold').text('คำสั่ง', 325, ordY, { underline: true });
    drawCheckbox(doc, 332, ordY + 22, allowId === 2 || allowId === 9, 11);
    doc.font('Thai').text('อนุญาต', 350, ordY + 20);
    drawCheckbox(doc, 412, ordY + 22, allowId === 3, 11);
    doc.text('ไม่อนุญาต', 430, ordY + 20);
    doc.text('ลงชื่อ.........................................................', 325, ordY + 54);
    doc.text('ตำแหน่ง ( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 320, ordY + 80, { width: 230, align: 'center' });
    doc.text('วันที่............/............................/.............', 325, ordY + 102);

    doc.font('ThaiBold').fontSize(9.5).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 782, { align: 'right', width: 500 });
    return sendPdf(doc, `leave-cancel-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  // ==================== แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว ====================
  const typeTitle = leave.hrd_leave_type_name || 'ลาป่วย / ลากิจส่วนตัว / ลาคลอดบุตร';
  doc.font('ThaiBold').fontSize(15).text('แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว', 48, 42, { align: 'center', width: 500, underline: true });

  doc.font('ThaiBold').fontSize(11.5).text('เขียนที่', 300, 74, { continued: true });
  doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
  doc.text(saveDateStr, 250, 92, { align: 'right', width: 295 });

  let y = 118;
  doc.font('ThaiBold').fontSize(11.5).text('เรื่อง', 48, y, { continued: true });
  doc.font('Thai').text(`    ขอ${typeTitle}`);
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

  // Checkboxes for leave type
  doc.text('ขอลา', 78, y);
  drawCheckbox(doc, 118, y + 3, typeId === 1, 10);
  doc.text('ป่วย', 134, y);
  drawCheckbox(doc, 178, y + 3, typeId === 4, 10);
  doc.text('กิจส่วนตัว', 194, y);
  drawCheckbox(doc, 268, y + 3, typeId === 2, 10);
  doc.text('คลอดบุตร', 284, y);
  const isOther = ![1, 2, 4].includes(typeId);
  drawCheckbox(doc, 355, y + 3, isOther, 10);
  doc.text(isOther ? `อื่นๆ (${typeTitle})` : 'อื่นๆ', 371, y);

  y += 22;
  doc.text(`เนื่องจาก   ${(leave.leave_because || '-').trim()}`, 48, y, { width: 495 });
  y += 28;
  doc.text(`ตั้งแต่วันที่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`, 48, y);
  y += 22;
  doc.text(`ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่   ${contactAddr}`, 48, y);
  y += 20;
  doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 62, y);

  // Stats table (4 columns x 4 rows)
  const midY = 345;
  doc.font('ThaiBold').fontSize(12).text('สถิติการลาในปีงบประมาณนี้', 48, midY);
  const tblX = 48;
  const tblY = midY + 24;
  const widths = [74, 48, 48, 48];
  const rowH = 26;
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
  doc.font('ThaiBold').fontSize(10);
  headers.forEach((h, i) => {
    doc.text(h, cx, tblY + 7, { width: widths[i], align: 'center' });
    cx += widths[i];
  });

  const statRows = [
    ['ป่วย', stats.prevSick || 0, typeId === 1 ? daysText : '-', typeId === 1 ? (Number(stats.prevSick || 0) + days) : (stats.prevSick || 0)],
    ['กิจส่วนตัว', stats.prevBusiness || 0, typeId === 4 ? daysText : '-', typeId === 4 ? (Number(stats.prevBusiness || 0) + days) : (stats.prevBusiness || 0)],
    ['คลอดบุตร', stats.prevMaternity || 0, typeId === 2 ? daysText : '-', typeId === 2 ? (Number(stats.prevMaternity || 0) + days) : (stats.prevMaternity || 0)],
  ];
  doc.font('Thai').fontSize(10.5);
  statRows.forEach((sr, rIdx) => {
    cx = tblX;
    sr.forEach((val, cIdx) => {
      doc.text(String(val), cx, tblY + rowH * (rIdx + 1) + 6, { width: widths[cIdx], align: cIdx === 0 ? 'left' : 'center' });
      cx += widths[cIdx];
    });
  });

  // Right: Applicant signature
  doc.font('Thai').fontSize(11.5).text('ขอแสดงความนับถือ', 345, midY - 6, { width: 190, align: 'center' });
  doc.text('ลงชื่อ.........................................................', 330, midY + 34, { width: 220, align: 'center' });
  doc.text(`( ${fullName} )`, 330, midY + 54, { width: 220, align: 'center' });

  // Checker (Left)
  const chkY = tblY + rowH * 4 + 28;
  doc.text('ลงชื่อ...........................................ผู้ตรวจสอบ', 48, chkY);
  doc.text(`( ${checkerName} )`, 60, chkY + 20, { width: 170, align: 'center' });
  doc.text('ตำแหน่ง   พนักงานธุรการ', 48, chkY + 40);
  doc.text('วันที่............/...................../.............', 48, chkY + 60);

  // Supervisor Opinion (Right)
  const supY = midY + 86;
  doc.font('ThaiBold').text('ความเห็นของผู้บังคับบัญชา', 340, supY, { width: 205, align: 'center' });
  doc.font('Thai').text('.....................................................................................', 325, supY + 22);
  doc.text('.....................................................................................', 325, supY + 42);
  doc.text('ลงชื่อ.........................................................', 325, supY + 68);
  doc.text(`( ${headName} )`, 335, supY + 88, { width: 205, align: 'center' });
  doc.text(`( หัวหน้า ${leave.department_name || 'กลุ่มงาน'} )`, 335, supY + 106, { width: 205, align: 'center' });
  doc.text('วันที่............/............................/.............', 325, supY + 126);

  // Director Order (Right bottom)
  const ordY = supY + 156;
  doc.font('ThaiBold').text('คำสั่ง', 325, ordY, { underline: true });
  drawCheckbox(doc, 332, ordY + 22, allowId === 2, 11);
  doc.font('Thai').text('อนุญาต', 350, ordY + 20);
  drawCheckbox(doc, 412, ordY + 22, allowId === 3, 11);
  doc.text('ไม่อนุญาต', 430, ordY + 20);
  doc.text('ลงชื่อ.........................................................', 325, ordY + 54);
  doc.text('ตำแหน่ง ( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 320, ordY + 82, { width: 230, align: 'center' });
  doc.text('วันที่............/............................/.............', 325, ordY + 104);

  doc.font('ThaiBold').fontSize(9.5).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 782, { align: 'right', width: 500 });
  return sendPdf(doc, `leave-${leave.hrd_leave_id}.pdf`, res, isDownload);
}

/**
 * Generates Training / Conference Report PDF (A4)
 */
function generateTrainPdf(train, res, isDownload = false) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.registerFont('Thai', FONT_REG);
  doc.registerFont('ThaiBold', FONT_BOLD);

  doc.font('ThaiBold').fontSize(16).text('แบบรายงานการฝึกอบรม / ประชุมวิชาการ / ไปราชการ', 48, 42, { align: 'center', width: 500, underline: true });
  doc.font('Thai').fontSize(12).text('โรงพยาบาลโคกศรีสุพรรณ จังหวัดสกลนคร', 48, 66, { align: 'center', width: 500 });

  let y = 104;
  const row = (label, val) => {
    doc.font('ThaiBold').fontSize(11.5).text(label, 48, y, { width: 150 });
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
  doc.font('ThaiBold').fontSize(12).text('รายละเอียดค่าใช้จ่าย (บาท)', 48, y);
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

  doc.font('Thai').fontSize(11.5).text('ลงชื่อ.........................................................ผู้รายงาน', 300, 620, { width: 240, align: 'center' });
  doc.text('ลงชื่อ.........................................................', 300, 690, { width: 240, align: 'center' });
  doc.text('( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 300, 710, { width: 240, align: 'center' });
  doc.font('ThaiBold').fontSize(9.5).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 782, { align: 'right', width: 500 });

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
  doc.font('Thai').fontSize(11).text('ลงชื่อ.........................................................', 310, y, { width: 240, align: 'center' });
  doc.text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', 310, y + 20, { width: 240, align: 'center' });
  doc.font('ThaiBold').text('นายแพทย์ชำนาญการพิเศษ', 310, y + 38, { width: 240, align: 'center' });
  doc.font('Thai').text('รักษาการในตำแหน่ง ผู้อำนวยการ รพ.โคกศรีสุพรรณ', 310, y + 54, { width: 240, align: 'center' });

  return sendPdf(doc, `hrd-report.pdf`, res, isDownload);
}

module.exports = { generateLeavePdf, generateTrainPdf, generateReportPdf };
