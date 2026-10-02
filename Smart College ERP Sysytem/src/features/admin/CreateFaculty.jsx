import React, { useState } from "react";
import "./CreateFaculty.css";

export default function CreateFaculty() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    employeeId: "",
    joiningDate: "",
    qualification: "",
  });

  const onChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    console.log("Faculty Created:", form);
    alert("Faculty profile created successfully!");
  };

  return (
    <div className="create-faculty">

      <h1>Create Faculty Profile</h1>
      <p>Add a new faculty member to the system</p>

      <form className="faculty-form" onSubmit={onSubmit}>

        <div className="grid-2">
          <Field label="Full Name" name="name" value={form.name} onChange={onChange} />
          <Field label="Email" name="email" value={form.email} onChange={onChange} />
          <Field label="Phone" name="phone" value={form.phone} onChange={onChange} />
          <Field label="Employee ID" name="employeeId" value={form.employeeId} onChange={onChange} />
          <Field label="Department" name="department" value={form.department} onChange={onChange} />
          <Field label="Designation" name="designation" value={form.designation} onChange={onChange} />
          <Field label="Qualification" name="qualification" value={form.qualification} onChange={onChange} />
          <Field label="Joining Date" name="joiningDate" type="date" value={form.joiningDate} onChange={onChange} />
        </div>

        <div className="actions">
          <button className="btn primary" type="submit">Create Faculty</button>
          <button className="btn ghost" type="reset">Reset</button>
        </div>

      </form>
    </div>
  );
}

/* SMALL COMPONENT */
function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
