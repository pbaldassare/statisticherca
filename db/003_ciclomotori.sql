-- L'API ha aggiunto rca_ciclomotori. Il controllo sul tipo di veicolo lo accetta.

alter table rca_stats.quotes drop constraint if exists quotes_veicolo_check;

alter table rca_stats.quotes
  add constraint quotes_veicolo_check
  check (veicolo in ('rca_auto', 'rca_moto', 'rca_autocarri', 'rca_ciclomotori'));
