-- The project is now called Nola, so the private schema follows: sakhi -> nola.
-- Tables, indexes, RLS, revoked grants and default privileges all move with the schema (they are tied to its OID).
-- Earlier migrations still create `sakhi`; this one renames it, and does nothing if it has already run.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'sakhi')
     and not exists (select 1 from pg_namespace where nspname = 'nola') then
    alter schema sakhi rename to nola;
  end if;
end $$;
