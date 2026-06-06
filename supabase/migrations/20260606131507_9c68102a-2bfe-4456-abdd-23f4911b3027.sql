
create table public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  kind text not null,
  ref_table text,
  ref_id text,
  label text not null,
  domain text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create unique index graph_nodes_ref_unique
  on public.graph_nodes (mission_id, kind, coalesce(ref_table, ''), coalesce(ref_id, ''));
create index graph_nodes_mission_idx on public.graph_nodes(mission_id);
create index graph_nodes_kind_idx on public.graph_nodes(mission_id, kind);

grant select, insert, update, delete on public.graph_nodes to authenticated;
grant all on public.graph_nodes to service_role;

alter table public.graph_nodes enable row level security;

create policy "Mission members can read graph_nodes"
  on public.graph_nodes for select to authenticated
  using (public.is_mission_member(mission_id, auth.uid()));

create table public.graph_edges (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  src_node_id uuid not null references public.graph_nodes(id) on delete cascade,
  dst_node_id uuid not null references public.graph_nodes(id) on delete cascade,
  edge_type text not null,
  weight numeric not null default 1.0,
  confidence numeric,
  provenance jsonb,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (src_node_id <> dst_node_id)
);

create index graph_edges_mission_idx on public.graph_edges(mission_id);
create index graph_edges_src_idx on public.graph_edges(src_node_id);
create index graph_edges_dst_idx on public.graph_edges(dst_node_id);
create index graph_edges_type_idx on public.graph_edges(mission_id, edge_type);

grant select, insert, update, delete on public.graph_edges to authenticated;
grant all on public.graph_edges to service_role;

alter table public.graph_edges enable row level security;

create policy "Mission members can read graph_edges"
  on public.graph_edges for select to authenticated
  using (public.is_mission_member(mission_id, auth.uid()));
