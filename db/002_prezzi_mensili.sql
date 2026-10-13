-- Prezzi RCA confrontabili all'anno.
-- Annuale così com'è, semestrale moltiplicato per 2. Il premio unico resta fuori.
-- Premi sotto 60 € l'anno esclusi: sono quotazioni non realistiche.

drop function if exists rca_stats.dashboard(date, date, text);

create or replace function rca_stats.dashboard(
  p_from date,
  p_to date,
  p_veicolo text,
  p_persona text,
  p_eta text,
  p_cu text,
  p_provincia text
)
returns jsonb
language sql
stable
as $fn$
with quotes as (
  select
    p.id,
    p.requested_date,
    case
      when p.provincia is null or btrim(p.provincia) = '' then 'n.d.'
      else btrim(p.provincia)
    end as provincia,
    case
      when btrim(p.cu) ~ '^[0-9]+$' then lpad((btrim(p.cu)::int)::text, 2, '0')
      when p.cu is null or btrim(p.cu) = '' then 'n.d.'
      else btrim(p.cu)
    end as cu,
    coalesce(p.tipo_contraente, 'n.d.') as persona,
    case
      when p.eta is null then 'n.d.'
      when p.eta < 26 then '18-25'
      when p.eta < 36 then '26-35'
      when p.eta < 46 then '36-45'
      when p.eta < 56 then '46-55'
      when p.eta < 66 then '56-65'
      else '66+'
    end as fascia
  from rca_stats.quotes p
  where p.requested_date between p_from and p_to
    and (p_veicolo is null or p_veicolo = 'tutti' or p.veicolo = p_veicolo)
),
prezzi as materialized (
  select
    q.requested_date,
    q.provincia,
    q.cu,
    q.persona,
    q.fascia,
    z.compagnia,
    case
      when z.frazionamento = 1 then z.premio_rca
      when z.frazionamento = 2 then z.premio_rca * 2
    end as annuo
  from quotes q
  join rca_stats.quotations z on z.quote_id = q.id
  where z.compagnia is not null
    and btrim(z.compagnia) <> ''
    and (
      (z.frazionamento = 1 and z.premio_rca >= 60)
      or (z.frazionamento = 2 and z.premio_rca >= 30)
    )
),
scoped as materialized (
  select *
  from prezzi
  where (p_persona is null or p_persona = 'tutti' or persona = p_persona)
    and (p_eta is null or p_eta = 'tutte' or fascia = p_eta)
    and (p_cu is null or p_cu = 'tutte' or cu = p_cu)
    and (p_provincia is null or p_provincia = 'tutte' or provincia = p_provincia)
),
for_zone as materialized (
  select *
  from prezzi
  where (p_persona is null or p_persona = 'tutti' or persona = p_persona)
    and (p_eta is null or p_eta = 'tutte' or fascia = p_eta)
    and (p_cu is null or p_cu = 'tutte' or cu = p_cu)
),
for_cu as materialized (
  select *
  from prezzi
  where (p_persona is null or p_persona = 'tutti' or persona = p_persona)
    and (p_eta is null or p_eta = 'tutte' or fascia = p_eta)
    and (p_provincia is null or p_provincia = 'tutte' or provincia = p_provincia)
),
for_persona as materialized (
  select *
  from prezzi
  where (p_cu is null or p_cu = 'tutte' or cu = p_cu)
    and (p_provincia is null or p_provincia = 'tutte' or provincia = p_provincia)
),
company_stats as (
  select
    compagnia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana,
    count(*)::int as n
  from scoped
  group by compagnia
),
soglia as (
  select case
    when exists (select 1 from company_stats where n >= 8) then 8
    else 3
  end as n
),
classifica as (
  select
    c.compagnia,
    c.media,
    c.mediana,
    row_number() over (order by c.mediana, c.media, c.compagnia)::int as posto
  from company_stats c
  join soglia s on c.n >= s.n
),
zone_market as (
  select
    provincia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_zone
  group by provincia
  having count(*) >= 5
),
zone_company as (
  select
    provincia,
    compagnia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_zone
  group by provincia, compagnia
  having count(*) >= 5
),
zone_best as (
  select distinct on (provincia)
    provincia,
    compagnia as migliore,
    mediana as migliore_mediana
  from zone_company
  order by provincia, mediana, media, compagnia
),
class_market as (
  select
    cu,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_cu
  group by cu
  having count(*) >= 5
),
class_company as (
  select
    cu,
    compagnia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_cu
  group by cu, compagnia
  having count(*) >= 5
),
class_best as (
  select distinct on (cu)
    cu,
    compagnia as migliore,
    mediana as migliore_mediana
  from class_company
  order by cu, mediana, media, compagnia
),
person_market as (
  select
    persona,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_persona
  group by persona
  having count(*) >= 5
),
person_company as (
  select
    persona,
    compagnia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_persona
  group by persona, compagnia
  having count(*) >= 5
),
person_best as (
  select distinct on (persona)
    persona,
    compagnia as migliore,
    mediana as migliore_mediana
  from person_company
  order by persona, mediana, media, compagnia
),
age_market as (
  select
    fascia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_persona
  group by fascia
  having count(*) >= 5
),
age_company as (
  select
    fascia,
    compagnia,
    round(avg(annuo)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
  from for_persona
  group by fascia, compagnia
  having count(*) >= 5
),
age_best as (
  select distinct on (fascia)
    fascia,
    compagnia as migliore,
    mediana as migliore_mediana
  from age_company
  order by fascia, mediana, media, compagnia
)
select jsonb_build_object(
  'overview', (
    select jsonb_build_object(
      'media_annua', round(avg(annuo)::numeric, 2),
      'mediana_annua', round((percentile_cont(0.5) within group (order by annuo))::numeric, 2),
      'migliore_compagnia', (select compagnia from classifica where posto = 1),
      'migliore_mediana', (select mediana from classifica where posto = 1),
      'migliore_media', (select media from classifica where posto = 1),
      'soglia', (select n from soglia)
    )
    from scoped
  ),
  'compagnie', coalesce((
    select jsonb_agg(to_jsonb(c) order by c.posto)
    from (
      select compagnia, media, mediana, posto
      from classifica
    ) c
  ), '[]'::jsonb),
  'zone', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.media, r.provincia)
    from (
      select
        m.provincia,
        m.media,
        m.mediana,
        b.migliore,
        b.migliore_mediana
      from zone_market m
      left join zone_best b using (provincia)
    ) r
  ), '[]'::jsonb),
  'classi', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.cu)
    from (
      select
        m.cu,
        m.media,
        m.mediana,
        b.migliore,
        b.migliore_mediana
      from class_market m
      left join class_best b using (cu)
    ) r
  ), '[]'::jsonb),
  'persone', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.persona)
    from (
      select
        m.persona,
        m.media,
        m.mediana,
        b.migliore,
        b.migliore_mediana
      from person_market m
      left join person_best b using (persona)
    ) r
  ), '[]'::jsonb),
  'eta', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.ordine)
    from (
      select
        m.fascia,
        case m.fascia
          when '18-25' then 1
          when '26-35' then 2
          when '36-45' then 3
          when '46-55' then 4
          when '56-65' then 5
          when '66+' then 6
          else 99
        end as ordine,
        m.media,
        m.mediana,
        b.migliore,
        b.migliore_mediana
      from age_market m
      left join age_best b using (fascia)
    ) r
  ), '[]'::jsonb),
  'vittorie', coalesce((
    select jsonb_agg(to_jsonb(v) order by v.compagnia)
    from (
      select
        migliore as compagnia,
        jsonb_agg(provincia order by provincia) as zone
      from zone_best
      group by migliore
    ) v
  ), '[]'::jsonb),
  'mesi', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.mese)
    from (
      select
        to_char(requested_date, 'YYYY-MM') as mese,
        round(avg(annuo)::numeric, 2) as media,
        round((percentile_cont(0.5) within group (order by annuo))::numeric, 2) as mediana
      from scoped
      group by to_char(requested_date, 'YYYY-MM')
    ) r
  ), '[]'::jsonb),
  'opzioni', jsonb_build_object(
    'cu', coalesce((
      select jsonb_agg(cu order by cu)
      from (select distinct cu from quotes) s
    ), '[]'::jsonb),
    'province', coalesce((
      select jsonb_agg(provincia order by provincia)
      from (select distinct provincia from quotes) s
    ), '[]'::jsonb)
  )
);
$fn$;

revoke all on function rca_stats.dashboard(date, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function rca_stats.dashboard(date, date, text, text, text, text, text)
  to service_role;

comment on function rca_stats.dashboard(date, date, text, text, text, text, text) is
  'Prezzo annuo RCA: premio annuale, semestrale per 2. La compagnia migliore ha la mediana annua più bassa.';
