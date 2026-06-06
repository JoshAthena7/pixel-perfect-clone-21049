CREATE OR REPLACE FUNCTION public.list_mission_scoped_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.table_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'mission_id'
  ORDER BY c.table_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_mission_scoped_tables() TO authenticated, service_role;