-- Backfill: canonicalise existing emails to trim()+lower() so they match the form the
-- application now stores and looks up by (see UsersService.normalizeEmail). Every existing row
-- is Google-sourced (email+password auth ships in this same batch of migrations), so a
-- lower(trim()) collision between two rows is effectively impossible here - but guard anyway:
-- abort loudly rather than silently violating the unique index.
DO $$
DECLARE
  collisions int;
BEGIN
  SELECT count(*) INTO collisions
  FROM (
    SELECT lower(btrim(email)) AS norm
    FROM "User"
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) dup;

  IF collisions > 0 THEN
    RAISE EXCEPTION 'Cannot normalize emails: % address(es) would collide after lower(trim()). Resolve the duplicate User rows manually first.', collisions;
  END IF;
END $$;

UPDATE "User"
SET email = lower(btrim(email))
WHERE email <> lower(btrim(email));
