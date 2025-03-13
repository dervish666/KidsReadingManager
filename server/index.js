const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'students.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    students: [],
    settings: {
      readingStatusSettings: {
        recentlyReadDays: 7,
        needsAttentionDays: 14
      }
    }
  }), 'utf8');
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Helper function to read data
const readData = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return { students: [] };
  }
};

// Helper function to write data
const writeData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing data file:', error);
    return false;
  }
};

// Routes
app.get('/api/students', (req, res) => {
  const data = readData();
  res.json(data.students);
});

app.post('/api/students', (req, res) => {
  const data = readData();
  const newStudent = req.body;
  
  data.students.push(newStudent);
  
  if (writeData(data)) {
    res.status(201).json(newStudent);
  } else {
    res.status(500).json({ error: 'Failed to save student' });
  }
});

app.put('/api/students/:id', (req, res) => {
  const data = readData();
  const { id } = req.params;
  const updatedStudent = req.body;
  
  const index = data.students.findIndex(student => student.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Student not found' });
  }
  
  data.students[index] = updatedStudent;
  
  if (writeData(data)) {
    res.json(updatedStudent);
  } else {
    res.status(500).json({ error: 'Failed to update student' });
  }
});

app.delete('/api/students/:id', (req, res) => {
  const data = readData();
  const { id } = req.params;
  
  const initialLength = data.students.length;
  data.students = data.students.filter(student => student.id !== id);
  
  if (data.students.length === initialLength) {
    return res.status(404).json({ error: 'Student not found' });
  }
  
  if (writeData(data)) {
    res.json({ message: 'Student deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Bulk operations
app.post('/api/students/bulk', (req, res) => {
  const data = readData();
  const newStudents = req.body;
  
  data.students = [...data.students, ...newStudents];
  
  if (writeData(data)) {
    res.status(201).json(newStudents);
  } else {
    res.status(500).json({ error: 'Failed to save students' });
  }
});

// Get all data (for import/export)
app.get('/api/data', (req, res) => {
  const data = readData();
  res.json(data);
});

// Replace all data (for import/export)
app.post('/api/data', (req, res) => {
  const newData = req.body;
  
  if (writeData(newData)) {
    res.json({ message: 'Data imported successfully', count: newData.students.length });
  } else {
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  const data = readData();
  
  // If settings don't exist yet, initialize with defaults
  if (!data.settings) {
    data.settings = {
      readingStatusSettings: {
        recentlyReadDays: 7,
        needsAttentionDays: 14
      }
    };
    writeData(data);
  }
  
  res.json(data.settings);
});

app.post('/api/settings', (req, res) => {
  const data = readData();
  const newSettings = req.body;
  
  // Initialize settings object if it doesn't exist
  if (!data.settings) {
    data.settings = {};
  }
  
  // Update settings with new values
  data.settings = { ...data.settings, ...newSettings };
  
  if (writeData(data)) {
    res.json(data.settings);
  } else {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});