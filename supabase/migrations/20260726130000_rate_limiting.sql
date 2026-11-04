-- Stage 1 hardening: minimal server-side rate limiting for sensitive,
-- authenticated actions (customer verification submission, customer
-- document-upload initiation, operator application upsert/submission,
-- operator document-upload initiation, admin mutations).
--
-- Sign-up and password-reset requests are NOT covered here: this
-- application's client calls supabase.auth.signUp /
-- resetPasswordForEmail directly against Supabase Auth (GoTrue) -- no
-- request for those actions ever reaches this application's own server
-- functions or database, so there is nothing here to gate. Those two
-- actions remain dependent on Supabase Auth's own built-in abuse
-- protection. See the implementation report for the full reasoning.
--
-- Design: a small sliding-window counter table plus one atomic
-- check-and-record function. Deliberately NOT IP-based -- this app runs
-- behind Lovable/Supabase infrastructure where the client IP seen by a
-- server function is not reliably available/stable, so every bucket
-- below is keyed on the authenticated user's own id instead, which is a
-- strictly more reliable identifier here than an IP address would be.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup_idx
  ON public.rate_limit_hits (bucket, identifier, created_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No client-facing policies at all -- this table is only ever written to
-- or read from inside check_rate_limit (SECURITY DEFINER, called only
-- from server-function handlers via the service-role client) and the
-- trigger below (SECURITY DEFINER). `authenticated`/`anon` get no direct
-- table privileges, so a client cannot read other users' attempt counts
-- or forge/clear its own.
REVOKE ALL ON public.rate_limit_hits FROM authenticated, anon;

-- Atomic check-and-record: returns true and records a hit if the caller
-- is still under the limit for this bucket+identifier within the window;
-- returns false (and records nothing further) once the limit is reached.
-- Also opportunistically prunes old rows for the bucket so the table
-- never needs a separate scheduled cleanup job.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket TEXT,
  p_identifier TEXT,
  p_max_attempts INT,
  p_window_seconds INT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.rate_limit_hits
    WHERE bucket = p_bucket
      AND created_at < now() - make_interval(secs => p_window_seconds * 4);

  SELECT count(*) INTO v_count
    FROM public.rate_limit_hits
    WHERE bucket = p_bucket
      AND identifier = p_identifier
      AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, identifier) VALUES (p_bucket, p_identifier);
  RETURN true;
END;
$$;

-- Deliberately NOT granted to authenticated/anon: called only from (a)
-- server-function handlers using the service-role client, where the
-- identifier is always the caller's own userId taken from their verified
-- auth token, never client-supplied, and (b) the trigger below. Granting
-- direct client EXECUTE would let one user pass an arbitrary identifier
-- and p_max_attempts=0 to lock out another user's bucket. Revoked from
-- authenticated/anon only (matching the column-privilege lockdown
-- migrations' own house style) -- service_role is a separate role with
-- its own platform-level grants and is unaffected by this revoke.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) FROM authenticated, anon;

-- Operator document-upload initiation is a direct authenticated-client
-- insert (see operator-documents-client.ts), not a server function, so it
-- cannot be gated from application code the way the other buckets are.
-- Enforce it at the database layer instead with a BEFORE INSERT trigger,
-- keyed on the uploading user's own auth.uid().
CREATE OR REPLACE FUNCTION public.enforce_operator_document_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.check_rate_limit(
    'operator_document_upload', COALESCE(auth.uid()::text, 'anon'), 30, 600
  ) THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_documents_rate_limit ON public.operator_documents;
CREATE TRIGGER trg_operator_documents_rate_limit
  BEFORE INSERT ON public.operator_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operator_document_rate_limit();
