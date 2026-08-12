/*
 * Voreingestellter Impressumstext (DE/EN). Der Superadmin kann beide Texte
 * im Admin Panel jederzeit anpassen — diese Fassung ist nur der Startwert.
 *
 * Format: "# " beginnt einen neuen Abschnitt mit Überschrift,
 * "- " eine Aufzählungszeile, Leerzeilen trennen Absätze.
 *
 * Wer hier etwas ändert, ändert die Vorgabe für NEUE Geräte. Bestandsgeräte
 * tragen den Text in ihren Einstellungen; `migrateState` hebt ihn nur dann
 * auf diese Fassung, wenn er noch unverändert der vorigen Vorgabe entspricht
 * (siehe IMPRINT_LEGACY_HASHES) — eine selbst geschriebene Fassung bleibt
 * unangetastet.
 */

export const IMPRINT_DE = `Diese Hinweise gelten für die Nutzung von Instructor Connect, der internen Kommunikations-App für Instruktoren eines reinen Simulatorbetriebs. Bitte lies sie aufmerksam — sie beschreiben den Charakter der App, deine Rechte und die Grenzen dessen, wofür die App gedacht ist.

# 1. Betreiber und Verantwortlicher
Instructor Connect wird ausschließlich für den internen Gebrauch betrieben. Verantwortlich für Betrieb, Benutzerverwaltung und Inhalte-Moderation ist der Admin.

Vollständige Anschrift und weitere Kontaktdaten werden vor dem Produktivbetrieb an dieser Stelle ergänzt. Dasselbe gilt für die Angabe einer Datenschutz-Kontaktstelle.

# 2. Zweck und Module der App
Instructor Connect ist ein internes, zentral verwaltetes Werkzeug für Instruktoren. Es umfasst derzeit folgende Module:

- Grading Tool: digitale Bewertungsformulare nach OM Appendix 5 (Grading Sheets, Additional Training, Record of Attendance, Deferred Item). Formulare sind immer englisch. Unterschriften werden ausschließlich live am Gerät geleistet und niemals gespeichert oder wiederverwendet; nach beidseitiger Unterschrift ist ein Formular schreibgeschützt. Ein Fingerabdruck über den Inhalt macht jede spätere Änderung sichtbar, und der Dokumentenstand (ATO, Zulassungsnummer, Formularstand, Formulartitel) wird beim Unterschreiben eingefroren. Abgeschlossene Formulare werden automatisch per E-Mail an die konfigurierten Empfänger versendet — die Deferred Item (Form 310) immer zusätzlich an den Training Admin. In der eigenen Ansicht bleiben Formulare eine Woche sichtbar; in der Ablage bleiben sie unbegrenzt erhalten. Ausdrucke und Exporte tragen immer Datum, Uhrzeit und Namen der exportierenden Person; jedes gedruckte Blatt nennt ATO, Formular und die geschulte Person.
- Auswertung: Verlauf je Pilot, Monatsbericht und Standardisierungsbericht. Sie vergleichen das Bewertungsverhalten der Instruktoren mit dem Flottenmittel und dienen der Standardisierung nach ORA.ATO.110 — nicht der Leistungskontrolle einzelner Personen (siehe Abschnitt 6).
- Lesson Plan: Bibliothek der Lesson Plans je Muster und Schulungsart. Sichtbar sind nur die Muster, die dir im Admin-Panel zugewiesen wurden.
- Chat: Gruppenchats mit Umfragen und automatischer Löschung nach der eingestellten Aufbewahrungsdauer. Der Zugang ist auf Mitglieder der jeweiligen Gruppe beschränkt. Der Admin kann einzelne Personen für das Senden im Chat sperren; Mitlesen bleibt möglich.
- Instructor Info: Informationsbibliothek mit Kategorien, Gültigkeitszeitraum (ohne Enddatum: UFN — until further notice) und Zielgruppen. Einträge mit Zielgruppen sehen nur deren Mitglieder. Für gekennzeichnete Einträge ist eine Lese-Bestätigung zu leisten; Admins sehen, wer bestätigt hat, und können eine Kontrollliste exportieren.
- Feedback: Feedback an einen wählbaren Empfänger, optional als „Urgent" markiert und mit Foto- oder PDF-Anhang. Feedback ist nicht anonym und bleibt für Admins gespeichert, bis es dort gelöscht wird. Wird die Kategorie „Safety" gewählt, weist die App sofort darauf hin, dass ein Safety Report zu schreiben ist — das Feedback-Modul ist kein Meldeweg.
- Notes: persönliche Merkliste. Notizen gehören ausschließlich ihrem Verfasser: Niemand sonst sieht sie, auch kein Admin und kein Superadmin, und sie gehen in keinen Export und in keinen Nachweis. Sie sind eine Gedächtnisstütze, keine Dokumentation.
- Who to call: internes Kontaktverzeichnis.
- Admin Panel: Benutzerverwaltung (einzeln oder als Tabellen-Import), Rechte-Matrix, Grading-Konfiguration, Gruppen, Feedback, Einstellungen, dieser Text und der Changelog.

Die App ist ein Zusatzangebot. Sie ist ausdrücklich kein offizielles Anweisungs-, Melde- oder Dokumentationssystem der Organisation.

# 3. Freiwilligkeit der Nutzung
Die Nutzung von Instructor Connect ist vollständig und in jeder Hinsicht freiwillig. Es besteht keine dienstliche, arbeitsrechtliche oder sonstige Verpflichtung, die App zu installieren, zu nutzen oder Nachrichten darin zu lesen oder zu beantworten.

- Wer die App nicht nutzt, erleidet dadurch keinerlei Nachteile. Alle dienstlich relevanten Informationen werden weiterhin über die offiziellen Kanäle verteilt.
- Es besteht keine Erwartung, über die App außerhalb der Arbeitszeit erreichbar zu sein. Benachrichtigungen können jederzeit pro Gruppe stummgeschaltet werden.
- Die Teilnahme kann jederzeit, ohne Angabe von Gründen und ohne Nachteile beendet werden (siehe Abschnitt 8).
- Auch das Einstellen eigener Inhalte — Nachrichten, Dateien, Umfragen, Feedback, Notizen — ist stets freiwillig. Lese-Bestätigungen in der Instructor Info dokumentieren ausschließlich die Kenntnisnahme eines Eintrags in dieser App; verbindliche Schulungs- und Kenntnisnahmenachweise laufen weiterhin über die offiziellen Systeme.

# 4. Rein informativer Charakter — genehmigte Handbücher sind maßgeblich
Sämtliche Inhalte in Instructor Connect dienen ausschließlich der Information und der informellen internen Abstimmung. Sie sind unverbindlich und ersetzen keine offiziellen Anweisungen, Verfahren, Freigaben oder Dokumente.

Verbindlich sind ausschließlich die genehmigten Handbücher und Verfahren der Organisation (z. B. Training Manual, Betriebs- und Verfahrensdokumentation für den Simulatorbetrieb) in ihrer jeweils gültigen, freigegebenen Fassung sowie die offiziellen Anweisungen der verantwortlichen Führungskräfte. Das gilt auch für Formulare des Grading Tools und Dokumente der Instructor Info: maßgeblich ist stets die genehmigte Fassung im offiziellen Dokumentationssystem.

Bei Widersprüchen zwischen Inhalten dieser App und einem genehmigten Handbuch oder einer offiziellen Anweisung gilt ausnahmslos das Handbuch bzw. die offizielle Anweisung.

# 5. Vertraulichkeit, Verschlüsselung und Gruppenzugriff
Alle Daten und Inhalte in Instructor Connect werden vertraulich behandelt. Der Zugang ist ausschließlich registrierten Mitgliedern vorbehalten; Konten werden nur vom Admin angelegt und dabei mindestens einer Gruppe zugewiesen — eine Selbstregistrierung existiert nicht. Angemeldet wird sich mit der dienstlichen E-Mail-Adresse und einem sechsstelligen Code, der bis Mitternacht gilt; Passwörter gibt es keine. Chats und gruppenbezogene Instructor-Info-Einträge sind nur für Mitglieder der jeweiligen Gruppe zugänglich.

Die Datenübertragung erfolgt transportverschlüsselt (TLS). Eine Ende-zu-Ende-Verschlüsselung besteht bewusst nicht: technische Administratoren könnten Inhalte prinzipiell einsehen, etwa zur Fehlerbehebung oder Moderation. Bitte teile daher keine sensiblen privaten Inhalte oder vertraulichen personenbezogenen Dokumente über die App.

- Inhalte, Screenshots, Exporte, Ausdrucke und Zugangsdaten dürfen nicht an Außenstehende weitergegeben werden. Das gilt insbesondere für Grading-Formulare und Kontrolllisten, die personenbezogene Bewertungs- und Bestätigungsdaten enthalten.
- Die App speichert ihre Daten auf dem Gerät und kann Inhalte für die Offline-Nutzung vorhalten — unverschlüsselt. Schütze dein Gerät daher mit Code oder Biometrie und melde dich auf fremden Geräten ab.
- Die Daten werden ausschließlich für den Betrieb der App verwendet und nicht an Dritte weitergegeben.

# 6. Datenschutz — welche Daten, wozu und wie lange
Diese Fassung der App kommt ohne Server aus: Der gesamte Bestand liegt in der Datenbank des Browsers auf deinem Gerät. Es gibt keine Analyse-, Tracking- oder Werbedienste, keine Weitergabe an Dritte und keine Verbindungen zu fremden Servern.

Verarbeitet werden: Stammdaten (Name, dienstliche E-Mail-Adresse, Telefonnummer, Rolle, zugewiesene Muster), Grading-Formulare samt Noten, Kommentaren und Unterschriftsbildern, Chat-Nachrichten und Umfragen, Instructor-Info-Einträge samt Lese-Bestätigungen, Rückmeldungen aus dem Feedback-Modul, das Kontaktverzeichnis sowie persönliche Notizen.

- Wozu: zur Durchführung des Ausbildungsbetriebs und zur Erfüllung der aufsichtsrechtlichen Nachweispflichten (Art. 6 Abs. 1 lit. b und c DSGVO), im Übrigen zur internen Abstimmung auf Grundlage des berechtigten Interesses (lit. f). Die Nutzung der App selbst bleibt freiwillig (Abschnitt 3).
- Wie lange: Chat-Nachrichten bis zum Ablauf der eingestellten Aufbewahrungsdauer; Formulare eine Woche in der eigenen Ansicht und danach dauerhaft in der Ablage, weil Ausbildungsnachweise aufbewahrungspflichtig sind (ORA.GEN.220); Notizen, bis ihr Verfasser sie löscht.
- Notizen sind privat. Sie werden fremden Konten gar nicht erst herausgegeben und sind in keinem Export enthalten.
- Unterschriften werden nicht gespeichert und nie wiederverwendet. Sie werden jedes Mal live geleistet, gehören zu genau einem Dokument, und der Fingerabdruck dient allein dem Nachweis, dass danach nichts verändert wurde.
- Auswertungen (Kalibrierung, Standardisierungsbericht) verfolgen den Zweck der Standardisierung nach ORA.ATO.110. Sie kennzeichnen erst ab zehn Noten aus mindestens drei Durchgängen, arbeiten mit festen, erklärbaren Schwellen und ersetzen kein Personalgespräch. Eine automatisierte Entscheidung mit rechtlicher Wirkung im Sinne des Art. 22 DSGVO findet nicht statt.
- Deine Rechte: Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit. Wende dich dafür an den Admin (Abschnitt 10); ein Beschwerderecht bei der zuständigen Aufsichtsbehörde besteht unabhängig davon.
- Grenze der Löschung: Unterschriebene Ausbildungsnachweise unterliegen der Aufbewahrungspflicht und können nicht auf Wunsch entfernt werden. Konten werden deshalb deaktiviert statt gelöscht — sonst verlöre ein unterschriebenes Formular seine Zuordnung. Chat-Inhalte, Notizen und Stammdaten bleiben davon unberührt.

# 7. Kein Backup — automatische Löschung
Für die Inhalte dieser App wird derzeit keine Datensicherung (Backup) erstellt. Chat-Nachrichten und ihre Anhänge werden nach Ablauf der für die jeweilige Gruppe eingestellten Aufbewahrungsdauer automatisch und unwiederbringlich gelöscht; Anhänge werden dabei stets gemeinsam mit der Nachricht entfernt. Grading-Formulare verschwinden nach einer Woche aus der persönlichen Ansicht; die Aufbewahrung in der Ablage ersetzt keine offizielle Ausbildungsdokumentation.

Darüber hinaus kann es — etwa bei technischen Störungen, beim Löschen der Browserdaten oder beim Verlust des Geräts — jederzeit zu einem vollständigen Verlust von Inhalten kommen. Verlasse dich daher niemals darauf, dass eine Information in der App dauerhaft verfügbar bleibt: Alles Wichtige gehört zusätzlich in die offiziellen Kanäle und Dokumentationssysteme.

# 8. Löschung von Teilnehmerkonten
Jedes Teilnehmerkonto kann jederzeit durch den Admin deaktiviert oder vollständig gelöscht werden. Ein Anspruch auf Nutzung der App besteht nicht.

Ebenso kann jede Teilnehmerin und jeder Teilnehmer die Löschung des eigenen Kontos jederzeit und ohne Angabe von Gründen verlangen. Eine formlose Mitteilung an den Admin genügt (siehe Abschnitt 10); die Löschung wird zeitnah umgesetzt.

Mit der Löschung erlischt der Zugang zur App. Bereits erstellte Chat-Inhalte unterliegen weiterhin der automatischen Löschung nach Abschnitt 7; für unterschriebene Ausbildungsnachweise gilt die Grenze aus Abschnitt 6.

# 9. Nutzungsregeln
- Über die App werden keine sicherheitskritischen oder für Training und Simulatorbetrieb verbindlichen Anweisungen erteilt oder entgegengenommen.
- Safety-relevante Ereignisse und Beobachtungen sind ausschließlich über die offiziellen Meldewege (Safety Reporting) zu melden — nicht über den Chat, das Feedback-Modul oder die Instructor Info.
- Grading-Formulare sind wahrheitsgemäß und vollständig auszufüllen; Unterschriften dürfen nur von der jeweils unterschreibenden Person selbst geleistet werden.
- Es gilt ein respektvoller, professioneller Umgangston. Der Admin kann Inhalte entfernen und Personen für das Senden im Chat sperren, wenn dem widersprochen wird.
- Feedback über das Feedback-Modul ist bewusst nicht anonym: Name und E-Mail-Adresse der absendenden Person sind für die Empfänger sichtbar.
- Notizen sind für eigene Merkposten gedacht. Personenbezogene Bewertungen gehören in das Formular, nicht in eine Notiz.

# 10. Kontakt — auch für Löschwünsche und Datenschutzfragen
Fragen, Anregungen, Auskunfts- und Löschwünsche richte bitte an den Admin — direkt in der App über das Modul „Who to call" oder per E-Mail. Ein Löschwunsch wird ohne Nachfragen und ohne Angabe von Gründen umgesetzt, soweit ihm keine Aufbewahrungspflicht entgegensteht (Abschnitt 6).`

export const IMPRINT_EN = `These notes govern the use of Instructor Connect, the internal communication app for instructors of a simulator-only training operation. Please read them carefully — they describe the character of the app, your rights, and the limits of what the app is intended for.

# 1. Operator and responsibility
Instructor Connect is operated exclusively for internal use. The admin is responsible for operation, user administration and content moderation.

The full address and further contact details will be added here before productive operation, as will a data protection contact point.

# 2. Purpose and modules of the app
Instructor Connect is an internal, centrally managed tool for instructors. It currently comprises the following modules:

- Grading Tool: digital assessment forms per OM Appendix 5 (grading sheets, additional training, record of attendance, deferred item). Forms are always in English. Signatures are given live on the device only and are never stored or reused; once signed by both parties a form is locked read-only. A fingerprint over the content makes any later change visible, and the document state (ATO, approval number, form revision, form title) is frozen at the moment of signing. Completed forms are emailed automatically to the configured recipients — the Deferred Item (Form 310) always additionally to the Training Admin. Forms remain visible in your own view for one week; in the records archive they are kept without limit. Printouts and exports always carry date, time and name of the exporting person; every printed sheet names the ATO, the form and the person trained.
- Reporting: trainee history, monthly report and standardisation report. They compare each instructor's grading behaviour against the fleet average and serve standardisation under ORA.ATO.110 — not individual performance monitoring (see section 6).
- Lesson Plan: library of lesson plans per aircraft type and training category. You only see the types assigned to you in the admin panel.
- Chat: group chats with polls and automatic deletion after the configured retention period. Access is restricted to members of the respective group. The admin can block individuals from sending in chat; reading remains possible.
- Instructor Info: information library with categories, validity period (no end date: UFN — until further notice) and target groups. Entries with target groups are visible to their members only. Marked entries require a read confirmation; admins can see who has confirmed and export a control list.
- Feedback: feedback to a selectable recipient, optionally marked "urgent" and with a photo or PDF attachment. Feedback is not anonymous and remains stored for admins until deleted there. Selecting the category "Safety" immediately shows a notice that a safety report has to be filed — the feedback module is not a reporting channel.
- Notes: your personal memory aid. Notes belong to their author alone: nobody else can see them, not even an admin or superadmin, and they are part of no export and no record. They are a reminder, not documentation.
- Who to call: internal contact directory.
- Admin panel: user administration (individually or via table import), permission matrix, grading configuration, groups, feedback, settings, this text and the changelog.

The app is a supplementary offer. It is expressly not an official instruction, reporting or documentation system of the organisation.

# 3. Voluntary use
Using Instructor Connect is entirely voluntary in every respect. There is no employment-related or other obligation to install the app, to use it, or to read or answer messages in it.

- Not using the app entails no disadvantage whatsoever. All work-related information will continue to be distributed through the official channels.
- There is no expectation of being reachable through the app outside working hours. Notifications can be muted per group at any time.
- Participation can be ended at any time, without giving reasons and without disadvantage (see section 8).
- Posting your own content — messages, files, polls, feedback, notes — is always voluntary as well. Read confirmations in Instructor Info document nothing more than that an entry in this app has been noted; binding training and acknowledgement records continue to run through the official systems.

# 4. Informational character only — approved manuals prevail
All content in Instructor Connect serves information and informal internal coordination only. It is non-binding and does not replace any official instructions, procedures, approvals or documents.

Only the organisation's approved manuals and procedures (e.g. Training Manual, operating and procedural documentation for simulator operations) in their current approved revision, together with official instructions from the responsible post holders, are binding. This also applies to Grading Tool forms and Instructor Info documents: the approved revision in the official documentation system always prevails.

In case of any conflict between content in this app and an approved manual or an official instruction, the manual or official instruction prevails without exception.

# 5. Confidentiality, encryption and group access
All data and content in Instructor Connect are treated confidentially. Access is restricted to registered members; accounts are created by the admin only and are assigned to at least one group on creation — there is no self-registration. Signing in works with your work email address and a six-digit code valid until midnight; there are no passwords. Chats and group-scoped Instructor Info entries are accessible to members of the respective group only.

Data transmission is transport-encrypted (TLS). There is deliberately no end-to-end encryption: technical administrators could in principle access content, for instance for troubleshooting or moderation. Therefore, please do not share sensitive private content or confidential personal documents via the app.

- Content, screenshots, exports, printouts and login credentials must not be passed on to outsiders. This applies in particular to grading forms and control lists, which contain personal assessment and confirmation data.
- The app keeps its data on your device and may cache content for offline use — unencrypted. Protect your device with a passcode or biometrics and sign out on shared devices.
- Data is used exclusively to operate the app and is not passed on to third parties.

# 6. Data protection — what is stored, why and for how long
This version of the app works without a server: the entire dataset lives in the browser database on your device. There are no analytics, tracking or advertising services, no disclosure to third parties and no connections to external servers.

Processed data: master data (name, work email address, phone number, role, assigned aircraft types), grading forms including grades, comments and signature images, chat messages and polls, Instructor Info entries including read confirmations, feedback submissions, the contact directory and personal notes.

- Why: to conduct training operations and to meet regulatory record-keeping duties (Art. 6(1)(b) and (c) GDPR), otherwise for internal coordination on the basis of legitimate interest (Art. 6(1)(f)). Using the app itself remains voluntary (section 3).
- How long: chat messages until the configured retention period expires; forms one week in your own view and afterwards permanently in the records archive, because training records are subject to retention (ORA.GEN.220); notes until their author deletes them.
- Notes are private. They are never handed to other accounts and appear in no export.
- Signatures are not stored and never reused. They are given live each time, belong to exactly one document, and the fingerprint serves only to show that nothing was altered afterwards.
- Reporting (calibration, standardisation report) serves standardisation under ORA.ATO.110. It flags only from ten grades across at least three sessions, uses fixed, explainable thresholds and replaces no conversation. There is no automated decision producing legal effects within the meaning of Art. 22 GDPR.
- Your rights: access, rectification, erasure, restriction of processing, objection and data portability. Please contact the admin (section 10); the right to lodge a complaint with the competent supervisory authority remains unaffected.
- Limit to erasure: signed training records are subject to retention and cannot be removed on request. Accounts are therefore deactivated rather than deleted — otherwise a signed form would lose the person it belongs to. Chat content, notes and master data are not affected by this.

# 7. No backup — automatic deletion
No backup is currently made of the content of this app. Chat messages and their attachments are deleted automatically and irretrievably once the retention period configured for the respective group has elapsed; attachments are always deleted together with their message. Grading forms disappear from your personal view after one week; their retention in the records archive does not replace official training records.

Beyond that, content may be lost completely at any time — for example due to technical failures, clearing the browser data or losing the device. Never rely on information remaining permanently available in the app: anything important also belongs in the official channels and documentation systems.

# 8. Deletion of participant accounts
Any participant account can be deactivated or completely deleted by the admin at any time. There is no entitlement to use the app.

Likewise, every participant can request the deletion of their own account at any time and without giving reasons. An informal message to the admin is sufficient (see section 10); the deletion will be carried out promptly.

Deletion ends access to the app. Chat content already created remains subject to automatic deletion as per section 7; for signed training records the limit in section 6 applies.

# 9. Rules of use
- No safety-critical instructions, nor instructions binding for training or simulator operations, are issued or received via the app.
- Safety-relevant events and observations must be reported exclusively through the official reporting channels (safety reporting) — not via chat, the feedback module or Instructor Info.
- Grading forms must be completed truthfully and completely; signatures may only be given by the signing person themselves.
- A respectful, professional tone applies. The admin may remove content and block individuals from sending in chat where this is violated.
- Feedback via the feedback module is deliberately not anonymous: the sender's name and email address are visible to the recipients.
- Notes are meant for your own reminders. Assessments of a person belong in the form, not in a note.

# 10. Contact — including deletion requests and data protection
Please address questions, suggestions, access and deletion requests to the admin — directly in the app via the "Who to call" module or by email. A deletion request will be carried out without queries and without reasons having to be given, unless a retention duty stands against it (section 6).`

/**
 * Prüfsummen (djb2) der VORIGEN Vorgabetexte.
 *
 * Bestandsgeräte tragen den Impressumstext in ihren Einstellungen; eine reine
 * Änderung dieser Datei erreicht sie nicht. `migrateState` hebt den
 * gespeicherten Text deshalb auf die Fassung oben — aber NUR, wenn er noch
 * unverändert der vorigen Vorgabe entspricht. Wer den Text im Admin Panel
 * selbst angepasst hat, behält ihn.
 *
 * Warum eine Prüfsumme und nicht der alte Text: Der alte Wortlaut wäre sonst
 * für immer als toter Ballast im Bündel. Warum djb2 und nicht SHA-256: Die
 * Migration läuft synchron beim Start, `crypto.subtle` ist asynchron — und
 * gegen eine böswillige Kollision muss hier nichts schützen.
 */
export const IMPRINT_LEGACY_HASHES: readonly number[] = [431572830, 127527832]

/** djb2 — klein, deterministisch, ohne Abhängigkeit. */
export function imprintHash(text: string): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h
}
