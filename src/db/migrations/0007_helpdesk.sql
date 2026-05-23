CREATE SCHEMA IF NOT EXISTS helpdesk;

CREATE TABLE IF NOT EXISTS helpdesk.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE CHECK (category_key IN ('IT', 'HR', 'Finance', 'Admin', 'Assets', 'Project Support')),
  label text NOT NULL,
  default_assignee_user_id uuid NULL,
  default_assignee_name text NULL,
  default_assignee_role text NULL,
  team text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sub_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS helpdesk_categories_active_idx
  ON helpdesk.categories (active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS helpdesk.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  subject text NOT NULL,
  description text NOT NULL,
  category_id uuid NOT NULL,
  category_key text NOT NULL CHECK (category_key IN ('IT', 'HR', 'Finance', 'Admin', 'Assets', 'Project Support')),
  sub_category text NULL,
  priority text NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status text NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'reopened', 'escalated')),
  requester_user_id uuid NOT NULL,
  requester_name text NOT NULL,
  requester_email text NULL,
  requester_department text NULL,
  assignee_user_id uuid NULL,
  assignee_name text NULL,
  assignee_role text NULL,
  related_asset_id text NULL,
  related_project_id text NULL,
  first_response_at timestamptz NULL,
  resolved_at timestamptz NULL,
  closed_at timestamptz NULL,
  resolution text NULL,
  reopen_count integer NOT NULL DEFAULT 0,
  escalated boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS helpdesk_tickets_requester_idx
  ON helpdesk.tickets (requester_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS helpdesk_tickets_queue_idx
  ON helpdesk.tickets (status, category_key, assignee_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS helpdesk.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  author_user_id uuid NULL,
  author_name text NOT NULL,
  author_role text NULL,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS helpdesk_comments_ticket_idx
  ON helpdesk.ticket_comments (ticket_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS helpdesk.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  document_id uuid NULL,
  attachment_type text NOT NULL,
  file_name text NOT NULL,
  size_text text NULL,
  uploaded_by_user_id uuid NULL,
  uploaded_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS helpdesk_attachments_ticket_idx
  ON helpdesk.ticket_attachments (ticket_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS helpdesk.ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  actor_user_id uuid NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  detail text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS helpdesk_events_ticket_idx
  ON helpdesk.ticket_events (ticket_id, created_at);
