const Department = require('../models/Department');

exports.listDepartments = async (req, res) => {
  const { q } = req.query;
  const filter = q
    ? { $or: [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }] }
    : {};
  const items = await Department.find(filter).sort({ name: 1 });
  res.json({ items });
};

exports.createDepartment = async (req, res) => {
  const { code, name, description, hod, isActive } = req.body;
  const exists = await Department.findOne({ code });
  if (exists) return res.status(400).json({ message: 'Code already exists' });
  const dep = await Department.create({ code, name, description, hod: hod || null, isActive });
  res.status(201).json({ item: dep });
};

exports.getDepartment = async (req, res) => {
  const dep = await Department.findById(req.params.departmentId);
  if (!dep) return res.status(404).json({ message: 'Not found' });
  res.json({ item: dep });
};

exports.updateDepartment = async (req, res) => {
  const { code, name, description, hod, isActive } = req.body;
  const dep = await Department.findById(req.params.departmentId);
  if (!dep) return res.status(404).json({ message: 'Not found' });
  if (code && code !== dep.code) {
    const exists = await Department.findOne({ code });
    if (exists) return res.status(400).json({ message: 'Code already exists' });
    dep.code = code;
  }
  if (name !== undefined) dep.name = name;
  if (description !== undefined) dep.description = description;
  if (hod !== undefined) dep.hod = hod || null;
  if (isActive !== undefined) dep.isActive = isActive;
  await dep.save();
  res.json({ item: dep });
};

exports.deleteDepartment = async (req, res) => {
  const dep = await Department.findByIdAndDelete(req.params.departmentId);
  if (!dep) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
};