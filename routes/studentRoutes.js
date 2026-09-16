const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { verifyAdmin } = require('../middleware/auth');

router.get('/', verifyAdmin, studentController.listStudents);
router.get('/:student_id', verifyAdmin, studentController.getStudent);
router.put('/:student_id', verifyAdmin, studentController.updateStudent);
router.put('/:student_id/reset-password', verifyAdmin, studentController.resetStudentPassword);

module.exports = router;