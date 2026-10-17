# Repräsentative öffentliche Fachschemata

Die Integrationstests verwenden zwei unveränderliche Veröffentlichungen aus dem offiziellen FIM-Portal:

- JSON Schema: S00000092, Version 1.1, „Antrag Selbstauskunft Verstoßdatei Seefischereigesetz“; XDF2-Export mit technischen Feldkennungen und lokalen `$defs`-Verweisen.
- XSD: S00000000159, Version 2.0.0, „Erstantrag Wohngeld Mietzuschuss“; XDF3-Export im XFall/FIM-Namensraum mit verschachtelten Gruppen und Dokumentationsangaben zu Bezeichnung, Version, Wertebereich und Feldtyp.

Die genauen unveränderlichen URLs und SHA-256-Werte stehen in `tests/public-schemas/manifest.json`. Grundlage zur Auswahl waren die öffentlichen FIM-Portal-API-Metadaten am 17. Oktober 2026. Das [FIM-Portal](https://fimportal.de/docs) dokumentiert die API und die unveränderlichen Ressourcen.

`node scripts/fetch-public-schemas.mjs` lädt ausschließlich diese Dateien ohne Zugangsdaten, Weiterleitungen oder zusätzliche Referenzabrufe. Größe und SHA-256 werden vor der Übernahme in den lokalen Testcache geprüft. Mit `--offline` wird nur ein bereits vollständig vorhandener, korrekt gehashter Cache akzeptiert. Die Windows-CI lädt den Cache vor den Browsertests. Ohne Cache bleibt dieser externe Integrationstest ausdrücklich übersprungen; die übrigen Browser- und lokalen XML-Regressionen funktionieren unabhängig davon.

Die Originaldateien liegen ausschließlich im ignorierten Testcache. Sie werden nicht ins Repository, in Diagnoseartefakte oder in den Anwendungsbuild übernommen. Die bereitgestellten Downloads sind öffentliche Fremddaten; es wird keine eigene Lizenz für sie behauptet. Im Repository stehen nur Herkunft, Prüfsummen und die selbst erstellten Tests.

Die Feldwerte sind ausschließlich erfunden: Erika Musterfrau. Die Testdokumente sind absichtlich kleine Ausschnitte für die **Darstellungszuordnung**, keine vollständigen, fachlich gültigen Wohngeld- oder Seefischereianträge. Geprüft werden die Feldbezeichnungen „Familienname“ und „Vornamen“, nachvollziehbare Schemaquellen und unveränderte Originalwerte/-modelle. Die vollständige technische Schema- und Kryptoprüfung wird unabhängig davon in den nativen Tests und den tatsächlichen TEST-Rundläufen ausgeführt.

FIM-XSD-Dokumentation wird nur dann als Feldbezeichnung aufgeteilt, wenn sie ausdrücklich mit `Datenschema:`, `Datenfeldgruppe:` oder `Datenfeld:` beginnt. Der Versionszusatz wird aus der Überschrift genommen; die vollständige Dokumentation bleibt als Erläuterung erhalten. Technische Feldkennungen werden nicht zu fachlichen Bedeutungen geraten. Die Prüfung belegt diese beiden konkreten Veröffentlichungen und keine pauschale Unterstützung aller FIM-/XÖV-Fassungen, Codelisten oder Sonderprofile.
