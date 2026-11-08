// Übersetzungen der Manager-Bezeichnungen (Original ist englisch)
const T = {
  Off: 'Aus', On: 'An', Yes: 'Ja', No: 'Nein', None: 'Keine', Limited: 'Begrenzt', Full: 'Voll', Complete: 'Komplett',
  Normal: 'Normal', Dynamic: 'Dynamisch', Optimal: 'Optimal', Anyone: 'Jeder', Custom: 'Eigene Einstellung',
  Novice: 'Anfänger', Amateur: 'Amateur', GetReal: 'GetReal (Profi)',
  'Black Only': 'Nur schwarze Flagge', 'Visual Only': 'Nur visuell', 'Slow-Down': 'Verlangsamung', 'Stop-And-Go': 'Stop & Go', 'Drive-Through': 'Durchfahrtsstrafe',
  MinimumTwoTires: 'Mind. 2 Reifen wechseln', MinimumFourTires: 'Alle 4 Reifen wechseln',
  'Free Choice': 'Freie Wahl', 'Forced Off': 'Erzwungen aus', 'Forced On': 'Erzwungen an',
  'Forced Manual': 'Manuell erzwungen', 'Forced Manual with Auto Clutch': 'Manuell mit Auto-Kupplung', 'Forced Auto': 'Automatik erzwungen',
  'Forced Low': 'Erzwungen niedrig', 'Forced Medium': 'Erzwungen mittel', 'Forced High': 'Erzwungen hoch',
  'Forced ABS': 'ABS erzwungen', 'Forced Factory ABS': 'Serien-ABS erzwungen', 'Forced Assisted': 'Bremshilfe erzwungen',
  'Forced Factory Default': 'Serienzustand erzwungen', 'Forced Downloaded Or Own': 'Rennlinie: heruntergeladen/eigene', 'Forced Ideal Line': 'Ideale Linie erzwungen',
  '500 (default)': '500 (Standard)',
}
export const tr = (l) => T[l] ?? l
export const opts = (meta, group) => (meta?.[group] || []).map((o) => ({ value: o.value, label: tr(o.label) }))

export const PRESET_DEFAULTS = {
  1: { assist_transmission: -1, assist_esp: 3, assist_steer: 1, assist_traction: 1, assist_raceline: -1, assist_autopit: 1 },
  2: { assist_transmission: -1, assist_esp: 1, assist_steer: 0, assist_traction: 1, assist_raceline: -1, assist_autopit: -1 },
  3: { assist_transmission: -1, assist_esp: 0, assist_steer: 0, assist_traction: 2, assist_raceline: -1, assist_autopit: -1 },
}

export const FIELD_KEYS = [
  'name', 'password', 'experience', 'layout_id', 'car_ids', 'max_players', 'warmup', 'sessions', 'time_multiplier',
  'drive_assist_preset', 'assist_transmission', 'assist_esp', 'assist_steer', 'assist_brake', 'assist_traction', 'assist_raceline', 'assist_autopit',
  'fuel_usage', 'tire_wear', 'tire_temperature', 'damage', 'flag_rules', 'cut_rules', 'mandatory_pitstop', 'prevent_false_start', 'wrecker_prevention',
  'max_ping', 'state_report_interval', 'race_finish_duration', 'reverse_start_order_places', 'stay_in_practice_if_empty', 'allow_join_in_qualifying',
  'starting_grid_from_leaderboards', 'checkered_after_time', 'fixed_setup', 'max_incident_points', 'min_rating', 'max_rating', 'min_reputation',
  'max_reputation', 'non_ready_pitlane_start_delay',
]

export const DEFAULT_FORM = {
  name: '', password: '', experience: 2481, layout_id: null, car_ids: [], max_players: 12, warmup: 0, time_multiplier: 0,
  sessions: {
    Practice: { duration: 10, laps: 0, time_of_day: 2, rolling_start: false },
    Qualify: { duration: 0, laps: 0, time_of_day: 2, rolling_start: false },
    Race1: { duration: 10, laps: 0, time_of_day: 2, rolling_start: false },
    Race2: { duration: 0, laps: 0, time_of_day: 2, rolling_start: false },
    Race3: { duration: 0, laps: 0, time_of_day: 2, rolling_start: false },
  },
  drive_assist_preset: 0, assist_transmission: -1, assist_esp: -1, assist_steer: -1, assist_brake: -1, assist_traction: -1, assist_raceline: -1, assist_autopit: -1,
  fuel_usage: 0, tire_wear: 0, tire_temperature: 0, damage: 0, flag_rules: 0, cut_rules: 0, mandatory_pitstop: 0, prevent_false_start: 0, wrecker_prevention: 0,
  max_ping: 0, state_report_interval: 500, race_finish_duration: 30, reverse_start_order_places: 0, stay_in_practice_if_empty: 0, allow_join_in_qualifying: 0,
  starting_grid_from_leaderboards: 0, checkered_after_time: 0, fixed_setup: 0, max_incident_points: 0, min_rating: 0, max_rating: 0, min_reputation: 0,
  max_reputation: 0, non_ready_pitlane_start_delay: 0,
}

export function toPayload(form) {
  const p = {}
  for (const k of FIELD_KEYS) p[k] = form[k]
  p.sessions = {}
  for (const [k, v] of Object.entries(form.sessions || {})) {
    p.sessions[k] = { duration: +v.duration || 0, laps: +v.laps || 0, time_of_day: v.time_of_day ?? null, rolling_start: !!v.rolling_start }
  }
  return p
}

export function fromServer(view) {
  const f = { ...DEFAULT_FORM, ...Object.fromEntries(FIELD_KEYS.filter((k) => view[k] !== undefined).map((k) => [k, view[k]])) }
  f.sessions = { ...DEFAULT_FORM.sessions }
  for (const [k, v] of Object.entries(view.sessions || {})) f.sessions[k] = { ...DEFAULT_FORM.sessions[k], ...v }
  return f
}
