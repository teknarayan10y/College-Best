// Server/routes/adminStudentRoutes.js
const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/roles");

const {
  listStudents,
  getStudentProfile,
  updateStudentProfile,
  updateUserStatus,
} = require("../controller/adminStudentController");

// Apply auth + admin role
router.use(requireAuth, requireRole("admin"));

router.get("/", listStudents);
router.get("/:userId/profile", getStudentProfile);
router.patch("/:userId/profile", updateStudentProfile);
router.patch("/:userId/status", updateUserStatus);

module.exports = router;