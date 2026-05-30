
CREATE TABLE public.state_market_data (
  state text PRIMARY KEY,
  medicaid_enrollment integer,
  managed_care_pct numeric,
  data_year text,
  source_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.state_market_data TO authenticated;
GRANT ALL ON public.state_market_data TO service_role;

ALTER TABLE public.state_market_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read state market data"
ON public.state_market_data
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role manages state market data"
ON public.state_market_data
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
