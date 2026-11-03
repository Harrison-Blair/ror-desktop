//! The table that Session runs: the players, the rounds with their turns and
//! interterm, the turn timer and the play nights, in `table.json` in the app
//! data folder, beside `world.json`. Round notes (turn, interterm and recap
//! notes) are Markdown files in `round-notes/`, not in the user's Notes
//! folder.
//!
//! Every record has a stable id and an `updatedAt` time, in milliseconds
//! since 1970, so it can sync later. Times are wall-clock milliseconds too,
//! so a running timer keeps counting through a restart.

use crate::world::{self, Paths, World};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

type Result<T> = std::result::Result<T, String>;

/// A play night ends by itself after this long with no activity.
pub const IDLE_MS: i64 = 6 * 60 * 60 * 1000;
/// The usual turn length of a new campaign: 15:00.
pub const DEFAULT_USUAL_SECONDS: i64 = 15 * 60;
/// The longest time a timer can hold: 99:59:59.
const MAX_SECONDS: i64 = 99 * 3600 + 59 * 60 + 59;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Length {
    Month,
    Quarter,
    Year,
}

impl Length {
    fn months(self) -> u32 {
        match self {
            Length::Month => 1,
            Length::Quarter => 3,
            Length::Year => 12,
        }
    }
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400) => {
            29
        }
        _ => 28,
    }
}

/// The end of a round that starts on `start` (`YYYY-MM-DD`), worked out date
/// to date on the real calendar: a quarter from 10 February ends 10 May, and
/// a month from 31 January ends on the last day of February. None when
/// `start` is not a real date.
pub fn end_date(start: &str, length: Length) -> Option<String> {
    if !world::is_iso_date(start) {
        return None;
    }
    let year: u32 = start[0..4].parse().ok()?;
    let month: u32 = start[5..7].parse().ok()?;
    let day: u32 = start[8..10].parse().ok()?;
    let total = year * 12 + (month - 1) + length.months();
    let (year, month) = (total / 12, total % 12 + 1);
    if year > 9999 {
        return None;
    }
    let day = day.min(days_in_month(year, month));
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub name: String,
    pub character_id: Option<String>,
    pub updated_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClockState {
    NotStarted,
    Running,
    Paused,
    AtZero,
}

/// A turn's timer. While it runs, the time left is `leftMs` minus the time
/// since `runningSince`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub state: ClockState,
    pub left_ms: i64,
    pub running_since: Option<i64>,
}

impl Clock {
    fn fresh(usual_seconds: i64) -> Clock {
        Clock {
            state: ClockState::NotStarted,
            left_ms: usual_seconds * 1000,
            running_since: None,
        }
    }

    /// The running time up to `now`, at most the time left.
    fn ran(&self, now: i64) -> i64 {
        match (self.state, self.running_since) {
            (ClockState::Running, Some(since)) => (now - since).clamp(0, self.left_ms),
            _ => 0,
        }
    }

    /// A running clock whose time ran out by `now` stops at zero.
    fn settle(&mut self, used_ms: &mut i64, now: i64) -> bool {
        if self.state == ClockState::Running && self.ran(now) >= self.left_ms {
            *used_ms += self.left_ms;
            *self = Clock {
                state: ClockState::AtZero,
                left_ms: 0,
                running_since: None,
            };
            return true;
        }
        false
    }

    /// Stops a running clock at `now` and adds the time it ran to `used`.
    fn stop(&mut self, used_ms: &mut i64, now: i64) {
        if self.state != ClockState::Running {
            return;
        }
        let ran = self.ran(now);
        *used_ms += ran;
        self.left_ms -= ran;
        self.running_since = None;
        self.state = if self.left_ms == 0 {
            ClockState::AtZero
        } else {
            ClockState::Paused
        };
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepState {
    Waiting,
    Ended,
}

/// One player's turn. The name and character are copied from the player when
/// the round opened, or when the round's order was saved.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub id: String,
    pub player_id: String,
    pub name: String,
    pub character_id: Option<String>,
    pub state: StepState,
    /// The real time the timer ran for this turn.
    pub used_ms: i64,
    /// An ended turn keeps the time it had left, for Reopen.
    pub clock: Clock,
    pub note_id: String,
    pub updated_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Interterm {
    pub id: String,
    pub state: StepState,
    pub note_id: String,
    pub updated_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundStatus {
    Open,
    Closed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Round {
    pub id: String,
    pub number: u32,
    pub start: String,
    pub length: Length,
    pub end: String,
    pub status: RoundStatus,
    /// In this round's own order.
    pub turns: Vec<Turn>,
    pub interterm: Interterm,
    /// The waiting turn that was made "now" by hand, until it ends.
    pub now_override: Option<String>,
    pub updated_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    /// The usual turn length, used by every turn that has not started.
    pub usual_seconds: i64,
    pub updated_at: i64,
}

impl Default for Timer {
    fn default() -> Self {
        Timer {
            usual_seconds: DEFAULT_USUAL_SECONDS,
            updated_at: 0,
        }
    }
}

/// A play night (a session).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Night {
    pub id: String,
    pub number: u32,
    pub started_at: i64,
    /// None while the night runs.
    pub ended_at: Option<i64>,
    /// True when the night ended after 6 hours with no activity.
    pub ended_idle: bool,
    pub recap_note_id: String,
    /// The ids of the rounds with activity during the night, in first-touch
    /// order.
    pub round_ids: Vec<String>,
    pub last_activity_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    /// The usual turn order.
    #[serde(default)]
    pub players: Vec<Player>,
    #[serde(default)]
    pub rounds: Vec<Round>,
    #[serde(default)]
    pub timer: Timer,
    #[serde(default)]
    pub nights: Vec<Night>,
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// A note id: a plain name that can't leave the notes folder.
fn is_note_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn valid_table(table: &Table) -> std::result::Result<(), String> {
    let mut ids = HashSet::new();
    let mut unique = |id: &str| -> std::result::Result<(), String> {
        if id.is_empty() || !ids.insert(id.to_string()) {
            return Err(format!("the id “{id}” is empty or repeated"));
        }
        Ok(())
    };
    for p in &table.players {
        unique(&p.id)?;
    }
    for r in &table.rounds {
        unique(&r.id)?;
        if !world::is_iso_date(&r.start) || !world::is_iso_date(&r.end) {
            return Err(format!("round {}: a date is not a real date", r.number));
        }
        unique(&r.interterm.id)?;
        let mut notes = vec![&r.interterm.note_id];
        for t in &r.turns {
            unique(&t.id)?;
            notes.push(&t.note_id);
        }
        if notes.iter().any(|n| !is_note_id(n)) {
            return Err(format!("round {}: a note id is not valid", r.number));
        }
    }
    for n in &table.nights {
        unique(&n.id)?;
        if !is_note_id(&n.recap_note_id) {
            return Err(format!(
                "session {}: the recap note id is not valid",
                n.number
            ));
        }
    }
    if !(1..=MAX_SECONDS).contains(&table.timer.usual_seconds) {
        return Err("the usual timer length is out of range".to_string());
    }
    Ok(())
}

fn table_file(paths: &Paths) -> PathBuf {
    paths.data.join("table.json")
}

fn notes_dir(paths: &Paths) -> PathBuf {
    paths.data.join("round-notes")
}

fn new_turn(player: &Player, usual_seconds: i64, now: i64) -> Turn {
    Turn {
        id: new_id(),
        player_id: player.id.clone(),
        name: player.name.clone(),
        character_id: player.character_id.clone(),
        state: StepState::Waiting,
        used_ms: 0,
        clock: Clock::fresh(usual_seconds),
        note_id: new_id(),
        updated_at: now,
    }
}

fn new_round(table: &Table, number: u32, start: &str, length: Length, now: i64) -> Result<Round> {
    let end = end_date(start, length).ok_or("The round's start is not a real date.")?;
    Ok(Round {
        id: new_id(),
        number,
        start: start.to_string(),
        length,
        end,
        status: RoundStatus::Open,
        turns: table
            .players
            .iter()
            .map(|p| new_turn(p, table.timer.usual_seconds, now))
            .collect(),
        interterm: Interterm {
            id: new_id(),
            state: StepState::Waiting,
            note_id: new_id(),
            updated_at: now,
        },
        now_override: None,
        updated_at: now,
    })
}

/// Who is "now" in the round: the waiting turn made "now" by hand, else the
/// first waiting turn, else the interterm while it waits. None for a closed
/// round.
pub fn now_id(round: &Round) -> Option<String> {
    if round.status == RoundStatus::Closed {
        return None;
    }
    let waiting = |id: &str| {
        round
            .turns
            .iter()
            .any(|t| t.id == id && t.state == StepState::Waiting)
    };
    if let Some(id) = round.now_override.as_deref().filter(|id| waiting(id)) {
        return Some(id.to_string());
    }
    if let Some(t) = round.turns.iter().find(|t| t.state == StepState::Waiting) {
        return Some(t.id.clone());
    }
    (round.interterm.state == StepState::Waiting).then(|| round.interterm.id.clone())
}

impl Table {
    /// The latest round.
    fn current(&self) -> Option<&Round> {
        self.rounds.iter().max_by_key(|r| r.number)
    }

    fn running_night(&mut self) -> Option<&mut Night> {
        self.nights.iter_mut().find(|n| n.ended_at.is_none())
    }

    /// Things that happen by the clock: timers reach zero, an idle night
    /// ends. True when something changed.
    fn settle(&mut self, now: i64) -> bool {
        let mut changed = false;
        for round in &mut self.rounds {
            for turn in &mut round.turns {
                if turn.clock.settle(&mut turn.used_ms, now) {
                    turn.updated_at = now;
                    changed = true;
                }
            }
        }
        if let Some(night) = self.running_night() {
            if now - night.last_activity_at >= IDLE_MS {
                night.ended_at = Some(night.last_activity_at);
                night.ended_idle = true;
                night.updated_at = now;
                changed = true;
            }
        }
        changed
    }

    /// Records activity in the running night, if any, for `round_id`.
    fn touch(&mut self, now: i64, round_id: Option<&str>) {
        if let Some(night) = self.running_night() {
            night.last_activity_at = now;
            night.updated_at = now;
            if let Some(id) = round_id {
                if !night.round_ids.iter().any(|r| r == id) {
                    night.round_ids.push(id.to_string());
                }
            }
        }
    }

    fn round_mut(&mut self, id: &str) -> Result<&mut Round> {
        self.rounds
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| "That round doesn't exist.".to_string())
    }

    /// The index of the round that holds the turn, and the turn's index.
    fn find_turn(&self, turn_id: &str) -> Result<(usize, usize)> {
        self.rounds
            .iter()
            .enumerate()
            .find_map(|(r, round)| {
                round
                    .turns
                    .iter()
                    .position(|t| t.id == turn_id)
                    .map(|t| (r, t))
            })
            .ok_or_else(|| "That turn doesn't exist.".to_string())
    }
}

fn open_round(round: &Round) -> Result<()> {
    if round.status == RoundStatus::Closed {
        return Err(format!("Round {} is closed.", round.number));
    }
    Ok(())
}

/// Stops every running clock in the round but `keep`.
fn pause_others(round: &mut Round, keep: &str, now: i64) {
    for t in round.turns.iter_mut().filter(|t| t.id != keep) {
        if t.clock.state == ClockState::Running {
            t.clock.stop(&mut t.used_ms, now);
            t.updated_at = now;
        }
    }
}

/// Shuffles in place, with the random bytes of v4 uuids.
fn shuffle<T>(items: &mut [T]) {
    for i in (1..items.len()).rev() {
        let j = (uuid::Uuid::new_v4().as_u128() % (i as u128 + 1)) as usize;
        items.swap(i, j);
    }
}

/// A player in the Edit order list. A new player has no id.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInput {
    pub id: Option<String>,
    pub name: String,
    pub character_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    /// Makes a waiting turn "now" until it ends.
    MakeNow {
        turn_id: String,
    },
    EndTurn {
        turn_id: String,
    },
    /// Makes an ended turn "now" again, paused with the time it had left.
    ReopenTurn {
        turn_id: String,
    },
    Start {
        turn_id: String,
    },
    Pause {
        turn_id: String,
    },
    Resume {
        turn_id: String,
    },
    /// Back to the usual length, not started.
    Reset {
        turn_id: String,
    },
    /// Sets the time left of a paused turn.
    SetLeft {
        turn_id: String,
        seconds: i64,
    },
    SetUsual {
        seconds: i64,
    },
    SetLength {
        round_id: String,
        length: Length,
    },
    Shuffle {
        round_id: String,
    },
    /// Saves the round's order. `usual` also makes it the usual order.
    SaveOrder {
        round_id: String,
        players: Vec<PlayerInput>,
        usual: bool,
    },
    /// Closes the current round, moves the game date to its end and opens
    /// the next round.
    NextRound {
        round_id: String,
    },
    ReopenRound {
        round_id: String,
    },
    CloseRound {
        round_id: String,
    },
    StartNight,
    EndNight,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundView {
    #[serde(flatten)]
    pub round: Round,
    /// The id of the turn or interterm that is "now", if any.
    pub now_id: Option<String>,
}

/// What the page shows. `world` is set when the action changed it.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub players: Vec<Player>,
    /// Oldest first.
    pub rounds: Vec<RoundView>,
    pub usual_seconds: i64,
    /// Oldest first.
    pub nights: Vec<Night>,
    pub world: Option<World>,
}

fn snapshot(table: Table, world: Option<World>) -> Snapshot {
    let mut rounds: Vec<RoundView> = table
        .rounds
        .into_iter()
        .map(|round| RoundView {
            now_id: now_id(&round),
            round,
        })
        .collect();
    rounds.sort_by_key(|r| r.round.number);
    Snapshot {
        players: table.players,
        rounds,
        usual_seconds: table.timer.usual_seconds,
        nights: table.nights,
        world,
    }
}

/// Reads the table and brings it up to `now`. With no round, round 1 opens
/// at the game date as a Quarter. Callers hold the world lock. Returns the
/// table and whether it changed.
fn load(paths: &Paths, now: i64) -> Result<(Table, bool)> {
    let mut table: Table = world::read(&table_file(paths), valid_table)?;
    let mut changed = table.settle(now);
    if table.rounds.is_empty() {
        let start = world::get_world(paths)?.game_date;
        let round = new_round(&table, 1, &start, Length::Quarter, now)?;
        table.rounds.push(round);
        changed = true;
    }
    Ok((table, changed))
}

fn save(paths: &Paths, table: &Table) -> Result<()> {
    world::write(&table_file(paths), table, "the session")
}

/// The table at `now`. Saves what changed by the clock.
pub fn get(paths: &Paths, now: i64) -> Result<Snapshot> {
    let _guard = world::lock();
    let (table, changed) = load(paths, now)?;
    if changed {
        save(paths, &table)?;
    }
    Ok(snapshot(table, None))
}

fn check_seconds(seconds: i64) -> Result<i64> {
    if !(1..=MAX_SECONDS).contains(&seconds) {
        return Err("Enter a time from 0:01 to 99:59:59.".to_string());
    }
    Ok(seconds)
}

/// Runs one action at `now` and saves.
pub fn act(paths: &Paths, action: Action, now: i64) -> Result<Snapshot> {
    let _guard = world::lock();
    let (mut table, _) = load(paths, now)?;
    let mut world_changed = None;
    let touched = apply(paths, &mut table, action, now, &mut world_changed)?;
    if let Some(rounds) = touched {
        if rounds.is_empty() {
            table.touch(now, None);
        }
        for id in rounds {
            table.touch(now, Some(&id));
        }
    }
    save(paths, &table)?;
    Ok(snapshot(table, world_changed))
}

/// Applies the action. Returns the rounds that it touched, for the running
/// night, or None when it is not activity.
fn apply(
    paths: &Paths,
    table: &mut Table,
    action: Action,
    now: i64,
    world_changed: &mut Option<World>,
) -> Result<Option<Vec<String>>> {
    let usual = table.timer.usual_seconds;
    let current_id = table.current().map(|r| r.id.clone());
    // The turn, which must wait in an open round.
    macro_rules! waiting_turn {
        ($turn_id:expr) => {{
            let (r, t) = table.find_turn($turn_id)?;
            open_round(&table.rounds[r])?;
            if table.rounds[r].turns[t].state != StepState::Waiting {
                return Err("That turn has ended.".to_string());
            }
            (r, t)
        }};
    }
    // The turn, which must be "now" in the current round.
    macro_rules! timer_turn {
        ($turn_id:expr) => {{
            let (r, t) = waiting_turn!($turn_id);
            if Some(&table.rounds[r].id) != current_id.as_ref() {
                return Err("The timer runs only in the current round.".to_string());
            }
            if now_id(&table.rounds[r]).as_deref() != Some($turn_id.as_str()) {
                return Err("Only the turn that is now has a running timer.".to_string());
            }
            (r, t)
        }};
    }
    let touched = match action {
        Action::MakeNow { turn_id } => {
            let (r, _) = waiting_turn!(&turn_id);
            let round = &mut table.rounds[r];
            pause_others(round, &turn_id, now);
            round.now_override = Some(turn_id);
            round.updated_at = now;
            vec![round.id.clone()]
        }
        Action::EndTurn { turn_id } => {
            let (r, t) = waiting_turn!(&turn_id);
            let round = &mut table.rounds[r];
            let before = now_id(round);
            let turn = &mut round.turns[t];
            turn.clock.stop(&mut turn.used_ms, now);
            turn.state = StepState::Ended;
            turn.updated_at = now;
            if round.now_override.as_deref() == Some(turn_id.as_str()) {
                round.now_override = None;
            }
            // The next turn waits for Start at the usual length.
            let after = now_id(round);
            if after != before {
                if let Some(next) = round
                    .turns
                    .iter_mut()
                    .find(|t| Some(&t.id) == after.as_ref())
                {
                    next.clock = Clock::fresh(usual);
                    next.updated_at = now;
                }
            }
            round.updated_at = now;
            vec![round.id.clone()]
        }
        Action::ReopenTurn { turn_id } => {
            let (r, t) = table.find_turn(&turn_id)?;
            let round = &mut table.rounds[r];
            open_round(round)?;
            if round.turns[t].state != StepState::Ended {
                return Err("That turn hasn't ended.".to_string());
            }
            pause_others(round, &turn_id, now);
            let turn = &mut round.turns[t];
            turn.state = StepState::Waiting;
            turn.clock.running_since = None;
            turn.clock.state = if turn.clock.left_ms == 0 {
                ClockState::AtZero
            } else {
                ClockState::Paused
            };
            turn.updated_at = now;
            round.now_override = Some(turn_id);
            round.updated_at = now;
            vec![round.id.clone()]
        }
        Action::Start { turn_id } | Action::Resume { turn_id } => {
            let (r, t) = timer_turn!(&turn_id);
            let turn = &mut table.rounds[r].turns[t];
            if !matches!(
                turn.clock.state,
                ClockState::NotStarted | ClockState::Paused
            ) {
                return Err("The timer isn't stopped.".to_string());
            }
            turn.clock.state = ClockState::Running;
            turn.clock.running_since = Some(now);
            turn.updated_at = now;
            vec![table.rounds[r].id.clone()]
        }
        Action::Pause { turn_id } => {
            let (r, t) = timer_turn!(&turn_id);
            let turn = &mut table.rounds[r].turns[t];
            if turn.clock.state != ClockState::Running {
                return Err("The timer isn't running.".to_string());
            }
            turn.clock.stop(&mut turn.used_ms, now);
            turn.updated_at = now;
            vec![table.rounds[r].id.clone()]
        }
        Action::Reset { turn_id } => {
            let (r, t) = timer_turn!(&turn_id);
            let turn = &mut table.rounds[r].turns[t];
            turn.clock.stop(&mut turn.used_ms, now);
            turn.clock = Clock::fresh(usual);
            turn.updated_at = now;
            vec![table.rounds[r].id.clone()]
        }
        Action::SetLeft { turn_id, seconds } => {
            let seconds = check_seconds(seconds)?;
            let (r, t) = timer_turn!(&turn_id);
            let turn = &mut table.rounds[r].turns[t];
            if turn.clock.state != ClockState::Paused {
                return Err("Pause the timer to change the time left.".to_string());
            }
            turn.clock.left_ms = seconds * 1000;
            turn.updated_at = now;
            vec![table.rounds[r].id.clone()]
        }
        Action::SetUsual { seconds } => {
            let seconds = check_seconds(seconds)?;
            table.timer = Timer {
                usual_seconds: seconds,
                updated_at: now,
            };
            // Every turn that has not started takes the new length.
            for round in table
                .rounds
                .iter_mut()
                .filter(|r| r.status == RoundStatus::Open)
            {
                for turn in &mut round.turns {
                    if turn.state == StepState::Waiting
                        && turn.clock.state == ClockState::NotStarted
                    {
                        turn.clock = Clock::fresh(seconds);
                        turn.updated_at = now;
                    }
                }
            }
            vec![]
        }
        Action::SetLength { round_id, length } => {
            let round = table.round_mut(&round_id)?;
            open_round(round)?;
            round.end =
                end_date(&round.start, length).ok_or("The round's start is not a real date.")?;
            round.length = length;
            round.updated_at = now;
            vec![round_id]
        }
        Action::Shuffle { round_id } => {
            let round = table.round_mut(&round_id)?;
            open_round(round)?;
            shuffle(&mut round.turns);
            round.updated_at = now;
            vec![round_id]
        }
        Action::SaveOrder {
            round_id,
            players,
            usual: also_usual,
        } => {
            let mut edited = Vec::with_capacity(players.len());
            for p in players {
                let name = p.name.trim().to_string();
                if name.is_empty() {
                    return Err("Enter a name for every player.".to_string());
                }
                edited.push(PlayerInput {
                    id: p.id.filter(|id| !id.is_empty()),
                    name,
                    character_id: p.character_id.filter(|id| !id.is_empty()),
                });
            }
            let mut seen = HashSet::new();
            if edited
                .iter()
                .filter_map(|p| p.id.as_deref())
                .any(|id| !seen.insert(id.to_string()))
            {
                return Err("A player is in the list twice.".to_string());
            }
            open_round(table.round_mut(&round_id)?)?;
            let list: Vec<Player> = edited
                .into_iter()
                .map(|p| {
                    let old =
                        p.id.as_ref()
                            .and_then(|id| table.players.iter().find(|o| &o.id == id));
                    let same =
                        old.is_some_and(|o| o.name == p.name && o.character_id == p.character_id);
                    Player {
                        id: p.id.unwrap_or_else(new_id),
                        name: p.name,
                        character_id: p.character_id,
                        updated_at: if same { old.unwrap().updated_at } else { now },
                    }
                })
                .collect();
            let round = table.round_mut(&round_id)?;
            let mut old_turns = std::mem::take(&mut round.turns);
            for player in &list {
                match old_turns.iter().position(|t| t.player_id == player.id) {
                    Some(i) => {
                        let mut turn = old_turns.remove(i);
                        if turn.name != player.name || turn.character_id != player.character_id {
                            turn.name = player.name.clone();
                            turn.character_id = player.character_id.clone();
                            turn.updated_at = now;
                        }
                        round.turns.push(turn);
                    }
                    None => round.turns.push(new_turn(player, usual, now)),
                }
            }
            round.updated_at = now;
            if also_usual {
                table.players = list;
            }
            vec![round_id]
        }
        Action::NextRound { round_id } => {
            if current_id.as_deref() != Some(round_id.as_str()) {
                return Err("Only the current round moves on to the next.".to_string());
            }
            let round = table.round_mut(&round_id)?;
            open_round(round)?;
            let (number, end, length) = (round.number + 1, round.end.clone(), round.length);
            // The date moves first: if the table then fails to save, Next
            // round can run again and moves it to the same date.
            *world_changed = Some(world::set_game_date_locked(paths, &end)?);
            let round = table.round_mut(&round_id)?;
            for t in &mut round.turns {
                t.clock.stop(&mut t.used_ms, now);
            }
            round.status = RoundStatus::Closed;
            round.interterm.state = StepState::Ended;
            round.interterm.updated_at = now;
            round.now_override = None;
            round.updated_at = now;
            let next = new_round(table, number, &end, length, now)?;
            let next_id = next.id.clone();
            table.rounds.push(next);
            vec![round_id, next_id]
        }
        Action::ReopenRound { round_id } => {
            let round = table.round_mut(&round_id)?;
            if round.status == RoundStatus::Open {
                return Err(format!("Round {} is open.", round.number));
            }
            round.status = RoundStatus::Open;
            round.updated_at = now;
            vec![round_id]
        }
        Action::CloseRound { round_id } => {
            if current_id.as_deref() == Some(round_id.as_str()) {
                return Err("Use Next round to close the current round.".to_string());
            }
            let round = table.round_mut(&round_id)?;
            open_round(round)?;
            for t in &mut round.turns {
                t.clock.stop(&mut t.used_ms, now);
            }
            round.status = RoundStatus::Closed;
            round.now_override = None;
            round.updated_at = now;
            vec![round_id]
        }
        Action::StartNight => {
            // A night left running ends where the next starts.
            if let Some(night) = table.running_night() {
                night.ended_at = Some(now);
                night.updated_at = now;
            }
            let number = table.nights.iter().map(|n| n.number).max().unwrap_or(0) + 1;
            table.nights.push(Night {
                id: new_id(),
                number,
                started_at: now,
                ended_at: None,
                ended_idle: false,
                recap_note_id: new_id(),
                round_ids: current_id.into_iter().collect(),
                last_activity_at: now,
                updated_at: now,
            });
            return Ok(None);
        }
        Action::EndNight => {
            let night = table.running_night().ok_or("No session is running.")?;
            night.ended_at = Some(now);
            night.updated_at = now;
            return Ok(None);
        }
    };
    Ok(Some(touched))
}

/// Which round a note belongs to: Some(round id) for a turn or interterm
/// note, Some(None) for a recap, None when no record has the note.
fn note_owner(table: &Table, note_id: &str) -> Option<Option<String>> {
    for r in &table.rounds {
        if r.interterm.note_id == note_id || r.turns.iter().any(|t| t.note_id == note_id) {
            return Some(Some(r.id.clone()));
        }
    }
    table
        .nights
        .iter()
        .any(|n| n.recap_note_id == note_id)
        .then_some(None)
}

fn note_path(paths: &Paths, table: &Table, note_id: &str) -> Result<(PathBuf, Option<String>)> {
    let owner = note_owner(table, note_id)
        .filter(|_| is_note_id(note_id))
        .ok_or("That note doesn't exist.")?;
    Ok((notes_dir(paths).join(format!("{note_id}.md")), owner))
}

/// The note's text. A note that was never written is empty.
pub fn read_note(paths: &Paths, note_id: &str, now: i64) -> Result<String> {
    let _guard = world::lock();
    let (table, _) = load(paths, now)?;
    let (file, _) = note_path(paths, &table, note_id)?;
    match fs::read_to_string(&file) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Couldn't read the note: {e}.")),
    }
}

/// Saves the note. A turn or interterm note edit is activity.
pub fn write_note(paths: &Paths, note_id: &str, text: &str, now: i64) -> Result<()> {
    let _guard = world::lock();
    let (mut table, changed) = load(paths, now)?;
    let (file, owner) = note_path(paths, &table, note_id)?;
    world::write_atomic(&file, text.as_bytes())
        .map_err(|e| format!("Couldn't save the note: {e}."))?;
    let running = table.nights.iter().any(|n| n.ended_at.is_none());
    if let Some(round_id) = owner.filter(|_| running) {
        table.touch(now, Some(&round_id));
        save(paths, &table)?;
    } else if changed {
        save(paths, &table)?;
    }
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn session_get(app: AppHandle) -> Result<Snapshot> {
    get(&world::app_paths(&app)?, now_ms())
}

#[tauri::command]
pub fn session_act(app: AppHandle, action: Action) -> Result<Snapshot> {
    act(&world::app_paths(&app)?, action, now_ms())
}

#[tauri::command]
pub fn round_note_read(app: AppHandle, note_id: String) -> Result<String> {
    read_note(&world::app_paths(&app)?, &note_id, now_ms())
}

#[tauri::command]
pub fn round_note_write(app: AppHandle, note_id: String, text: String) -> Result<()> {
    write_note(&world::app_paths(&app)?, &note_id, &text, now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const MIN: i64 = 60 * 1000;
    const HOUR: i64 = 60 * MIN;
    const T0: i64 = 1_800_000_000_000;

    fn setup() -> (TempDir, Paths) {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths {
            data: temp.path().join("data"),
            config_file: temp.path().join("config").join("config.json"),
        };
        (temp, paths)
    }

    fn player(id: &str, name: &str, character: Option<&str>) -> Player {
        Player {
            id: id.into(),
            name: name.into(),
            character_id: character.map(Into::into),
            updated_at: 0,
        }
    }

    /// A table with players Ana, Ben and Cleo and no round yet.
    fn with_players(paths: &Paths) {
        let table = Table {
            players: vec![
                player("p-ana", "Ana", Some("marie")),
                player("p-ben", "Ben", Some("karl")),
                player("p-cleo", "Cleo", None),
            ],
            ..Default::default()
        };
        save(paths, &table).unwrap();
    }

    fn current(s: &Snapshot) -> &RoundView {
        s.rounds.last().unwrap()
    }

    fn turn_id(s: &Snapshot, name: &str) -> String {
        current(s)
            .round
            .turns
            .iter()
            .find(|t| t.name == name)
            .unwrap()
            .id
            .clone()
    }

    fn turn<'a>(s: &'a Snapshot, name: &str) -> &'a Turn {
        current(s)
            .round
            .turns
            .iter()
            .find(|t| t.name == name)
            .unwrap()
    }

    fn now_name(s: &Snapshot) -> String {
        let round = &current(s).round;
        let id = current(s).now_id.clone().unwrap();
        if id == round.interterm.id {
            return "Interterm".into();
        }
        round
            .turns
            .iter()
            .find(|t| t.id == id)
            .unwrap()
            .name
            .clone()
    }

    fn run(paths: &Paths, action: Action, now: i64) -> Snapshot {
        act(paths, action, now).unwrap()
    }

    #[test]
    fn end_dates_are_worked_out_date_to_date() {
        let cases = [
            ("1962-02-10", Length::Quarter, "1962-05-10"),
            ("1962-02-10", Length::Month, "1962-03-10"),
            ("1962-02-10", Length::Year, "1963-02-10"),
            ("1962-01-31", Length::Month, "1962-02-28"),
            ("1964-01-31", Length::Month, "1964-02-29"),
            ("1900-01-31", Length::Month, "1900-02-28"),
            ("2000-01-31", Length::Month, "2000-02-29"),
            ("1964-02-29", Length::Year, "1965-02-28"),
            ("1961-11-30", Length::Quarter, "1962-02-28"),
            ("1961-12-31", Length::Month, "1962-01-31"),
            ("1962-08-31", Length::Month, "1962-09-30"),
        ];
        for (start, length, end) in cases {
            assert_eq!(
                end_date(start, length).as_deref(),
                Some(end),
                "{start} {length:?}"
            );
        }
        assert_eq!(end_date("1962-02-30", Length::Month), None);
        assert_eq!(end_date("9999-12-01", Length::Month), None);
    }

    #[test]
    fn round_one_opens_by_itself_at_the_game_date_as_a_quarter() {
        let (_temp, paths) = setup();
        world::set_game_date(&paths, "1961-09-10").unwrap();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        assert_eq!(s.rounds.len(), 1);
        let round = &s.rounds[0].round;
        assert_eq!(round.number, 1);
        assert_eq!(round.start, "1961-09-10");
        assert_eq!(round.length, Length::Quarter);
        assert_eq!(round.end, "1961-12-10");
        assert_eq!(round.status, RoundStatus::Open);
        let names: Vec<_> = round
            .turns
            .iter()
            .map(|t| (t.name.as_str(), t.character_id.as_deref()))
            .collect();
        assert_eq!(
            names,
            [
                ("Ana", Some("marie")),
                ("Ben", Some("karl")),
                ("Cleo", None)
            ]
        );
        assert!(round
            .turns
            .iter()
            .all(|t| t.clock == Clock::fresh(900) && t.state == StepState::Waiting));
        assert_eq!(s.rounds[0].now_id.as_ref(), Some(&round.turns[0].id));
        // It is saved, so the next load shows the same round.
        assert_eq!(get(&paths, T0 + MIN).unwrap().rounds[0].round.id, round.id);
    }

    #[test]
    fn with_no_files_round_one_has_only_the_interterm() {
        let (_temp, paths) = setup();
        let s = get(&paths, T0).unwrap();
        let round = &s.rounds[0];
        assert_eq!(round.round.start, "1962-02-10");
        assert!(round.round.turns.is_empty());
        assert_eq!(round.now_id.as_ref(), Some(&round.round.interterm.id));
        assert_eq!(s.usual_seconds, 900);
    }

    #[test]
    fn now_is_the_first_waiting_turn_unless_another_is_picked() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        assert_eq!(now_name(&s), "Ana");
        let s = run(
            &paths,
            Action::MakeNow {
                turn_id: turn_id(&s, "Cleo"),
            },
            T0,
        );
        assert_eq!(now_name(&s), "Cleo");
        // Ending another turn keeps the picked turn "now".
        let s = run(
            &paths,
            Action::EndTurn {
                turn_id: turn_id(&s, "Ana"),
            },
            T0,
        );
        assert_eq!(now_name(&s), "Cleo");
        // When it ends, "now" is the first waiting turn again.
        let s = run(
            &paths,
            Action::EndTurn {
                turn_id: turn_id(&s, "Cleo"),
            },
            T0,
        );
        assert_eq!(now_name(&s), "Ben");
        let s = run(
            &paths,
            Action::EndTurn {
                turn_id: turn_id(&s, "Ben"),
            },
            T0,
        );
        assert_eq!(now_name(&s), "Interterm");
        assert_eq!(
            act(
                &paths,
                Action::MakeNow {
                    turn_id: turn_id(&s, "Ben")
                },
                T0
            ),
            Err("That turn has ended.".to_string())
        );
    }

    #[test]
    fn picking_another_turn_pauses_the_running_timer() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let ana = turn_id(&s, "Ana");
        run(
            &paths,
            Action::Start {
                turn_id: ana.clone(),
            },
            T0,
        );
        let s = run(
            &paths,
            Action::MakeNow {
                turn_id: turn_id(&s, "Ben"),
            },
            T0 + 2 * MIN,
        );
        assert_eq!(turn(&s, "Ana").clock.state, ClockState::Paused);
        assert_eq!(turn(&s, "Ana").used_ms, 2 * MIN);
        // Only the turn that is now runs its timer.
        assert_eq!(
            act(&paths, Action::Resume { turn_id: ana }, T0),
            Err("Only the turn that is now has a running timer.".to_string())
        );
    }

    #[test]
    fn after_end_turn_the_next_turn_waits_for_start_at_the_usual_length() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let (ana, ben) = (turn_id(&s, "Ana"), turn_id(&s, "Ben"));
        // Ben ran a little while picked by hand, then Ana took over again.
        run(
            &paths,
            Action::MakeNow {
                turn_id: ben.clone(),
            },
            T0,
        );
        run(
            &paths,
            Action::Start {
                turn_id: ben.clone(),
            },
            T0,
        );
        run(
            &paths,
            Action::MakeNow {
                turn_id: ana.clone(),
            },
            T0 + MIN,
        );
        run(
            &paths,
            Action::Start {
                turn_id: ana.clone(),
            },
            T0 + MIN,
        );
        let s = run(&paths, Action::EndTurn { turn_id: ana }, T0 + 3 * MIN);
        assert_eq!(now_name(&s), "Ben");
        assert_eq!(turn(&s, "Ben").clock, Clock::fresh(900));
        assert_eq!(turn(&s, "Ben").used_ms, MIN);
        assert_eq!(turn(&s, "Ana").used_ms, 2 * MIN);
    }

    #[test]
    fn time_used_counts_only_running_time_across_pause_edit_and_reopen() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let ana = turn_id(&s, "Ana");
        let id = || ana.clone();
        run(&paths, Action::Start { turn_id: id() }, T0);
        // A restart in between: the running time is worked out from the wall clock.
        let s = get(&paths, T0 + MIN).unwrap();
        assert_eq!(turn(&s, "Ana").clock.running_since, Some(T0));
        let s = run(&paths, Action::Pause { turn_id: id() }, T0 + MIN);
        assert_eq!(
            (turn(&s, "Ana").used_ms, turn(&s, "Ana").clock.left_ms),
            (MIN, 14 * MIN)
        );
        // Editing the time left changes no time used.
        let s = run(
            &paths,
            Action::SetLeft {
                turn_id: id(),
                seconds: 5 * 60,
            },
            T0 + 10 * MIN,
        );
        assert_eq!(
            (turn(&s, "Ana").used_ms, turn(&s, "Ana").clock.left_ms),
            (MIN, 5 * MIN)
        );
        run(&paths, Action::Resume { turn_id: id() }, T0 + 20 * MIN);
        let s = run(&paths, Action::EndTurn { turn_id: id() }, T0 + 22 * MIN);
        assert_eq!(
            (turn(&s, "Ana").used_ms, turn(&s, "Ana").clock.left_ms),
            (3 * MIN, 3 * MIN)
        );
        // Reopen: "now" again, paused with the time it had left at End.
        let s = run(&paths, Action::ReopenTurn { turn_id: id() }, T0 + 30 * MIN);
        assert_eq!(now_name(&s), "Ana");
        assert_eq!(turn(&s, "Ana").state, StepState::Waiting);
        assert_eq!(turn(&s, "Ana").clock.state, ClockState::Paused);
        assert_eq!(turn(&s, "Ana").clock.left_ms, 3 * MIN);
        run(&paths, Action::Resume { turn_id: id() }, T0 + 40 * MIN);
        // It runs out 3 minutes later and stops at zero; the extra time is not used time.
        let s = get(&paths, T0 + 50 * MIN).unwrap();
        assert_eq!(turn(&s, "Ana").clock.state, ClockState::AtZero);
        assert_eq!(
            (turn(&s, "Ana").used_ms, turn(&s, "Ana").clock.left_ms),
            (6 * MIN, 0)
        );
        // Reset goes back to the usual length and keeps the time used.
        let s = run(&paths, Action::Reset { turn_id: id() }, T0 + 51 * MIN);
        assert_eq!(turn(&s, "Ana").clock, Clock::fresh(900));
        assert_eq!(turn(&s, "Ana").used_ms, 6 * MIN);
    }

    #[test]
    fn a_reopened_turn_is_now_even_before_an_earlier_waiting_turn() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let cleo = turn_id(&s, "Cleo");
        run(
            &paths,
            Action::MakeNow {
                turn_id: cleo.clone(),
            },
            T0,
        );
        let s = run(
            &paths,
            Action::EndTurn {
                turn_id: cleo.clone(),
            },
            T0,
        );
        assert_eq!(now_name(&s), "Ana");
        let s = run(&paths, Action::ReopenTurn { turn_id: cleo }, T0);
        assert_eq!(now_name(&s), "Cleo");
    }

    #[test]
    fn the_time_left_is_edited_only_while_paused_and_within_range() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let ana = turn_id(&s, "Ana");
        let set = |seconds| {
            act(
                &paths,
                Action::SetLeft {
                    turn_id: ana.clone(),
                    seconds,
                },
                T0,
            )
        };
        assert_eq!(
            set(60),
            Err("Pause the timer to change the time left.".to_string())
        );
        run(
            &paths,
            Action::Start {
                turn_id: ana.clone(),
            },
            T0,
        );
        run(
            &paths,
            Action::Pause {
                turn_id: ana.clone(),
            },
            T0,
        );
        for bad in [0, -5, MAX_SECONDS + 1] {
            assert_eq!(
                set(bad),
                Err("Enter a time from 0:01 to 99:59:59.".to_string())
            );
        }
        assert!(set(MAX_SECONDS).is_ok());
    }

    #[test]
    fn a_new_usual_length_applies_to_every_turn_that_has_not_started() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        run(
            &paths,
            Action::Start {
                turn_id: turn_id(&s, "Ana"),
            },
            T0,
        );
        let s = run(&paths, Action::SetUsual { seconds: 20 * 60 }, T0 + MIN);
        assert_eq!(s.usual_seconds, 1200);
        assert_eq!(turn(&s, "Ana").clock.left_ms, 15 * MIN);
        assert_eq!(turn(&s, "Ben").clock, Clock::fresh(1200));
        let s = run(
            &paths,
            Action::Reset {
                turn_id: turn_id(&s, "Ana"),
            },
            T0 + MIN,
        );
        assert_eq!(turn(&s, "Ana").clock, Clock::fresh(1200));
    }

    #[test]
    fn next_round_closes_the_round_moves_the_date_and_opens_the_next() {
        let (_temp, paths) = setup();
        world::set_game_date(&paths, "1962-02-10").unwrap();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let first = current(&s).round.id.clone();
        run(
            &paths,
            Action::SetLength {
                round_id: first.clone(),
                length: Length::Month,
            },
            T0,
        );
        run(
            &paths,
            Action::EndTurn {
                turn_id: turn_id(&s, "Ana"),
            },
            T0,
        );
        let s = run(
            &paths,
            Action::NextRound {
                round_id: first.clone(),
            },
            T0 + MIN,
        );
        assert_eq!(s.world.as_ref().unwrap().game_date, "1962-03-10");
        assert_eq!(world::get_world(&paths).unwrap().game_date, "1962-03-10");
        // The stat names are kept.
        assert_eq!(
            world::get_world(&paths).unwrap().stat_names,
            World::default().stat_names
        );
        let old = &s.rounds[0];
        assert_eq!(old.round.status, RoundStatus::Closed);
        assert_eq!(old.round.interterm.state, StepState::Ended);
        assert_eq!(old.now_id, None);
        // An unfinished turn stays unfinished.
        assert_eq!(old.round.turns[1].state, StepState::Waiting);
        let new = &current(&s).round;
        assert_eq!(
            (new.number, new.start.as_str(), new.end.as_str()),
            (2, "1962-03-10", "1962-04-10")
        );
        assert_eq!(new.length, Length::Month);
        assert_eq!(new.status, RoundStatus::Open);
        assert!(new
            .turns
            .iter()
            .all(|t| t.state == StepState::Waiting && t.clock == Clock::fresh(900)));
        assert_eq!(now_name(&s), "Ana");
        // Only the current round moves on, once.
        assert_eq!(
            act(&paths, Action::NextRound { round_id: first }, T0),
            Err("Only the current round moves on to the next.".to_string())
        );
    }

    #[test]
    fn next_round_copies_the_usual_order_not_the_rounds_own() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let round_id = current(&s).round.id.clone();
        let reversed = current(&s)
            .round
            .turns
            .iter()
            .rev()
            .map(|t| PlayerInput {
                id: Some(t.player_id.clone()),
                name: t.name.clone(),
                character_id: t.character_id.clone(),
            })
            .collect();
        let s = run(
            &paths,
            Action::SaveOrder {
                round_id: round_id.clone(),
                players: reversed,
                usual: false,
            },
            T0,
        );
        assert_eq!(now_name(&s), "Cleo");
        let s = run(&paths, Action::NextRound { round_id }, T0);
        assert_eq!(now_name(&s), "Ana");
    }

    #[test]
    fn edit_order_changes_this_round_or_the_usual_order_too() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let round_id = current(&s).round.id.clone();
        run(
            &paths,
            Action::EndTurn {
                turn_id: turn_id(&s, "Ana"),
            },
            T0,
        );
        let edited = |usual| Action::SaveOrder {
            round_id: round_id.clone(),
            players: vec![
                PlayerInput {
                    id: Some("p-ben".into()),
                    name: " Benjamin ".into(),
                    character_id: Some("karl".into()),
                },
                PlayerInput {
                    id: None,
                    name: "Dee".into(),
                    character_id: None,
                },
                PlayerInput {
                    id: Some("p-ana".into()),
                    name: "Ana".into(),
                    character_id: Some("marie".into()),
                },
            ],
            usual,
        };
        let s = run(&paths, edited(false), T0);
        let names: Vec<_> = current(&s)
            .round
            .turns
            .iter()
            .map(|t| t.name.as_str())
            .collect();
        assert_eq!(names, ["Benjamin", "Dee", "Ana"]);
        // Ana's turn keeps its state and note; Dee gets a waiting turn.
        assert_eq!(turn(&s, "Ana").state, StepState::Ended);
        assert_eq!(turn(&s, "Dee").state, StepState::Waiting);
        let usual: Vec<_> = s.players.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(usual, ["Ana", "Ben", "Cleo"]);
        let s = run(&paths, edited(true), T0);
        let usual: Vec<_> = s.players.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(usual, ["Benjamin", "Dee", "Ana"]);
        assert_eq!(s.players[0].id, "p-ben");
        let blank = Action::SaveOrder {
            round_id,
            players: vec![PlayerInput {
                id: None,
                name: " ".into(),
                character_id: None,
            }],
            usual: true,
        };
        assert_eq!(
            act(&paths, blank, T0),
            Err("Enter a name for every player.".to_string())
        );
    }

    #[test]
    fn players_added_with_no_players_get_waiting_turns() {
        let (_temp, paths) = setup();
        let s = get(&paths, T0).unwrap();
        assert_eq!(now_name(&s), "Interterm");
        let s = run(
            &paths,
            Action::SaveOrder {
                round_id: current(&s).round.id.clone(),
                players: vec![PlayerInput {
                    id: None,
                    name: "Ana".into(),
                    character_id: None,
                }],
                usual: true,
            },
            T0,
        );
        assert_eq!(now_name(&s), "Ana");
        assert_eq!(turn(&s, "Ana").player_id, s.players[0].id);
    }

    #[test]
    fn shuffle_keeps_every_turn() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = get(&paths, T0).unwrap();
        let mut before: Vec<_> = current(&s)
            .round
            .turns
            .iter()
            .map(|t| t.id.clone())
            .collect();
        let s = run(
            &paths,
            Action::Shuffle {
                round_id: current(&s).round.id.clone(),
            },
            T0,
        );
        let mut after: Vec<_> = current(&s)
            .round
            .turns
            .iter()
            .map(|t| t.id.clone())
            .collect();
        before.sort();
        after.sort();
        assert_eq!(before, after);
    }

    #[test]
    fn the_length_changes_only_while_the_round_is_open() {
        let (_temp, paths) = setup();
        let s = get(&paths, T0).unwrap();
        let id = current(&s).round.id.clone();
        let s = run(
            &paths,
            Action::SetLength {
                round_id: id.clone(),
                length: Length::Year,
            },
            T0,
        );
        assert_eq!(s.rounds[0].round.end, "1963-02-10");
        run(
            &paths,
            Action::NextRound {
                round_id: id.clone(),
            },
            T0,
        );
        assert_eq!(
            act(
                &paths,
                Action::SetLength {
                    round_id: id,
                    length: Length::Month
                },
                T0
            ),
            Err("Round 1 is closed.".to_string())
        );
    }

    #[test]
    fn a_closed_round_reopens_and_closes_again_without_moving_the_date() {
        let (_temp, paths) = setup();
        let s = get(&paths, T0).unwrap();
        let first = current(&s).round.id.clone();
        run(
            &paths,
            Action::NextRound {
                round_id: first.clone(),
            },
            T0,
        );
        let s = run(
            &paths,
            Action::ReopenRound {
                round_id: first.clone(),
            },
            T0,
        );
        assert_eq!(s.rounds[0].round.status, RoundStatus::Open);
        assert_eq!(s.world, None);
        let s = run(&paths, Action::CloseRound { round_id: first }, T0);
        assert_eq!(s.rounds[0].round.status, RoundStatus::Closed);
        assert_eq!(world::get_world(&paths).unwrap().game_date, "1962-05-10");
        assert_eq!(
            act(
                &paths,
                Action::CloseRound {
                    round_id: current(&s).round.id.clone()
                },
                T0
            ),
            Err("Use Next round to close the current round.".to_string())
        );
    }

    #[test]
    fn a_night_ends_after_six_idle_hours_at_its_last_activity() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = run(&paths, Action::StartNight, T0);
        let round_id = current(&s).round.id.clone();
        assert_eq!(s.nights[0].round_ids, [round_id]);
        run(
            &paths,
            Action::Start {
                turn_id: turn_id(&s, "Ana"),
            },
            T0 + HOUR,
        );
        // Just under six hours after the last activity it still runs.
        let s = get(&paths, T0 + 7 * HOUR - 1).unwrap();
        assert_eq!(s.nights[0].ended_at, None);
        let s = get(&paths, T0 + 7 * HOUR).unwrap();
        assert_eq!(s.nights[0].ended_at, Some(T0 + HOUR));
        assert!(s.nights[0].ended_idle);
        // Later activity doesn't bring it back.
        let s = run(
            &paths,
            Action::Reset {
                turn_id: turn_id(&s, "Ana"),
            },
            T0 + 8 * HOUR,
        );
        assert_eq!(s.nights[0].ended_at, Some(T0 + HOUR));
        assert_eq!(s.nights[0].last_activity_at, T0 + HOUR);
    }

    #[test]
    fn nights_record_activity_and_the_rounds_they_touch() {
        let (_temp, paths) = setup();
        let s = get(&paths, T0).unwrap();
        let first = current(&s).round.id.clone();
        run(&paths, Action::StartNight, T0);
        let s = run(
            &paths,
            Action::NextRound {
                round_id: first.clone(),
            },
            T0 + HOUR,
        );
        let second = current(&s).round.id.clone();
        assert_eq!(s.nights[0].round_ids, [first, second]);
        assert_eq!(s.nights[0].last_activity_at, T0 + HOUR);
        let s = run(&paths, Action::EndNight, T0 + 2 * HOUR);
        assert_eq!(s.nights[0].ended_at, Some(T0 + 2 * HOUR));
        assert!(!s.nights[0].ended_idle);
        assert_eq!(
            act(&paths, Action::EndNight, T0),
            Err("No session is running.".to_string())
        );
        // The next night gets the next number; a night left running ends at the next Start.
        run(&paths, Action::StartNight, T0 + 3 * HOUR);
        let s = run(&paths, Action::StartNight, T0 + 4 * HOUR);
        let numbers: Vec<_> = s.nights.iter().map(|n| (n.number, n.ended_at)).collect();
        assert_eq!(
            numbers,
            [
                (1, Some(T0 + 2 * HOUR)),
                (2, Some(T0 + 4 * HOUR)),
                (3, None)
            ]
        );
    }

    #[test]
    fn round_notes_are_kept_in_app_data_and_their_edits_are_activity() {
        let (_temp, paths) = setup();
        with_players(&paths);
        let s = run(&paths, Action::StartNight, T0);
        let note = turn(&s, "Ana").note_id.clone();
        let recap = s.nights[0].recap_note_id.clone();
        assert_eq!(read_note(&paths, &note, T0).unwrap(), "");
        write_note(&paths, &note, "# Ana\nStrike.", T0 + HOUR).unwrap();
        assert_eq!(read_note(&paths, &note, T0).unwrap(), "# Ana\nStrike.");
        assert!(paths
            .data
            .join("round-notes")
            .join(format!("{note}.md"))
            .is_file());
        assert_eq!(
            get(&paths, T0 + HOUR).unwrap().nights[0].last_activity_at,
            T0 + HOUR
        );
        // A recap edit is not activity.
        write_note(&paths, &recap, "Recap.", T0 + 2 * HOUR).unwrap();
        assert_eq!(read_note(&paths, &recap, T0).unwrap(), "Recap.");
        assert_eq!(
            get(&paths, T0 + 2 * HOUR).unwrap().nights[0].last_activity_at,
            T0 + HOUR
        );
        for bad in ["../world", "nope", ""] {
            assert_eq!(
                read_note(&paths, bad, T0),
                Err("That note doesn't exist.".to_string())
            );
            assert_eq!(
                write_note(&paths, bad, "x", T0),
                Err("That note doesn't exist.".to_string())
            );
        }
    }

    #[test]
    fn a_damaged_table_is_reported_and_left_as_it_is() {
        let (_temp, paths) = setup();
        fs::create_dir_all(&paths.data).unwrap();
        fs::write(table_file(&paths), "{\"rounds\": 3}").unwrap();
        assert!(get(&paths, T0).unwrap_err().contains("is damaged"));
        assert_eq!(
            fs::read_to_string(table_file(&paths)).unwrap(),
            "{\"rounds\": 3}"
        );
    }
}
