-- Alternative zum Zeitplan über GitHub Actions: der Takt liegt in der
-- Datenbank selbst. Sinnvoll, wenn kein externer Läufer gewünscht ist.
--
-- Wichtige Einschränkung: pg_cron kann kein pg_dump ausführen. Der Job stößt
-- deshalb per pg_net eine Edge Function an, die den eigentlichen Export
-- übernimmt. Der Dump entsteht dort tabellenweise über die REST-Schnittstelle
-- und ist damit weniger vollständig als ein echter pg_dump — Sequenzen,
-- Trigger und Rechte fehlen. Für eine Sicherung, aus der sich der Betrieb
-- wiederherstellen lässt, ist die Variante mit pg_dump vorzuziehen.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 03:00 Europe/Vienna. pg_cron plant in UTC; ab Version 1.5 lässt sich die
-- Zeitzone je Job setzen. Ist das nicht verfügbar, werden wie bei der
-- Actions-Vorlage beide Zeiten eingetragen und die Funktion bricht ab, wenn
-- es lokal nicht 3 Uhr ist.
select cron.schedule(
  'instructor-connect-backup-sommerzeit',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.backup_function_url'),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.backup_function_token')
               ),
    body    := jsonb_build_object('source', 'pg_cron', 'expectLocalHour', 3)
  );
  $$
);

select cron.schedule(
  'instructor-connect-backup-winterzeit',
  '0 2 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.backup_function_url'),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.backup_function_token')
               ),
    body    := jsonb_build_object('source', 'pg_cron', 'expectLocalHour', 3)
  );
  $$
);

-- Zugangsdaten NICHT im Klartext hier ablegen, sondern einmalig setzen:
--   alter database postgres set app.backup_function_url   = 'https://<projekt>.supabase.co/functions/v1/backup';
--   alter database postgres set app.backup_function_token = '<service-role-key>';

-- Kontrolle:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;

-- Entfernen:
--   select cron.unschedule('instructor-connect-backup-sommerzeit');
--   select cron.unschedule('instructor-connect-backup-winterzeit');
