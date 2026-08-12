create type public.document_type as enum ('id_card', 'passport', 'driver_license');
create type public.document_status as enum ('pending', 'approved', 'rejected');

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  document_type public.document_type not null,
  -- percorso nel bucket privato "verification-documents", non URL pubblico.
  file_path text not null,
  status public.document_status not null default 'pending',
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index verification_documents_sitter_id_idx on public.verification_documents (sitter_id);
