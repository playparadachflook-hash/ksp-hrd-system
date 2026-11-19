const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, '..', 'fonts', 'THSarabun.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'THSarabun-Bold.ttf');
const GARUDA_PATH = path.join(__dirname, '..', 'public', 'garuda.png');

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtThaiDatePlain(iso) {
  if (!iso || String(iso).startsWith('0000')) return '';
  const s = String(iso).slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return s;
  return `${Number(p[2])} ${THAI_MONTHS_FULL[Number(p[1]) - 1] || p[1]} ${Number(p[0]) + 543}`;
}

function drawDottedLine(doc, x1, x2, y) {
  if (x2 <= x1) return;
  doc.save();
  doc.lineWidth(0.55).dash(1.1, { space: 1.8 }).moveTo(x1, y).lineTo(x2, y).stroke('#333333');
  doc.undash().restore();
}

function isThaiCombining(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
}

function splitThaiLines(doc, text, firstW, nextW) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  if (doc.widthOfString(clean) <= firstW) return [clean];

  const fitSlice = (str, maxW) => {
    if (doc.widthOfString(str) <= maxW) return [str, ''];
    let best = 1;
    let lastSpace = -1;
    for (let i = 1; i <= str.length; i++) {
      if (i < str.length && isThaiCombining(str[i])) continue;
      const sub = str.slice(0, i);
      if (doc.widthOfString(sub) <= maxW) {
        best = i;
        if (str[i - 1] === ' ') lastSpace = i;
      } else {
        break;
      }
    }
    const cut = lastSpace > Math.floor(best * 0.65) ? lastSpace : best;
    return [str.slice(0, cut).trim(), str.slice(cut).trim()];
  };

  const [line1, rest1] = fitSlice(clean, firstW);
  if (!rest1) return [line1];
  const [line2, rest2] = fitSlice(rest1, nextW);
  if (!rest2) return [line1, line2];
  return [line1, `${line2} ${rest2}`.trim()];
}

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
 * Generates Official Memo PDF (บันทึกข้อความ ขออนุมัติไปราชการ, A4 TH Sarabun PSK)
 */
function generateTrainPdf(train, res, isDownload = false) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 28, bottom: 18, left: 48, right: 48 } });
  doc.registerFont('Thai', FONT_REG);
  doc.registerFont('ThaiBold', FONT_BOLD);

  const L = 62;
  const R = 538;
  const INDENT = L + 52;

  // Helper to draw label + dotted line + value aligned cleanly on baseline
  const drawField = (label, value, x, endX, y, opts = {}) => {
    const { boldLabel = false, align = 'left', fontSize = 16, padLeft = 6 } = opts;
    doc.font(boldLabel ? 'ThaiBold' : 'Thai').fontSize(fontSize).text(label, x, y, { lineBreak: false });
    const lblW = doc.widthOfString(label);
    const lineX1 = x + lblW + 4;
    drawDottedLine(doc, lineX1, endX, y + 15.5);
    const valStr = String(value ?? '').trim();
    if (valStr && endX > lineX1 + 8) {
      doc.font('Thai').fontSize(fontSize).text(valStr, lineX1 + (align === 'center' ? 2 : padLeft), y - 0.5, {
        width: endX - lineX1 - (align === 'center' ? 4 : padLeft + 2),
        align,
        lineBreak: false,
      });
    }
  };

  // Header: Garuda + Title "บันทึกข้อความ"
  if (fs.existsSync(GARUDA_PATH)) {
    doc.image(GARUDA_PATH, L, 30, { width: 45 });
  }
  doc.font('ThaiBold').fontSize(24).text('บันทึกข้อความ', 48, 48, { align: 'center', width: 500, lineBreak: false });

  // ส่วนราชการ / ที่ / วันที่ / เรื่อง / เรียน
  let y = 88;
  drawField('ส่วนราชการ', 'โรงพยาบาลโคกศรีสุพรรณ  อำเภอโคกศรีสุพรรณ  จังหวัดสกลนคร', L, R, y, { boldLabel: true });

  y = 110;
  const rawOrder = String(train.train_order || '').trim();
  const docOrder = rawOrder
    ? (rawOrder.includes('สน') ? rawOrder : `สน ๐๐๓๓.๓๐๑/${rawOrder}`)
    : 'สน ๐๐๓๓.๓๐๑/';
  drawField('ที่', docOrder, L, 286, y, { boldLabel: true });

  const memoDateStr = fmtThaiDatePlain(train.memo_date || train.train_order_startdate || train.train_startdate);
  drawField('วันที่', memoDateStr, 292, R, y, { boldLabel: true, align: 'center' });

  y = 132;
  drawField('เรื่อง', 'ขออนุมัติไปราชการ', L, R, y, { boldLabel: true });

  y = 156;
  doc.font('ThaiBold').fontSize(16).text('เรียน', L, y, { lineBreak: false });
  doc.font('Thai').fontSize(16).text('ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ', L + doc.widthOfString('เรียน') + 10, y, { lineBreak: false });

  // Body Paragraph
  y = 182;
  const reqDept = String(train.request_dept || train.requester_dept || '').trim();
  doc.font('Thai').fontSize(16);
  const openPrefix = 'ด้วย';
  const openSuffix = 'โรงพยาบาลโคกศรีสุพรรณ มีความประสงค์';
  const suffixW = doc.widthOfString(openSuffix);
  const suffixX = R - suffixW;
  doc.text(openPrefix, INDENT, y, { lineBreak: false });
  const deptLineX1 = INDENT + doc.widthOfString(openPrefix) + 6;
  const deptLineX2 = suffixX - 6;
  drawDottedLine(doc, deptLineX1, deptLineX2, y + 15.5);
  if (reqDept) {
    doc.text(reqDept, deptLineX1 + 2, y - 0.5, { width: deptLineX2 - deptLineX1 - 4, align: 'center', lineBreak: false });
  }
  doc.text(openSuffix, suffixX, y, { lineBreak: false });

  // จะขออนุมัติไปราชการเกี่ยวกับ ... (wraps cleanly to line 2 starting at L if long)
  y += 22;
  const topicLabel = 'จะขออนุมัติไปราชการเกี่ยวกับ';
  doc.text(topicLabel, L, y, { lineBreak: false });
  const topicX1 = L + doc.widthOfString(topicLabel) + 6;
  const topicLines = splitThaiLines(doc, train.train_topic || '', R - topicX1 - 8, R - L - 8);
  drawDottedLine(doc, topicX1, R, y + 15.5);
  if (topicLines[0]) {
    doc.text(topicLines[0], topicX1 + 4, y - 0.5, { width: R - topicX1 - 6, lineBreak: false });
  }
  if (topicLines.length > 1 && topicLines[1]) {
    y += 22;
    drawDottedLine(doc, L, R, y + 15.5);
    doc.text(topicLines[1], L + 4, y - 0.5, { width: R - L - 6, lineBreak: false });
  }

  // ที่ ... (wraps cleanly to line 2 starting at L if long)
  y += 22;
  const placeLabel = 'ที่';
  doc.text(placeLabel, L, y, { lineBreak: false });
  const placeX1 = L + doc.widthOfString(placeLabel) + 6;
  const rawPlace = String(train.train_place || '').trim();
  const rawOrg = String(train.train_org || '').trim();
  const placeCombined = rawPlace
    ? (rawOrg && !rawPlace.includes(rawOrg) ? `${rawPlace} (${rawOrg})` : rawPlace)
    : rawOrg;
  const placeLines = splitThaiLines(doc, placeCombined, R - placeX1 - 8, R - L - 8);
  drawDottedLine(doc, placeX1, R, y + 15.5);
  if (placeLines[0]) {
    doc.text(placeLines[0], placeX1 + 4, y - 0.5, { width: R - placeX1 - 6, lineBreak: false });
  }
  if (placeLines.length > 1 && placeLines[1]) {
    y += 22;
    drawDottedLine(doc, L, R, y + 15.5);
    doc.text(placeLines[1], L + 4, y - 0.5, { width: R - L - 6, lineBreak: false });
  }

  // ระหว่างวันที่ ... ถึงวันที่ ...
  y += 22;
  const startPlain = fmtThaiDatePlain(train.train_startdate);
  const endPlain = fmtThaiDatePlain(train.train_enddate);
  drawField('ระหว่างวันที่', startPlain, L, 302, y, { align: 'center' });
  drawField('ถึงวันที่', endPlain, 308, R, y, { align: 'center' });

  // โดยพาหนะ ... และมีผู้ร่วมเดินทางไปราชการครั้งนี้ คือ
  y += 22;
  const distKm = Number(train.train_distance_km || 0);
  const travelText = [
    String(train.train_travel || '').trim(),
    distKm > 0 ? `(${distKm.toLocaleString()} กม.)` : '',
  ].filter(Boolean).join(' ');
  const trPrefix = 'โดยพาหนะ';
  const trSuffix = 'และมีผู้ร่วมเดินทางไปราชการครั้งนี้ คือ';
  const trSuffixW = doc.widthOfString(trSuffix);
  const trSuffixX = R - trSuffixW;
  doc.text(trPrefix, L, y, { lineBreak: false });
  const trLineX1 = L + doc.widthOfString(trPrefix) + 6;
  const trLineX2 = trSuffixX - 6;
  drawDottedLine(doc, trLineX1, trLineX2, y + 15.5);
  if (travelText) {
    doc.text(travelText, trLineX1 + 2, y - 0.5, { width: trLineX2 - trLineX1 - 4, align: 'center', lineBreak: false });
  }
  doc.text(trSuffix, trSuffixX, y, { lineBreak: false });

  // Companions 1 - 6
  let companions = [];
  if (train.companions_json) {
    try {
      const parsed = JSON.parse(train.companions_json);
      if (Array.isArray(parsed)) companions = parsed;
    } catch {}
  }
  if (!companions.length && train.requester_name) {
    companions = [{ name: train.requester_name, position: train.requester_position || '' }];
  }

  y += 23;
  const posLblW = doc.widthOfString('ตำแหน่ง');
  for (let i = 0; i < 6; i++) {
    const comp = companions[i] || {};
    doc.text(`${i + 1}.`, INDENT, y, { lineBreak: false });
    const nameX1 = INDENT + 18;
    const nameX2 = 320;
    drawDottedLine(doc, nameX1, nameX2, y + 15.5);
    if (comp.name) {
      doc.text(String(comp.name).trim(), nameX1 + 6, y - 0.5, { width: nameX2 - nameX1 - 8, lineBreak: false });
    }
    doc.text('ตำแหน่ง', 326, y, { lineBreak: false });
    const posX1 = 326 + posLblW + 4;
    drawDottedLine(doc, posX1, R, y + 15.5);
    if (comp.position) {
      doc.text(String(comp.position).trim(), posX1 + 6, y - 0.5, { width: R - posX1 - 8, lineBreak: false });
    }
    y += 21;
  }

  // Budget section
  y += 4;
  const orgBudget = String(train.org_budget_text || train.train_org || '').trim();
  drawField('ในการไปราชการครั้งนี้ ขออนุมัติใช้งบประมาณจาก (หน่วยงานผู้จัด)', orgBudget, L, R, y, { padLeft: 6 });

  y += 22;
  const totalCost =
    Number(train.train_pay_register || 0) +
    Number(train.train_pay_apartment || 0) +
    Number(train.train_pay_allowance || 0) +
    Number(train.train_pay_travel || 0) +
    Number(train.train_pay_other || 0);
  const hospBudget = Number(train.hospital_budget || 0) > 0 ? Number(train.hospital_budget) : totalCost;
  const hospLbl = 'เงินบำรุงโรงพยาบาลโคกศรีสุพรรณ   เป็นเงิน';
  doc.text(hospLbl, L, y, { lineBreak: false });
  const amtX1 = L + doc.widthOfString(hospLbl) + 6;
  const amtX2 = amtX1 + 104;
  drawDottedLine(doc, amtX1, amtX2, y + 15.5);
  if (hospBudget > 0) {
    doc.text(hospBudget.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), amtX1 + 2, y - 0.5, {
      width: amtX2 - amtX1 - 4,
      align: 'center',
      lineBreak: false,
    });
  }
  doc.text('บาท', amtX2 + 6, y, { lineBreak: false });

  y += 23;
  doc.text('จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ', INDENT, y, { lineBreak: false });

  // Applicant signature (right column)
  const reqName = String(train.requester_name || '').trim();
  const reqPos = String(train.requester_position || '').trim();
  y += 24;
  const sigBoxL = 290;
  doc.text('(ลงชื่อ)', sigBoxL, y, { lineBreak: false });
  const sLine1 = sigBoxL + doc.widthOfString('(ลงชื่อ)') + 4;
  const sLine2 = 488;
  drawDottedLine(doc, sLine1, sLine2, y + 15.5);
  doc.text('ผู้ขออนุมัติ', sLine2 + 4, y, { lineBreak: false });

  y += 21;
  doc.text('(', sLine1 - 6, y, { lineBreak: false });
  drawDottedLine(doc, sLine1 + 2, sLine2 - 6, y + 15.5);
  if (reqName) {
    doc.text(reqName, sLine1 + 4, y - 0.5, { width: sLine2 - sLine1 - 10, align: 'center', lineBreak: false });
  }
  doc.text(')', sLine2 - 4, y, { lineBreak: false });

  y += 21;
  const posPrefixX = sLine1 - doc.widthOfString('ตำแหน่ง') - 6;
  doc.text('ตำแหน่ง', posPrefixX, y, { lineBreak: false });
  drawDottedLine(doc, sLine1, sLine2, y + 15.5);
  if (reqPos) {
    doc.text(reqPos, sLine1 + 4, y - 0.5, { width: sLine2 - sLine1 - 8, align: 'center', lineBreak: false });
  }

  // Head of department opinion (left side)
  y += 18;
  doc.font('ThaiBold').fontSize(16).text('ความเห็นของหัวหน้ากลุ่มงาน', L, y, { lineBreak: false });
  y += 20;
  doc.font('Thai').fontSize(16).text('-   เห็นควรอนุมัติ', L + 14, y, { lineBreak: false });

  // Director approval + signature block
  y += 28;
  doc.font('ThaiBold').fontSize(16).text('(    )  อนุมัติ          (    )  ไม่อนุมัติ', 200, y, { lineBreak: false });

  const dirName = String(train.director_name || 'นางณัฐปภัสร์ นวัตชัยศิริกุล').trim();
  const dirPos1 = String(train.director_pos1 || 'นายแพทย์ชำนาญการพิเศษ รักษาการในตำแหน่ง').trim();
  const dirPos2 = String(train.director_pos2 || 'ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ').trim();

  const dirY = Math.min(y + 48, 724);
  doc.font('Thai').fontSize(16);
  doc.text(`( ${dirName} )`, 250, dirY, { width: 270, align: 'center', lineBreak: false });
  doc.text(dirPos1, 250, dirY + 20, { width: 270, align: 'center', lineBreak: false });
  doc.text(dirPos2, 250, dirY + 40, { width: 270, align: 'center', lineBreak: false });

  drawFooterTimestamp(doc);
  return sendPdf(doc, `memo-travel-${train.train_data_id}.pdf`, res, isDownload);
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
