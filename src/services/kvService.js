/**
 * KV Service for interacting with Cloudflare KV storage
 * 
 * This service provides methods for reading and writing data to the KV store.
 * The application uses a single JSON document stored under the 'app_data' key.
 */

// Default data structure
const DEFAULT_DATA = {
  students: [],
  classes: [], // Added classes array
  settings: {
    readingStatusSettings: {
      recentlyReadDays: 7,
      needsAttentionDays: 14
    }
  },
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: '1.0.0'
  }
};

// Key for storing the application data
const APP_DATA_KEY = 'app_data';

/**
 * Get the entire application data from KV
 * @param {Object} env - Environment with KV binding
 * @returns {Promise<Object>} - The application data
 */
export async function getData(env) {
  try {
    const data = await env.READING_MANAGER_KV.get(APP_DATA_KEY, { type: 'json' });
    if (!data) {
      // Initialize with default data if not found
      const defaultData = { ...DEFAULT_DATA };
      await env.READING_MANAGER_KV.put(APP_DATA_KEY, JSON.stringify(defaultData));
      return defaultData;
    }
    return data;
  } catch (error) {
    console.error('Error reading from KV:', error);
    throw new Error('Failed to read data from storage');
  }
}

/**
 * Save the entire application data to KV
 * @param {Object} env - Environment with KV binding
 * @param {Object} data - The data to save
 * @returns {Promise<boolean>} - Success status
 */
export async function saveData(env, data) {
  try {
    // Update metadata
    const updatedData = {
      ...data,
      metadata: {
        ...(data.metadata || {}),
        lastUpdated: new Date().toISOString()
      }
    };
    
    await env.READING_MANAGER_KV.put(APP_DATA_KEY, JSON.stringify(updatedData));
    return true;
  } catch (error) {
    console.error('Error writing to KV:', error);
    throw new Error('Failed to save data to storage');
  }
}

/**
 * Get students from KV
 * @param {Object} env - Environment with KV binding
 * @returns {Promise<Array>} - Array of students
 */
export async function getStudents(env) {
  const data = await getData(env);
  return data.students || [];
}

/**
 * Get a student by ID
 * @param {Object} env - Environment with KV binding
 * @param {string} id - Student ID
 * @returns {Promise<Object|null>} - Student object or null if not found
 */
export async function getStudentById(env, id) {
  const data = await getData(env);
  return data.students.find(student => student.id === id) || null;
}

/**
 * Save a student (create or update)
 * @param {Object} env - Environment with KV binding
 * @param {Object} student - Student object to save
 * @returns {Promise<Object>} - Saved student
 */
export async function saveStudent(env, student) {
  const data = await getData(env);
  const index = data.students.findIndex(s => s.id === student.id);
  
  if (index === -1) {
    // Create new student
    data.students.push(student);
  } else {
    // Update existing student
    data.students[index] = student;
  }
  
  await saveData(env, data);
  return student;
}

/**
 * Delete a student by ID
 * @param {Object} env - Environment with KV binding
 * @param {string} id - Student ID to delete
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteStudent(env, id) {
  const data = await getData(env);
  const initialLength = data.students.length;
  data.students = data.students.filter(student => student.id !== id);
  
  if (data.students.length === initialLength) {
    return false; // Student not found
  }
  
  await saveData(env, data);
  return true;
}

/**
 * Add multiple students
 * @param {Object} env - Environment with KV binding
 * @param {Array} students - Array of student objects to add
 * @returns {Promise<Array>} - Array of added students
 */
export async function addStudents(env, students) {
  const data = await getData(env);
  data.students = [...data.students, ...students];
  await saveData(env, data);
  return students;
}

/**
 * Get application settings
 * @param {Object} env - Environment with KV binding
 * @returns {Promise<Object>} - Application settings
 */
export async function getSettings(env) {
  const data = await getData(env);
  return data.settings || DEFAULT_DATA.settings;
}

/**
 * Get classes from KV
 * @param {Object} env - Environment with KV binding
 * @returns {Promise<Array>} - Array of classes
 */
export async function getClasses(env) {
  const data = await getData(env);
  return data.classes || [];
}

/**
 * Get a class by ID
 * @param {Object} env - Environment with KV binding
 * @param {string} id - Class ID
 * @returns {Promise<Object|null>} - Class object or null if not found
 */
export async function getClassById(env, id) {
  const data = await getData(env);
  return data.classes.find(cls => cls.id === id) || null;
}

/**
 * Save a class (create or update)
 * @param {Object} env - Environment with KV binding
 * @param {Object} cls - Class object to save
 * @returns {Promise<Object>} - Saved class
 */
export async function saveClass(env, cls) {
  const data = await getData(env);
  
  // Initialize classes array if it doesn't exist
  if (!data.classes) {
    data.classes = [];
  }
  
  const index = data.classes.findIndex(c => c.id === cls.id);
  
  if (index === -1) {
    // Create new class
    data.classes.push(cls);
  } else {
    // Update existing class
    data.classes[index] = cls;
  }
  
  await saveData(env, data);
  return cls;
}

/**
 * Delete a class by ID
 * @param {Object} env - Environment with KV binding
 * @param {string} id - Class ID to delete
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteClass(env, id) {
  const data = await getData(env);
  
  // Initialize classes array if it doesn't exist
  if (!data.classes) {
    data.classes = [];
    return false; // Class not found
  }
  
  const initialLength = data.classes.length;
  data.classes = data.classes.filter(cls => cls.id !== id);
  
  if (data.classes.length === initialLength) {
    return false; // Class not found
  }
  
  // Unassign students from the deleted class
  if (data.students) {
    data.students = data.students.map(student =>
      student.classId === id ? { ...student, classId: null } : student
    );
  }
  
  await saveData(env, data);
  return true;
}

/**
 * Update application settings
 * @param {Object} env - Environment with KV binding
 * @param {Object} settings - New settings
 * @returns {Promise<Object>} - Updated settings
 */
export async function updateSettings(env, settings) {
  const data = await getData(env);
  data.settings = { ...(data.settings || {}), ...settings };
  await saveData(env, data);
  return data.settings;
}

/**
 * Replace all application data
 * @param {Object} env - Environment with KV binding
 * @param {Object} newData - New data to replace existing data
 * @returns {Promise<Object>} - The new data
 */
export async function replaceData(env, newData) {
  await saveData(env, newData);
  return newData;
}