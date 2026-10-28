import React from 'react';

export default function StudentSelector({
  students = [],
  selectedStudentId,
  onSelectStudent,
  disabled = false
}) {
  const currentStudent = students.find(s => s.id === selectedStudentId);

  return (
    <section className="student-panel" aria-labelledby="student-select-heading">
      <h2 id="student-select-heading" className="panel-title">
        <span>👤</span> Fictional Student
      </h2>

      <div className="form-group">
        <label htmlFor="student-dropdown" className="form-label">
          Select Student Profile
        </label>
        <select
          id="student-dropdown"
          className="form-select"
          value={selectedStudentId}
          onChange={e => onSelectStudent(e.target.value)}
          disabled={disabled || students.length === 0}
        >
          {students.map(student => (
            <option key={student.id} value={student.id}>
              {student.name} ({student.id})
            </option>
          ))}
        </select>
      </div>

      {currentStudent && (
        <div className="student-card-details" aria-live="polite">
          <div className="student-card-name">{currentStudent.name}</div>
          <div className="student-card-id">ID: {currentStudent.id}</div>
          <div className="student-interests-list" aria-label="Student interests">
            {(currentStudent.interests || []).map(interest => (
              <span key={interest} className="badge badge-tag">
                #{interest}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
