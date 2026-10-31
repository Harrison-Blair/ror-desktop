//! People of interest and the world they live in: `characters.json`,
//! `world.json` and the `photos/` folder in the app data folder. The id of
//! this device's character is kept in the config.

use crate::config;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

pub const STAT_COUNT: usize = 7;

/// The left values of the seven stat pairs. Each right value is 100 − left.
pub type Stats = [Option<u8>; STAT_COUNT];

/// Reads an optional value whose key must be there: null is none, and a
/// missing key is an error. Serde reads a missing `Option` key as none unless
/// the field has its own `deserialize_with`.
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> std::result::Result<Option<T>, D::Error> {
    Option::deserialize(d)
}

/// Everything about a character that the edit form sets. Dates are
/// `YYYY-MM-DD`. An empty place is unknown.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterFields {
    pub name: String,
    #[serde(deserialize_with = "present")]
    pub birth_date: Option<String>,
    pub birth_city: String,
    pub birth_country: String,
    #[serde(deserialize_with = "present")]
    pub death_date: Option<String>,
    pub death_city: String,
    pub death_country: String,
    pub stats: Stats,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    #[serde(flatten)]
    pub fields: CharacterFields,
    /// The file name in `photos/`, or none.
    #[serde(deserialize_with = "present")]
    pub photo: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct CharactersFile {
    characters: Vec<Character>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StatName {
    pub left: String,
    pub right: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub game_date: String,
    pub stat_names: [StatName; STAT_COUNT],
}

impl Default for World {
    fn default() -> Self {
        World {
            game_date: "1962-02-10".to_string(),
            stat_names: std::array::from_fn(|i| StatName {
                left: format!("[Stat {}A]", i + 1),
                right: format!("[Stat {}B]", i + 1),
            }),
        }
    }
}

/// The characters and which of them is this device's character.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct People {
    pub characters: Vec<Character>,
    /// None when this device has no character, or the saved id is gone.
    pub me_id: Option<String>,
}

/// Where the files live.
pub struct Paths {
    /// The app data folder.
    pub data: PathBuf,
    pub config_file: PathBuf,
}

impl Paths {
    fn characters(&self) -> PathBuf {
        self.data.join("characters.json")
    }
    fn world(&self) -> PathBuf {
        self.data.join("world.json")
    }
    fn photos(&self) -> PathBuf {
        self.data.join("photos")
    }
}

type Result<T> = std::result::Result<T, String>;

// Changes read, change and write whole files, so they run one at a time.
static UPDATE: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    UPDATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// Reads a JSON object file. A missing file counts as the defaults. A file
/// that can't be read, can't be parsed, lacks a field or breaks a rule of
/// `valid` is an error and stays as it is, so its data can be recovered.
fn read<T: DeserializeOwned + Default>(
    file: &Path,
    valid: fn(&T) -> std::result::Result<(), String>,
) -> Result<T> {
    let text = match fs::read_to_string(file) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(T::default()),
        Err(e) => return Err(format!("Couldn't read {}: {e}.", file.display())),
    };
    let invalid = |e: String| {
        format!(
            "{} is damaged and was left as it is ({e}). Fix or move the file to go on.",
            file.display()
        )
    };
    // serde would also read a struct from an array.
    let value = match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(value) if value.is_object() => {
            serde_json::from_value::<T>(value).map_err(|e| invalid(e.to_string()))?
        }
        Ok(_) => return Err(invalid("not a JSON object".to_string())),
        Err(e) => return Err(invalid(e.to_string())),
    };
    valid(&value).map_err(invalid)?;
    Ok(value)
}

/// Writes beside the file and renames over it, so a failed write keeps the
/// previous data.
fn write_atomic(file: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut temp = file.as_os_str().to_owned();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);
    let result = fs::write(&temp, bytes).and_then(|()| fs::rename(&temp, file));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write<T: Serialize>(file: &Path, value: &T, what: &str) -> Result<()> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(file, text.as_bytes()).map_err(|e| format!("Couldn't save {what}: {e}."))
}

/// The rules every saved character keeps.
fn valid_characters(file: &CharactersFile) -> std::result::Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for c in &file.characters {
        if !is_file_name(&c.id) || !ids.insert(c.id.as_str()) {
            return Err(format!("the id “{}” is empty, a path or repeated", c.id));
        }
        valid_fields(&c.fields).map_err(|e| format!("character {}: {e}", c.id))?;
        if c.photo.as_deref().is_some_and(|p| !is_file_name(p)) {
            return Err(format!("character {}: the photo is not a file name", c.id));
        }
    }
    Ok(())
}

fn valid_world(world: &World) -> std::result::Result<(), String> {
    if !is_iso_date(&world.game_date) {
        return Err(format!(
            "the game date “{}” is not a real date",
            world.game_date
        ));
    }
    let empty = |n: &StatName| n.left.trim().is_empty() || n.right.trim().is_empty();
    if world.stat_names.iter().any(empty) {
        return Err("a stat name is empty".to_string());
    }
    Ok(())
}

fn read_characters(paths: &Paths) -> Result<Vec<Character>> {
    Ok(read(&paths.characters(), valid_characters)?.characters)
}

fn write_characters(paths: &Paths, characters: Vec<Character>) -> Result<()> {
    write(
        &paths.characters(),
        &CharactersFile { characters },
        "the characters",
    )
}

fn not_found() -> String {
    "That character isn't in the list.".to_string()
}

fn is_leap(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

/// Whether `text` is a date that exists, written `YYYY-MM-DD`.
pub fn is_iso_date(text: &str) -> bool {
    let b = text.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let num = |s: &str| {
        s.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| s.parse::<u32>().ok())
            .flatten()
    };
    let (Some(y), Some(m), Some(d)) = (num(&text[0..4]), num(&text[5..7]), num(&text[8..10]))
    else {
        return false;
    };
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(y) => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&d)
}

/// The rules for a character's fields, on input and in the saved file.
fn valid_fields(f: &CharacterFields) -> std::result::Result<(), String> {
    if f.name.trim().is_empty() {
        return Err("Enter a name.".to_string());
    }
    let dates = [&f.birth_date, &f.death_date];
    if dates
        .iter()
        .any(|d| d.as_deref().is_some_and(|d| !is_iso_date(d)))
    {
        return Err("Not a real date.".to_string());
    }
    // ISO dates compare in date order.
    if let (Some(birth), Some(death)) = (&f.birth_date, &f.death_date) {
        if death < birth {
            return Err("Death date is before the birth date.".to_string());
        }
    }
    if f.stats.iter().flatten().any(|&v| v > 100) {
        return Err("Use a whole number from 0 to 100.".to_string());
    }
    Ok(())
}

/// Tidies and checks the fields: the name and places are trimmed, an empty
/// date is none.
fn checked(mut f: CharacterFields) -> Result<CharacterFields> {
    for place in [
        &mut f.name,
        &mut f.birth_city,
        &mut f.birth_country,
        &mut f.death_city,
        &mut f.death_country,
    ] {
        *place = place.trim().to_string();
    }
    for date in [&mut f.birth_date, &mut f.death_date] {
        if date.as_deref().is_some_and(|d| d.trim().is_empty()) {
            *date = None;
        }
    }
    valid_fields(&f)?;
    Ok(f)
}

/// A plain file name, never a path.
fn is_file_name(name: &str) -> bool {
    Path::new(name).file_name() == Some(name.as_ref())
}

fn photo_path(paths: &Paths, name: &str) -> Option<PathBuf> {
    is_file_name(name).then(|| paths.photos().join(name))
}

/// Deletes a photo file. A file that is already gone is not an error.
fn remove_photo(paths: &Paths, name: &str) -> Result<()> {
    let Some(path) = photo_path(paths, name) else {
        return Ok(());
    };
    match fs::remove_file(&path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(format!(
            "Couldn't delete the photo {}: {e}.",
            path.display()
        )),
        _ => Ok(()),
    }
}

/// The saved id of this device's character. A config that can't be read is
/// an error, so a damaged config never hides which character is yours.
fn saved_me_id(paths: &Paths) -> Result<Option<String>> {
    config::read(&paths.config_file)
        .map(|c| c.me_id)
        .map_err(|e| format!("Couldn't tell which character is yours: {e}."))
}

pub fn list(paths: &Paths) -> Result<People> {
    let characters = read_characters(paths)?;
    let me_id = saved_me_id(paths)?.filter(|id| characters.iter().any(|c| &c.id == id));
    Ok(People { characters, me_id })
}

pub fn create(paths: &Paths, fields: CharacterFields) -> Result<Character> {
    let fields = checked(fields)?;
    let _guard = lock();
    let mut characters = read_characters(paths)?;
    let character = Character {
        id: uuid::Uuid::new_v4().to_string(),
        fields,
        photo: None,
    };
    characters.push(character.clone());
    write_characters(paths, characters)?;
    Ok(character)
}

/// Replaces every field the form sets. The id and photo stay.
pub fn update(paths: &Paths, id: &str, fields: CharacterFields) -> Result<Character> {
    let fields = checked(fields)?;
    let _guard = lock();
    let mut characters = read_characters(paths)?;
    let character = characters
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(not_found)?;
    character.fields = fields;
    let updated = character.clone();
    write_characters(paths, characters)?;
    Ok(updated)
}

/// Deletes the character and its photo. This device's character can't be
/// deleted, and nothing is deleted while the config can't be read. The photo
/// is moved aside until the record is saved, so a failed save can put it
/// back and the delete can be tried again.
pub fn delete(paths: &Paths, id: &str) -> Result<()> {
    let _guard = lock();
    let mut characters = read_characters(paths)?;
    let index = characters
        .iter()
        .position(|c| c.id == id)
        .ok_or_else(not_found)?;
    if saved_me_id(paths)?.as_deref() == Some(id) {
        return Err("You can't delete your own character.".to_string());
    }
    let gone = characters.remove(index);
    let name = &gone.fields.name;
    let staged = match gone.photo.as_deref().and_then(|p| photo_path(paths, p)) {
        Some(photo) => stage(&photo).map_err(|e| {
            format!(
                "Couldn't delete the photo {}: {e}. {name} was not deleted.",
                photo.display()
            )
        })?,
        None => None,
    };
    if let Err(e) = write_characters(paths, characters) {
        if let Some((photo, aside)) = &staged {
            if let Err(u) = fs::rename(aside, photo) {
                return Err(format!(
                    "{e} The photo was left at {}: {u}.",
                    aside.display()
                ));
            }
        }
        return Err(e);
    }
    if let Some((_, aside)) = staged {
        fs::remove_file(&aside).map_err(|e| {
            format!(
                "{name} was deleted, but the photo file {} couldn't be removed: {e}.",
                aside.display()
            )
        })?;
    }
    Ok(())
}

/// Moves a photo aside, beside it. Returns the photo and where it went, or
/// none when the photo is already gone.
fn stage(photo: &Path) -> io::Result<Option<(PathBuf, PathBuf)>> {
    let mut aside = photo.as_os_str().to_owned();
    aside.push(".deleting");
    let aside = PathBuf::from(aside);
    match fs::rename(photo, &aside) {
        Ok(()) => Ok(Some((photo.to_path_buf(), aside))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Makes the character this device's character. A dead character can't be
/// claimed.
pub fn set_me(paths: &Paths, id: &str) -> Result<()> {
    let _guard = lock();
    let character = read_characters(paths)?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(not_found)?;
    if character.fields.death_date.is_some() {
        return Err("A dead character can't be your character.".to_string());
    }
    config::update(&paths.config_file, |c| c.me_id = Some(id.to_string()))
        .map_err(|e| format!("Couldn't save your character: {e}."))
}

const PHOTO_TYPES: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// Copies the image at `source` to `photos/<id>.<ext>` and replaces the
/// character's old photo.
pub fn set_photo(paths: &Paths, id: &str, source: &Path) -> Result<Character> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|e| PHOTO_TYPES.contains(&e.as_str()))
        .ok_or("Pick a PNG, JPEG, GIF or WebP image.")?;
    let _guard = lock();
    let mut characters = read_characters(paths)?;
    let character = characters
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(not_found)?;
    let bytes = fs::read(source).map_err(|e| format!("Couldn't read the image: {e}."))?;
    let name = format!("{id}.{ext}");
    let target = photo_path(paths, &name).ok_or_else(not_found)?;
    // Kept so that a failed save can put the old image back.
    let replaced = match fs::read(&target) {
        Ok(old) => Some(old),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Couldn't read the old photo: {e}.")),
    };
    write_atomic(&target, &bytes).map_err(|e| format!("Couldn't save the photo: {e}."))?;
    let old = character.photo.replace(name.clone());
    let updated = character.clone();
    if let Err(e) = write_characters(paths, characters) {
        let undone = match &replaced {
            Some(old) => write_atomic(&target, old),
            None => fs::remove_file(&target),
        };
        return Err(match undone {
            Ok(()) => e,
            Err(u) => format!("{e} The photo file {} is now wrong: {u}.", target.display()),
        });
    }
    if let Some(old) = old.filter(|old| *old != name) {
        remove_photo(paths, &old).map_err(|e| format!("The photo was changed, but: {e}"))?;
    }
    Ok(updated)
}

/// The bytes of the character's photo.
pub fn read_photo(paths: &Paths, id: &str) -> Result<Vec<u8>> {
    let name = read_characters(paths)?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(not_found)?
        .photo
        .ok_or("This character has no photo.")?;
    let path = photo_path(paths, &name).ok_or("This character has no photo.")?;
    fs::read(path).map_err(|e| format!("Couldn't read the photo: {e}."))
}

pub fn get_world(paths: &Paths) -> Result<World> {
    read(&paths.world(), valid_world)
}

fn update_world(paths: &Paths, change: impl FnOnce(&mut World)) -> Result<World> {
    let _guard = lock();
    let mut world = get_world(paths)?;
    change(&mut world);
    write(&paths.world(), &world, "the world")?;
    Ok(world)
}

pub fn set_game_date(paths: &Paths, date: &str) -> Result<World> {
    if date.trim().is_empty() {
        return Err("Enter a game date.".to_string());
    }
    if !is_iso_date(date) {
        return Err("Not a real date.".to_string());
    }
    update_world(paths, |w| w.game_date = date.to_string())
}

/// Renames the stats for every character. An empty name keeps the old name.
pub fn set_stat_names(paths: &Paths, names: [StatName; STAT_COUNT]) -> Result<World> {
    update_world(paths, |w| {
        for (old, new) in w.stat_names.iter_mut().zip(names) {
            for (old, new) in [(&mut old.left, new.left), (&mut old.right, new.right)] {
                let new = new.trim();
                if !new.is_empty() {
                    *old = new.to_string();
                }
            }
        }
    })
}

fn app_paths(app: &AppHandle) -> Result<Paths> {
    Ok(Paths {
        data: app.path().app_data_dir().map_err(|e| e.to_string())?,
        config_file: crate::config_file(app).map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
pub fn people_list(app: AppHandle) -> Result<People> {
    list(&app_paths(&app)?)
}

#[tauri::command]
pub fn people_create(app: AppHandle, fields: CharacterFields) -> Result<Character> {
    create(&app_paths(&app)?, fields)
}

#[tauri::command]
pub fn people_update(app: AppHandle, id: String, fields: CharacterFields) -> Result<Character> {
    update(&app_paths(&app)?, &id, fields)
}

#[tauri::command]
pub fn people_delete(app: AppHandle, id: String) -> Result<()> {
    delete(&app_paths(&app)?, &id)
}

#[tauri::command]
pub fn people_set_me(app: AppHandle, id: String) -> Result<()> {
    set_me(&app_paths(&app)?, &id)
}

// Async so that the open picker doesn't block the main thread.
#[tauri::command]
pub async fn people_choose_photo(app: AppHandle, window: WebviewWindow) -> Result<Option<String>> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Images", &PHOTO_TYPES)
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn people_set_photo(app: AppHandle, id: String, source: String) -> Result<Character> {
    set_photo(&app_paths(&app)?, &id, Path::new(&source))
}

#[tauri::command]
pub fn people_read_photo(app: AppHandle, id: String) -> Result<Response> {
    Ok(Response::new(read_photo(&app_paths(&app)?, &id)?))
}

#[tauri::command]
pub fn world_get(app: AppHandle) -> Result<World> {
    get_world(&app_paths(&app)?)
}

#[tauri::command]
pub fn world_set_game_date(app: AppHandle, date: String) -> Result<World> {
    set_game_date(&app_paths(&app)?, &date)
}

#[tauri::command]
pub fn world_set_stat_names(app: AppHandle, names: [StatName; STAT_COUNT]) -> Result<World> {
    set_stat_names(&app_paths(&app)?, names)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn setup() -> (TempDir, Paths) {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths {
            data: temp.path().join("data"),
            config_file: temp.path().join("config").join("config.json"),
        };
        (temp, paths)
    }

    fn named(name: &str) -> CharacterFields {
        CharacterFields {
            name: name.to_string(),
            ..Default::default()
        }
    }

    fn saved_json(file: &Path) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap()
    }

    #[test]
    fn missing_files_mean_an_empty_world_with_defaults() {
        let (_temp, paths) = setup();
        assert_eq!(
            list(&paths).unwrap(),
            People {
                characters: vec![],
                me_id: None
            }
        );
        let world = get_world(&paths).unwrap();
        assert_eq!(world.game_date, "1962-02-10");
        assert_eq!(
            world.stat_names[0],
            StatName {
                left: "[Stat 1A]".into(),
                right: "[Stat 1B]".into()
            }
        );
        assert_eq!(
            world.stat_names[6],
            StatName {
                left: "[Stat 7A]".into(),
                right: "[Stat 7B]".into()
            }
        );
        assert!(!paths.data.exists());
    }

    #[test]
    fn a_created_character_is_saved_and_loaded_back() {
        let (_temp, paths) = setup();
        let mut stats = [None; STAT_COUNT];
        stats[0] = Some(62);
        stats[6] = Some(0);
        let fields = CharacterFields {
            name: "  Jun Nakamura ".into(),
            birth_date: Some("1925-11-09".into()),
            birth_city: " Osaka".into(),
            birth_country: "Japan".into(),
            death_date: Some("1961-08-03".into()),
            death_city: "Tokyo".into(),
            death_country: "Japan".into(),
            stats,
            description: "Reported on the Anpo protests.".into(),
        };
        let jun = create(&paths, fields).unwrap();
        assert_eq!(jun.fields.name, "Jun Nakamura");
        assert_eq!(jun.fields.birth_city, "Osaka");
        assert_eq!(list(&paths).unwrap().characters, vec![jun.clone()]);
        assert_eq!(
            saved_json(&paths.data.join("characters.json")),
            json!({ "characters": [{
                "id": jun.id,
                "name": "Jun Nakamura",
                "birthDate": "1925-11-09",
                "birthCity": "Osaka",
                "birthCountry": "Japan",
                "deathDate": "1961-08-03",
                "deathCity": "Tokyo",
                "deathCountry": "Japan",
                "stats": [62, null, null, null, null, null, 0],
                "description": "Reported on the Anpo protests.",
                "photo": null
            }]})
        );
        assert!(!paths.data.join("characters.json.tmp").exists());
    }

    #[test]
    fn an_update_replaces_the_fields_and_keeps_the_id_and_photo() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.png");
        fs::write(&image, "png").unwrap();
        set_photo(&paths, &ada.id, &image).unwrap();
        let mut fields = named("Ada Byron");
        fields.birth_date = Some("1915-12-10".into());
        let updated = update(&paths, &ada.id, fields.clone()).unwrap();
        assert_eq!(updated.id, ada.id);
        assert_eq!(updated.fields, fields);
        assert_eq!(updated.photo, Some(format!("{}.png", ada.id)));
        assert_eq!(list(&paths).unwrap().characters, vec![updated]);
        assert_eq!(update(&paths, "nobody", named("X")), Err(not_found()));
    }

    #[test]
    fn bad_fields_are_refused_and_nothing_is_saved() {
        let (_temp, paths) = setup();
        let date = |birth: Option<&str>, death: Option<&str>| CharacterFields {
            birth_date: birth.map(String::from),
            death_date: death.map(String::from),
            ..named("Ada")
        };
        let mut stats = [None; STAT_COUNT];
        stats[3] = Some(101);
        let cases = [
            (named("   "), "Enter a name."),
            (date(Some("1904-02-30"), None), "Not a real date."),
            (date(Some("1900-02-29"), None), "Not a real date."),
            (date(None, Some("21 January 1904")), "Not a real date."),
            (date(Some("1904-1-21"), None), "Not a real date."),
            (date(Some("1904-13-01"), None), "Not a real date."),
            (
                date(Some("1930-06-14"), Some("1930-06-13")),
                "Death date is before the birth date.",
            ),
            (
                CharacterFields {
                    stats,
                    ..named("Ada")
                },
                "Use a whole number from 0 to 100.",
            ),
        ];
        for (fields, error) in cases {
            assert_eq!(create(&paths, fields.clone()), Err(error.to_string()));
        }
        assert!(!paths.data.join("characters.json").exists());
    }

    #[test]
    fn real_dates_and_empty_dates_are_accepted() {
        let (_temp, paths) = setup();
        let fields = CharacterFields {
            birth_date: Some("2000-02-29".into()),
            death_date: Some("".into()),
            ..named("Ada")
        };
        let ada = create(&paths, fields).unwrap();
        assert_eq!(ada.fields.birth_date.as_deref(), Some("2000-02-29"));
        assert_eq!(ada.fields.death_date, None);
        let same_day = CharacterFields {
            birth_date: Some("1961-08-03".into()),
            death_date: Some("1961-08-03".into()),
            ..named("Bo")
        };
        assert!(create(&paths, same_day).is_ok());
    }

    fn a_good_character() -> serde_json::Value {
        json!({
            "id": "a", "name": "Ada", "birthDate": "1904-01-21", "birthCity": "",
            "birthCountry": "", "deathDate": null, "deathCity": "", "deathCountry": "",
            "stats": [50, null, null, null, null, null, 0], "description": "",
            "photo": "a.png"
        })
    }

    // Every way a characters.json can be damaged: not JSON, the wrong shape,
    // a missing field, or a value the app never saves.
    fn damaged_characters() -> Vec<String> {
        let mut texts: Vec<String> = [
            "{ not json",
            "[]",
            "{}",
            r#"{ "character": [] }"#,
            r#"{ "characters": 3 }"#,
        ]
        .map(String::from)
        .to_vec();
        let changes: [(&str, serde_json::Value); 13] = [
            ("name", json!("  ")),
            ("birthDate", json!("1904-99-21")),
            ("birthDate", json!("21 January 1904")),
            ("deathDate", json!("1904-02-30")),
            ("deathDate", json!("1903-01-01")),
            ("stats", json!([101, null, null, null, null, null, null])),
            ("stats", json!([-1, null, null, null, null, null, null])),
            ("stats", json!([1, 2, 3, 4, 5, 6])),
            ("stats", json!([1, 2, 3, 4, 5, 6, 7, 8])),
            ("photo", json!("../keep.png")),
            ("id", json!("")),
            ("id", json!("../a")),
            ("description", serde_json::Value::Null),
        ];
        for (key, value) in changes {
            let mut c = a_good_character();
            c[key] = value;
            texts.push(json!({ "characters": [c] }).to_string());
        }
        // Every key must be there, including the ones that may be null.
        for key in a_good_character().as_object().unwrap().keys() {
            let mut c = a_good_character();
            c.as_object_mut().unwrap().remove(key);
            texts.push(json!({ "characters": [c] }).to_string());
        }
        texts.push(json!({ "characters": [a_good_character(), a_good_character()] }).to_string());
        texts
    }

    #[test]
    fn a_good_character_file_loads() {
        let (_temp, paths) = setup();
        fs::create_dir_all(&paths.data).unwrap();
        // Explicit null is fine for the keys that may be empty.
        let mut nulls = a_good_character();
        nulls["id"] = json!("b");
        nulls["birthDate"] = json!(null);
        nulls["photo"] = json!(null);
        let text = json!({ "characters": [a_good_character(), nulls] }).to_string();
        fs::write(paths.characters(), text).unwrap();
        let characters = list(&paths).unwrap().characters;
        assert_eq!(characters[0].fields.death_date, None);
        assert_eq!(characters[1].fields.birth_date, None);
        assert_eq!(characters[1].photo, None);
    }

    #[test]
    fn a_damaged_character_file_is_reported_and_left_as_it_is() {
        for text in damaged_characters() {
            let (temp, paths) = setup();
            let file = paths.characters();
            fs::create_dir_all(&paths.data).unwrap();
            fs::write(&file, &text).unwrap();
            let image = temp.path().join("new.png");
            fs::write(&image, "x").unwrap();
            let error = list(&paths).unwrap_err();
            assert!(
                error.contains("characters.json is damaged"),
                "{text}: {error}"
            );
            assert!(create(&paths, named("Bo")).is_err(), "{text}");
            assert!(update(&paths, "a", named("Bo")).is_err(), "{text}");
            assert!(delete(&paths, "a").is_err(), "{text}");
            assert!(set_me(&paths, "a").is_err(), "{text}");
            assert!(set_photo(&paths, "a", &image).is_err(), "{text}");
            assert!(read_photo(&paths, "a").is_err(), "{text}");
            assert_eq!(fs::read_to_string(&file).unwrap(), text);
            assert!(!paths.config_file.exists());
            assert!(!paths.photos().exists());
        }
    }

    #[test]
    fn a_damaged_world_file_is_reported_and_left_as_it_is() {
        let names = World::default().stat_names;
        let mut empty_name = json!(names);
        empty_name[2]["right"] = json!(" ");
        let texts = [
            "{ not json".to_string(),
            "[]".to_string(),
            "{}".to_string(),
            json!({ "gameDate": "1963-05-01" }).to_string(),
            json!({ "statNames": names }).to_string(),
            json!({ "gameDate": 3, "statNames": names }).to_string(),
            json!({ "gameDate": "1962-99-10", "statNames": names }).to_string(),
            json!({ "gameDate": "10 February 1962", "statNames": names }).to_string(),
            json!({ "gameDate": "1962-02-10", "statNames": names[..6] }).to_string(),
            json!({ "gameDate": "1962-02-10", "statNames": empty_name }).to_string(),
        ];
        for text in texts {
            let (_temp, paths) = setup();
            let file = paths.world();
            fs::create_dir_all(&paths.data).unwrap();
            fs::write(&file, &text).unwrap();
            let error = get_world(&paths).unwrap_err();
            assert!(error.contains("world.json is damaged"), "{text}: {error}");
            assert!(set_game_date(&paths, "1963-01-01").is_err(), "{text}");
            assert!(
                set_stat_names(&paths, World::default().stat_names).is_err(),
                "{text}"
            );
            assert_eq!(fs::read_to_string(&file).unwrap(), text);
        }
    }

    #[test]
    fn a_good_world_file_loads() {
        let (_temp, paths) = setup();
        fs::create_dir_all(&paths.data).unwrap();
        let world = World {
            game_date: "1963-05-01".into(),
            ..Default::default()
        };
        fs::write(paths.world(), serde_json::to_string(&world).unwrap()).unwrap();
        assert_eq!(get_world(&paths).unwrap(), world);
    }

    #[test]
    fn photos_are_copied_replaced_and_deleted_with_the_character() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let png = temp.path().join("Portrait.PNG");
        let jpg = temp.path().join("other.jpeg");
        fs::write(&png, "first").unwrap();
        fs::write(&jpg, "second").unwrap();

        let with_png = set_photo(&paths, &ada.id, &png).unwrap();
        let png_name = format!("{}.png", ada.id);
        assert_eq!(with_png.photo.as_deref(), Some(png_name.as_str()));
        assert_eq!(fs::read(paths.photos().join(&png_name)).unwrap(), b"first");
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"first");
        assert!(png.exists());

        let with_jpg = set_photo(&paths, &ada.id, &jpg).unwrap();
        let jpg_name = format!("{}.jpeg", ada.id);
        assert_eq!(with_jpg.photo.as_deref(), Some(jpg_name.as_str()));
        assert!(!paths.photos().join(&png_name).exists());
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"second");
        assert_eq!(list(&paths).unwrap().characters, vec![with_jpg]);

        delete(&paths, &ada.id).unwrap();
        assert!(!paths.photos().join(&jpg_name).exists());
        assert_eq!(list(&paths).unwrap().characters, vec![]);
    }

    #[test]
    fn a_photo_must_be_an_image_of_a_known_character() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let text = temp.path().join("notes.txt");
        let png = temp.path().join("a.png");
        fs::write(&text, "x").unwrap();
        fs::write(&png, "x").unwrap();
        assert_eq!(
            set_photo(&paths, &ada.id, &text),
            Err("Pick a PNG, JPEG, GIF or WebP image.".to_string())
        );
        assert_eq!(set_photo(&paths, "nobody", &png), Err(not_found()));
        assert!(set_photo(&paths, &ada.id, &temp.path().join("gone.png")).is_err());
        assert_eq!(
            read_photo(&paths, &ada.id),
            Err("This character has no photo.".to_string())
        );
        assert!(!paths.photos().exists());
    }

    #[test]
    fn me_round_trips_through_the_config() {
        let (_temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let bo = create(&paths, named("Bo")).unwrap();
        set_me(&paths, &ada.id).unwrap();
        assert_eq!(list(&paths).unwrap().me_id.as_ref(), Some(&ada.id));
        assert_eq!(
            config::load(&paths.config_file).me_id.as_ref(),
            Some(&ada.id)
        );
        set_me(&paths, &bo.id).unwrap();
        assert_eq!(list(&paths).unwrap().me_id.as_ref(), Some(&bo.id));
        assert_eq!(set_me(&paths, "nobody"), Err(not_found()));
    }

    #[test]
    fn a_dead_character_cant_be_claimed() {
        let (_temp, paths) = setup();
        let dead = CharacterFields {
            death_date: Some("1961-08-03".into()),
            ..named("Jun")
        };
        let jun = create(&paths, dead).unwrap();
        assert!(set_me(&paths, &jun.id).is_err());
        assert_eq!(config::load(&paths.config_file).me_id, None);
    }

    #[test]
    fn my_character_cant_be_deleted_and_others_can() {
        let (_temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let bo = create(&paths, named("Bo")).unwrap();
        set_me(&paths, &ada.id).unwrap();
        assert_eq!(
            delete(&paths, &ada.id),
            Err("You can't delete your own character.".to_string())
        );
        delete(&paths, &bo.id).unwrap();
        assert_eq!(list(&paths).unwrap().characters, vec![ada]);
        assert_eq!(delete(&paths, &bo.id), Err(not_found()));
    }

    #[test]
    fn a_saved_me_id_of_a_gone_character_counts_as_none() {
        let (_temp, paths) = setup();
        config::update(&paths.config_file, |c| c.me_id = Some("gone".into())).unwrap();
        assert_eq!(list(&paths).unwrap().me_id, None);
    }

    #[test]
    fn the_game_date_is_checked_and_saved() {
        let (_temp, paths) = setup();
        assert_eq!(
            set_game_date(&paths, " "),
            Err("Enter a game date.".to_string())
        );
        assert_eq!(
            set_game_date(&paths, "1963-02-29"),
            Err("Not a real date.".to_string())
        );
        assert!(!paths.world().exists());
        let world = set_game_date(&paths, "1963-03-01").unwrap();
        assert_eq!(world.game_date, "1963-03-01");
        assert_eq!(get_world(&paths).unwrap(), world);
        assert_eq!(world.stat_names, World::default().stat_names);
    }

    #[test]
    fn stat_names_are_renamed_and_empty_names_keep_the_old_name() {
        let (_temp, paths) = setup();
        let mut names = World::default().stat_names.map(|_| StatName {
            left: " ".into(),
            right: String::new(),
        });
        names[0] = StatName {
            left: " Loyal ".into(),
            right: "Ambitious".into(),
        };
        names[6].right = "Rich".into();
        let world = set_stat_names(&paths, names).unwrap();
        assert_eq!(get_world(&paths).unwrap(), world);
        assert_eq!(world.game_date, "1962-02-10");
        let saved = saved_json(&paths.world());
        assert_eq!(
            saved["statNames"][0],
            json!({ "left": "Loyal", "right": "Ambitious" })
        );
        assert_eq!(
            saved["statNames"][1],
            json!({ "left": "[Stat 2A]", "right": "[Stat 2B]" })
        );
        assert_eq!(
            saved["statNames"][6],
            json!({ "left": "[Stat 7A]", "right": "Rich" })
        );
    }

    // A non-empty folder where a file should be can't be removed or replaced
    // as a file, even by the owner.
    fn block(path: &Path) {
        fs::create_dir_all(path.join("inside")).unwrap();
    }

    #[test]
    fn a_damaged_config_blocks_delete_and_the_list() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.png");
        fs::write(&image, "png").unwrap();
        set_photo(&paths, &ada.id, &image).unwrap();
        set_me(&paths, &ada.id).unwrap();
        fs::write(&paths.config_file, "{ not json").unwrap();

        let error = delete(&paths, &ada.id).unwrap_err();
        assert!(
            error.starts_with("Couldn't tell which character is yours"),
            "{error}"
        );
        assert!(list(&paths)
            .unwrap_err()
            .starts_with("Couldn't tell which character is yours"));
        assert_eq!(read_characters(&paths).unwrap().len(), 1);
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"png");
        assert_eq!(
            fs::read_to_string(&paths.config_file).unwrap(),
            "{ not json"
        );
    }

    #[test]
    fn a_photo_that_cant_be_moved_aside_keeps_the_character() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.png");
        fs::write(&image, "png").unwrap();
        set_photo(&paths, &ada.id, &image).unwrap();
        let aside = paths.photos().join(format!("{}.png.deleting", ada.id));
        block(&aside);

        let error = delete(&paths, &ada.id).unwrap_err();
        assert!(error.starts_with("Couldn't delete the photo"), "{error}");
        assert!(error.ends_with("Ada was not deleted."), "{error}");
        assert_eq!(list(&paths).unwrap().characters.len(), 1);
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"png");

        // Once the way is clear, the delete can be tried again.
        fs::remove_dir_all(&aside).unwrap();
        delete(&paths, &ada.id).unwrap();
        assert_eq!(list(&paths).unwrap().characters, vec![]);
        assert_eq!(fs::read_dir(paths.photos()).unwrap().count(), 0);
    }

    #[test]
    fn a_failed_delete_save_keeps_the_record_and_the_photo() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.png");
        fs::write(&image, "png").unwrap();
        set_photo(&paths, &ada.id, &image).unwrap();
        let before = fs::read_to_string(paths.characters()).unwrap();
        block(&paths.data.join("characters.json.tmp"));

        assert!(delete(&paths, &ada.id).is_err());
        assert_eq!(fs::read_to_string(paths.characters()).unwrap(), before);
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"png");
        let aside = paths.photos().join(format!("{}.png.deleting", ada.id));
        assert!(!aside.exists());
    }

    #[test]
    fn a_photo_left_after_a_delete_is_reported() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.png");
        fs::write(&image, "png").unwrap();
        set_photo(&paths, &ada.id, &image).unwrap();
        // A folder moves aside like a file but can't be removed as one.
        let photo = paths.photos().join(format!("{}.png", ada.id));
        fs::remove_file(&photo).unwrap();
        block(&photo);

        let error = delete(&paths, &ada.id).unwrap_err();
        assert!(
            error.starts_with("Ada was deleted, but the photo file"),
            "{error}"
        );
        assert_eq!(list(&paths).unwrap().characters, vec![]);
    }

    #[test]
    fn a_failed_photo_save_keeps_the_old_image() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let first = temp.path().join("first.png");
        let second = temp.path().join("second.png");
        fs::write(&first, "first").unwrap();
        fs::write(&second, "second").unwrap();
        set_photo(&paths, &ada.id, &first).unwrap();
        let before = fs::read_to_string(paths.characters()).unwrap();
        block(&paths.data.join("characters.json.tmp"));

        assert!(set_photo(&paths, &ada.id, &second).is_err());
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"first");
        assert_eq!(fs::read_to_string(paths.characters()).unwrap(), before);
    }

    #[test]
    fn a_failed_first_photo_save_leaves_no_photo() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let image = temp.path().join("ada.webp");
        fs::write(&image, "webp").unwrap();
        block(&paths.data.join("characters.json.tmp"));
        assert!(set_photo(&paths, &ada.id, &image).is_err());
        assert!(!paths.photos().join(format!("{}.webp", ada.id)).exists());
        assert_eq!(list(&paths).unwrap().characters[0].photo, None);
    }

    #[test]
    fn an_old_photo_that_cant_be_deleted_is_reported() {
        let (temp, paths) = setup();
        let ada = create(&paths, named("Ada")).unwrap();
        let png = temp.path().join("a.png");
        let gif = temp.path().join("a.gif");
        fs::write(&png, "png").unwrap();
        fs::write(&gif, "gif").unwrap();
        set_photo(&paths, &ada.id, &png).unwrap();
        let old = paths.photos().join(format!("{}.png", ada.id));
        fs::remove_file(&old).unwrap();
        block(&old);

        let error = set_photo(&paths, &ada.id, &gif).unwrap_err();
        assert!(
            error.starts_with("The photo was changed, but: Couldn't delete the photo"),
            "{error}"
        );
        assert_eq!(read_photo(&paths, &ada.id).unwrap(), b"gif");
    }
}
