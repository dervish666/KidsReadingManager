# Tally Reading - API Test Scripts

This document provides detailed test scripts for validating the API endpoints after migration to Cloudflare Workers. These scripts can be executed using tools like Postman, curl, or automated testing frameworks.

## Prerequisites

- Cloudflare Worker deployed with test KV namespace
- Test data prepared for import
- API base URL configured (replace `{API_BASE_URL}` with the actual URL)

## Environment Setup

```javascript
// Environment variables
const API_BASE_URL = "https://kids-reading-manager-api.your-domain.workers.dev/api";
let studentId; // Will store a student ID for use in subsequent tests
let sessionId; // Will store a session ID for use in subsequent tests
```

## 1. Student Endpoint Tests

### 1.1 Get All Students (Empty Database)

```javascript
// Test case TC-S-01: Retrieve all students with empty database
const getAllStudentsEmpty = async () => {
  console.log("Running TC-S-01: Get all students (empty database)");
  
  try {
    const response = await fetch(`${API_BASE_URL}/students`);
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(Array.isArray(data), "Response should be an array");
    console.assert(data.length === 0, `Expected empty array, got ${data.length} items`);
    
    console.log("TC-S-01: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-01: FAILED", error);
    return false;
  }
};
```

### 1.2 Create New Student

```javascript
// Test case TC-S-10: Create new student with valid data
const createStudent = async () => {
  console.log("Running TC-S-10: Create new student");
  
  const newStudent = {
    id: "test-" + Date.now(),
    name: "Test Student",
    lastReadDate: null,
    readingSessions: []
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 201, `Expected status 201, got ${response.status}`);
    console.assert(data.id === newStudent.id, `Expected ID ${newStudent.id}, got ${data.id}`);
    console.assert(data.name === newStudent.name, `Expected name ${newStudent.name}, got ${data.name}`);
    
    // Store student ID for later tests
    studentId = data.id;
    
    console.log("TC-S-10: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-10: FAILED", error);
    return false;
  }
};
```

### 1.3 Get Student by ID

```javascript
// Test case TC-S-06: Retrieve existing student
const getStudentById = async () => {
  console.log("Running TC-S-06: Get student by ID");
  
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`);
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.id === studentId, `Expected ID ${studentId}, got ${data.id}`);
    
    console.log("TC-S-06: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-06: FAILED", error);
    return false;
  }
};
```

### 1.4 Get Non-existent Student

```javascript
// Test case TC-S-07: Retrieve non-existent student
const getNonExistentStudent = async () => {
  console.log("Running TC-S-07: Get non-existent student");
  
  try {
    const response = await fetch(`${API_BASE_URL}/students/non-existent-id`);
    
    // Assertions
    console.assert(response.status === 404, `Expected status 404, got ${response.status}`);
    
    console.log("TC-S-07: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-07: FAILED", error);
    return false;
  }
};
```

### 1.5 Update Student

```javascript
// Test case TC-S-15: Update existing student
const updateStudent = async () => {
  console.log("Running TC-S-15: Update student");
  
  try {
    // First get the current student
    const getResponse = await fetch(`${API_BASE_URL}/students/${studentId}`);
    const student = await getResponse.json();
    
    // Update the student
    const updatedStudent = {
      ...student,
      name: "Updated Test Student"
    };
    
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStudent)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.name === "Updated Test Student", `Expected name "Updated Test Student", got ${data.name}`);
    
    console.log("TC-S-15: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-15: FAILED", error);
    return false;
  }
};
```

### 1.6 Add Reading Session

```javascript
// Test case: Add reading session to student
const addReadingSession = async () => {
  console.log("Running test: Add reading session");
  
  try {
    // First get the current student
    const getResponse = await fetch(`${API_BASE_URL}/students/${studentId}`);
    const student = await getResponse.json();
    
    // Create a new session
    const newSession = {
      id: "session-" + Date.now(),
      date: new Date().toISOString().split('T')[0],
      assessment: "Level 3",
      notes: "Test session"
    };
    
    // Add session to student
    const updatedStudent = {
      ...student,
      lastReadDate: newSession.date,
      readingSessions: [newSession, ...student.readingSessions]
    };
    
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStudent)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.readingSessions.length === student.readingSessions.length + 1, 
      `Expected ${student.readingSessions.length + 1} sessions, got ${data.readingSessions.length}`);
    console.assert(data.lastReadDate === newSession.date, 
      `Expected lastReadDate ${newSession.date}, got ${data.lastReadDate}`);
    
    // Store session ID for later tests
    sessionId = data.readingSessions[0].id;
    
    console.log("Add reading session: PASSED");
    return true;
  } catch (error) {
    console.error("Add reading session: FAILED", error);
    return false;
  }
};
```

### 1.7 Delete Student

```javascript
// Test case TC-S-20: Delete existing student
const deleteStudent = async () => {
  console.log("Running TC-S-20: Delete student");
  
  try {
    const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
      method: 'DELETE'
    });
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    
    // Verify student is deleted
    const verifyResponse = await fetch(`${API_BASE_URL}/students/${studentId}`);
    console.assert(verifyResponse.status === 404, `Expected status 404, got ${verifyResponse.status}`);
    
    console.log("TC-S-20: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-20: FAILED", error);
    return false;
  }
};
```

### 1.8 Bulk Import Students

```javascript
// Test case TC-S-24: Import multiple students
const bulkImportStudents = async () => {
  console.log("Running TC-S-24: Bulk import students");
  
  const students = [
    {
      id: "bulk-1-" + Date.now(),
      name: "Bulk Student 1",
      lastReadDate: null,
      readingSessions: []
    },
    {
      id: "bulk-2-" + Date.now(),
      name: "Bulk Student 2",
      lastReadDate: null,
      readingSessions: []
    },
    {
      id: "bulk-3-" + Date.now(),
      name: "Bulk Student 3",
      lastReadDate: null,
      readingSessions: []
    }
  ];
  
  try {
    const response = await fetch(`${API_BASE_URL}/students/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(students)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 201, `Expected status 201, got ${response.status}`);
    console.assert(Array.isArray(data), "Response should be an array");
    console.assert(data.length === students.length, 
      `Expected ${students.length} students, got ${data.length}`);
    
    console.log("TC-S-24: PASSED");
    return true;
  } catch (error) {
    console.error("TC-S-24: FAILED", error);
    return false;
  }
};
```

## 2. Settings Endpoint Tests

### 2.1 Get Settings

```javascript
// Test case TC-SET-01: Retrieve settings
const getSettings = async () => {
  console.log("Running TC-SET-01: Get settings");
  
  try {
    const response = await fetch(`${API_BASE_URL}/settings`);
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.readingStatusSettings, "Response should include readingStatusSettings");
    console.assert(typeof data.readingStatusSettings.recentlyReadDays === 'number', 
      "recentlyReadDays should be a number");
    console.assert(typeof data.readingStatusSettings.needsAttentionDays === 'number', 
      "needsAttentionDays should be a number");
    
    console.log("TC-SET-01: PASSED");
    return true;
  } catch (error) {
    console.error("TC-SET-01: FAILED", error);
    return false;
  }
};
```

### 2.2 Update Settings

```javascript
// Test case TC-SET-04: Update settings
const updateSettings = async () => {
  console.log("Running TC-SET-04: Update settings");
  
  const newSettings = {
    readingStatusSettings: {
      recentlyReadDays: 10,
      needsAttentionDays: 20
    }
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.readingStatusSettings.recentlyReadDays === 10, 
      `Expected recentlyReadDays 10, got ${data.readingStatusSettings.recentlyReadDays}`);
    console.assert(data.readingStatusSettings.needsAttentionDays === 20, 
      `Expected needsAttentionDays 20, got ${data.readingStatusSettings.needsAttentionDays}`);
    
    console.log("TC-SET-04: PASSED");
    return true;
  } catch (error) {
    console.error("TC-SET-04: FAILED", error);
    return false;
  }
};
```

## 3. Data Import/Export Tests

### 3.1 Export Data

```javascript
// Test case TC-D-01: Export all data
const exportData = async () => {
  console.log("Running TC-D-01: Export data");
  
  try {
    const response = await fetch(`${API_BASE_URL}/data`);
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.students !== undefined, "Response should include students");
    console.assert(data.settings !== undefined, "Response should include settings");
    console.assert(data.exportDate !== undefined, "Response should include exportDate");
    console.assert(data.version !== undefined, "Response should include version");
    
    // Save data for import test
    exportedData = data;
    
    console.log("TC-D-01: PASSED");
    return true;
  } catch (error) {
    console.error("TC-D-01: FAILED", error);
    return false;
  }
};
```

### 3.2 Import Data

```javascript
// Test case TC-D-05: Import valid data
const importData = async () => {
  console.log("Running TC-D-05: Import data");
  
  // Modify exported data slightly to verify changes
  const modifiedData = {
    ...exportedData,
    students: exportedData.students.map(student => ({
      ...student,
      name: student.name + " (Modified)"
    }))
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modifiedData)
    });
    
    const data = await response.json();
    
    // Assertions
    console.assert(response.status === 200, `Expected status 200, got ${response.status}`);
    console.assert(data.message.includes("successfully"), "Response should indicate success");
    console.assert(data.count === modifiedData.students.length, 
      `Expected count ${modifiedData.students.length}, got ${data.count}`);
    
    // Verify data was imported
    const verifyResponse = await fetch(`${API_BASE_URL}/students`);
    const students = await verifyResponse.json();
    
    console.assert(students.length === modifiedData.students.length, 
      `Expected ${modifiedData.students.length} students, got ${students.length}`);
    console.assert(students.some(s => s.name.includes("(Modified)")), 
      "Should find modified student names");
    
    console.log("TC-D-05: PASSED");
    return true;
  } catch (error) {
    console.error("TC-D-05: FAILED", error);
    return false;
  }
};
```

## 4. Performance Test Scripts

### 4.1 Response Time Test

```javascript
// Performance test: Measure API response times
const measureResponseTimes = async (iterations = 10) => {
  console.log(`Running performance test: Measure response times (${iterations} iterations)`);
  
  const endpoints = [
    { name: "Get all students", url: `${API_BASE_URL}/students`, method: 'GET' },
    { name: "Get settings", url: `${API_BASE_URL}/settings`, method: 'GET' },
    { name: "Export data", url: `${API_BASE_URL}/data`, method: 'GET' }
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const response = await fetch(endpoint.url, { method: endpoint.method });
        await response.json();
        
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error(`Error testing ${endpoint.name}:`, error);
      }
    }
    
    // Calculate statistics
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    results[endpoint.name] = {
      average: avg.toFixed(2) + "ms",
      min: min.toFixed(2) + "ms",
      max: max.toFixed(2) + "ms",
      samples: times.length
    };
  }
  
  console.log("Performance test results:", results);
  return results;
};
```

### 4.2 Concurrent Request Test

```javascript
// Performance test: Concurrent requests
const concurrentRequests = async (concurrency = 10) => {
  console.log(`Running performance test: Concurrent requests (${concurrency})`);
  
  const url = `${API_BASE_URL}/students`;
  const start = performance.now();
  
  try {
    // Create array of promises
    const promises = Array(concurrency).fill().map(() => fetch(url).then(res => res.json()));
    
    // Wait for all requests to complete
    await Promise.all(promises);
    
    const end = performance.now();
    const totalTime = end - start;
    const avgTime = totalTime / concurrency;
    
    console.log(`Concurrent requests results:
      Total time: ${totalTime.toFixed(2)}ms
      Average time per request: ${avgTime.toFixed(2)}ms
      Requests per second: ${(1000 / avgTime * concurrency).toFixed(2)}
    `);
    
    return {
      totalTime: totalTime.toFixed(2) + "ms",
      averageTime: avgTime.toFixed(2) + "ms",
      requestsPerSecond: (1000 / avgTime * concurrency).toFixed(2)
    };
  } catch (error) {
    console.error("Concurrent requests test failed:", error);
    return null;
  }
};
```

## 5. Data Migration Test Script

```javascript
// Data migration test
const testDataMigration = async (sourceDataFile) => {
  console.log("Running data migration test");
  
  try {
    // Read source data file
    const sourceData = JSON.parse(fs.readFileSync(sourceDataFile, 'utf8'));
    
    // Import data to KV
    console.log("Importing data to KV...");
    const importResponse = await fetch(`${API_BASE_URL}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sourceData)
    });
    
    const importResult = await importResponse.json();
    console.assert(importResponse.status === 200, 
      `Expected import status 200, got ${importResponse.status}`);
    
    // Export data from KV
    console.log("Exporting data from KV...");
    const exportResponse = await fetch(`${API_BASE_URL}/data`);
    const exportedData = await exportResponse.json();
    
    // Compare data
    console.log("Comparing data...");
    
    // Check student count
    console.assert(exportedData.students.length === sourceData.students.length, 
      `Expected ${sourceData.students.length} students, got ${exportedData.students.length}`);
    
    // Check each student
    for (const sourceStudent of sourceData.students) {
      const exportedStudent = exportedData.students.find(s => s.id === sourceStudent.id);
      console.assert(exportedStudent, `Student ${sourceStudent.id} not found in exported data`);
      
      if (exportedStudent) {
        console.assert(exportedStudent.name === sourceStudent.name, 
          `Expected name ${sourceStudent.name}, got ${exportedStudent.name}`);
        console.assert(exportedStudent.lastReadDate === sourceStudent.lastReadDate, 
          `Expected lastReadDate ${sourceStudent.lastReadDate}, got ${exportedStudent.lastReadDate}`);
        console.assert(exportedStudent.readingSessions.length === sourceStudent.readingSessions.length, 
          `Expected ${sourceStudent.readingSessions.length} sessions, got ${exportedStudent.readingSessions.length}`);
      }
    }
    
    // Check settings
    console.assert(JSON.stringify(exportedData.settings) === JSON.stringify(sourceData.settings), 
      "Settings do not match");
    
    console.log("Data migration test: PASSED");
    return true;
  } catch (error) {
    console.error("Data migration test: FAILED", error);
    return false;
  }
};
```

## 6. Running the Test Suite

```javascript
// Main test runner
const runTests = async () => {
  console.log("Starting API test suite");
  
  // Track test results
  const results = {
    passed: 0,
    failed: 0,
    tests: {}
  };
  
  // Helper to run and track a test
  const runTest = async (name, testFn) => {
    try {
      const result = await testFn();
      results.tests[name] = result ? "PASSED" : "FAILED";
      result ? results.passed++ : results.failed++;
    } catch (error) {
      console.error(`Error running test ${name}:`, error);
      results.tests[name] = "ERROR";
      results.failed++;
    }
  };
  
  // Run student endpoint tests
  await runTest("Get All Students (Empty)", getAllStudentsEmpty);
  await runTest("Create Student", createStudent);
  await runTest("Get Student by ID", getStudentById);
  await runTest("Get Non-existent Student", getNonExistentStudent);
  await runTest("Update Student", updateStudent);
  await runTest("Add Reading Session", addReadingSession);
  await runTest("Delete Student", deleteStudent);
  await runTest("Bulk Import Students", bulkImportStudents);
  
  // Run settings endpoint tests
  await runTest("Get Settings", getSettings);
  await runTest("Update Settings", updateSettings);
  
  // Run data import/export tests
  await runTest("Export Data", exportData);
  await runTest("Import Data", importData);
  
  // Run performance tests
  await runTest("Response Time Measurement", () => measureResponseTimes(5));
  await runTest("Concurrent Requests", () => concurrentRequests(5));
  
  // Print summary
  console.log("\n=== Test Summary ===");
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log("\nDetailed Results:");
  
  for (const [test, result] of Object.entries(results.tests)) {
    console.log(`${test}: ${result}`);
  }
  
  return results;
};

// Run the tests
runTests().then(results => {
  console.log("Test suite completed");
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
});
```

## Using These Scripts

These test scripts can be:

1. Saved as a Node.js file and executed directly
2. Imported into a test framework like Jest or Mocha
3. Adapted for use in Postman collections
4. Converted to curl commands for manual testing

To run as a standalone Node.js script:

```bash
# Install dependencies
npm install node-fetch

# Run the tests
node api-tests.js
```

For automated CI/CD integration, these tests can be incorporated into your pipeline to validate the Cloudflare Worker deployment before switching production traffic to it.