const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const {
  createDepartment,
  listDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controller/adminDepartmentController');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', listDepartments);
router.post('/', createDepartment);

router.get('/:departmentId', getDepartment);
router.patch('/:departmentId', updateDepartment);
router.delete('/:departmentId', deleteDepartment);

module.exports = router;