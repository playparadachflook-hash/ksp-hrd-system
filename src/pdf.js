const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, '..', 'fonts', 'THSarabun.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'THSarabun-Bold.ttf');

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

function drawCheckbox(doc, x, y, checked, size = 12) {
  doc.save();
  doc.lineWidth(0.9).rect(x, y, size, size).stroke('#111827');
  if (checked) {
    doc.lineWidth(1.4)
      .moveTo(x + 2.2, y + size * 0.52)
      .lineTo(x + size * 0.44, y + size - 2.5)
      .lineTo(x + size - 2, y + 2.5)
      .stroke('#1d4ed8');
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
  doc.font('ThaiBold').fontSize(12).text(`Print Datetime  ${fmtPrintDatetime()}`, 48, 792, {
    align: 'right',
    width: 500,
    lineBreak: false,
  });
}

function drawSupervisorAndOrder(doc, supY, ordY, headName, deptName, allowId, supLabel = 'ความเห็นของผู้บังคับบัญชา') {
  doc.font('ThaiBold').fontSize(15).text(supLabel, 325, supY, { width: 220, align: 'center', lineBreak: false });
  doc.font('Thai').fontSize(15);
  doc.text('......................................................................', 325, supY + 22, { width: 225, lineBreak: false });
  doc.text('......................................................................', 325, supY + 42, { width: 225, lineBreak: false });
  doc.text('ลงชื่อ....................................................', 325, supY + 66, { width: 225, lineBreak: false });
  doc.text(`( ${headName} )`, 325, supY + 88, { width: 220, align: 'center', lineBreak: false });
  doc.text(`( หัวหน้า ${deptName || 'กลุ่มงาน'} )`, 325, supY + 108, { width: 220, align: 'center', lineBreak: false });
  doc.text('วันที่........../........................../............', 325, supY + 130, { width: 225, lineBreak: false });

  doc.font('ThaiBold').fontSize(15).text('คำสั่ง', 325, ordY, { underline: true });
  drawCheckbox(doc, 332, ordY + 24, allowId === 2, 12);
  doc.font('Thai').fontSize(15).text('อนุญาต', 350, ordY + 20, { lineBreak: false });
  drawCheckbox(doc, 416, ordY + 24, allowId === 3, 12);
  doc.text('ไม่อนุญาต', 434, ordY + 20, { lineBreak: false });

  doc.text('ลงชื่อ....................................................', 325, ordY + 52, { width: 225, lineBreak: false });
  doc.text('( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 310, ordY + 82, { width: 245, align: 'center', lineBreak: false });
  doc.text('วันที่........../........................../............', 325, ordY + 106, { width: 225, lineBreak: false });
}

/**
 * Generates exact original A4 Leave Form PDF using TH Sarabun PSK (1 single A4 page)
 */
function generateLeavePdf(leave, stats, res, isDownload = false) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 34, bottom: 20, left: 48, right: 48 },
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
    doc.font('ThaiBold').fontSize(18).text('แบบใบลาพักผ่อน', 48, 34, { align: 'center', width: 500, underline: true });

    doc.font('ThaiBold').fontSize(15).text('เขียนที่', 310, 66, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

    let y = 114;
    doc.font('ThaiBold').fontSize(15).text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอลาพักผ่อน');
    y += 22;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ');
    y += 24;
    doc.text(`ข้าพเจ้า   ${fullName}`, 96, y, { continued: true });
    doc.font('ThaiBold').text('          ตำแหน่ง   ', { continued: true });
    doc.font('Thai').text(posName);
    y += 22;
    doc.font('ThaiBold').text('สังกัด  ', 48, y, { continued: true });
    doc.font('Thai').text(`${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`);
    y += 26;

    const acc = Number(leave.leave_accumulate || 0);
    const annualRight = 10;
    const totalRight = acc + annualRight;
    const rightTxt = `มีวันลาพักผ่อนสะสม   ${acc || '     '}   วัน     มีสิทธิ์การลาพักผ่อนประจำปี   ${annualRight}   วันทำการ     รวมเป็น   ${totalRight}   วันทำการ`;
    doc.text(rightTxt, 48, y, { width: 505 });
    y += Math.max(24, doc.heightOfString(rightTxt, { width: 505 }) + 6);

    const vacRangeTxt = `ขอลาพักผ่อนตั้งแต่  ${startStr}  ถึง  ${endStr}  มีกำหนด  ${daysText}  วัน`;
    doc.text(vacRangeTxt, 48, y, { width: 505 });
    y += Math.max(24, doc.heightOfString(vacRangeTxt, { width: 505 }) + 6);

    const vacAddrTxt = `ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่   ${contactAddr}`;
    doc.text(vacAddrTxt, 48, y, { width: 505 });
    y += Math.max(22, doc.heightOfString(vacAddrTxt, { width: 505 }) + 6);

    doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 48, y);

    // Middle Section: Left = Leave Stats Table, Right = Applicant Signature
    const midY = Math.max(344, y + 28);
    doc.font('ThaiBold').fontSize(15.5).text('สถิติการลาในปีงบประมาณนี้', 48, midY);

    const tblX = 48;
    const tblY = midY + 28;
    const colW = [62, 62, 62];
    const rowH1 = 40;
    const rowH2 = 34;

    doc.lineWidth(0.9).rect(tblX, tblY, 186, rowH1 + rowH2).stroke('#111827');
    doc.moveTo(tblX + colW[0], tblY).lineTo(tblX + colW[0], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX + colW[0] + colW[1], tblY).lineTo(tblX + colW[0] + colW[1], tblY + rowH1 + rowH2).stroke();
    doc.moveTo(tblX, tblY + rowH1).lineTo(tblX + 186, tblY + rowH1).stroke();

    doc.font('ThaiBold').fontSize(13.5);
    doc.text('ลามาแล้ว\n(วันทำการ)', tblX, tblY + 4, { width: colW[0], align: 'center' });
    doc.text('ลาครั้งนี้\n(วันทำการ)', tblX + colW[0], tblY + 4, { width: colW[1], align: 'center' });
    doc.text('รวมเป็น\n(วันทำการ)', tblX + colW[0] + colW[1], tblY + 4, { width: colW[2], align: 'center' });

    const prevVac = Number(stats.prevVacation || 0);
    const totalVac = prevVac + days;
    doc.font('Thai').fontSize(14.5);
    doc.text(prevVac ? String(prevVac) : '0', tblX, tblY + rowH1 + 8, { width: colW[0], align: 'center' });
    doc.text(daysText, tblX + colW[0], tblY + rowH1 + 8, { width: colW[1], align: 'center' });
    doc.text(Number.isInteger(totalVac) ? String(totalVac) : totalVac.toFixed(1), tblX + colW[0] + colW[1], tblY + rowH1 + 8, { width: colW[2], align: 'center' });

    doc.font('Thai').fontSize(15).text('ขอแสดงความนับถือ', 325, midY - 12, { width: 220, align: 'center' });
    doc.text('ลงชื่อ....................................................', 325, midY + 26, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 325, midY + 48, { width: 220, align: 'center' });

    drawSupervisorAndOrder(doc, midY + 78, midY + 236, headName, leave.department_name, allowId, 'ความเห็นของผู้บังคับบัญชา( ขั้นต้น )');

    const chkY = midY + 144;
    doc.font('Thai').fontSize(15).text('ลงชื่อ......................................ผู้ตรวจสอบ', 48, chkY);
    doc.text(`( ${checkerName} )`, 56, chkY + 20, { width: 170, align: 'center' });
    doc.text('ตำแหน่ง   พนักงานธุรการ', 48, chkY + 40);
    doc.text('วันที่........../..................../............', 48, chkY + 60);

    const hndY = chkY + 86;
    doc.font('ThaiBold').fontSize(14.5).text('ในระหว่างที่ข้าพเจ้าลาครั้งนี้ขอมอบงานในหน้าที่ให้', 48, hndY);
    doc.font('Thai').fontSize(14.5).text('ลงชื่อ...........................................ผู้มอบ', 48, hndY + 20);
    doc.text('วันที่........../..................../............', 48, hndY + 40);
    doc.text('ลงชื่อ...........................................ผู้รับมอบ', 48, hndY + 62);
    doc.text(`( ${assignedName} )`, 56, hndY + 82, { width: 170, align: 'center' });
    doc.text('วันที่........../..................../............', 48, hndY + 102);

    drawFooterTimestamp(doc);
    return sendPdf(doc, `leave-vacation-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  if (typeId === 12) {
    // ==================== แบบใบขอยกเลิกวันลา ====================
    doc.font('ThaiBold').fontSize(18).text('แบบใบขอยกเลิกวันลา', 48, 34, { align: 'center', width: 500, underline: true });
    doc.font('ThaiBold').fontSize(15).text('เขียนที่', 310, 66, { continued: true });
    doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
    doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

    let y = 118;
    doc.font('ThaiBold').text('เรื่อง', 48, y, { continued: true });
    doc.font('Thai').text('    ขอยกเลิกวันลา');
    y += 22;
    doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
    doc.font('Thai').text('    ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ');
    y += 24;
    doc.text(`ข้าพเจ้า   ${fullName}          ตำแหน่ง   ${posName}`, 84, y);
    y += 22;
    doc.text(`สังกัด   ${deptFull}  โรงพยาบาลโคกศรีสุพรรณ`, 48, y);
    y += 24;
    const cancelRangeTxt = `ขอแจ้งยกเลิกวันลาตั้งแต่  ${startStr}  ถึง  ${endStr}   มีกำหนด   ${daysText}   วัน`;
    doc.text(cancelRangeTxt, 48, y, { width: 505 });
    y += Math.max(24, doc.heightOfString(cancelRangeTxt, { width: 505 }) + 6);
    const cancelReasonTxt = `เนื่องจาก   ${(leave.leave_because_cancel || leave.leave_because || '-').trim()}`;
    doc.text(cancelReasonTxt, 48, y, { width: 505 });
    y += Math.max(24, doc.heightOfString(cancelReasonTxt, { width: 505 }) + 6);

    const sigY = Math.max(330, y + 28);
    doc.text('ขอแสดงความนับถือ', 325, sigY, { width: 220, align: 'center' });
    doc.text('ลงชื่อ....................................................', 325, sigY + 36, { width: 220, align: 'center' });
    doc.text(`( ${fullName} )`, 325, sigY + 56, { width: 220, align: 'center' });

    drawSupervisorAndOrder(doc, sigY + 86, sigY + 244, headName, leave.department_name, allowId === 9 ? 2 : allowId, 'ความเห็นของผู้บังคับบัญชา( ขั้นต้น )');
    drawFooterTimestamp(doc);
    return sendPdf(doc, `leave-cancel-${leave.hrd_leave_id}.pdf`, res, isDownload);
  }

  // ==================== แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว (Matches media_1794981900722_dadc4e32.jpg) ====================
  const typeTitle = leave.hrd_leave_type_name || 'ลาป่วย / ลากิจส่วนตัว / ลาคลอดบุตร';
  doc.font('ThaiBold').fontSize(18).text('แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว', 48, 34, { align: 'center', width: 500, underline: true });

  doc.font('ThaiBold').fontSize(15).text('เขียนที่', 310, 66, { continued: true });
  doc.font('Thai').text('  โรงพยาบาลโคกศรีสุพรรณ  จังหวัดสกลนคร');
  doc.text(saveDateStr, 250, 86, { align: 'right', width: 295 });

  let y = 112;
  doc.font('ThaiBold').fontSize(15).text('เรื่อง', 48, y, { continued: true });
  doc.font('Thai').text(`    ขอ${typeTitle}`);
  y += 20;
  doc.font('ThaiBold').text('เรียน', 48, y, { continued: true });
  doc.font('Thai').text('    ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ');
  y += 24;
  doc.text(`ข้าพเจ้า   ${fullName}`, 120, y, { continued: true });
  doc.font('ThaiBold').text('              ตำแหน่ง   ', { continued: true });
  doc.font('Thai').text(posName);
  y += 22;
  doc.font('ThaiBold').text('สังกัด  ', 48, y, { continued: true });
  doc.font('Thai').text(deptFull);

  // Stacked vertical checkboxes matching the exact reference screenshot
  y += 22;
  drawCheckbox(doc, 88, y + 3, typeId === 1, 13);
  doc.font('Thai').fontSize(15).text('ป่วย', 112, y);

  y += 22;
  doc.font('ThaiBold').text('ขอลา', 48, y);
  drawCheckbox(doc, 88, y + 3, typeId === 4, 13);
  doc.font('Thai').text(`กิจส่วนตัว   เนื่องจาก  ${(leave.leave_because || '-').trim()}`, 112, y, { width: 435 });

  y += 22;
  drawCheckbox(doc, 88, y + 3, typeId === 2, 13);
  doc.text(![1, 2, 4].includes(typeId) ? `คลอดบุตร   (อื่นๆ: ${typeTitle})` : 'คลอดบุตร', 112, y);

  y += 26;
  doc.text(`ตั้งแต่  ${startStr}  ถึง  ${endStr}       มีกำหนด  ${daysText}  วัน`, 48, y, { width: 505 });

  // Previous leave line ("ข้าพเจ้าได้ลา...")
  y += 24;
  const lastL = stats.lastLeave || null;
  const lastTypeId = lastL ? Number(lastL.hrd_leave_type_id) : 0;
  doc.text('ข้าพเจ้าได้ลา', 48, y);
  drawCheckbox(doc, 118, y + 3, lastTypeId === 1, 12);
  doc.text('ป่วย', 136, y);
  drawCheckbox(doc, 168, y + 3, lastTypeId === 4, 12);
  doc.text('กิจส่วนตัว', 186, y);
  drawCheckbox(doc, 248, y + 3, lastTypeId === 2, 12);
  doc.text('คลอดบุตร', 266, y);
  drawCheckbox(doc, 324, y + 3, lastTypeId === 3, 12);
  doc.text('ลาเพื่อดูแลบุตรและภรรยาหลังคลอดบุตร', 342, y, { width: 215 });

  y += 20;
  const lastStart = lastL ? fmtThaiFullDate(lastL.leave_startdate) : '........................................';
  const lastEnd = lastL ? fmtThaiFullDate(lastL.leave_enddate) : '........................................';
  const lastDays = lastL ? String(lastL.days) : '.....';
  const lastRangeTxt = `ครั้งสุดท้าย ตั้งแต่   ${lastStart}   ถึง   ${lastEnd}   มีกำหนด  ${lastDays}  วัน`;
  doc.text(lastRangeTxt, 48, y, { width: 505 });
  y += Math.max(22, doc.heightOfString(lastRangeTxt, { width: 505 }) + 6);

  const sickAddrTxt = `ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่  ${contactAddr}`;
  doc.text(sickAddrTxt, 48, y, { width: 505 });
  y += Math.max(22, doc.heightOfString(sickAddrTxt, { width: 505 }) + 6);

  doc.text(`หมายเลขโทรศัพท์  ${contactTel}`, 48, y);

  // Middle Section: Left = Stats table (4x4), Right = Applicant Signature + Supervisor
  const midY = Math.max(398, y + 28);
  doc.font('ThaiBold').fontSize(15).text('สถิติการลาในปีงบประมาณนี้', 48, midY);
  const tblX = 48;
  const tblY = midY + 26;
  const widths = [52, 56, 56, 56];
  const rowH = 38;
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

  const headers = ['ประเภท', 'ลามาแล้ว', 'ลาครั้งนี้', 'รวมเป็น'];
  cx = tblX;
  doc.font('ThaiBold').fontSize(14);
  headers.forEach((h, i) => {
    doc.text(h, cx, tblY + 10, { width: widths[i], align: 'center' });
    cx += widths[i];
  });

  const statRows = [
    ['ลาป่วย', `${stats.prevSick || 0}\n(วันทำการ)`, `${typeId === 1 ? daysText : '0'}\n(วันทำการ)`, `${typeId === 1 ? (Number(stats.prevSick || 0) + days) : (stats.prevSick || 0)}\n(วันทำการ)`],
    ['กิจส่วนตัว', `${stats.prevBusiness || 0}\n(วันทำการ)`, `${typeId === 4 ? daysText : '0'}\n(วันทำการ)`, `${typeId === 4 ? (Number(stats.prevBusiness || 0) + days) : (stats.prevBusiness || 0)}\n(วันทำการ)`],
    ['คลอดบุตร', `${stats.prevMaternity || 0}`, `${typeId === 2 ? daysText : '0'}`, `${typeId === 2 ? (Number(stats.prevMaternity || 0) + days) : (stats.prevMaternity || 0)}`],
  ];
  doc.font('Thai').fontSize(13.5);
  statRows.forEach((sr, rIdx) => {
    cx = tblX;
    sr.forEach((val, cIdx) => {
      doc.text(String(val), cx + (cIdx === 0 ? 5 : 0), tblY + rowH * (rIdx + 1) + (cIdx === 0 ? 10 : 4), {
        width: widths[cIdx] - (cIdx === 0 ? 5 : 0),
        align: cIdx === 0 ? 'left' : 'center',
      });
      cx += widths[cIdx];
    });
  });

  // Right: Applicant signature
  doc.font('Thai').fontSize(15).text('ขอแสดงความนับถือ', 325, midY - 12, { width: 220, align: 'center' });
  doc.text('ลงชื่อ....................................................', 325, midY + 14, { width: 220, align: 'center' });
  doc.text(`( ${fullName} )`, 325, midY + 34, { width: 220, align: 'center' });

  // Checker (Left bottom)
  const chkY = tblY + rowH * 4 + 28;
  doc.font('Thai').fontSize(15).text('ลงชื่อ.............................................ผู้ตรวจสอบ', 48, chkY);
  doc.text(`( ${checkerName} )`, 56, chkY + 20, { width: 170, align: 'center' });
  doc.text('วันที่........./........................../............', 48, chkY + 52);

  // Supervisor (ขัันต้น) + Director Order (Right)
  drawSupervisorAndOrder(doc, midY + 62, midY + 220, headName, leave.department_name, allowId, 'ความเห็นของผู้บังคับบัญชา( ขั้นต้น )');

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

  doc.font('ThaiBold').fontSize(18).text('แบบรายงานการฝึกอบรม / ประชุมวิชาการ / ไปราชการ', 48, 40, { align: 'center', width: 500, underline: true });
  doc.font('Thai').fontSize(15).text('โรงพยาบาลโคกศรีสุพรรณ จังหวัดสกลนคร', 48, 66, { align: 'center', width: 500 });

  let y = 104;
  const row = (label, val) => {
    doc.font('ThaiBold').fontSize(15).text(label, 48, y, { width: 150 });
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
  row('เลขที่หนังสือ:', train.train_order);
  row('การเดินทาง:', train.train_travel);

  y += 10;
  doc.font('ThaiBold').fontSize(15.5).text('รายละเอียดค่าใช้จ่าย (บาท)', 48, y);
  y += 24;
  const costs = [
    ['ค่าลงทะเบียน', Number(train.train_pay_register || 0)],
    ['ค่าที่พัก', Number(train.train_pay_apartment || 0)],
    ['ค่าเบี้ยเลี้ยง', Number(train.train_pay_allowance || 0)],
    ['ค่าพาหนะ/เดินทาง', Number(train.train_pay_travel || 0)],
    ['ค่าใช้จ่ายอื่นๆ', Number(train.train_pay_other || 0)],
  ];
  const totalCost = costs.reduce((s, c) => s + c[1], 0);
  doc.font('Thai').fontSize(15);
  costs.forEach(([k, v]) => {
    doc.text(k, 64, y, { width: 220 });
    doc.text(v.toLocaleString('th-TH', { minimumFractionDigits: 2 }), 300, y, { width: 120, align: 'right' });
    y += 22;
  });
  doc.font('ThaiBold').text('รวมเป็นเงินทั้งสิ้น', 64, y + 4, { width: 220 });
  doc.text(`${totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`, 300, y + 4, { width: 120, align: 'right' });

  doc.font('Thai').fontSize(15).text('ลงชื่อ....................................................ผู้รายงาน', 300, 620, { width: 240, align: 'center' });
  doc.text('ลงชื่อ....................................................', 300, 690, { width: 240, align: 'center' });
  doc.text('( ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ )', 300, 712, { width: 240, align: 'center' });
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

  doc.font('ThaiBold').fontSize(18).text(title, 40, 34, { align: 'center', width: 515 });
  doc.font('Thai').fontSize(14).text(`โรงพยาบาลโคกศรีสุพรรณ | ${subtitle}`, 40, 58, { align: 'center', width: 515 });

  let y = 88;
  const drawHeader = () => {
    doc.save().rect(40, y, 515, 24).fill('#0f172a').restore();
    let cx = 40;
    doc.font('ThaiBold').fontSize(13.5).fillColor('#ffffff');
    cols.forEach((c) => {
      doc.text(c.label, cx + 4, y + 4, { width: c.w - 8, align: c.align || 'left' });
      cx += c.w;
    });
    doc.fillColor('#111827');
    y += 24;
  };
  drawHeader();

  doc.font('Thai').fontSize(13.5);
  rows.forEach((r, idx) => {
    let maxH = 22;
    r.forEach((cell, i) => {
      const h = doc.heightOfString(String(cell ?? '-'), { width: cols[i].w - 8 }) + 8;
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
      doc.text(String(cell ?? '-'), cx + 4, y + 4, { width: cols[i].w - 8, align: cols[i].align || 'left' });
      cx += cols[i].w;
    });
    y += maxH;
  });

  if (y + 90 > 770) {
    doc.addPage();
    y = 60;
  } else {
    y += 28;
  }
  doc.font('Thai').fontSize(14.5).text('ลงชื่อ....................................................', 310, y, { width: 240, align: 'center' });
  doc.text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', 310, y + 20, { width: 240, align: 'center' });
  doc.font('ThaiBold').text('นายแพทย์ชำนาญการพิเศษ', 310, y + 38, { width: 240, align: 'center' });
  doc.font('Thai').text('รักษาการในตำแหน่ง ผู้อำนวยการ รพ.โคกศรีสุพรรณ', 310, y + 56, { width: 240, align: 'center' });

  return sendPdf(doc, `hrd-report.pdf`, res, isDownload);
}

module.exports = { generateLeavePdf, generateTrainPdf, generateReportPdf };
