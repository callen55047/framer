-- Jobs may declare a not-before time and stay unclaimable until it passes.

alter table jobs add column not_before text;
