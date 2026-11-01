-- Reference data and starter accounts. Safe to run again: labels and tab lists are refreshed, accounts are left alone.
-- console_views, console_pages and console_view_pages mirror alpha/src/state/views.ts. tests/database.test.ts fails if they drift.

INSERT INTO organisations (id, name, slug) VALUES ('org_deck_twin', 'Deck Twin', 'deck-twin')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO account_types (key, label, description, can_switch_views, can_manage_users, can_manage_orgs) VALUES
  ('user', 'Sign-up user', 'Self-registered account. Sees the one view it is assigned.', 0, 0, 0),
  ('system_admin', 'System admin', 'Runs one organisation. Sees every tab and can switch views.', 1, 1, 0),
  ('super_admin', 'Super admin', 'Runs the platform. Everything a system admin can do, in every organisation.', 1, 1, 1)
  ON CONFLICT (key) DO UPDATE SET label = excluded.label, description = excluded.description,
    can_switch_views = excluded.can_switch_views, can_manage_users = excluded.can_manage_users, can_manage_orgs = excluded.can_manage_orgs;

INSERT INTO console_views (key, label, description, sort) VALUES
  ('all', 'System admin', 'Every tab', 0),
  ('operations', 'Operator', 'Control room and HSE manager', 1),
  ('finance', 'Finance', 'Revenue and finance', 2),
  ('hse', 'HSE', 'Safety and HSE teams', 3)
  ON CONFLICT (key) DO UPDATE SET label = excluded.label, description = excluded.description, sort = excluded.sort;

INSERT INTO console_pages (key, label, title, area, sort) VALUES
  ('dashboard', 'Dashboard', 'Field dashboard', 'operations', 0),
  ('overview', 'Overview', 'Plant overview', 'operations', 1),
  ('process', 'Process', 'Process graphics', 'operations', 2),
  ('alarms', 'Alarms', 'Alarm summary', 'operations', 3),
  ('shutdown', 'Shutdown', 'ESD and shutdown', 'operations', 4),
  ('trends', 'Trends', 'Historian trends', 'operations', 5),
  ('machines', 'Machines', 'Rotating equipment', 'operations', 6),
  ('cranes', 'Cranes', 'Lifting operations and weather', 'operations', 7),
  ('handover', 'Handover', 'Shift handover', 'operations', 8),
  ('fg', 'F&G', 'Fire and gas', 'safety', 9),
  ('response', 'Response', 'Incident response', 'safety', 10),
  ('risk', 'Risk', 'Risk and what-if', 'safety', 11),
  ('cctv', 'CCTV', 'CCTV and PPE', 'safety', 12),
  ('alerts', 'Alerts', 'Alerts and assistant', 'safety', 13),
  ('scenarios', 'Scenarios', 'Training scenarios', 'safety', 14),
  ('maintenance', 'Maintenance', 'Maintenance and permits', 'integrity', 15),
  ('inspection', 'Inspections', 'Inspections and corrosion', 'integrity', 16),
  ('economics', 'Economics', 'Asset and economics', 'commercial', 17),
  ('spares', 'Spares', 'Spares and logistics', 'commercial', 18),
  ('instructor', 'Instructor', 'Instructor station', 'admin', 19)
  ON CONFLICT (key) DO UPDATE SET label = excluded.label, title = excluded.title, area = excluded.area, sort = excluded.sort;

DELETE FROM console_view_pages;
INSERT INTO console_view_pages (view_key, page_key) SELECT 'all', key FROM console_pages;
INSERT INTO console_view_pages (view_key, page_key) VALUES
  ('operations', 'dashboard'), ('operations', 'overview'), ('operations', 'process'), ('operations', 'alarms'),
  ('operations', 'shutdown'), ('operations', 'trends'), ('operations', 'machines'), ('operations', 'cranes'),
  ('operations', 'handover'), ('operations', 'fg'), ('operations', 'response'), ('operations', 'alerts'),
  ('operations', 'scenarios'), ('operations', 'maintenance'),
  ('finance', 'dashboard'), ('finance', 'trends'), ('finance', 'maintenance'), ('finance', 'economics'), ('finance', 'spares'),
  ('hse', 'dashboard'), ('hse', 'alarms'), ('hse', 'shutdown'), ('hse', 'handover'), ('hse', 'fg'), ('hse', 'response'),
  ('hse', 'risk'), ('hse', 'cctv'), ('hse', 'alerts'), ('hse', 'scenarios'), ('hse', 'maintenance'), ('hse', 'inspection');

-- Invited, with no password until a sign-in route sets one.
INSERT INTO users (id, organisation_id, email, name, account_type, console_view, status) VALUES
  ('usr_super_admin', 'org_deck_twin', 'superadmin@decktwin.com', 'Sam Rivers', 'super_admin', 'all', 'invited'),
  ('usr_system_admin', 'org_deck_twin', 'admin@decktwin.com', 'Alex Morgan', 'system_admin', 'all', 'invited')
  ON CONFLICT (id) DO NOTHING;
