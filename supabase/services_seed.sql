insert into services (title, category, price, delivery_days, is_active)
values
  ('Study Permit Starter Package', 'Study Permits', 199, 7, true),
  ('Study Permit Standard Package', 'Study Permits', 349, 10, true),
  ('Study Permit Premium Package', 'Study Permits', 549, 14, true),
  ('Study Permit & Visa Consulting', 'Study Permits', 149, 5, true),
  ('University Admission Basic', 'University Admissions', 299, 7, true),
  ('University Admission Comprehensive', 'University Admissions', 549, 14, true),
  ('University Admission Elite', 'University Admissions', 849, 28, true),
  ('PGWP Only Package', 'Post-Graduate', 249, 7, true),
  ('PR Roadmap Package', 'PR & Immigration', 449, 10, true),
  ('Full PR Acceleration Package', 'PR & Immigration', 799, 42, true),
  ('Arrival Essentials Package', 'Settlement', 199, 5, true),
  ('Full Settlement Package', 'Settlement', 449, 10, true),
  ('Premium Integration Package', 'Settlement', 699, 90, true),
  ('Monthly Mentorship', 'Mentorship', 149, 30, true),
  ('Quarterly Mentorship', 'Mentorship', 349, 90, true),
  ('Annual Mentorship', 'Mentorship', 849, 365, true),
  ('Credential Assessment Guided', 'Credentials', 179, 7, true),
  ('Credential Assessment Full + Appeal', 'Credentials', 299, 14, true),
  ('Resume & LinkedIn Glow-Up', 'Career', 99, 5, true),
  ('Job Search Mastery', 'Career', 199, 14, true),
  ('Premium Placement Package', 'Career', 349, 28, true)
on conflict do nothing;
