# Windows-Installation und Upgrade

`scripts/windows-install-smoke.ps1` prüft auf dem Windows-CI-Runner den tatsächlich gebauten NSIS-Installer, keine separat gestartete Entwicklungsanwendung. Es verwendet ein eigenes Installationsverzeichnis mit Leerzeichen und ausschließlich erfundene Profildaten ohne private Schlüssel. Es authentifiziert sich nicht bei FIT-Connect.

Automatisierter Ablauf, erstmals vollständig bestanden im [Windows-Lauf 39037553713](https://github.com/FBForge/fit-connect-testclient/actions/runs/39037553713) auf Commit `06a7ee2`:

1. Frisch installieren, die installierte Desktop-Anwendung starten und über Windows UI Automation die sichtbare Diagnose „Komponenten prüfen“ bedienen.
2. Beide Adapter müssen „Lokal bereit“ anzeigen. Der Java-Kindprozess muss aus der installierten gebündelten Laufzeit stammen. Java/Node-Pfade und JVM-Injektionsvariablen sind beim Anwendungsstart entfernt. Der SHA-256 der installierten Anwendung muss dem gerade gebauten Programm entsprechen. Der neue Anzeigename muss im beibehaltenen Upgrade-Registrierungseintrag stehen; ein zweiter Eintrag unter dem neuen Namen ist unzulässig.
3. Mit dem CI-Hilfsprogramm ein DPAPI-Profil mit erfundenen Zugangsdaten anlegen. Dessen Modus `fixture` erzeugt es unmittelbar aus den nativen Produkttypen; PowerShell überträgt weder Profil-JSON noch Zugangsdaten über eine Text-Pipe. Die echte Anwendung muss dessen öffentlichen Profilnamen anzeigen, ohne sich damit anzumelden.
4. Die Anwendung schließen und den Installer deinstallieren. Das gespeicherte Profil muss erhalten bleiben.
5. Im vertrauenswürdigen Push-Lauf den Installer aus dem festen dev.7-Workflow 38967495361 verwenden, dessen Quellstand `bc12b4ad0f0f47a77024e82a070dc2df993da438` geprüft wird. Danach den aktuellen Kandidaten darüber installieren, beide SDKs und das erhaltene Profil erneut in der echten Anwendung prüfen und deinstallieren.

Der Windows-Build verwendet die dokumentierte Tauri-Option `--no-binary-patching`: Es gibt aktuell nur NSIS und kein Auto-Update-Plugin, das die sonst eingesetzte Bündeltypkennung benötigt. Damit bleibt die im Installer enthaltene Programmdatei bytegleich zum geprüften Release-Binary; der Hashvergleich wird nicht abgeschwächt. Bei Einführung weiterer Windows-Pakettypen oder automatischer Updates diese Entscheidung erneut prüfen. Maven-/Rust-Caches beschleunigen Wiederholungsläufe; Tests und Installation bleiben erforderlich.

Nach erfolgreicher Installation erzeugt der Workflow `SHA256SUMS.txt` und `build-info.json` direkt aus dem gebauten Installer. Das Actions-Artefakt enthält damit den Installer, seine SHA-256-Prüfsumme, Größe, Produktversion und den tatsächlichen Commit/Workflow-Lauf. Das Manifest bezeichnet den Kandidaten ausdrücklich als unsigniert; es ersetzt keine digitale Signatur.

Der Skriptablauf ist erst nach einem erfolgreichen CI-Lauf als bestanden zu werten. Fehlende UI-Automation-Unterstützung wird als Fehler gemeldet und nicht als bestandener Anwendungstest ausgegeben. Der Runner enthält Buildwerkzeuge; der bereinigte Anwendungspfad und der nachgewiesene gebündelte Java-Prozess prüfen die Unabhängigkeit von separat installierten Java-/Node-Laufzeiten. Das ersetzt nicht jede Kombination eines frischen Behördenrechners, dessen Proxy oder Endpoint-Schutz.

Das Skript entfernt nur seine eigene temporäre Installation und den von ihm angelegten Profilordner. Ein schon vorhandener Profilordner führt vor dessen Veränderung zum Abbruch. Echte Actions-Secrets werden diesem Schritt nicht übergeben. Der frühere Installer wird mit einem nur lesenden GitHub-Token heruntergeladen; dieses Token wird nicht an die gestartete Anwendung weitergereicht.

Weitere Freigabegrenzen: reale Tastatur-/Screenreader- und Skalierungsprüfung auf Zielgeräten, behördliche Netzwerkumgebung sowie Herausgeber-/Signierungsentscheidung. Der Kandidat ist weiterhin unsigniert. Diese Punkte werden nicht durch einen erfolgreichen Build oder einen Browser-Test als erledigt bezeichnet.
