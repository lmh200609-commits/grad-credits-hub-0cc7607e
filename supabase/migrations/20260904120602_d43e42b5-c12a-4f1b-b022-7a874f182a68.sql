ALTER TABLE public.application_attachments ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.application_attachments ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;