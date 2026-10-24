-- Public catalogue seed snapshot, read from the Books tab on 2026-10-24.
-- Contains only book-level fields; no member, loan, account, email or fine data.
-- Copies-on-loan and available-copies columns are intentionally NOT imported: availability
-- is derived by the database from public.loans and must never be copied as stale sheet values.
-- Safe to rerun: existing book IDs are never overwritten.
begin;
insert into public.books (book_id,title,author,isbn,publisher,year,category,description,shelf_location,total_copies,record_status,cover_image_url)
values
  ('BK-1001', 'Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', 'MIT Press', 2022, 'Computer Science', 'Comprehensive guide to algorithms and computational problem solving.', 'A-01', 5, 'ACTIVE', 'https://placehold.co/300x450?text=Algorithms'),
  ('BK-1002', 'Clean Code', 'Robert C. Martin', '9780132350884', 'Prentice Hall', 2008, 'Programming', 'A practical guide to writing readable and maintainable software.', 'A-02', 4, 'ACTIVE', 'https://placehold.co/300x450?text=Clean+Code'),
  ('BK-1003', 'Python Crash Course', 'Eric Matthes', '9781718502703', 'No Starch Press', 2023, 'Python', 'Hands-on introduction to Python programming and projects.', 'A-03', 6, 'ACTIVE', 'https://placehold.co/300x450?text=Python'),
  ('BK-1004', 'Database System Concepts', 'Abraham Silberschatz', '9780078022159', 'McGraw Hill', 2019, 'Database Systems', 'Core concepts in database design transactions and query processing.', 'B-01', 4, 'ACTIVE', 'https://placehold.co/300x450?text=Databases'),
  ('BK-1005', 'Designing Data-Intensive Applications', 'Martin Kleppmann', '9781449373320', 'O''Reilly Media', 2017, 'Data Engineering', 'Explores distributed systems storage engines and data processing.', 'B-02', 3, 'ACTIVE', 'https://placehold.co/300x450?text=Data+Systems'),
  ('BK-1006', 'Computer Networking: A Top-Down Approach', 'James Kurose', '9780136681557', 'Pearson', 2021, 'Networking', 'An application-first introduction to computer networking.', 'B-03', 5, 'ACTIVE', 'https://placehold.co/300x450?text=Networking'),
  ('BK-1007', 'Operating System Concepts', 'Abraham Silberschatz', '9781119800361', 'Wiley', 2021, 'Operating Systems', 'Explains processes memory management file systems and operating system design.', 'C-01', 4, 'ACTIVE', 'https://placehold.co/300x450?text=Operating+Systems'),
  ('BK-1008', 'Artificial Intelligence: A Modern Approach', 'Stuart Russell', '9780134610993', 'Pearson', 2021, 'Artificial Intelligence', 'An overview of AI methods search reasoning and machine learning.', 'C-02', 3, 'ACTIVE', 'https://placehold.co/300x450?text=Artificial+Intelligence'),
  ('BK-1009', 'Hands-On Machine Learning', 'Aurélien Géron', '9781098125974', 'O''Reilly Media', 2022, 'Machine Learning', 'Practical machine learning using modern Python tools and workflows.', 'C-03', 5, 'ACTIVE', 'https://placehold.co/300x450?text=Machine+Learning'),
  ('BK-1010', 'Computer Organization and Design', 'David A. Patterson', '9780128201091', 'Morgan Kaufmann', 2020, 'Computer Architecture', 'Introduces processor design instruction sets and computer architecture.', 'D-01', 4, 'ACTIVE', 'https://placehold.co/300x450?text=Computer+Architecture'),
  ('BK-1011', 'SQL Performance Explained', 'Markus Winand', '9783950307825', 'SQL Performance', 2012, 'SQL', 'Practical techniques for understanding indexes and optimizing SQL queries.', 'D-02', 3, 'ACTIVE', 'https://placehold.co/300x450?text=SQL'),
  ('BK-1012', 'Fluent Python', 'Luciano Ramalho', '9781492056355', 'O''Reilly Media', 2022, 'Python', 'Advanced Python techniques for writing expressive idiomatic code.', 'D-03', 4, 'ACTIVE', 'https://placehold.co/300x450?text=Fluent+Python'),
  ('BK-1013', 'Cloud Computing Concepts', 'Rajkumar Buyya', '9780470887998', 'Wiley', 2011, 'Cloud Computing', 'Introduction to cloud infrastructure virtualization and distributed services.', 'E-01', 5, 'ACTIVE', 'https://placehold.co/300x450?text=Cloud+Computing'),
  ('BK-1014', 'Deep Learning', 'Ian Goodfellow', '9780262035613', 'MIT Press', 2016, 'Deep Learning', 'Foundational concepts and techniques in modern deep learning.', 'E-02', 3, 'ACTIVE', 'https://placehold.co/300x450?text=Deep+Learning'),
  ('BK-1015', 'The Pragmatic Programmer', 'Andrew Hunt', '9780135957059', 'Addison-Wesley', 2019, 'Software Engineering', 'A collection of practical principles for professional software development.', 'E-03', 6, 'ACTIVE', 'https://placehold.co/300x450?text=Pragmatic+Programmer')
on conflict (book_id) do nothing;

-- Keep generated book IDs above any imported BK-#### ID (next new title is BK-1016 here).
select setval('public.book_code_seq', greatest(1000, coalesce((
  select max(substring(book_id from 4)::bigint) from public.books where book_id ~ '^BK-[0-9]+$'
), 1000)));
commit;
