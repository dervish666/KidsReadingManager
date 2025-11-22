// Use native fetch if available (Node 18+), otherwise try to require it
const fetch = globalThis.fetch || require('node-fetch');

const API_URL = 'http://localhost:3000/api';

async function testUpdateBook() {
  try {
    // 1. Create a book
    console.log('Creating test book...');
    const createRes = await fetch(`${API_URL}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Book for Author Update',
        author: null
      })
    });
    
    if (!createRes.ok) {
      throw new Error(`Failed to create book: ${createRes.status}`);
    }
    
    const book = await createRes.json();
    console.log('Created book:', book);

    // 2. Update the book with an author
    console.log('Updating book author...');
    const updateRes = await fetch(`${API_URL}/books/${book.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...book,
        author: 'Updated Author'
      })
    });

    if (!updateRes.ok) {
      throw new Error(`Failed to update book: ${updateRes.status}`);
    }

    const updatedBook = await updateRes.json();
    console.log('Updated book response:', updatedBook);

    // 3. Verify update
    if (updatedBook.author === 'Updated Author') {
      console.log('SUCCESS: Book author updated correctly.');
    } else {
      console.error('FAILURE: Book author NOT updated.');
    }

    // 4. Cleanup
    console.log('Cleaning up...');
    await fetch(`${API_URL}/books/${book.id}`, { method: 'DELETE' });

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testUpdateBook();