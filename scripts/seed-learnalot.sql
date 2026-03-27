-- ============================================================
-- Seed Data: Learnalot School (enriching existing data)
-- ============================================================
-- Adds realistic reading activity to the existing Learnalot School.
-- Uses existing org, users, classes, and book library.
--
-- Run: npx wrangler d1 execute reading-manager-db --remote --file=scripts/seed-learnalot.sql
--
-- Existing org: 3780f673-74e1-4252-91b5-777c9de2760d
-- Existing users: bc3a54f9 (Sam/owner), cba7de46 (Demo/teacher), 1ddd90a3 (Test/teacher)
-- Existing classes: 49f7bf8b (Year 2/2025), 2e9c8fc5 (Year 2/2026), 5f9ab747 (Year 3/2026)

-- ============================================================
-- 1. ENRICH EXISTING STUDENTS with fuller names, reading levels, year groups
-- ============================================================

-- Year 2 class (2025, Miss Teach) — 6 students
UPDATE students SET name = 'Ben Carter',       reading_level_min = 1.0, reading_level_max = 2.0, year_group = 'Year 2', age_range = '6-7', notes = 'Enjoys Oxford Reading Tree, reads steadily',  gender = 'Male'   WHERE id = '882a9032-75eb-4f3a-be2f-fbbe8b278427';
UPDATE students SET name = 'Bert Holloway',    reading_level_min = 0.8, reading_level_max = 1.5, year_group = 'Year 2', age_range = '6-7', notes = 'SEN support, uses reading ruler',              gender = 'Male',   sen_status = 'SEN Support' WHERE id = '74ee5776-f34f-466d-91a7-db7c771634c7';
UPDATE students SET name = 'Bob Marshall',     reading_level_min = 1.0, reading_level_max = 2.0, year_group = 'Year 2', age_range = '6-7', notes = 'Likes animal stories',                         gender = 'Male'   WHERE id = '38f9c55b-cc51-4cba-973d-25b808c4cf01';
UPDATE students SET name = 'Charlotte Ainsworth', reading_level_min = 1.5, reading_level_max = 3.4, year_group = 'Year 2', age_range = '6-7', notes = 'Strong reader, already on chapter books', gender = 'Female' WHERE id = '946db048-9e7a-4012-9a04-6f5597ed4521';
UPDATE students SET name = 'Julio Reyes',      reading_level_min = 0.8, reading_level_max = 1.5, year_group = 'Year 2', age_range = '6-7', notes = 'EAL student, growing confidence',              gender = 'Male',   eal_status = 'EAL', first_language = 'Spanish' WHERE id = '2fa35e31-6b03-491b-90b7-81c196292801';
UPDATE students SET name = 'William Frost',    reading_level_min = 1.0, reading_level_max = 2.0, year_group = 'Year 2', age_range = '6-7', notes = 'Enjoys funny stories, Horrid Henry fan',       gender = 'Male'   WHERE id = '160869a0-7bbb-452e-b7dd-00d560557b45';

-- Year 2 class (2026, Mr Teach) — 4 students
UPDATE students SET name = 'Ben Okafor',       reading_level_min = 1.0, reading_level_max = 2.0, year_group = 'Year 2', age_range = '6-7', notes = 'Keen reader, loves non-fiction',               gender = 'Male'   WHERE id = '2ba89c96-783c-4ddd-ba3e-78763b54a1b1';
UPDATE students SET name = 'Bert Singh',       reading_level_min = 0.8, reading_level_max = 1.5, year_group = 'Year 2', age_range = '6-7', notes = 'Prefers picture books, gaining confidence',     gender = 'Male'   WHERE id = '7ca9a1d2-6a65-45c3-b04a-234e0d012355';
UPDATE students SET name = 'John Fletcher',    reading_level_min = 1.2, reading_level_max = 2.2, year_group = 'Year 2', age_range = '6-7', notes = 'Enjoys adventure stories',                     gender = 'Male'   WHERE id = '07742190-4b2f-46cc-954a-96cda40ff947';
UPDATE students SET name = 'Katie Brennan',    reading_level_min = 1.5, reading_level_max = 2.5, year_group = 'Year 2', age_range = '6-7', notes = 'Very enthusiastic reader, good comprehension', gender = 'Female' WHERE id = '8fcf70a2-7824-49be-af40-50b0255a403f';

-- ============================================================
-- 2. ADD NEW STUDENTS to Year 3 (empty) and Year 2 (2026, only 4)
-- ============================================================

-- Extra students for Year 2 (2026, Mr Teach)
INSERT OR IGNORE INTO students (id, organization_id, class_id, name, reading_level_min, reading_level_max, year_group, age_range, notes, is_active, gender, created_at, updated_at)
VALUES
  ('stu-la-n01', '3780f673-74e1-4252-91b5-777c9de2760d', '2e9c8fc5-5a6c-471f-adf4-caf29ce64626', 'Amira Patel',     1.0, 2.0, 'Year 2', '6-7', 'Enjoys fairy tales',              1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n02', '3780f673-74e1-4252-91b5-777c9de2760d', '2e9c8fc5-5a6c-471f-adf4-caf29ce64626', 'Oscar Whitfield',  0.8, 1.5, 'Year 2', '6-7', 'Reluctant reader, likes sport',   1, 'Male',   '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z');

-- Year 3 students (Mr Learnalot)
INSERT OR IGNORE INTO students (id, organization_id, class_id, name, reading_level_min, reading_level_max, year_group, age_range, notes, is_active, gender, created_at, updated_at)
VALUES
  ('stu-la-n03', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Isla McGregor',    2.0, 3.5, 'Year 3', '7-8', 'Avid reader, gets through a book a week',        1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n04', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Marcus Johnson',   2.0, 3.0, 'Year 3', '7-8', 'Loves graphic novels and comics',                1, 'Male',   '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n05', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Priya Sharma',     2.5, 3.5, 'Year 3', '7-8', 'Very strong reader, enjoys mystery stories',     1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n06', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Dylan Thomas',     1.8, 2.8, 'Year 3', '7-8', 'Enjoys humour, Mr Men fan',                      1, 'Male',   '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n07', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Sophie Williams',  2.0, 3.0, 'Year 3', '7-8', 'Steady reader, good at phonics',                 1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n08', '3780f673-74e1-4252-91b5-777c9de2760d', '5f9ab747-2bd4-458d-9968-a10046fa4eb6', 'Alfie Cooper',     1.5, 2.5, 'Year 3', '7-8', 'Pupil premium, responds to sports stories',      1, 'Male',   '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z');

UPDATE students SET pupil_premium = 1 WHERE id = 'stu-la-n08';

-- ============================================================
-- 3. ADD A YEAR 4 CLASS with students
-- ============================================================
INSERT OR IGNORE INTO classes (id, organization_id, name, year_group, teacher_id, teacher_name, academic_year, is_active, disabled, created_at, updated_at)
VALUES ('cls-la-y4', '3780f673-74e1-4252-91b5-777c9de2760d', 'Year 4', 'Year 4', 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', 'Demo', '2026', 1, 0, '2025-09-01T09:00:00Z', '2025-09-01T09:00:00Z');

INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at)
VALUES ('ca-la-y4', 'cls-la-y4', 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2025-09-01T09:00:00Z');

INSERT OR IGNORE INTO students (id, organization_id, class_id, name, reading_level_min, reading_level_max, year_group, age_range, notes, is_active, gender, created_at, updated_at)
VALUES
  ('stu-la-n09', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Ethan Brooks',     3.5, 5.0, 'Year 4', '8-9', 'Loves Beast Quest, reads constantly',    1, 'Male',   '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n10', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Grace Adeyemi',    3.0, 4.5, 'Year 4', '8-9', 'Enjoys historical fiction, thoughtful',  1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n11', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Leo Chen',         3.0, 4.5, 'Year 4', '8-9', 'Prefers non-fiction, building confidence', 1, 'Male', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n12', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Ruby Fitzgerald',  4.0, 5.5, 'Year 4', '8-9', 'Exceptional reader, recommends books',   1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n13', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Harley Scott',     2.5, 3.5, 'Year 4', '8-9', 'Pupil premium, improving since book club', 1, 'Male', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z'),
  ('stu-la-n14', '3780f673-74e1-4252-91b5-777c9de2760d', 'cls-la-y4', 'Maisie Taylor',    3.5, 5.0, 'Year 4', '8-9', 'Reads every evening, loves adventure',   1, 'Female', '2025-09-05T09:00:00Z', '2026-03-25T08:00:00Z');

UPDATE students SET pupil_premium = 1 WHERE id = 'stu-la-n13';

-- ============================================================
-- 4. READING SESSIONS (March 2026 — bringing everyone up to date)
-- ============================================================
-- Uses books already in the Learnalot library.
-- Book IDs from existing org_book_selections:
--   0e49ddec = The Scarf (1.1)
--   dd77c644 = Hen's Pens (1.1)
--   b0896763 = Seal at the Wheel (1.5)
--   9581988d = George and the New Craze (1.6)
--   b547a57d = Maisy, Charley, and the Wobbly Tooth (1.7)
--   ef5ca597 = The Tortoise and the Baboon (1.7)
--   46b4e96c = Clementine's Smile (2.1)
--   506d2c7f = A Home for Bonnie (2.2)
--   5d863304 = The Giant Postman (2.6)
--   c566c73c = Dustbin (2.6)
--   059db4c1 = Treasure Hunt (2.7)
--   22124627 = Horrid Henry Meets the Queen (2.9)
--   c2d6bdb8 = The Emergency (3.0)
--   cf723a61 = Buzz and Bingo in the Starry Sky (3.1)
--   582233cc = Mr. Christmas (3.1)
--   ec0cea98 = The Gizmos' Party (3.1)
--   cbb94d46 = Sorted! (3.5)
--   ab3f2ecf = The Nowhere Boy (3.8)
--   d6a2f26a = Komodo the Lizard King (4.6)
--   49015442 = The Camel Fair (4.7)
--   331eb8a1 = The Enemies of Jupiter (4.8)
--   12628795 = I Believe in Unicorns (4.8)
--   ee6a4267 = Krabb, Master of the Sea (4.8)
--   da008ce3 = Even More Terrible Tudors (5.5)
--   504fa816 = In the Mouth of the Wolf (5.8)

INSERT OR IGNORE INTO reading_sessions (id, student_id, book_id, book_title, session_date, duration_minutes, pages_read, assessment, notes, rating, recorded_by, created_at) VALUES

-- ── YEAR 2 (2025 class, Miss Teach) ────────────────────────

-- Ben Carter: steady reader, picking up again in March
('rs-la-101', '882a9032-75eb-4f3a-be2f-fbbe8b278427', 'b547a57d-7b48-4cce-b36f-91855e8c5623', 'Maisy, Charley, and the Wobbly Tooth', '2026-03-02', 15, 8, 6, 'Back after half term', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-102', '882a9032-75eb-4f3a-be2f-fbbe8b278427', 'b547a57d-7b48-4cce-b36f-91855e8c5623', 'Maisy, Charley, and the Wobbly Tooth', '2026-03-04', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-103', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-09', 15, 8, 7, 'Good expression', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-104', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-11', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-105', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-16', 20, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-106', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-18', 15, 8, 7, 'Enjoyed the animal theme', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-107', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-23', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-108', '882a9032-75eb-4f3a-be2f-fbbe8b278427', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-25', 20, 12, 8, 'Really improving', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Bert Holloway: SEN, careful progress
('rs-la-109', '74ee5776-f34f-466d-91a7-db7c771634c7', '0e49ddec-0187-4c7e-823d-970cb0c0a1e4', 'The Scarf', '2026-03-05', 10, 4, 5, '1:1 session, used reading ruler', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-110', '74ee5776-f34f-466d-91a7-db7c771634c7', '0e49ddec-0187-4c7e-823d-970cb0c0a1e4', 'The Scarf', '2026-03-10', 10, 5, 5, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-111', '74ee5776-f34f-466d-91a7-db7c771634c7', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-17', 10, 6, 5, 'Decoded new words well', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-17T15:30:00Z'),
('rs-la-112', '74ee5776-f34f-466d-91a7-db7c771634c7', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-24', 10, 6, 6, 'Good effort, read a full page alone!', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-24T15:30:00Z'),

-- Bob Marshall: regular, animal stories
('rs-la-113', '38f9c55b-cc51-4cba-973d-25b808c4cf01', 'ef5ca597-efa3-463e-b1ab-c293877c15dd', 'The Tortoise and the Baboon', '2026-03-02', 15, 8, 6, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-114', '38f9c55b-cc51-4cba-973d-25b808c4cf01', 'ef5ca597-efa3-463e-b1ab-c293877c15dd', 'The Tortoise and the Baboon', '2026-03-05', 15, 10, 7, 'Loved the animals', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-115', '38f9c55b-cc51-4cba-973d-25b808c4cf01', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-10', 15, 8, 7, 'Funny book, engaged well', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-116', '38f9c55b-cc51-4cba-973d-25b808c4cf01', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-12', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-117', '38f9c55b-cc51-4cba-973d-25b808c4cf01', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-17', 20, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-17T15:30:00Z'),
('rs-la-118', '38f9c55b-cc51-4cba-973d-25b808c4cf01', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-19', 15, 8, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-119', '38f9c55b-cc51-4cba-973d-25b808c4cf01', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-24', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-24T15:30:00Z'),
('rs-la-120', '38f9c55b-cc51-4cba-973d-25b808c4cf01', '506d2c7f-609c-4e95-8fcc-f66a9acd3c59', 'A Home for Bonnie', '2026-03-25', 20, 12, 8, 'Great session', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Charlotte Ainsworth: strong reader, ploughing through books
('rs-la-121', '946db048-9e7a-4012-9a04-6f5597ed4521', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-02', 20, 14, 8, 'Finished this quickly', 4, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-122', '946db048-9e7a-4012-9a04-6f5597ed4521', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-04', 20, 16, 8, 'Started new book, very keen', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-123', '946db048-9e7a-4012-9a04-6f5597ed4521', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-05', 25, 18, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-124', '946db048-9e7a-4012-9a04-6f5597ed4521', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-09', 20, 14, 9, 'Excellent expression reading aloud', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-125', '946db048-9e7a-4012-9a04-6f5597ed4521', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-11', 25, 18, 9, 'Laughing all the way through', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-126', '946db048-9e7a-4012-9a04-6f5597ed4521', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-12', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-127', '946db048-9e7a-4012-9a04-6f5597ed4521', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-16', 25, 20, 9, 'Finished! Wants more Horrid Henry', 5, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-128', '946db048-9e7a-4012-9a04-6f5597ed4521', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-18', 20, 14, 8, 'Trying a new genre', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-129', '946db048-9e7a-4012-9a04-6f5597ed4521', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-19', 25, 18, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-130', '946db048-9e7a-4012-9a04-6f5597ed4521', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-23', 20, 16, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-131', '946db048-9e7a-4012-9a04-6f5597ed4521', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-25', 25, 20, 9, 'Star reader this term', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Julio Reyes: EAL, improving but gaps
('rs-la-132', '2fa35e31-6b03-491b-90b7-81c196292801', '0e49ddec-0187-4c7e-823d-970cb0c0a1e4', 'The Scarf', '2026-03-03', 10, 6, 5, 'Vocabulary support needed', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-03T15:30:00Z'),
('rs-la-133', '2fa35e31-6b03-491b-90b7-81c196292801', '0e49ddec-0187-4c7e-823d-970cb0c0a1e4', 'The Scarf', '2026-03-10', 10, 8, 5, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-134', '2fa35e31-6b03-491b-90b7-81c196292801', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-17', 10, 6, 6, 'More confident today', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-17T15:30:00Z'),
('rs-la-135', '2fa35e31-6b03-491b-90b7-81c196292801', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-24', 15, 8, 6, 'Used picture clues well', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-24T15:30:00Z'),

-- William Frost: Horrid Henry fan, regular
('rs-la-136', '160869a0-7bbb-452e-b7dd-00d560557b45', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-02', 15, 10, 7, 'Chose this from the shelf himself', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-137', '160869a0-7bbb-452e-b7dd-00d560557b45', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-04', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-138', '160869a0-7bbb-452e-b7dd-00d560557b45', '22124627-0df3-4068-8cfc-ef6519e4e275', 'Horrid Henry Meets the Queen', '2026-03-09', 20, 14, 7, 'Really enjoying this', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-139', '160869a0-7bbb-452e-b7dd-00d560557b45', '9581988d-ffde-4c55-85c7-e19695d254ac', 'George and the New Craze', '2026-03-11', 15, 10, 7, 'Trying something different', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-140', '160869a0-7bbb-452e-b7dd-00d560557b45', '9581988d-ffde-4c55-85c7-e19695d254ac', 'George and the New Craze', '2026-03-16', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-141', '160869a0-7bbb-452e-b7dd-00d560557b45', '9581988d-ffde-4c55-85c7-e19695d254ac', 'George and the New Craze', '2026-03-18', 20, 14, 8, 'Good session', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-142', '160869a0-7bbb-452e-b7dd-00d560557b45', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-23', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-143', '160869a0-7bbb-452e-b7dd-00d560557b45', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-25', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- ── YEAR 2 (2026 class, Mr Teach) ──────────────────────────

-- Ben Okafor: keen reader
('rs-la-144', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '5c857eac-e897-47d7-935a-dbf258334508', 'A Hot Surprise', '2026-03-04', 15, 8, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-04T15:30:00Z'),
('rs-la-145', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '5c857eac-e897-47d7-935a-dbf258334508', 'A Hot Surprise', '2026-03-05', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-05T15:30:00Z'),
('rs-la-146', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '59c71260-4739-445a-bf12-7588fa0de9e2', 'The Frog under the Tree', '2026-03-09', 15, 8, 7, 'Good comprehension', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-09T15:30:00Z'),
('rs-la-147', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '59c71260-4739-445a-bf12-7588fa0de9e2', 'The Frog under the Tree', '2026-03-11', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-11T15:30:00Z'),
('rs-la-148', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-16', 20, 12, 8, 'Excellent reading', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-16T15:30:00Z'),
('rs-la-149', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-18', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-18T15:30:00Z'),
('rs-la-150', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-23', 15, 10, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-23T15:30:00Z'),
('rs-la-151', '2ba89c96-783c-4ddd-ba3e-78763b54a1b1', 'ef5ca597-efa3-463e-b1ab-c293877c15dd', 'The Tortoise and the Baboon', '2026-03-25', 20, 12, 8, 'Really engaged', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-25T15:30:00Z'),

-- Bert Singh: gaining confidence
('rs-la-152', '7ca9a1d2-6a65-45c3-b04a-234e0d012355', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-05', 10, 5, 5, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-05T15:30:00Z'),
('rs-la-153', '7ca9a1d2-6a65-45c3-b04a-234e0d012355', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-11', 10, 6, 5, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-11T15:30:00Z'),
('rs-la-154', '7ca9a1d2-6a65-45c3-b04a-234e0d012355', '0e49ddec-0187-4c7e-823d-970cb0c0a1e4', 'The Scarf', '2026-03-18', 10, 6, 6, 'Finished the book, well done!', 3, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-18T15:30:00Z'),
('rs-la-155', '7ca9a1d2-6a65-45c3-b04a-234e0d012355', 'b0896763-9907-4460-8715-3981a5ec0166', 'Seal at the Wheel', '2026-03-24', 10, 5, 6, 'Chose this himself', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-24T15:30:00Z'),

-- John Fletcher: adventure lover
('rs-la-156', '07742190-4b2f-46cc-954a-96cda40ff947', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-04', 15, 10, 7, 'Loved the treasure theme', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-04T15:30:00Z'),
('rs-la-157', '07742190-4b2f-46cc-954a-96cda40ff947', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-09', 15, 12, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-09T15:30:00Z'),
('rs-la-158', '07742190-4b2f-46cc-954a-96cda40ff947', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-11', 20, 14, 8, 'Read independently', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-11T15:30:00Z'),
('rs-la-159', '07742190-4b2f-46cc-954a-96cda40ff947', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-16', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-16T15:30:00Z'),
('rs-la-160', '07742190-4b2f-46cc-954a-96cda40ff947', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-18', 15, 12, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-18T15:30:00Z'),
('rs-la-161', '07742190-4b2f-46cc-954a-96cda40ff947', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-23', 20, 14, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-23T15:30:00Z'),
('rs-la-162', '07742190-4b2f-46cc-954a-96cda40ff947', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-25', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-25T15:30:00Z'),

-- Katie Brennan: enthusiastic reader
('rs-la-163', '8fcf70a2-7824-49be-af40-50b0255a403f', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-03', 15, 10, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-03T15:30:00Z'),
('rs-la-164', '8fcf70a2-7824-49be-af40-50b0255a403f', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-05', 20, 14, 8, 'Great fluency', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-05T15:30:00Z'),
('rs-la-165', '8fcf70a2-7824-49be-af40-50b0255a403f', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-09', 20, 16, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-09T15:30:00Z'),
('rs-la-166', '8fcf70a2-7824-49be-af40-50b0255a403f', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-10', 15, 12, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-10T15:30:00Z'),
('rs-la-167', '8fcf70a2-7824-49be-af40-50b0255a403f', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-12', 20, 16, 9, 'Finished! Excellent', 5, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-12T15:30:00Z'),
('rs-la-168', '8fcf70a2-7824-49be-af40-50b0255a403f', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-16', 15, 12, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-16T15:30:00Z'),
('rs-la-169', '8fcf70a2-7824-49be-af40-50b0255a403f', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-18', 20, 16, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-18T15:30:00Z'),
('rs-la-170', '8fcf70a2-7824-49be-af40-50b0255a403f', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-19', 15, 12, 8, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-19T15:30:00Z'),
('rs-la-171', '8fcf70a2-7824-49be-af40-50b0255a403f', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-23', 20, 16, 9, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-23T15:30:00Z'),
('rs-la-172', '8fcf70a2-7824-49be-af40-50b0255a403f', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-25', 20, 14, 9, 'Brilliant this term', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-25T15:30:00Z'),

-- Amira Patel (new): fairy tales
('rs-la-173', 'stu-la-n01', 'b547a57d-7b48-4cce-b36f-91855e8c5623', 'Maisy, Charley, and the Wobbly Tooth', '2026-03-05', 15, 8, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-05T15:30:00Z'),
('rs-la-174', 'stu-la-n01', 'b547a57d-7b48-4cce-b36f-91855e8c5623', 'Maisy, Charley, and the Wobbly Tooth', '2026-03-10', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-10T15:30:00Z'),
('rs-la-175', 'stu-la-n01', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-16', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-16T15:30:00Z'),
('rs-la-176', 'stu-la-n01', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-19', 20, 12, 8, 'Loved this story', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-19T15:30:00Z'),
('rs-la-177', 'stu-la-n01', '46b4e96c-ca0b-4c4f-8545-13bd383ac6ce', 'Clementine''s Smile', '2026-03-23', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-23T15:30:00Z'),
('rs-la-178', 'stu-la-n01', 'ef5ca597-efa3-463e-b1ab-c293877c15dd', 'The Tortoise and the Baboon', '2026-03-25', 15, 10, 7, NULL, NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-25T15:30:00Z'),

-- Oscar Whitfield (new): reluctant, sport-focused
('rs-la-179', 'stu-la-n02', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-10', 10, 4, 4, 'Reluctant start', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-10T15:30:00Z'),
('rs-la-180', 'stu-la-n02', 'dd77c644-32d6-4363-83a3-cf51ae5854df', 'Hen''s Pens', '2026-03-19', 10, 6, 5, 'Better today', NULL, '1ddd90a3-7e95-4f21-876e-9d1d8edf93f2', '2026-03-19T15:30:00Z'),

-- ── YEAR 3 (Mr Learnalot) ──────────────────────────────────

-- Isla McGregor: avid reader
('rs-la-181', 'stu-la-n03', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-02', 20, 14, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-182', 'stu-la-n03', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-04', 20, 16, 8, 'Brilliant fluency', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-183', 'stu-la-n03', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-05', 25, 18, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-184', 'stu-la-n03', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-09', 20, 14, 8, 'Started new book', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-185', 'stu-la-n03', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-11', 25, 18, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-186', 'stu-la-n03', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-12', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-187', 'stu-la-n03', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-16', 25, 18, 9, 'Challenging but enjoying it', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-188', 'stu-la-n03', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-18', 20, 14, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-189', 'stu-la-n03', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-19', 25, 20, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-190', 'stu-la-n03', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-23', 20, 16, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-191', 'stu-la-n03', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-25', 25, 18, 9, 'Outstanding reader', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Marcus Johnson: comic/graphic fan
('rs-la-192', 'stu-la-n04', 'ec0cea98-2be9-498b-961d-256866d1c4e5', 'The Gizmos'' Party', '2026-03-04', 15, 12, 6, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-193', 'stu-la-n04', 'ec0cea98-2be9-498b-961d-256866d1c4e5', 'The Gizmos'' Party', '2026-03-09', 15, 14, 7, 'Loved the illustrations', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-194', 'stu-la-n04', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-12', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-195', 'stu-la-n04', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-18', 20, 14, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-196', 'stu-la-n04', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-23', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-197', 'stu-la-n04', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-25', 20, 14, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Priya Sharma: strong reader, mystery
('rs-la-198', 'stu-la-n05', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-02', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-199', 'stu-la-n05', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-04', 25, 20, 9, 'Excellent inference skills', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-200', 'stu-la-n05', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-05', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-201', 'stu-la-n05', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-09', 25, 18, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-202', 'stu-la-n05', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-11', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-203', 'stu-la-n05', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-16', 25, 20, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-204', 'stu-la-n05', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-18', 20, 14, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-205', 'stu-la-n05', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-23', 25, 18, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-206', 'stu-la-n05', 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8', 'The Emergency', '2026-03-25', 20, 16, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Dylan Thomas: humour fan, occasional
('rs-la-207', 'stu-la-n06', '582233cc-a725-4c83-a1e4-350cfeca3904', 'Mr. Christmas', '2026-03-05', 15, 10, 6, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-208', 'stu-la-n06', '582233cc-a725-4c83-a1e4-350cfeca3904', 'Mr. Christmas', '2026-03-12', 15, 12, 6, 'Giggly but engaged', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-209', 'stu-la-n06', 'ec0cea98-2be9-498b-961d-256866d1c4e5', 'The Gizmos'' Party', '2026-03-19', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-210', 'stu-la-n06', 'ec0cea98-2be9-498b-961d-256866d1c4e5', 'The Gizmos'' Party', '2026-03-25', 20, 14, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Sophie Williams: steady
('rs-la-211', 'stu-la-n07', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-03', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-03T15:30:00Z'),
('rs-la-212', 'stu-la-n07', 'c566c73c-16d0-41ee-8ac5-b9c249ea299d', 'Dustbin', '2026-03-05', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-213', 'stu-la-n07', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-10', 20, 14, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-214', 'stu-la-n07', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-12', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-215', 'stu-la-n07', '5d863304-619c-4c4b-8f6e-733d8e5a13ba', 'The Giant Postman', '2026-03-16', 20, 14, 8, 'Good progress', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-216', 'stu-la-n07', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-18', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-217', 'stu-la-n07', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-23', 15, 12, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-218', 'stu-la-n07', '059db4c1-f03d-4889-90a3-6007ba539e98', 'Treasure Hunt', '2026-03-25', 20, 14, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Alfie Cooper: PP, reluctant
('rs-la-219', 'stu-la-n08', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-10', 10, 6, 5, 'Needed encouragement', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-220', 'stu-la-n08', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-18', 10, 8, 5, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-221', 'stu-la-n08', 'cf723a61-3140-4e15-8418-3593a3794178', 'Buzz and Bingo in the Starry Sky', '2026-03-25', 15, 10, 6, 'Better effort today', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- ── YEAR 4 (Demo teacher) ──────────────────────────────────

-- Ethan Brooks: Beast Quest fan, strong
('rs-la-222', 'stu-la-n09', 'd6a2f26a-b6c4-47c6-8df8-45de11352c81', 'Komodo the Lizard King', '2026-03-02', 25, 20, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-223', 'stu-la-n09', 'd6a2f26a-b6c4-47c6-8df8-45de11352c81', 'Komodo the Lizard King', '2026-03-04', 30, 24, 9, 'Flew through this', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-224', 'stu-la-n09', 'ee6a4267-0a8b-4065-a9c9-0cd9dfbc2f0d', 'Krabb, Master of the Sea', '2026-03-05', 25, 20, 8, 'Straight onto the next one', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-225', 'stu-la-n09', 'ee6a4267-0a8b-4065-a9c9-0cd9dfbc2f0d', 'Krabb, Master of the Sea', '2026-03-09', 30, 26, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-226', 'stu-la-n09', 'ee6a4267-0a8b-4065-a9c9-0cd9dfbc2f0d', 'Krabb, Master of the Sea', '2026-03-11', 25, 22, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-227', 'stu-la-n09', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-16', 30, 24, 8, 'Trying something different', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-228', 'stu-la-n09', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-18', 25, 20, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-229', 'stu-la-n09', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-19', 30, 26, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-230', 'stu-la-n09', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-23', 25, 22, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-231', 'stu-la-n09', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-25', 30, 26, 9, 'Devouring books', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Grace Adeyemi: historical fiction, thoughtful
('rs-la-232', 'stu-la-n10', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-03', 20, 14, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-03T15:30:00Z'),
('rs-la-233', 'stu-la-n10', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-05', 25, 18, 8, 'Loves Morpurgo', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-234', 'stu-la-n10', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-09', 20, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-235', 'stu-la-n10', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-12', 25, 18, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-236', 'stu-la-n10', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-16', 20, 14, 8, 'Good comprehension of cultural themes', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-237', 'stu-la-n10', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-18', 25, 20, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-238', 'stu-la-n10', '504fa816-a67f-4067-b325-34faa85f3dd8', 'In the Mouth of the Wolf', '2026-03-23', 20, 14, 8, 'Challenging but determined', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-239', 'stu-la-n10', '504fa816-a67f-4067-b325-34faa85f3dd8', 'In the Mouth of the Wolf', '2026-03-25', 25, 18, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Leo Chen: non-fiction, building confidence
('rs-la-240', 'stu-la-n11', '0a3816fb-518f-4597-9cfc-e50419af62b9', 'I Wonder Why My Tummy Rumbles', '2026-03-04', 20, 12, 7, 'Loves the Q&A format', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-241', 'stu-la-n11', '0a3816fb-518f-4597-9cfc-e50419af62b9', 'I Wonder Why My Tummy Rumbles', '2026-03-10', 20, 14, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-10T15:30:00Z'),
('rs-la-242', 'stu-la-n11', '1930817b-0a8c-481f-8b7a-9a59d6d03096', 'The Awful Egyptians', '2026-03-16', 20, 12, 7, 'Trying Horrible Histories', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-243', 'stu-la-n11', '1930817b-0a8c-481f-8b7a-9a59d6d03096', 'The Awful Egyptians', '2026-03-19', 25, 16, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-244', 'stu-la-n11', '1930817b-0a8c-481f-8b7a-9a59d6d03096', 'The Awful Egyptians', '2026-03-23', 20, 14, 8, 'Getting more confident', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-245', 'stu-la-n11', '1930817b-0a8c-481f-8b7a-9a59d6d03096', 'The Awful Egyptians', '2026-03-25', 25, 16, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Ruby Fitzgerald: exceptional reader
('rs-la-246', 'stu-la-n12', 'da008ce3-4907-4988-a8ff-f23bdf58cd5f', 'Even More Terrible Tudors', '2026-03-02', 30, 24, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-247', 'stu-la-n12', 'da008ce3-4907-4988-a8ff-f23bdf58cd5f', 'Even More Terrible Tudors', '2026-03-04', 35, 28, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-248', 'stu-la-n12', 'da008ce3-4907-4988-a8ff-f23bdf58cd5f', 'Even More Terrible Tudors', '2026-03-05', 30, 26, 10, 'Astounding vocabulary', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-249', 'stu-la-n12', '504fa816-a67f-4067-b325-34faa85f3dd8', 'In the Mouth of the Wolf', '2026-03-09', 30, 22, 9, 'Started Morpurgo', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-250', 'stu-la-n12', '504fa816-a67f-4067-b325-34faa85f3dd8', 'In the Mouth of the Wolf', '2026-03-11', 35, 28, 10, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-251', 'stu-la-n12', '504fa816-a67f-4067-b325-34faa85f3dd8', 'In the Mouth of the Wolf', '2026-03-12', 30, 24, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-252', 'stu-la-n12', 'd457c535-18d8-467c-8ba2-54657b703134', 'Bloomin'' Rainforests', '2026-03-16', 30, 22, 9, 'Branching into non-fiction', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-253', 'stu-la-n12', 'd457c535-18d8-467c-8ba2-54657b703134', 'Bloomin'' Rainforests', '2026-03-18', 35, 28, 10, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-254', 'stu-la-n12', 'd457c535-18d8-467c-8ba2-54657b703134', 'Bloomin'' Rainforests', '2026-03-19', 30, 24, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-255', 'stu-la-n12', 'd457c535-18d8-467c-8ba2-54657b703134', 'Bloomin'' Rainforests', '2026-03-23', 35, 28, 10, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-256', 'stu-la-n12', 'd457c535-18d8-467c-8ba2-54657b703134', 'Bloomin'' Rainforests', '2026-03-25', 30, 26, 10, 'Reading role model', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Harley Scott: PP, improving
('rs-la-257', 'stu-la-n13', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-09', 15, 8, 6, 'Chose this himself', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-258', 'stu-la-n13', 'cbb94d46-f637-449b-b0c1-63ef3cc3b82b', 'Sorted!', '2026-03-16', 15, 10, 6, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-259', 'stu-la-n13', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-23', 20, 12, 7, 'More engaged', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-260', 'stu-la-n13', 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b', 'The Nowhere Boy', '2026-03-25', 15, 10, 7, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z'),

-- Maisie Taylor: reads every evening
('rs-la-261', 'stu-la-n14', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-02', 25, 18, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-02T15:30:00Z'),
('rs-la-262', 'stu-la-n14', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-04', 30, 24, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-04T15:30:00Z'),
('rs-la-263', 'stu-la-n14', '49015442-aec8-4d9a-9741-208babf86777', 'The Camel Fair', '2026-03-05', 25, 20, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-05T15:30:00Z'),
('rs-la-264', 'stu-la-n14', 'd6a2f26a-b6c4-47c6-8df8-45de11352c81', 'Komodo the Lizard King', '2026-03-09', 25, 18, 8, 'Trying Beast Quest', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-09T15:30:00Z'),
('rs-la-265', 'stu-la-n14', 'd6a2f26a-b6c4-47c6-8df8-45de11352c81', 'Komodo the Lizard King', '2026-03-11', 30, 24, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-11T15:30:00Z'),
('rs-la-266', 'stu-la-n14', 'd6a2f26a-b6c4-47c6-8df8-45de11352c81', 'Komodo the Lizard King', '2026-03-12', 25, 20, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-12T15:30:00Z'),
('rs-la-267', 'stu-la-n14', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-16', 30, 22, 9, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-16T15:30:00Z'),
('rs-la-268', 'stu-la-n14', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-18', 25, 18, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-18T15:30:00Z'),
('rs-la-269', 'stu-la-n14', '12628795-3973-41bf-af45-d48cbdd836ac', 'I Believe in Unicorns', '2026-03-19', 30, 24, 9, 'Finished, beautiful response', 5, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-19T15:30:00Z'),
('rs-la-270', 'stu-la-n14', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-23', 25, 20, 8, NULL, NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-23T15:30:00Z'),
('rs-la-271', 'stu-la-n14', '331eb8a1-a145-42a2-a0a0-4c9c650d43e6', 'The Enemies of Jupiter', '2026-03-25', 30, 24, 9, 'Brilliant term', NULL, 'cba7de46-4dc4-4249-8fb8-3dd3ced2e4f3', '2026-03-25T15:30:00Z');

-- ============================================================
-- 5. UPDATE STREAKS AND LAST READ DATES
-- ============================================================

-- Existing Year 2 (2025) students — now active again
UPDATE students SET last_read_date = '2026-03-25', current_streak = 8,  longest_streak = 8,  streak_start_date = '2026-03-09' WHERE id = '882a9032-75eb-4f3a-be2f-fbbe8b278427'; -- Ben Carter
UPDATE students SET last_read_date = '2026-03-24', current_streak = 2,  longest_streak = 4,  streak_start_date = '2026-03-17' WHERE id = '74ee5776-f34f-466d-91a7-db7c771634c7'; -- Bert Holloway
UPDATE students SET last_read_date = '2026-03-25', current_streak = 10, longest_streak = 10, streak_start_date = '2026-03-02' WHERE id = '38f9c55b-cc51-4cba-973d-25b808c4cf01'; -- Bob Marshall
UPDATE students SET last_read_date = '2026-03-25', current_streak = 18, longest_streak = 18, streak_start_date = '2026-03-02' WHERE id = '946db048-9e7a-4012-9a04-6f5597ed4521'; -- Charlotte Ainsworth
UPDATE students SET last_read_date = '2026-03-24', current_streak = 2,  longest_streak = 3,  streak_start_date = '2026-03-17' WHERE id = '2fa35e31-6b03-491b-90b7-81c196292801'; -- Julio Reyes
UPDATE students SET last_read_date = '2026-03-25', current_streak = 8,  longest_streak = 8,  streak_start_date = '2026-03-09' WHERE id = '160869a0-7bbb-452e-b7dd-00d560557b45'; -- William Frost

-- Existing Year 2 (2026) students — brought up to date
UPDATE students SET last_read_date = '2026-03-25', current_streak = 8,  longest_streak = 8,  streak_start_date = '2026-03-09' WHERE id = '2ba89c96-783c-4ddd-ba3e-78763b54a1b1'; -- Ben Okafor
UPDATE students SET last_read_date = '2026-03-24', current_streak = 2,  longest_streak = 3,  streak_start_date = '2026-03-18' WHERE id = '7ca9a1d2-6a65-45c3-b04a-234e0d012355'; -- Bert Singh
UPDATE students SET last_read_date = '2026-03-25', current_streak = 7,  longest_streak = 7,  streak_start_date = '2026-03-11' WHERE id = '07742190-4b2f-46cc-954a-96cda40ff947'; -- John Fletcher
UPDATE students SET last_read_date = '2026-03-25', current_streak = 15, longest_streak = 15, streak_start_date = '2026-03-03' WHERE id = '8fcf70a2-7824-49be-af40-50b0255a403f'; -- Katie Brennan

-- New Year 2 students
UPDATE students SET last_read_date = '2026-03-25', current_streak = 6,  longest_streak = 6,  streak_start_date = '2026-03-10' WHERE id = 'stu-la-n01'; -- Amira Patel
UPDATE students SET last_read_date = '2026-03-19', current_streak = 0,  longest_streak = 1,  streak_start_date = NULL          WHERE id = 'stu-la-n02'; -- Oscar Whitfield

-- Year 3 students
UPDATE students SET last_read_date = '2026-03-25', current_streak = 16, longest_streak = 16, streak_start_date = '2026-03-02' WHERE id = 'stu-la-n03'; -- Isla McGregor
UPDATE students SET last_read_date = '2026-03-25', current_streak = 5,  longest_streak = 5,  streak_start_date = '2026-03-12' WHERE id = 'stu-la-n04'; -- Marcus Johnson
UPDATE students SET last_read_date = '2026-03-25', current_streak = 16, longest_streak = 16, streak_start_date = '2026-03-02' WHERE id = 'stu-la-n05'; -- Priya Sharma
UPDATE students SET last_read_date = '2026-03-25', current_streak = 2,  longest_streak = 2,  streak_start_date = '2026-03-19' WHERE id = 'stu-la-n06'; -- Dylan Thomas
UPDATE students SET last_read_date = '2026-03-25', current_streak = 8,  longest_streak = 8,  streak_start_date = '2026-03-10' WHERE id = 'stu-la-n07'; -- Sophie Williams
UPDATE students SET last_read_date = '2026-03-25', current_streak = 3,  longest_streak = 3,  streak_start_date = '2026-03-18' WHERE id = 'stu-la-n08'; -- Alfie Cooper

-- Year 4 students
UPDATE students SET last_read_date = '2026-03-25', current_streak = 18, longest_streak = 18, streak_start_date = '2026-03-02' WHERE id = 'stu-la-n09'; -- Ethan Brooks
UPDATE students SET last_read_date = '2026-03-25', current_streak = 10, longest_streak = 10, streak_start_date = '2026-03-05' WHERE id = 'stu-la-n10'; -- Grace Adeyemi
UPDATE students SET last_read_date = '2026-03-25', current_streak = 6,  longest_streak = 6,  streak_start_date = '2026-03-10' WHERE id = 'stu-la-n11'; -- Leo Chen
UPDATE students SET last_read_date = '2026-03-25', current_streak = 20, longest_streak = 20, streak_start_date = '2026-03-02' WHERE id = 'stu-la-n12'; -- Ruby Fitzgerald
UPDATE students SET last_read_date = '2026-03-25', current_streak = 3,  longest_streak = 3,  streak_start_date = '2026-03-16' WHERE id = 'stu-la-n13'; -- Harley Scott
UPDATE students SET last_read_date = '2026-03-25', current_streak = 18, longest_streak = 18, streak_start_date = '2026-03-02' WHERE id = 'stu-la-n14'; -- Maisie Taylor

-- Set current_book_id for students actively reading
UPDATE students SET current_book_id = '506d2c7f-609c-4e95-8fcc-f66a9acd3c59'  WHERE id = '882a9032-75eb-4f3a-be2f-fbbe8b278427'; -- Ben Carter → A Home for Bonnie
UPDATE students SET current_book_id = 'dd77c644-32d6-4363-83a3-cf51ae5854df'  WHERE id = '74ee5776-f34f-466d-91a7-db7c771634c7'; -- Bert → Hen's Pens
UPDATE students SET current_book_id = '506d2c7f-609c-4e95-8fcc-f66a9acd3c59'  WHERE id = '38f9c55b-cc51-4cba-973d-25b808c4cf01'; -- Bob → A Home for Bonnie
UPDATE students SET current_book_id = 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8'  WHERE id = '946db048-9e7a-4012-9a04-6f5597ed4521'; -- Charlotte → The Emergency
UPDATE students SET current_book_id = 'b0896763-9907-4460-8715-3981a5ec0166'  WHERE id = '2fa35e31-6b03-491b-90b7-81c196292801'; -- Julio → Seal at the Wheel
UPDATE students SET current_book_id = 'c566c73c-16d0-41ee-8ac5-b9c249ea299d'  WHERE id = '160869a0-7bbb-452e-b7dd-00d560557b45'; -- William → Dustbin
UPDATE students SET current_book_id = 'ef5ca597-efa3-463e-b1ab-c293877c15dd'  WHERE id = '2ba89c96-783c-4ddd-ba3e-78763b54a1b1'; -- Ben O → Tortoise and Baboon
UPDATE students SET current_book_id = 'b0896763-9907-4460-8715-3981a5ec0166'  WHERE id = '7ca9a1d2-6a65-45c3-b04a-234e0d012355'; -- Bert S → Seal at the Wheel
UPDATE students SET current_book_id = 'c566c73c-16d0-41ee-8ac5-b9c249ea299d'  WHERE id = '07742190-4b2f-46cc-954a-96cda40ff947'; -- John → Dustbin
UPDATE students SET current_book_id = '059db4c1-f03d-4889-90a3-6007ba539e98'  WHERE id = '8fcf70a2-7824-49be-af40-50b0255a403f'; -- Katie → Treasure Hunt
UPDATE students SET current_book_id = 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b'  WHERE id = 'stu-la-n03'; -- Isla → The Nowhere Boy
UPDATE students SET current_book_id = 'cf723a61-3140-4e15-8418-3593a3794178'  WHERE id = 'stu-la-n04'; -- Marcus → Buzz and Bingo
UPDATE students SET current_book_id = 'c2d6bdb8-925d-4c0a-82c7-49da3da114a8'  WHERE id = 'stu-la-n05'; -- Priya → The Emergency
UPDATE students SET current_book_id = '059db4c1-f03d-4889-90a3-6007ba539e98'  WHERE id = 'stu-la-n07'; -- Sophie → Treasure Hunt
UPDATE students SET current_book_id = '331eb8a1-a145-42a2-a0a0-4c9c650d43e6'  WHERE id = 'stu-la-n09'; -- Ethan → Enemies of Jupiter
UPDATE students SET current_book_id = '504fa816-a67f-4067-b325-34faa85f3dd8'  WHERE id = 'stu-la-n10'; -- Grace → In the Mouth of the Wolf
UPDATE students SET current_book_id = '1930817b-0a8c-481f-8b7a-9a59d6d03096' WHERE id = 'stu-la-n11'; -- Leo → Awful Egyptians
UPDATE students SET current_book_id = 'd457c535-18d8-467c-8ba2-54657b703134' WHERE id = 'stu-la-n12'; -- Ruby → Bloomin' Rainforests
UPDATE students SET current_book_id = 'ab3f2ecf-95e6-44bd-a1c1-e830e0d5f01b'  WHERE id = 'stu-la-n13'; -- Harley → The Nowhere Boy
UPDATE students SET current_book_id = '331eb8a1-a145-42a2-a0a0-4c9c650d43e6'  WHERE id = 'stu-la-n14'; -- Maisie → Enemies of Jupiter

-- ============================================================
-- 6. UPDATE CLASSES with year_group field
-- ============================================================
UPDATE classes SET year_group = 'Year 2' WHERE id = '49f7bf8b-a254-4d0e-a6e3-30443e018be0';
UPDATE classes SET year_group = 'Year 2' WHERE id = '2e9c8fc5-5a6c-471f-adf4-caf29ce64626';
UPDATE classes SET year_group = 'Year 3' WHERE id = '5f9ab747-2bd4-458d-9968-a10046fa4eb6';

-- ============================================================
-- DONE! Learnalot School enriched.
-- ============================================================
-- Changes:
--   10 existing students updated with full names, reading levels, year groups
--   8 new students added (2 in Year 2, 6 in Year 3)
--   6 new students in new Year 4 class
--   1 new class (Year 4)
--   171 new reading sessions across March 2026
--   All streaks and last_read_date updated
--   All classes now have year_group set
--
-- Student diversity:
--   Star readers: Charlotte, Katie, Isla, Priya, Ethan, Ruby, Maisie (streaks 15-20)
--   Steady readers: Ben C, Bob, William, Ben O, John, Sophie, Grace, Leo, Marcus
--   Occasional: Bert H (SEN), Julio (EAL), Bert S, Dylan, Harley (PP)
--   Needs attention: Oscar (reluctant, last read Mar 19)
