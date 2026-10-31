//! Native-owned consent copy. Local scanning and external content transfer stay distinct.
pub struct Confirmation {
    pub title: &'static str,
    pub message: String,
    pub button: &'static str,
    pub warning: bool,
}

pub fn activation(local: bool, destination: &str) -> Confirmation {
    if local {
        Confirmation {
            title: "Lokalen Virenscan aktivieren?",
            message: "FBForge Connect startet ClamAV auf diesem Rechner und verwendet ihn als Standardscanner. Empfangene Inhalte sowie vorbereitete Sendungen und Antworten werden geprüft.\n\nFür den Scan werden keine Inhalte an externe Dienste übertragen.".into(),
            button: "Scanner aktivieren",
            warning: false,
        }
    } else {
        Confirmation {
            title: "Eigene Scanner-Gegenstelle verwenden?",
            message: format!("FBForge Connect überträgt die zu prüfenden Inhalte an Ihren Scanner:\n{destination}\n\nDie Verbindung verwendet unverschlüsseltes TCP. Verwenden Sie eine vertrauenswürdige Gegenstelle in einem geschützten Netz. Die Einstellung gilt nur für diese Verbindung."),
            button: "Scanner aktivieren",
            warning: true,
        }
    }
}

pub fn download() -> Confirmation {
    Confirmation {
        title: "Lokalen Virenscan einrichten?",
        message: "FBForge Connect lädt die festgelegte ClamAV-Version von GitHub und prüft sie kryptografisch. Anschließend lädt FreshClam die offiziellen Virensignaturen von ClamAV.\n\nDiese Dienste erhalten Ihre Netzwerkadresse. FIT-Connect-Inhalte und Zugangsdaten werden nicht übertragen.".into(),
        button: "Herunterladen und einrichten",
        warning: false,
    }
}

pub fn update() -> Confirmation {
    Confirmation {
        title: "Virensignaturen aktualisieren?",
        message: "FreshClam lädt aktuelle Virensignaturen von ClamAV. FIT-Connect-Inhalte und Zugangsdaten werden nicht übertragen.\n\nBei einem Fehler bleibt der bisherige gültige Signaturstand erhalten.".into(),
        button: "Signaturen aktualisieren",
        warning: false,
    }
}

pub fn automatic_updates() -> Confirmation {
    Confirmation {
        title: "Automatische Signaturupdates erlauben?",
        message: "Beim Start von FBForge Connect darf FreshClam höchstens einmal täglich Virensignaturen von ClamAV laden. Dafür werden externe ClamAV-Server kontaktiert.\n\nFIT-Connect-Inhalte und Zugangsdaten werden nicht übertragen.".into(),
        button: "Automatische Updates erlauben",
        warning: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_activation_never_describes_an_external_endpoint() {
        let notice = activation(true, "must-not-be-shown.example:3310");
        assert_eq!(notice.title, "Lokalen Virenscan aktivieren?");
        assert!(!notice.warning);
        assert!(!notice.message.contains("must-not-be-shown"));
        assert!(notice.message.contains("Standardscanner"));
        assert!(notice.message.contains("keine Inhalte an externe Dienste"));
    }

    #[test]
    fn external_activation_discloses_the_exact_endpoint_and_unencrypted_transfer() {
        for destination in ["scanner.example:3310", "scanner.example:1344/avscan"] {
            let notice = activation(false, destination);
            assert!(notice.warning);
            assert_eq!(notice.title, "Eigene Scanner-Gegenstelle verwenden?");
            assert!(notice.message.contains(destination));
            assert!(notice.message.contains("unverschlüsseltes TCP"));
            assert!(notice.message.contains("nur für diese Verbindung"));
            assert!(!notice.message.contains("keine Inhalte an externe Dienste"));
        }
    }

    #[test]
    fn network_consent_distinguishes_installation_manual_and_automatic_updates() {
        let install = download();
        assert!(install.message.contains("GitHub"));
        assert!(install.message.contains("kryptografisch"));
        assert!(install.message.contains("Netzwerkadresse"));
        assert_ne!(install.title, update().title);
        assert!(update().message.contains("gültige Signaturstand erhalten"));
        assert!(automatic_updates()
            .message
            .contains("höchstens einmal täglich"));
        for notice in [install, update(), automatic_updates()] {
            assert!(!notice.warning);
            assert!(notice
                .message
                .contains("Zugangsdaten werden nicht übertragen"));
            assert!(!notice.message.contains(';'));
            assert_ne!(notice.button, "OK");
        }
    }
}
