// ============ ADMIN: upload an image file, get back a URL ============
// The returned url is meant to be pasted straight into gallery's image_url
// or settings' logo_url / favicon_url fields — this endpoint only handles
// the "get the file onto the server and get a URL back" step.
exports.uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file received (field name must be "image")' });
  }

  const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/uploads/${req.file.filename}`;

  res.status(201).json({
    success: true,
    url,
    filename: req.file.filename,
    size_bytes: req.file.size,
  });
};