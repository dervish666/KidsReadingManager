/**
 * API Test Script for Kids Reading Manager Cloudflare Worker
 * 
 * This script tests the API endpoints of the Kids Reading Manager Cloudflare Worker.
 * It can be used to verify that the API is working correctly after deployment.
 * 
 * Usage:
 * 1. Set the API_URL to the URL of your deployed Worker
 * 2. Run the script: node scripts/test-api.js
 */

const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:8787/api';

// Test data
const testStudent = {
  name: `Test Student ${new Date().toISOString()}`,
  lastReadDate: null,
  readingSessions: []
};

const testSettings = {
  readingStatusSettings: {
    recentlyReadDays: 10,
    needsAttentionDays: 20
  }
};

/**
 * Run API tests
 */
async function runTests() {
  console.log(`Testing API at ${API_URL}...`);
  
  try {
    // Test health check
    console.log('\n--- Testing Health Check ---');
    await testHealthCheck();
    
    // Test students endpoints
    console.log('\n--- Testing Students Endpoints ---');
    const studentId = await testStudentsEndpoints();
    
    // Test settings endpoints
    console.log('\n--- Testing Settings Endpoints ---');
    await testSettingsEndpoints();
    
    // Test data endpoints
    console.log('\n--- Testing Data Endpoints ---');
    await testDataEndpoints();
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\nTests failed:', error);
    process.exit(1);
  }
}

/**
 * Test health check endpoint
 */
async function testHealthCheck() {
  const response = await fetch(API_URL.replace('/api', ''));
  
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('Health check response:', data);
}

/**
 * Test students endpoints
 * @returns {Promise<string>} - ID of created student
 */
async function testStudentsEndpoints() {
  // Get all students
  console.log('Testing GET /students...');
  const getResponse = await fetch(`${API_URL}/students`);
  
  if (!getResponse.ok) {
    throw new Error(`GET /students failed: ${getResponse.status} ${getResponse.statusText}`);
  }
  
  const students = await getResponse.json();
  console.log(`Found ${students.length} students`);
  
  // Create a student
  console.log('Testing POST /students...');
  const createResponse = await fetch(`${API_URL}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testStudent)
  });
  
  if (!createResponse.ok) {
    throw new Error(`POST /students failed: ${createResponse.status} ${createResponse.statusText}`);
  }
  
  const createdStudent = await createResponse.json();
  console.log('Created student:', createdStudent);
  
  // Update the student
  console.log(`Testing PUT /students/${createdStudent.id}...`);
  const updatedStudent = {
    ...createdStudent,
    name: `${createdStudent.name} (Updated)`
  };
  
  const updateResponse = await fetch(`${API_URL}/students/${createdStudent.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedStudent)
  });
  
  if (!updateResponse.ok) {
    throw new Error(`PUT /students/${createdStudent.id} failed: ${updateResponse.status} ${updateResponse.statusText}`);
  }
  
  const updatedStudentResponse = await updateResponse.json();
  console.log('Updated student:', updatedStudentResponse);
  
  // Delete the student
  console.log(`Testing DELETE /students/${createdStudent.id}...`);
  const deleteResponse = await fetch(`${API_URL}/students/${createdStudent.id}`, {
    method: 'DELETE'
  });
  
  if (!deleteResponse.ok) {
    throw new Error(`DELETE /students/${createdStudent.id} failed: ${deleteResponse.status} ${deleteResponse.statusText}`);
  }
  
  const deleteResult = await deleteResponse.json();
  console.log('Delete result:', deleteResult);
  
  // Test bulk import
  console.log('Testing POST /students/bulk...');
  const bulkStudents = [
    {
      id: uuidv4(),
      name: `Bulk Student 1 ${new Date().toISOString()}`,
      lastReadDate: null,
      readingSessions: []
    },
    {
      id: uuidv4(),
      name: `Bulk Student 2 ${new Date().toISOString()}`,
      lastReadDate: null,
      readingSessions: []
    }
  ];
  
  const bulkResponse = await fetch(`${API_URL}/students/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bulkStudents)
  });
  
  if (!bulkResponse.ok) {
    throw new Error(`POST /students/bulk failed: ${bulkResponse.status} ${bulkResponse.statusText}`);
  }
  
  const bulkResult = await bulkResponse.json();
  console.log(`Imported ${bulkResult.length} students`);
  
  return createdStudent.id;
}

/**
 * Test settings endpoints
 */
async function testSettingsEndpoints() {
  // Get settings
  console.log('Testing GET /settings...');
  const getResponse = await fetch(`${API_URL}/settings`);
  
  if (!getResponse.ok) {
    throw new Error(`GET /settings failed: ${getResponse.status} ${getResponse.statusText}`);
  }
  
  const settings = await getResponse.json();
  console.log('Current settings:', settings);
  
  // Update settings
  console.log('Testing POST /settings...');
  const updateResponse = await fetch(`${API_URL}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testSettings)
  });
  
  if (!updateResponse.ok) {
    throw new Error(`POST /settings failed: ${updateResponse.status} ${updateResponse.statusText}`);
  }
  
  const updatedSettings = await updateResponse.json();
  console.log('Updated settings:', updatedSettings);
}

/**
 * Test data endpoints
 */
async function testDataEndpoints() {
  // Get all data
  console.log('Testing GET /data...');
  const getResponse = await fetch(`${API_URL}/data`);
  
  if (!getResponse.ok) {
    throw new Error(`GET /data failed: ${getResponse.status} ${getResponse.statusText}`);
  }
  
  const data = await getResponse.json();
  console.log(`Exported data with ${data.students.length} students`);
  
  // Import data (using the same data we just exported)
  console.log('Testing POST /data...');
  const importResponse = await fetch(`${API_URL}/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!importResponse.ok) {
    throw new Error(`POST /data failed: ${importResponse.status} ${importResponse.statusText}`);
  }
  
  const importResult = await importResponse.json();
  console.log('Import result:', importResult);
}

// Run the tests
runTests();