// ============================================
// CareerMyntra Exam Portal - Admit Card Template
// ============================================
const { SimplePDF, PAGE_WIDTH } = require('./pdfGenerator');

function formatDateTime(dt) {
  if (!dt) return 'To be announced';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(dt));
  } catch (e) {
    return String(dt);
  }
}

function formatDuration(mins) {
  const n = Number(mins);
  if (!n) return '-';
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}

const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const DEFAULT_INSTRUCTIONS = [
  'Log in at least 15 minutes before the scheduled exam time using your registered mobile number.',
  'Keep a valid government photo ID ready for verification if requested by the invigilator/admin.',
  'Ensure a stable internet connection and a quiet, distraction-free environment for the full duration.',
  'The exam timer is server-controlled and will auto-submit your attempt when time expires.',
  'Do not refresh, close the browser tab, or switch windows during the exam unless instructed.',
  'Any use of unfair means will lead to disqualification and cancellation of this admit card.',
];

// data: { registration, exam, candidate, settings, exam_id }
function buildAdmitCardPdf(data) {
  const { registration, exam, candidate, settings = {}, exam_id } = data;

  const brandName = settings.brand_name || 'CareerMyntra';
  const tagline = settings.tagline || 'Career Guidance - Assessment - Training - Opportunities';
  const primaryColor = settings.primary_color || '#2554F0';
  const supportEmail = settings.support_email || 'support@careermyntra.com';
  const supportPhone = settings.support_phone || '';

  const pdf = new SimplePDF();

  // ---------- Header band ----------
  pdf.rect(0, 0, PAGE_WIDTH, 100, { fill: primaryColor, stroke: null });
  pdf.text(MARGIN, 40, brandName.toUpperCase(), { size: 24, bold: true, color: '#FFFFFF' });
  pdf.text(MARGIN, 62, tagline, { size: 9, color: '#EAF0FF' });
  pdf.text(360, 38, 'ADMIT CARD', { size: 18, bold: true, color: '#FFFFFF' });
  pdf.text(360, 58, `Reg. No: CM-${pad(registration.registration_id)}`, { size: 10, color: '#EAF0FF' });

  let y = 130;

  // ---------- Candidate details ----------
  pdf.text(MARGIN, y, 'Candidate Details', { size: 13, bold: true });
  pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6, { width: 1, color: '#CBD5E1' });
  y += 28;

  const candidateRows = [
    ['Candidate Name', candidate.full_name || '-'],
    ['Registration No.', `CM-${pad(registration.registration_id)}`],
    ['Mobile Number', candidate.mobile_number || '-'],
    ['Email', candidate.email || '-'],
    ['Registered On', formatDateTime(registration.registered_at)],
  ];
  for (const [label, value] of candidateRows) {
    pdf.text(MARGIN, y, `${label}:`, { size: 10, bold: true, color: '#374151' });
    pdf.text(MARGIN + 150, y, value, { size: 10, color: '#111827' });
    y += 20;
  }

  y += 14;

  // ---------- Exam details ----------
  pdf.text(MARGIN, y, 'Exam Details', { size: 13, bold: true });
  pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6, { width: 1, color: '#CBD5E1' });
  y += 28;

  const examRows = [
    ['Exam Name', exam.exam_name || '-'],
    ['Category', exam.category ? exam.category.charAt(0).toUpperCase() + exam.category.slice(1) : '-'],
    ['Exam Date & Time', formatDateTime(exam.start_datetime)],
    ['Duration', formatDuration(exam.duration_minutes)],
    ['Total Marks', exam.total_marks != null ? String(exam.total_marks) : '-'],
    ['Exam Mode', 'Online (candidate login required)'],
  ];
  for (const [label, value] of examRows) {
    pdf.text(MARGIN, y, `${label}:`, { size: 10, bold: true, color: '#374151' });
    pdf.text(MARGIN + 150, y, value, { size: 10, color: '#111827' });
    y += 20;
  }

  y += 16;

  // ---------- Instructions box ----------
  const boxTop = y;
  pdf.text(MARGIN, y, 'Instructions', { size: 13, bold: true });
  y += 22;

  const bulletStartY = y;
  let cursorY = y + 4;
  const allInstructions = [...DEFAULT_INSTRUCTIONS];
  if (exam.instructions && exam.instructions.trim()) {
    allInstructions.push(`Exam-specific note: ${exam.instructions.trim()}`);
  }
  for (const line of allInstructions) {
    pdf.text(MARGIN + 14, cursorY, '-', { size: 10, color: '#111827' });
    cursorY = pdf.wrapText(MARGIN + 26, cursorY, line, CONTENT_WIDTH - 40, { size: 9.5, lineHeight: 14 });
    cursorY += 2;
  }
  const boxBottom = cursorY + 6;
  pdf.rect(MARGIN - 10, boxTop - 10, CONTENT_WIDTH + 20, boxBottom - boxTop + 14, {
    fill: null,
    stroke: '#CBD5E1',
    width: 1,
  });

  // ---------- Signatures ----------
  const sigY = Math.max(boxBottom + 50, 700);
  pdf.line(MARGIN, sigY, MARGIN + 160, sigY, { width: 1, color: '#111827' });
  pdf.text(MARGIN, sigY + 14, 'Candidate Signature', { size: 9, color: '#374151' });

  pdf.line(PAGE_WIDTH - MARGIN - 160, sigY, PAGE_WIDTH - MARGIN, sigY, { width: 1, color: '#111827' });
  pdf.text(PAGE_WIDTH - MARGIN - 160, sigY + 14, 'Authorized Signatory', { size: 9, color: '#374151' });

  // ---------- Footer ----------
  const footerY = sigY + 50;
  pdf.line(MARGIN, footerY, PAGE_WIDTH - MARGIN, footerY, { width: 0.5, color: '#E5E7EB' });
  const contactLine = supportPhone ? `${supportEmail}  |  ${supportPhone}` : supportEmail;
  pdf.text(MARGIN, footerY + 16, `This is a system-generated document. For queries, contact ${contactLine}.`, {
    size: 8,
    color: '#6B7280',
  });
  pdf.text(MARGIN, footerY + 30, `Generated on ${formatDateTime(new Date())} | Exam ID: ${exam_id}`, {
    size: 8,
    color: '#9CA3AF',
  });

  return pdf.build();
}

module.exports = { buildAdmitCardPdf, formatDateTime, formatDuration };