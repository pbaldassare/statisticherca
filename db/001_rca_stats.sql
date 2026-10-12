-- Statistiche RCA anonimizzate.
-- Schema isolato da public, rcadealer e gestionalesir.
-- Nessun grant a anon/authenticated: la Data API non deve leggere queste tabelle.
-- Il job scrive con un ruolo che bypassa la RLS (service_role / postgres).

create schema if not exists rca_stats;

revoke all on schema rca_stats from public;
revoke all on schema rca_stats from anon, authenticated;
grant usage on schema rca_stats to service_role;

create table if not exists rca_stats.ingest_runs (
  id bigint generated always as identity primary key,
  requested_date date not null,
  status text not null check (status in ('success', 'error')),
  http_status integer,
  quote_count integer,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ingest_runs_requested_date_idx
  on rca_stats.ingest_runs (requested_date);

create table if not exists rca_stats.quotes (
  id bigint generated always as identity primary key,
  ingest_run_id bigint not null references rca_stats.ingest_runs (id),
  requested_date date not null,
  data_preventivo timestamp without time zone,
  veicolo text not null check (veicolo in ('rca_auto', 'rca_moto', 'rca_autocarri')),
  tipo_contraente text check (tipo_contraente in ('privato', 'azienda')),
  eta smallint check (eta is null or (eta >= 0 and eta <= 120)),
  straniero boolean,
  provincia text,
  cu text,
  tipologia_rca text,
  source jsonb not null
);

create index if not exists quotes_requested_date_idx
  on rca_stats.quotes (requested_date);

create index if not exists quotes_veicolo_requested_date_idx
  on rca_stats.quotes (veicolo, requested_date);

create index if not exists quotes_ingest_run_id_idx
  on rca_stats.quotes (ingest_run_id);

create index if not exists quotes_provincia_idx
  on rca_stats.quotes (provincia);

create index if not exists quotes_cu_idx
  on rca_stats.quotes (cu);

create table if not exists rca_stats.quotations (
  id bigint generated always as identity primary key,
  quote_id bigint not null references rca_stats.quotes (id) on delete cascade,
  posizione smallint not null check (posizione > 0),
  compagnia text not null,
  premio_rca numeric(12, 2) not null,
  frazionamento smallint not null check (frazionamento in (0, 1, 2))
);

create index if not exists quotations_quote_id_idx
  on rca_stats.quotations (quote_id);

create index if not exists quotations_compagnia_frazionamento_idx
  on rca_stats.quotations (compagnia, frazionamento);

alter table rca_stats.ingest_runs enable row level security;
alter table rca_stats.quotes enable row level security;
alter table rca_stats.quotations enable row level security;

alter table rca_stats.ingest_runs force row level security;
alter table rca_stats.quotes force row level security;
alter table rca_stats.quotations force row level security;

revoke all on rca_stats.ingest_runs, rca_stats.quotes, rca_stats.quotations
  from public, anon, authenticated;

grant select, insert, update, delete
  on rca_stats.ingest_runs, rca_stats.quotes, rca_stats.quotations
  to service_role;

grant usage, select on all sequences in schema rca_stats to service_role;

alter default privileges in schema rca_stats
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema rca_stats
  grant usage, select on sequences to service_role;

create or replace view rca_stats.v_premi_annuali
with (security_invoker = true) as
select
  p.id as quote_id,
  p.requested_date,
  p.data_preventivo,
  p.veicolo,
  p.tipo_contraente,
  p.eta,
  p.straniero,
  p.provincia,
  p.cu,
  p.tipologia_rca,
  z.compagnia,
  z.premio_rca,
  z.posizione
from rca_stats.quotes p
join rca_stats.quotations z on z.quote_id = p.id
where z.frazionamento = 1;

create or replace view rca_stats.v_riepilogo_giorno
with (security_invoker = true) as
select
  requested_date,
  veicolo,
  count(*)::integer as preventivi,
  count(*) filter (where n_quotazioni > 0)::integer as preventivi_con_premio,
  count(*) filter (where n_quotazioni = 0)::integer as preventivi_senza_premio
from (
  select
    p.id,
    p.requested_date,
    p.veicolo,
    count(z.id)::integer as n_quotazioni
  from rca_stats.quotes p
  left join rca_stats.quotations z on z.quote_id = p.id
  group by p.id
) giorni
group by requested_date, veicolo;

revoke all on rca_stats.v_premi_annuali, rca_stats.v_riepilogo_giorno
  from public, anon, authenticated;

grant select on rca_stats.v_premi_annuali, rca_stats.v_riepilogo_giorno
  to service_role;

comment on schema rca_stats is
  'Preventivi RCA anonimizzati scaricati da api.assicurapp.it. Nessun dato identificativo.';

comment on column rca_stats.quotes.data_preventivo is
  'Ora italiana, senza fuso, come restituita dall''API.';

comment on column rca_stats.quotations.frazionamento is
  '1 annuale, 2 semestrale (premio del semestre), 0 premio unico. Confrontare solo a parita'' di frazionamento.';

create or replace function rca_stats.dashboard(p_from date, p_to date, p_veicolo text)
returns jsonb
language sql
stable
as $fn$
with filtered as (
  select p.*
  from rca_stats.quotes p
  where p.requested_date between p_from and p_to
    and (p_veicolo is null or p_veicolo = 'tutti' or p.veicolo = p_veicolo)
),
base as (
  select
    f.id,
    f.requested_date,
    f.veicolo,
    f.tipo_contraente,
    f.eta,
    f.straniero,
    f.provincia,
    f.cu,
    f.tipologia_rca,
    count(z.id)::int as n_quotazioni,
    min(z.premio_rca) filter (where z.frazionamento = 1) as premio_annuo
  from filtered f
  left join rca_stats.quotations z on z.quote_id = f.id
  group by f.id, f.requested_date, f.veicolo, f.tipo_contraente, f.eta, f.straniero, f.provincia, f.cu, f.tipologia_rca
)
select jsonb_build_object(
  'overview', (
    select jsonb_build_object(
      'preventivi', count(*)::int,
      'con_premio', count(*) filter (where n_quotazioni > 0)::int,
      'senza_premio', count(*) filter (where n_quotazioni = 0)::int,
      'con_premio_annuo', count(premio_annuo)::int,
      'mediana_annuale', round((percentile_cont(0.5) within group (order by premio_annuo))::numeric, 2),
      'minimo_annuale', round(min(premio_annuo), 2),
      'compagnie', (
        select count(distinct z.compagnia)::int
        from filtered f
        join rca_stats.quotations z on z.quote_id = f.id
        where z.frazionamento = 1
      )
    )
    from base
  ),
  'companies', coalesce((
    select jsonb_agg(to_jsonb(c) order by c.mediana)
    from (
      select
        z.compagnia,
        count(*)::int as quotazioni,
        round((percentile_cont(0.5) within group (order by z.premio_rca))::numeric, 2) as mediana,
        round(min(z.premio_rca), 2) as minimo,
        round(max(z.premio_rca), 2) as massimo
      from filtered f
      join rca_stats.quotations z on z.quote_id = f.id
      where z.frazionamento = 1
      group by z.compagnia
    ) c
  ), '[]'::jsonb),
  'provinces', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.preventivi desc)
    from (
      select
        coalesce(provincia, 'n.d.') as provincia,
        count(*)::int as preventivi,
        round((percentile_cont(0.5) within group (order by premio_annuo))::numeric, 2) as mediana
      from base
      group by coalesce(provincia, 'n.d.')
    ) r
  ), '[]'::jsonb),
  'vehicles', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.preventivi desc)
    from (
      select veicolo, count(*)::int as preventivi
      from base
      group by veicolo
    ) r
  ), '[]'::jsonb),
  'contraenti', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.preventivi desc)
    from (
      select coalesce(tipo_contraente, 'n.d.') as tipo, count(*)::int as preventivi
      from base
      group by coalesce(tipo_contraente, 'n.d.')
    ) r
  ), '[]'::jsonb),
  'eta', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.ordine)
    from (
      select fascia, ordine, count(*)::int as preventivi
      from (
        select
          case
            when eta is null then 'non disponibile'
            when eta < 26 then '18-25'
            when eta < 36 then '26-35'
            when eta < 46 then '36-45'
            when eta < 56 then '46-55'
            when eta < 66 then '56-65'
            else '66+'
          end as fascia,
          case
            when eta is null then 99
            when eta < 26 then 1
            when eta < 36 then 2
            when eta < 46 then 3
            when eta < 56 then 4
            when eta < 66 then 5
            else 6
          end as ordine
        from base
      ) fasce
      group by fascia, ordine
    ) r
  ), '[]'::jsonb),
  'cu', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.cu)
    from (
      select
        coalesce(cu, 'n.d.') as cu,
        count(*)::int as preventivi,
        round((percentile_cont(0.5) within group (order by premio_annuo))::numeric, 2) as mediana
      from base
      group by coalesce(cu, 'n.d.')
    ) r
  ), '[]'::jsonb),
  'tipologie', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.preventivi desc)
    from (
      select coalesce(tipologia_rca, 'n.d.') as tipologia, count(*)::int as preventivi
      from base
      group by coalesce(tipologia_rca, 'n.d.')
    ) r
  ), '[]'::jsonb),
  'stranieri', (
    select jsonb_build_object(
      'si', count(*) filter (where straniero is true)::int,
      'no', count(*) filter (where straniero is false)::int,
      'nd', count(*) filter (where straniero is null)::int
    )
    from base
  ),
  'days', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.giorno)
    from (
      select
        requested_date as giorno,
        count(*)::int as preventivi,
        count(*) filter (where n_quotazioni > 0)::int as con_premio,
        round((percentile_cont(0.5) within group (order by premio_annuo))::numeric, 2) as mediana
      from base
      group by requested_date
    ) r
  ), '[]'::jsonb)
);
$fn$;

revoke all on function rca_stats.dashboard(date, date, text) from public, anon, authenticated;
grant execute on function rca_stats.dashboard(date, date, text) to service_role;
