
alter table public.graph_nodes
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_to timestamptz;

drop index if exists public.graph_nodes_ref_unique;

create unique index graph_nodes_ref_unique_active
  on public.graph_nodes (mission_id, kind, coalesce(ref_table, ''), coalesce(ref_id, ''))
  where valid_to is null;

create index if not exists graph_nodes_active_idx
  on public.graph_nodes(mission_id, kind)
  where valid_to is null;

create index if not exists graph_edges_active_idx
  on public.graph_edges(mission_id, edge_type)
  where valid_to is null;
