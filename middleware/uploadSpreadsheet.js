const multer = require('multer');

// Question-bank bulk import: file is parsed in memory and discarded — never
// written to disk, so this uses memoryStorage (unlike middleware/upload.js,
// which persists gallery/branding images to disk).
const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel', // some browsers send .csv as this
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a question bank sheet

const fileFilter = (req, file, cb) => {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_TYPES.includes(file.mimetype) && !['csv', 'xlsx', 'xls'].includes(ext)) {
    return cb(new Error('Only .csv or .xlsx files are allowed'));
  }
  cb(null, true);
};

const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

module.exports = { uploadSpreadsheet };