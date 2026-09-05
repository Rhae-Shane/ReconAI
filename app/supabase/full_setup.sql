-- Full Reactor Design Tool schema + seed

-- Reactor design tool — initial schema.
-- Mirrors the tables implied by ReCal_Combine_10-07-2026_R1.xlsx.
-- Auth: single internal team with equal access → every table enables RLS with one
-- permissive policy on the `authenticated` role. The app connects with the publishable
-- (anon) key; the seed script uses the secret key.

-- ── Saved design runs / quotes ──────────────────────────────────────────────
create table if not exists public.designs (
  id          uuid primary key default gen_random_uuid(),
  quote_no    text,
  job_no      text,
  status      text not null default 'draft',          -- draft | quoted | approved
  inputs      jsonb not null,                         -- DesignInputs
  outputs     jsonb not null,                         -- DesignOutputs
  total       numeric,                                -- W26
  quote_price numeric,                                -- W28
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.design_revisions (
  id         bigint generated always as identity primary key,
  design_id  uuid not null references public.designs(id) on delete cascade,
  revision   int  not null,
  inputs     jsonb not null,
  outputs    jsonb not null,
  created_at timestamptz not null default now(),
  unique (design_id, revision)
);

-- ── Editable raw-material prices ───────────────────────────────────────────
create table if not exists public.raw_material_prices (
  id          bigint generated always as identity primary key,
  item        text not null unique,                    -- matches CostLine.id
  label       text,
  unit        text,
  price       numeric,                                 -- rate per unit (nullable for 'from table')
  qty_formula text,
  sort        int not null default 0
);

-- ── Stock / conductor sizes inventory ──────────────────────────────────────
create table if not exists public.stock_items (
  id               bigint generated always as identity primary key,
  material         text not null check (material in ('AL STRIP', 'AL BUSBAR')),
  specification    text,
  width            numeric not null,
  thickness        numeric not null,
  area             numeric generated always as (width * thickness) stored,
  physical_stock_kg numeric,
  roll_count       int,
  remarks          text,
  updated_at       timestamptz not null default now()
);

-- ── Reference tables (editable) ────────────────────────────────────────────
create table if not exists public.bobbin_sizes (
  id           bigint generated always as identity primary key,
  dia          int not null,
  length_mm    int,
  qty          int,
  dog_bone_qty int
);

create table if not exists public.skin_depth (
  id           bigint generated always as identity primary key,
  harmonic     text not null check (harmonic in ('50Hz', '60Hz')),
  frequency_hz numeric not null,
  thickness    numeric not null,
  unique (harmonic, frequency_hz)
);

create table if not exists public.material_constants (
  material               text primary key check (material in ('Aluminium', 'Copper')),
  resistivity            numeric not null,
  density                numeric not null,
  width_max              numeric not null,
  thickness_min          numeric not null,
  covering               numeric not null,
  theoretical_resistivity numeric not null,
  isc_k                  numeric not null
);

create table if not exists public.item_densities (
  item    text primary key,
  density numeric,
  unit    text
);

create table if not exists public.insulator_dimensions (
  id          bigint generated always as identity primary key,
  voltage_kv  numeric not null,
  type        text,
  height_mm   numeric,
  pcd         numeric,
  creepage    numeric,
  qty         int
);

create table if not exists public.busbar_cross_sizes (
  id        bigint generated always as identity primary key,
  label     text,
  width     numeric not null,
  thickness numeric not null
);

create table if not exists public.winding_matrix (
  id          bigint generated always as identity primary key,
  design_type text not null,
  orientation text not null,
  w           text,
  t           text
);

create table if not exists public.quote_settings (
  key   text primary key,
  value numeric
);

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.designs             enable row level security;
alter table public.design_revisions    enable row level security;
alter table public.raw_material_prices enable row level security;
alter table public.stock_items         enable row level security;
alter table public.bobbin_sizes        enable row level security;
alter table public.skin_depth          enable row level security;
alter table public.material_constants  enable row level security;
alter table public.item_densities      enable row level security;
alter table public.insulator_dimensions enable row level security;
alter table public.busbar_cross_sizes  enable row level security;
alter table public.winding_matrix      enable row level security;
alter table public.quote_settings      enable row level security;

-- Single-team equal-access policy: any authenticated user may read/write.
-- (Optionally tighten `designs` to created_by = auth.uid() later if needed.)
do $$
declare t text;
begin
  foreach t in array array[
    'designs','design_revisions','raw_material_prices','stock_items','bobbin_sizes',
    'skin_depth','material_constants','item_densities','insulator_dimensions',
    'busbar_cross_sizes','winding_matrix','quote_settings'
  ]
  loop
    execute format('create policy "authenticated all" on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Seed reference + price + stock data (generated by npm run generate:seed).
-- Derives values from the calculator defaults so DB == engine defaults.
-- Safe to re-run: upserts via ON CONFLICT DO NOTHING where a natural key exists.

insert into public.material_constants (material, resistivity, density, width_max, thickness_min, covering, theoretical_resistivity, isc_k) values
  ('Aluminium', 2.82e-8, 2700, 12, 1.8, 0.75, 2.82e-8, 72.55),
  ('Copper', 1.72e-8, 8960, 12, 1.8, 0.75, 1.72e-8, 110)
on conflict do nothing;


insert into public.skin_depth (harmonic, frequency_hz, thickness) values
  ('50Hz', 50, 11.592404155084477),
  ('50Hz', 100, 8.197067588315345),
  ('50Hz', 150, 6.692877659492959),
  ('50Hz', 200, 5.7962020775422385),
  ('50Hz', 250, 5.184280742683981),
  ('50Hz', 300, 4.73257917867942),
  ('50Hz', 350, 4.38151692738648),
  ('50Hz', 400, 4.098533794157673),
  ('50Hz', 450, 3.8641347183614925),
  ('50Hz', 500, 3.6658400687266743),
  ('50Hz', 550, 3.4952413636883746),
  ('50Hz', 600, 3.3464388297464795),
  ('50Hz', 650, 3.2151544297737606),
  ('50Hz', 700, 3.098200331238626),
  ('50Hz', 750, 2.99314588234319),
  ('50Hz', 800, 2.8981010387711192),
  ('50Hz', 850, 2.8115709874271975),
  ('50Hz', 900, 2.7323558627717817),
  ('50Hz', 950, 2.6594799065628547),
  ('50Hz', 1000, 2.5921403713419906),
  ('50Hz', 1050, 2.5296699774854865),
  ('50Hz', 1100, 2.4715088701477654),
  ('50Hz', 1150, 2.417183359910239),
  ('50Hz', 1200, 2.36628958933971),
  ('50Hz', 1250, 2.3184808310168954),
  ('50Hz', 1300, 2.273457499854994),
  ('50Hz', 1350, 2.2309592198309867),
  ('50Hz', 1400, 2.19075846369324),
  ('50Hz', 1450, 2.152655409863473),
  ('50Hz', 1500, 2.116473750485462)
on conflict do nothing;


insert into public.skin_depth (harmonic, frequency_hz, thickness) values
  ('60Hz', 60, 10.582368752427309),
  ('60Hz', 120, 7.482864705857974),
  ('60Hz', 180, 6.10973344787779),
  ('60Hz', 240, 5.291184376213654),
  ('60Hz', 300, 4.73257917867942),
  ('60Hz', 360, 4.320233952236651),
  ('60Hz', 420, 3.999759428700501),
  ('60Hz', 480, 3.741432352928987),
  ('60Hz', 540, 3.5274562508091023),
  ('60Hz', 600, 3.3464388297464795),
  ('60Hz', 660, 3.1907042313620684),
  ('60Hz', 720, 3.054866723938895),
  ('60Hz', 780, 2.9350210117495803),
  ('60Hz', 840, 2.8282570151489552),
  ('60Hz', 900, 2.7323558627717817),
  ('60Hz', 960, 2.645592188106827),
  ('60Hz', 1020, 2.566601419734916),
  ('60Hz', 1080, 2.494288235285991),
  ('60Hz', 1140, 2.4277618934270118),
  ('60Hz', 1200, 2.36628958933971),
  ('60Hz', 1260, 2.309262182853978),
  ('60Hz', 1320, 2.2561685987567293),
  ('60Hz', 1380, 2.2065764197482776),
  ('60Hz', 1440, 2.1601169761183256),
  ('60Hz', 1500, 2.116473750485462),
  ('60Hz', 1560, 2.0753732603331296),
  ('60Hz', 1620, 2.036577815959263),
  ('60Hz', 1680, 1.9998797143502505),
  ('60Hz', 1740, 1.9650965441962553),
  ('60Hz', 1800, 1.9320673591807462)
on conflict do nothing;


insert into public.raw_material_prices (item, label, unit, price) values
  ('conductor', NULL, NULL, 500),
  ('busbar', NULL, NULL, 422),
  ('dogBone', NULL, NULL, 180),
  ('epoxySheet', NULL, NULL, 1300),
  ('resin', NULL, NULL, 400),
  ('tieRod1', NULL, NULL, 200),
  ('tieRod2', NULL, NULL, 200),
  ('fibreTape', NULL, NULL, 250),
  ('paint', NULL, NULL, 330),
  ('primer', NULL, NULL, 235),
  ('thinner', NULL, NULL, 145),
  ('cleaningThinner', NULL, NULL, 90),
  ('glassPowder', NULL, NULL, 26)
on conflict do nothing;


insert into public.raw_material_prices (item, label, unit, price) values
  ('crossBar', 'Cross bar Assembly', 'Per Set/coil', NULL),
  ('labour', 'Labour', 'Per Set/coil', NULL),
  ('packing', 'Packing', 'Per Set/coil', NULL),
  ('insulator', 'Insulator', 'Per Set/coil', NULL),
  ('otherRm', 'Other RM Cost', 'Per Set/coil', NULL),
  ('overhead', 'Over head', 'Per Set/coil', NULL),
  ('transport', 'Transport', 'Per Set/coil', NULL)
on conflict do nothing;


insert into public.stock_items (material, specification, width, thickness, physical_stock_kg, roll_count, remarks) values
  ('AL STRIP', 'Dpdfgc, F/H class', 10, 4.5, 75.38, 6, '6 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 9, 2.7, 36.4, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 9, 2.25, 187.42, 4, '4 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 6, 3.5, 16.28, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 7, 3.5, 11.4, 2, '2 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 6, 4, 22.36, 3, '3 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 6.5, 3, 45.16, 2, '2 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 8.5, 2.25, 49.96, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 7, 3, 31.3, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 11, 3.75, 35.1, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 4, 2.5, 21, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 6, 2, 11.9, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 9, 3, 24.6, 2, '2 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 8, 1.5, 7.7, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 7, 2.5, 17.5, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 5, 1.8, 39.68, 3, '3 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 7, 2, 61, 1, '1 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 5, 3, 82.28, 3, '3 Roll'),
  ('AL STRIP', 'Dpdfgc, F/H class', 9, 2.2, 45.5, 1, '1 Roll'),
  ('AL BUSBAR', 'EC Grade 75x10mm L=3660mm', 75, 10, 0, 0, NULL),
  ('AL BUSBAR', 'EC Grade 100x10mm L=3660mm', 100, 10, 0, 0, NULL),
  ('AL BUSBAR', 'EC Grade 63x10mm L=3660mm', 63, 10, 2, 0, 'Nos'),
  ('AL BUSBAR', 'EC Grade 40x10mm L=3660mm', 40, 10, 0, 0, NULL),
  ('AL BUSBAR', 'EC Grade 50x6mm L=3660mm', 50, 6, 0, 0, NULL),
  ('AL BUSBAR', 'EC Grade 25x6mm L=3660mm', 25, 6, 0, 0, NULL),
  ('AL BUSBAR', 'EC Grade 60x6mm L=3660mm', 60, 6, 0, 0, NULL)
on conflict do nothing;


insert into public.bobbin_sizes (dia, length_mm, qty) values
  (150, 1500, 4),
  (170, 1500, 3),
  (200, 1500, 2),
  (220, 1500, 4),
  (300, 1500, 3),
  (350, 1500, 3),
  (600, 1500, 4),
  (950, 1800, 1),
  (1100, 2000, 1),
  (1200, 1870, 3),
  (1400, 2500, 1)
on conflict do nothing;


insert into public.insulator_dimensions (voltage_kv, type, height_mm, pcd, creepage, qty) values
  (11, 'Solid Core Post Insulator', 254, 57, 320, 8),
  (33, 'Solid Core Post Insulator', 508, 76, 900, 4),
  (33, 'Solid Core Post Insulator (long)', 508, 76, 1116, 4)
on conflict do nothing;


insert into public.item_densities (item, density, unit) values
  ('Tie Rod', 2100, 'kg/M3'),
  ('Dog Bone 16X10', 0.245, 'kg/Mtr per piece'),
  ('Flat Sheet', 2100, 'kg/M3'),
  ('Sheet', 2.7, 'kg/Sheet'),
  ('Fiber Tape', 22.5, 'Mtr/kg'),
  ('Nut M16', 41, 'Nos per kg'),
  ('Nut M20', 16, 'Nos. per kg'),
  ('Paint', 0.75, 'kg/M2'),
  ('Primer', 0.5, 'kg/M2'),
  ('Thinner', 0.5, 'kg/M2'),
  ('Resin', 1.5, 'kg/Sq.mtr'),
  ('Busbar', 22, 'kg/Coil')
on conflict do nothing;


insert into public.quote_settings (key, value) values ('quote_multiplier', 1.5) on conflict do nothing;
