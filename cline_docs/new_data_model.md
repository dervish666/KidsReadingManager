# Enhanced Data Model for Kids Reading Manager

This document outlines the proposed new data model to support enhanced features including school/home reading tracking, student reading preferences, and a book recommendation system.

## 1. High-Level Changes

The new data model introduces two new top-level entities: `books` and `genres`. It also significantly extends the `students` and `readingSessions` objects to capture more detailed information.

The new structure will be:

```json
{
  "settings": { ... },
  "students": [ ... ],
  "classes": [ ... ],
  "books": [ ... ],
  "genres": [ ... ]
}
```

## 2. Data Structure Definitions

### 2.1. `books` (New)

A new top-level array to store information about each book.

```json
{
  "books": [
    {
      "id": "book_UUID",
      "title": "The Gruffalo",
      "author": "Julia Donaldson",
      "genreIds": ["genre_UUID_fiction", "genre_UUID_picture_book"],
      "ageRange": "3-7"
    }
  ]
}
```

### 2.2. `genres` (New)

A new top-level array to store predefined and user-defined genres.

```json
{
  "genres": [
    {
      "id": "genre_UUID_fiction",
      "name": "Fiction",
      "isPredefined": true
    },
    {
      "id": "genre_UUID_dinosaurs",
      "name": "Dinosaurs",
      "isPredefined": false
    }
  ]
}
```

### 2.3. `students` (Extended)

The `students` object will be extended to include a `preferences` object.

```json
{
  "students": [
    {
      "id": "student_UUID",
      "name": "Student Name",
      "classId": "class_UUID",
      "preferences": {
        "favoriteGenreIds": ["genre_UUID_dinosaurs"],
        "likes": ["Monsters", "Magic"],
        "dislikes": ["Scary stories"]
      },
      "readingSessions": [ ... ]
    }
  ]
}
```

### 2.4. `readingSessions` (Extended)

The `readingSessions` object within each student will be extended to track the book read and the location.

```json
{
  "readingSessions": [
    {
      "id": "session_UUID",
      "date": "YYYY-MM-DD",
      "bookId": "book_UUID",
      "location": "school", // "school" or "home"
      "assessment": "independent", // "independent", "needs-help", "struggling"
      "notes": "Read the first half of the book."
    }
  ]
}
```

### 2.5. `classes` (Extended)

The `classes` object will be extended to include the `schoolYear`.

```json
{
  "classes": [
    {
      "id": "class_UUID",
      "name": "Class A",
      "schoolYear": "Year 3"
    }
  ]
}
```

## 3. Entity Relationship Diagram

The following diagram illustrates the relationships between the main data entities.

```mermaid
erDiagram
    STUDENT ||--o{ READING_SESSION : has
    STUDENT ||--|{ PREFERENCE : has
    PREFERENCE }o--|| GENRE : likes
    READING_SESSION }o--|| BOOK : logs
    BOOK }o--|| GENRE : belongs to
    CLASS ||--o{ STUDENT : contains

    STUDENT {
        string id
        string name
        string classId
    }

    PREFERENCE {
        string studentId
        array favoriteGenreIds
        array likes
        array dislikes
    }

    READING_SESSION {
        string id
        string date
        string bookId
        string location
        string assessment
        string notes
    }

    BOOK {
        string id
        string title
        string author
        array genreIds
        string ageRange
    }

    GENRE {
        string id
        string name
        boolean isPredefined
    }

    CLASS {
        string id
        string name
        string schoolYear
    }