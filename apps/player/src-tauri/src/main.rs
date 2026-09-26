// The Board RPG player (docs/distribution.md §2): the game build in a window. It plays the .brpg it
// was opened with (a double-click on one, the command line) or a game.brpg beside the executable –
// a finished game is the player with its game.brpg; without either the page asks for one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::State;

struct StartFile(Mutex<Option<PathBuf>>);

/// The game to start with, as raw bytes (empty: none – the page asks).
#[tauri::command]
fn initial_game(start: State<StartFile>) -> Response {
    let path = start.0.lock().ok().and_then(|p| p.clone());
    Response::new(path.and_then(|p| std::fs::read(p).ok()).unwrap_or_default())
}

/// A .brpg the app was opened with, else a game.brpg beside the executable.
fn start_file() -> Option<PathBuf> {
    if let Some(arg) = std::env::args().skip(1).find(|a| a.to_lowercase().ends_with(".brpg")) {
        return Some(PathBuf::from(arg));
    }
    let beside = std::env::current_exe().ok()?.parent()?.join("game.brpg");
    beside.exists().then_some(beside)
}

fn main() {
    tauri::Builder::default()
        .manage(StartFile(Mutex::new(start_file())))
        .invoke_handler(tauri::generate_handler![initial_game])
        .run(tauri::generate_context!())
        .expect("error while running the Board RPG player");
}
