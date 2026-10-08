REVOKE EXECUTE ON FUNCTION public.colleges_seed_libraries() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.applications_dedupe_guard() FROM anon, public;
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='clone_template_to_college' LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
END LOOP; END $$;