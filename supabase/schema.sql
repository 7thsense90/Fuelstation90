-- Server-only compatibility schema. No browser Data API access.
create table public.portal_revision (id boolean primary key default true check(id), revision bigint not null default 0 check(revision >= 0), sessions jsonb not null default '[]'::jsonb check(jsonb_typeof(sessions)='array'));
insert into public.portal_revision(id) values(true);
create table public.portal_stations (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create table public.portal_users (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_users_station_idx on public.portal_users(station_id);
alter table public.portal_users add constraint portal_users_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_fuels (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_fuels_station_idx on public.portal_fuels(station_id);
alter table public.portal_fuels add constraint portal_fuels_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_rates (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_rates_station_idx on public.portal_rates(station_id);
alter table public.portal_rates add constraint portal_rates_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_machines (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_machines_station_idx on public.portal_machines(station_id);
alter table public.portal_machines add constraint portal_machines_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_nozzles (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_nozzles_station_idx on public.portal_nozzles(station_id);
alter table public.portal_nozzles add constraint portal_nozzles_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_shifts (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_shifts_station_idx on public.portal_shifts(station_id);
alter table public.portal_shifts add constraint portal_shifts_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_assignments (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_assignments_station_idx on public.portal_assignments(station_id);
alter table public.portal_assignments add constraint portal_assignments_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_runs (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_runs_station_idx on public.portal_runs(station_id);
alter table public.portal_runs add constraint portal_runs_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_meter_reconciliations (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_meter_reconciliations_station_idx on public.portal_meter_reconciliations(station_id);
alter table public.portal_meter_reconciliations add constraint portal_meter_reconciliations_station_fk foreign key(station_id) references public.portal_stations(id) deferrable initially deferred;
create table public.portal_audit (id text primary key, position integer not null default 0, data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id), station_id text generated always as (data->>'stationId') stored);
create index portal_audit_station_idx on public.portal_audit(station_id);
create unique index portal_users_email_unique on public.portal_users(lower(data->>'email'));
alter table public.portal_users add constraint portal_users_role_check check(data->>'role' in ('super_admin','station_admin','salesman') and data->>'email' is not null and ((data->>'role'='super_admin' and station_id is null) or (data->>'role'<>'super_admin' and station_id is not null)));
alter table public.portal_revision enable row level security;
revoke all on public.portal_revision from public, anon, authenticated;
grant select,insert,update,delete on public.portal_revision to service_role;
alter table public.portal_stations enable row level security;
revoke all on public.portal_stations from public, anon, authenticated;
grant select,insert,update,delete on public.portal_stations to service_role;
alter table public.portal_users enable row level security;
revoke all on public.portal_users from public, anon, authenticated;
grant select,insert,update,delete on public.portal_users to service_role;
alter table public.portal_fuels enable row level security;
revoke all on public.portal_fuels from public, anon, authenticated;
grant select,insert,update,delete on public.portal_fuels to service_role;
alter table public.portal_rates enable row level security;
revoke all on public.portal_rates from public, anon, authenticated;
grant select,insert,update,delete on public.portal_rates to service_role;
alter table public.portal_machines enable row level security;
revoke all on public.portal_machines from public, anon, authenticated;
grant select,insert,update,delete on public.portal_machines to service_role;
alter table public.portal_nozzles enable row level security;
revoke all on public.portal_nozzles from public, anon, authenticated;
grant select,insert,update,delete on public.portal_nozzles to service_role;
alter table public.portal_shifts enable row level security;
revoke all on public.portal_shifts from public, anon, authenticated;
grant select,insert,update,delete on public.portal_shifts to service_role;
alter table public.portal_assignments enable row level security;
revoke all on public.portal_assignments from public, anon, authenticated;
grant select,insert,update,delete on public.portal_assignments to service_role;
alter table public.portal_runs enable row level security;
revoke all on public.portal_runs from public, anon, authenticated;
grant select,insert,update,delete on public.portal_runs to service_role;
alter table public.portal_meter_reconciliations enable row level security;
revoke all on public.portal_meter_reconciliations from public, anon, authenticated;
grant select,insert,update,delete on public.portal_meter_reconciliations to service_role;
alter table public.portal_audit enable row level security;
revoke all on public.portal_audit from public, anon, authenticated;
grant select,insert,update,delete on public.portal_audit to service_role;
create function public.portal_load() returns jsonb language sql stable security invoker set search_path='' as $body$
select jsonb_build_object('revision',r.revision,'sessions',r.sessions,'db',jsonb_build_object(
'stations',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_stations t),
'users',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_users t),
'fuels',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_fuels t),
'rates',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_rates t),
'machines',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_machines t),
'nozzles',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_nozzles t),
'shifts',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_shifts t),
'assignments',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_assignments t),
'runs',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_runs t),
'meterReconciliations',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_meter_reconciliations t),
'audit',(select coalesce(jsonb_agg(t.data order by t.position, t.id),'[]'::jsonb) from public.portal_audit t)
)) from public.portal_revision r where r.id=true;
$body$;
create function public.portal_save(expected_revision bigint, document jsonb, session_records jsonb) returns bigint language plpgsql security invoker set search_path='' as $body$
declare current_revision bigint;
begin
select revision into current_revision from public.portal_revision where id=true for update;
if current_revision is distinct from expected_revision then raise exception 'PORTAL_CONFLICT' using errcode='40001'; end if;
if jsonb_typeof(document) is distinct from 'object' or jsonb_typeof(session_records) is distinct from 'array' then raise exception 'Invalid portal state'; end if;
if jsonb_typeof(document->'stations') is distinct from 'array' then raise exception 'Missing collection stations'; end if;
insert into public.portal_stations(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'stations') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_stations.data is distinct from excluded.data or portal_stations.position is distinct from excluded.position;
delete from public.portal_stations where id not in (select value->>'id' from jsonb_array_elements(document->'stations'));
if jsonb_typeof(document->'users') is distinct from 'array' then raise exception 'Missing collection users'; end if;
insert into public.portal_users(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'users') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_users.data is distinct from excluded.data or portal_users.position is distinct from excluded.position;
delete from public.portal_users where id not in (select value->>'id' from jsonb_array_elements(document->'users'));
if jsonb_typeof(document->'fuels') is distinct from 'array' then raise exception 'Missing collection fuels'; end if;
insert into public.portal_fuels(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'fuels') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_fuels.data is distinct from excluded.data or portal_fuels.position is distinct from excluded.position;
delete from public.portal_fuels where id not in (select value->>'id' from jsonb_array_elements(document->'fuels'));
if jsonb_typeof(document->'rates') is distinct from 'array' then raise exception 'Missing collection rates'; end if;
insert into public.portal_rates(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'rates') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_rates.data is distinct from excluded.data or portal_rates.position is distinct from excluded.position;
delete from public.portal_rates where id not in (select value->>'id' from jsonb_array_elements(document->'rates'));
if jsonb_typeof(document->'machines') is distinct from 'array' then raise exception 'Missing collection machines'; end if;
insert into public.portal_machines(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'machines') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_machines.data is distinct from excluded.data or portal_machines.position is distinct from excluded.position;
delete from public.portal_machines where id not in (select value->>'id' from jsonb_array_elements(document->'machines'));
if jsonb_typeof(document->'nozzles') is distinct from 'array' then raise exception 'Missing collection nozzles'; end if;
insert into public.portal_nozzles(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'nozzles') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_nozzles.data is distinct from excluded.data or portal_nozzles.position is distinct from excluded.position;
delete from public.portal_nozzles where id not in (select value->>'id' from jsonb_array_elements(document->'nozzles'));
if jsonb_typeof(document->'shifts') is distinct from 'array' then raise exception 'Missing collection shifts'; end if;
insert into public.portal_shifts(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'shifts') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_shifts.data is distinct from excluded.data or portal_shifts.position is distinct from excluded.position;
delete from public.portal_shifts where id not in (select value->>'id' from jsonb_array_elements(document->'shifts'));
if jsonb_typeof(document->'assignments') is distinct from 'array' then raise exception 'Missing collection assignments'; end if;
insert into public.portal_assignments(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'assignments') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_assignments.data is distinct from excluded.data or portal_assignments.position is distinct from excluded.position;
delete from public.portal_assignments where id not in (select value->>'id' from jsonb_array_elements(document->'assignments'));
if jsonb_typeof(document->'runs') is distinct from 'array' then raise exception 'Missing collection runs'; end if;
insert into public.portal_runs(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'runs') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_runs.data is distinct from excluded.data or portal_runs.position is distinct from excluded.position;
delete from public.portal_runs where id not in (select value->>'id' from jsonb_array_elements(document->'runs'));
if jsonb_typeof(document->'meterReconciliations') is distinct from 'array' then raise exception 'Missing collection meterReconciliations'; end if;
insert into public.portal_meter_reconciliations(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'meterReconciliations') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_meter_reconciliations.data is distinct from excluded.data or portal_meter_reconciliations.position is distinct from excluded.position;
delete from public.portal_meter_reconciliations where id not in (select value->>'id' from jsonb_array_elements(document->'meterReconciliations'));
if jsonb_typeof(document->'audit') is distinct from 'array' then raise exception 'Missing collection audit'; end if;
insert into public.portal_audit(id,position,data) select value->>'id',ordinality,value from jsonb_array_elements(document->'audit') with ordinality on conflict(id) do update set data=excluded.data,position=excluded.position where portal_audit.data is distinct from excluded.data or portal_audit.position is distinct from excluded.position;
delete from public.portal_audit where id not in (select value->>'id' from jsonb_array_elements(document->'audit'));
update public.portal_revision set revision=revision+1,sessions=session_records where id=true returning revision into current_revision;
return current_revision;
end;
$body$;
revoke all on function public.portal_load() from public,anon,authenticated;
revoke all on function public.portal_save(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.portal_load() to service_role;
grant execute on function public.portal_save(bigint,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
create table public.portal_login_limits (key text primary key, count integer not null check(count>0), expires_at timestamptz not null);
alter table public.portal_login_limits enable row level security;
revoke all on public.portal_login_limits from public,anon,authenticated;
grant select,insert,update,delete on public.portal_login_limits to service_role;
create index portal_login_limits_expiry_idx on public.portal_login_limits(expires_at);
create function public.portal_login_attempt(identity_key text) returns boolean language plpgsql security invoker set search_path='' as $body$
declare attempts integer;
begin
if identity_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid identity'; end if;
delete from public.portal_login_limits where expires_at < now();
insert into public.portal_login_limits(key,count,expires_at) values(identity_key,1,now()+interval '15 minutes')
on conflict(key) do update set count=public.portal_login_limits.count+1 returning count into attempts;
return attempts<=10;
end; $body$;
create function public.portal_login_clear(identity_key text) returns void language sql security invoker set search_path='' as $body$
delete from public.portal_login_limits where key=identity_key;
$body$;
revoke all on function public.portal_login_attempt(text),public.portal_login_clear(text) from public,anon,authenticated;
grant execute on function public.portal_login_attempt(text),public.portal_login_clear(text) to service_role;
notify pgrst,'reload schema';
