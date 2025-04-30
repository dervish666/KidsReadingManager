import React, { useState } from 'react'; // Removed unused useContext import
import { useAppContext } from '../../contexts/AppContext'; // Corrected import

function ClassManager() {
  const { classes, addClass, updateClass, deleteClass } = useAppContext(); // Use the hook
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [editingClass, setEditingClass] = useState(null); // { id, name, teacherName }
  const [editClassName, setEditClassName] = useState('');
  const [editTeacherName, setEditTeacherName] = useState('');

  const handleAddClass = (e) => {
    e.preventDefault();
    if (newClassName.trim() && newTeacherName.trim()) {
      addClass({ name: newClassName.trim(), teacherName: newTeacherName.trim() });
      setNewClassName('');
      setNewTeacherName('');
    } else {
      alert('Please enter both class name and teacher name.');
    }
  };

  const handleEditClick = (cls) => {
    setEditingClass(cls);
    setEditClassName(cls.name);
    setEditTeacherName(cls.teacherName);
  };

  const handleUpdateClass = (e) => {
    e.preventDefault();
    if (editingClass && editClassName.trim() && editTeacherName.trim()) {
      updateClass(editingClass.id, { name: editClassName.trim(), teacherName: editTeacherName.trim() });
      setEditingClass(null);
      setEditClassName('');
      setEditTeacherName('');
    } else {
      alert('Please enter both class name and teacher name.');
    }
  };

  const handleDeleteClass = (classId) => {
    if (window.confirm('Are you sure you want to delete this class? This will unassign all students from it.')) {
      deleteClass(classId);
    }
  };

  const handleCancelEdit = () => {
    setEditingClass(null);
    setEditClassName('');
    setEditTeacherName('');
  };

  return (
    <div className="class-manager">
      <h2>Manage Classes</h2>

      {/* Add Class Form */}
      <form onSubmit={handleAddClass} className="add-class-form">
        <h3>Add New Class</h3>
        <input
          type="text"
          placeholder="Class Name (e.g., Year 3 Robins)"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Teacher Name"
          value={newTeacherName}
          onChange={(e) => setNewTeacherName(e.target.value)}
          required
        />
        <button type="submit">Add Class</button>
      </form>

      {/* Edit Class Form (Modal or Inline) */}
      {editingClass && (
        <div className="edit-class-form">
          <h3>Edit Class: {editingClass.name}</h3>
          <form onSubmit={handleUpdateClass}>
            <input
              type="text"
              value={editClassName}
              onChange={(e) => setEditClassName(e.target.value)}
              required
            />
            <input
              type="text"
              value={editTeacherName}
              onChange={(e) => setEditTeacherName(e.target.value)}
              required
            />
            <button type="submit">Update Class</button>
            <button type="button" onClick={handleCancelEdit}>Cancel</button>
          </form>
        </div>
      )}

      {/* Class List */}
      <div className="class-list">
        <h3>Existing Classes</h3>
        {classes.length === 0 ? (
          <p>No classes created yet.</p>
        ) : (
          <ul>
            {classes.map((cls) => (
              <li key={cls.id}>
                <span>{cls.name} ({cls.teacherName})</span>
                <div>
                  <button onClick={() => handleEditClick(cls)} disabled={!!editingClass}>Edit</button>
                  <button onClick={() => handleDeleteClass(cls.id)} disabled={!!editingClass}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Basic Styling (Consider moving to CSS file) */}
      <style jsx>{`
        .class-manager {
          padding: 20px;
          border: 1px solid #ccc;
          border-radius: 5px;
          margin-top: 20px;
        }
        .add-class-form, .edit-class-form {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #eee;
          border-radius: 4px;
        }
        .add-class-form input, .edit-class-form input {
          margin-right: 10px;
          padding: 8px;
        }
        .class-list ul {
          list-style: none;
          padding: 0;
        }
        .class-list li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          border-bottom: 1px solid #eee;
        }
        .class-list li:last-child {
          border-bottom: none;
        }
        .class-list button {
          margin-left: 10px;
        }
        .edit-class-form {
          background-color: #f9f9f9;
        }
      `}</style>
    </div>
  );
}

export default ClassManager;