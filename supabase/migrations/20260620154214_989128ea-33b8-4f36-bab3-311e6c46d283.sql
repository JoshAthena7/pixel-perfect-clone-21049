create table if not exists public.email_template_overrides (
  template_key text primary key,
  subject text not null,
  intro text not null default '',
  body text not null default '',
  cta_label text not null default 'CREATE YOUR ACCOUNT →',
  signoff text not null default '— Athena Strategy Command',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

grant select, insert, update, delete on public.email_template_overrides to authenticated;
grant all on public.email_template_overrides to service_role;

alter table public.email_template_overrides enable row level security;

create policy "admins read overrides"
  on public.email_template_overrides for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "admins write overrides"
  on public.email_template_overrides for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.email_template_overrides (template_key, subject, intro, body, cta_label, signoff)
values (
  'mission-invite',
  'Your Mission Awaits — {{missionName}}',
  'Hi {{recipientName}},',
  E'You''ve been selected to join the {{missionName}} pursuit team at Athena Strategy Command.\n\nAtlas is the operational command platform where your team coordinates, strategizes, and executes this pursuit. IRIS — Athena''s intelligence engine — will brief you, flag what matters, and keep the mission moving.',
  'CREATE YOUR ACCOUNT →',
  '— Athena Strategy Command'
)
on conflict (template_key) do nothing;