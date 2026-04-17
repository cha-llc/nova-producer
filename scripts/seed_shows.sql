-- Seed: Tea Time Network shows
-- Run after migrations to populate show_configs

insert into public.show_configs
  (show_name, display_name, description, color, day_of_week, voice_id, avatar_id)
values
  (
    'sunday_power_hour',
    'Sunday Power Hour',
    'Weekly motivation and mindset reset. Start your Sunday with hard truth and clear direction.',
    '#C9A84C',
    'Sunday',
    '',
    ''
  ),
  (
    'motivation_court',
    'Motivation Court',
    'The case for your potential. Every Wednesday, CJ puts excuses on trial.',
    '#2A9D8F',
    'Wednesday',
    '',
    ''
  ),
  (
    'tea_time_with_cj',
    'Tea Time with CJ',
    'Sip slow. Real talk about life, business, and what it takes to level up.',
    '#9B5DE5',
    'Tuesday',
    '',
    ''
  ),
  (
    'confession_court',
    'Confession Court',
    'Friday accountability. What did you say you were going to do this week — and did you do it?',
    '#C1121F',
    'Friday',
    '',
    ''
  )
on conflict (show_name) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  color        = excluded.color,
  day_of_week  = excluded.day_of_week;
