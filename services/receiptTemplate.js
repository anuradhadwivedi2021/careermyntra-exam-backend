// ============================================
// CareerMyntra Exam Portal - Payment Receipt Template
// ============================================
const { SimplePDF, PAGE_WIDTH } = require('./pdfGenerator');
const { formatDateTime } = require('./admitCardTemplate');

function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}

function money(n) {
  const num = Number(n) || 0;
  return `Rs. ${num.toFixed(2)}`;
}

const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const STATUS_LABELS = {
  success: 'PAID',
  refunded: 'FULLY REFUNDED',
  partially_refunded: 'PARTIALLY REFUNDED',
  created: 'PENDING',
  failed: 'FAILED',
};

// data: { transaction, candidate, exam, settings }
function buildReceiptPdf(data) {
  const { transaction: txn, candidate, exam, settings = {} } = data;

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
  pdf.text(360, 38, 'PAYMENT RECEIPT', { size: 16, bold: true, color: '#FFFFFF' });
  pdf.text(360, 58, `Receipt No: CM-RCPT-${pad(txn.transaction_id)}`, { size: 10, color: '#EAF0FF' });

  let y = 130;

  // ---------- Status badge ----------
  const statusLabel = STATUS_LABELS[txn.status] || txn.status.toUpperCase();
  const badgeColor = txn.status === 'success' ? '#16A34A' : txn.status.includes('refund') ? '#D97706' : '#DC2626';
  pdf.rect(MARGIN, y - 16, 150, 24, { fill: badgeColor, stroke: null });
  pdf.text(MARGIN + 12, y, statusLabel, { size: 11, bold: true, color: '#FFFFFF' });
  y += 36;

  // ---------- Billed To ----------
  pdf.text(MARGIN, y, 'Billed To', { size: 13, bold: true });
  pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6, { width: 1, color: '#CBD5E1' });
  y += 28;

  const billedRows = [
    ['Candidate Name', candidate.full_name || '-'],
    ['Mobile Number', candidate.mobile_number || '-'],
    ['Email', candidate.email || '-'],
  ];
  for (const [label, value] of billedRows) {
    pdf.text(MARGIN, y, `${label}:`, { size: 10, bold: true, color: '#374151' });
    pdf.text(MARGIN + 150, y, value, { size: 10, color: '#111827' });
    y += 20;
  }

  y += 14;

  // ---------- Payment details ----------
  pdf.text(MARGIN, y, 'Payment Details', { size: 13, bold: true });
  pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6, { width: 1, color: '#CBD5E1' });
  y += 28;

  const paymentRows = [
    ['Exam', exam.exam_name || '-'],
    ['Order ID', txn.razorpay_order_id || '-'],
    ['Payment ID', txn.razorpay_payment_id || '-'],
    ['Payment Date', formatDateTime(txn.created_at)],
  ];
  if (txn.coupon_code) {
    paymentRows.push(['Coupon Applied', `${txn.coupon_code} (-${money(txn.discount_amount)})`]);
  }
  for (const [label, value] of paymentRows) {
    pdf.text(MARGIN, y, `${label}:`, { size: 10, bold: true, color: '#374151' });
    pdf.text(MARGIN + 150, y, value, { size: 10, color: '#111827' });
    y += 20;
  }

  y += 10;

  // ---------- Amount summary box ----------
  const baseAmount = Number(txn.amount) + Number(txn.discount_amount || 0);
  const boxTop = y;
  const boxHeight = txn.coupon_code ? 96 : 76;
  pdf.rect(MARGIN, boxTop, CONTENT_WIDTH, boxHeight, { fill: '#F8FAFC', stroke: '#E2E8F0', width: 1 });
  let ry = boxTop + 20;
  pdf.text(MARGIN + 16, ry, 'Exam Fee', { size: 10, color: '#374151' });
  pdf.text(PAGE_WIDTH - MARGIN - 100, ry, money(baseAmount), { size: 10, color: '#111827' });
  ry += 20;
  if (txn.coupon_code) {
    pdf.text(MARGIN + 16, ry, 'Discount', { size: 10, color: '#374151' });
    pdf.text(PAGE_WIDTH - MARGIN - 100, ry, `- ${money(txn.discount_amount)}`, { size: 10, color: '#111827' });
    ry += 20;
  }
  pdf.line(MARGIN + 16, ry - 4, PAGE_WIDTH - MARGIN - 16, ry - 4, { width: 0.5, color: '#CBD5E1' });
  ry += 12;
  pdf.text(MARGIN + 16, ry, 'Amount Paid', { size: 11, bold: true, color: '#111827' });
  pdf.text(PAGE_WIDTH - MARGIN - 110, ry, money(txn.amount), { size: 12, bold: true, color: '#111827' });

  y = boxTop + boxHeight + 30;

  // ---------- Refund details (only if any refund happened) ----------
  const refundAmount = Number(txn.refund_amount) || 0;
  if (refundAmount > 0) {
    pdf.text(MARGIN, y, 'Refund Details', { size: 13, bold: true });
    pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6, { width: 1, color: '#CBD5E1' });
    y += 28;

    const refundRows = [
      ['Refund Amount', money(refundAmount)],
      ['Refund ID', txn.razorpay_refund_id || '-'],
      ['Refunded On', formatDateTime(txn.refunded_at)],
    ];
    if (txn.refund_reason) {
      refundRows.push(['Reason', txn.refund_reason]);
    }
    for (const [label, value] of refundRows) {
      pdf.text(MARGIN, y, `${label}:`, { size: 10, bold: true, color: '#374151' });
      pdf.text(MARGIN + 150, y, value, { size: 10, color: '#111827' });
      y += 20;
    }
    y += 10;
  }

  // ---------- Footer ----------
  const footerY = Math.max(y + 30, 740);
  pdf.line(MARGIN, footerY, PAGE_WIDTH - MARGIN, footerY, { width: 0.5, color: '#E5E7EB' });
  const contactLine = supportPhone ? `${supportEmail}  |  ${supportPhone}` : supportEmail;
  pdf.text(MARGIN, footerY + 16, 'This is a computer-generated receipt and does not require a signature.', {
    size: 8,
    color: '#6B7280',
  });
  pdf.text(MARGIN, footerY + 30, `For queries, contact ${contactLine}.`, { size: 8, color: '#6B7280' });
  pdf.text(MARGIN, footerY + 44, `Generated on ${formatDateTime(new Date())}`, { size: 8, color: '#9CA3AF' });

  return pdf.build();
}

module.exports = { buildReceiptPdf };