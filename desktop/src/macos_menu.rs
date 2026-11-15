//! Navigation-only native menu. All writes still use the existing UI confirmation paths.
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem as Standard, Submenu},
    Emitter, Manager,
};
pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Einstellungen…", true, Some("Cmd+,"))?;
    let quit = MenuItem::with_id(app, "quit", "FBForge Connect beenden", true, Some("Cmd+Q"))?;
    let application = Submenu::with_items(
        app,
        "FBForge Connect",
        true,
        &[
            &Standard::about(app, Some("Über FBForge Connect"), None)?,
            &Standard::separator(app)?,
            &settings,
            &Standard::separator(app)?,
            &Standard::hide(app, Some("FBForge Connect ausblenden"))?,
            &Standard::hide_others(app, Some("Andere ausblenden"))?,
            &Standard::separator(app)?,
            &quit,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Bearbeiten",
        true,
        &[
            &Standard::undo(app, Some("Rückgängig"))?,
            &Standard::redo(app, Some("Wiederholen"))?,
            &Standard::separator(app)?,
            &Standard::cut(app, Some("Ausschneiden"))?,
            &Standard::copy(app, Some("Kopieren"))?,
            &Standard::paste(app, Some("Einfügen"))?,
            &Standard::select_all(app, Some("Alles auswählen"))?,
        ],
    )?;
    let view = Submenu::new(app, "Darstellung", true)?;
    for (id, title) in [
        ("start", "Start"),
        ("send", "Senden"),
        ("receive", "Empfangen"),
        ("cases", "Vorgänge"),
        ("destinations", "Destinations"),
        ("process", "Prozesse"),
        ("events", "Event Log"),
        ("tests", "Testwerkzeuge"),
        ("scanner", "Virenscan"),
        ("diagnostics", "Diagnose"),
    ] {
        view.append(&MenuItem::with_id(app, id, title, true, None::<&str>)?)?;
    }
    let window = Submenu::with_items(
        app,
        "Fenster",
        true,
        &[
            &Standard::minimize(app, Some("Im Dock ablegen"))?,
            &Standard::maximize(app, Some("Zoomen"))?,
            &Standard::close_window(app, Some("Fenster schließen"))?,
        ],
    )?;
    let help = Submenu::with_items(
        app,
        "Hilfe",
        true,
        &[&MenuItem::with_id(
            app,
            "help",
            "FBForge Connect-Hilfe",
            true,
            None::<&str>,
        )?],
    )?;
    app.set_menu(Menu::with_items(
        app,
        &[&application, &edit, &view, &window, &help],
    )?)?;
    app.on_menu_event(|app, event| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            if event.id().as_ref() == "quit" {
                let _ = window.emit("application-close-requested", ());
            } else {
                let _ = window.emit("application-navigation", event.id().as_ref());
            }
        }
    });
    Ok(())
}
