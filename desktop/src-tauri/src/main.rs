// The app's native side. The page (../app) can call only these commands:
//   set_key / remember_key / use_saved_key / forget_key
//                holds the Planning Center key, and optionally keeps it in the
//                Mac Keychain or Windows Credential Manager. The page never gets
//                a saved key back; requests are signed here.
//   pco_request  sends one request to the Planning Center Services API, and nowhere else
//   save_file    asks where to save a file, then writes it there
//   open_url     opens a help page or Planning Center in the default browser
// The page itself has no network access (see build-frontend.mjs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const API_HOST: &str = "api.planningcenteronline.com";
const API_PATH: &str = "/services/v2/";
const BROWSER_HOSTS: &[&str] = &[
    "api.planningcenteronline.com",
    "services.planningcenteronline.com",
    "github.com",
    "3cordguy.github.io",
    "claude.ai",
];
const KEYCHAIN_SERVICE: &str = "HV Song Tagger";
const KEYCHAIN_ACCOUNT: &str = "Planning Center key";

#[derive(Serialize, Deserialize, Clone)]
struct Key {
    client_id: String,
    secret: String,
}

/// The key in use right now. Lives only in this process unless remember_key saves it.
static CURRENT_KEY: Mutex<Option<Key>> = Mutex::new(None);

#[derive(Serialize)]
struct PcoResponse {
    status: u16,
    retry_after: Option<String>,
    body: String,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none()) // never carry the key somewhere else
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("hv-tagger-desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("couldn't set up the network client")
    })
}

fn keychain() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

/// Only HTTPS requests to Planning Center Services. Dot segments are resolved
/// before the check, so "songs/../../people" can't escape the Services API.
fn api_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw).map_err(|_| "That isn't a valid address.".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some(API_HOST) || url.port().is_some()
        || !url.path().starts_with(API_PATH) || !url.username().is_empty()
    {
        return Err("The app only talks to the Planning Center Services API.".into());
    }
    Ok(url)
}

#[tauri::command]
fn set_key(client_id: String, secret: String) {
    let key = Key { client_id: client_id.trim().into(), secret: secret.trim().into() };
    *CURRENT_KEY.lock().unwrap() = Some(key);
}

/// Saves the key in use to the Keychain (Mac) or Credential Manager (Windows).
#[tauri::command]
fn remember_key() -> Result<(), String> {
    let key = CURRENT_KEY.lock().unwrap().clone().ok_or("There's no key to remember.")?;
    let json = serde_json::to_string(&key).map_err(|e| e.to_string())?;
    keychain()?.set_password(&json).map_err(|e| e.to_string())
}

/// Loads a remembered key for use. Returns false when none is saved.
#[tauri::command]
fn use_saved_key() -> Result<bool, String> {
    match keychain()?.get_password() {
        Ok(json) => {
            let key: Key = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            *CURRENT_KEY.lock().unwrap() = Some(key);
            Ok(true)
        }
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Removes the remembered key from this computer and stops using it.
#[tauri::command]
fn forget_key() -> Result<(), String> {
    *CURRENT_KEY.lock().unwrap() = None;
    match keychain()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn pco_request(method: String, url: String, body: Option<String>) -> Result<PcoResponse, String> {
    let url = api_url(&url)?;
    let method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err("Only GET and POST are allowed.".into()),
    };
    let key = CURRENT_KEY.lock().unwrap().clone().ok_or("Not connected to Planning Center.")?;
    let mut req = client().request(method, url).basic_auth(key.client_id, Some(key.secret));
    if let Some(body) = body {
        req = req.header("Content-Type", "application/json").body(body);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let retry_after = resp
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(PcoResponse { status, retry_after, body })
}

/// Shows a Save dialog. Returns where the file was saved, or None if the person cancelled.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, contents: String) -> Result<Option<String>, String> {
    let Some(choice) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
        return Ok(None);
    };
    let path = choice.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "That isn't a valid address.".to_string())?;
    let allowed = parsed.scheme() == "https"
        && parsed.host_str().is_some_and(|h| BROWSER_HOSTS.contains(&h));
    if !allowed {
        return Err("The app doesn't open that address.".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_key, remember_key, use_saved_key, forget_key, pco_request, save_file, open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_services_api_is_allowed() {
        assert!(api_url("https://api.planningcenteronline.com/services/v2/tag_groups?per_page=100").is_ok());
        for bad in [
            "http://api.planningcenteronline.com/services/v2/tag_groups",
            "https://api.planningcenteronline.com.evil.example/services/v2/",
            "https://evil.example/services/v2/tag_groups",
            "https://api.planningcenteronline.com/people/v2/people",
            "https://api.planningcenteronline.com/services/v2/songs/../../people/v2/people",
            "https://api.planningcenteronline.com:8443/services/v2/tag_groups",
            "https://user@api.planningcenteronline.com/services/v2/tag_groups",
        ] {
            assert!(api_url(bad).is_err(), "should block {bad}");
        }
    }

    #[test]
    fn planning_center_answers_are_readable() {
        // The browser hid this status. The app can read it.
        set_key("not".into(), "real".into());
        let resp = tauri::async_runtime::block_on(pco_request(
            "GET".into(),
            "https://api.planningcenteronline.com/services/v2/tag_groups".into(),
            None,
        ))
        .expect("request should reach Planning Center");
        assert_eq!(resp.status, 401);
    }
}
