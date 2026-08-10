/*
 * Voreingestellter Impressumstext (DE/EN). Der Superadmin kann beide Texte
 * im Admin Panel jederzeit anpassen — diese Fassung ist nur der Startwert.
 *
 * Format: "# " beginnt einen neuen Abschnitt mit Überschrift,
 * "- " eine Aufzählungszeile, Leerzeilen trennen Absätze.
 */

export const IMPRINT_DE = `Diese Hinweise gelten für die Nutzung von Instructor Connect, der internen Kommunikations-App für Instruktoren eines reinen Simulatorbetriebs. Bitte lies sie aufmerksam — sie beschreiben den Charakter der App, deine Rechte und die Grenzen dessen, wofür die App gedacht ist.

# 1. Betreiber und Verantwortlicher
Instructor Connect wird ausschließlich für den internen Gebrauch betrieben. Verantwortlich für Betrieb, Benutzerverwaltung und Inhalte-Moderation ist der Admin.

Vollständige Anschrift und weitere Kontaktdaten werden vor dem Produktivbetrieb an dieser Stelle ergänzt.

# 2. Zweck und Module der App
Instructor Connect ist ein internes, zentral verwaltetes Werkzeug für Instruktoren. Es umfasst derzeit folgende Module:

- Grading Tool: digitale Bewertungsformulare nach OM Appendix 5 (Grading Sheets, Additional Training, Record of Attendance, Deferred Item). Formulare sind immer englisch. Unterschriften werden ausschließlich live am Gerät geleistet und niemals gespeichert oder wiederverwendet; nach beidseitiger Unterschrift ist ein Formular schreibgeschützt. Abgeschlossene Formulare werden automatisch per E-Mail an die konfigurierten Empfänger versendet — die Deferred Item (Form 310) immer zusätzlich an den Training Admin. In der eigenen Ansicht bleiben Formulare eine Woche sichtbar; im Admin-Panel bleiben sie unbegrenzt erhalten. Ausdrucke und Exporte tragen immer Datum, Uhrzeit und Namen der exportierenden Person.
- Lesson Plan: Bibliothek der Lesson Plans je Muster. Sichtbar sind nur die Muster, die dir im Admin-Panel zugewiesen wurden.
- Chat: Gruppenchats mit Umfragen und automatischer Löschung nach der eingestellten Aufbewahrungsdauer. Der Zugang ist auf Mitglieder der jeweiligen Gruppe beschränkt. Der Admin kann einzelne Personen für das Senden im Chat sperren; Mitlesen bleibt möglich.
- Instructor Info: Informationsbibliothek mit Kategorien, Gültigkeitszeitraum (ohne Enddatum: UFN — until further notice) und Zielgruppen. Einträge mit Zielgruppen sehen nur deren Mitglieder. Für gekennzeichnete Einträge ist eine Lese-Bestätigung zu leisten; Admins sehen, wer bestätigt hat, und können eine Kontrollliste exportieren.
- Feedback: Feedback an einen wählbaren Empfänger, optional als „Urgent" markiert und mit Foto- oder PDF-Anhang. Feedback ist nicht anonym und bleibt für Admins gespeichert, bis es dort gelöscht wird.
- Who to call: internes Kontaktverzeichnis.

Die App ist ein Zusatzangebot. Sie ist ausdrücklich kein offizielles Anweisungs-, Melde- oder Dokumentationssystem der Organisation.

# 3. Freiwilligkeit der Nutzung
Die Nutzung von Instructor Connect ist vollständig und in jeder Hinsicht freiwillig. Es besteht keine dienstliche, arbeitsrechtliche oder sonstige Verpflichtung, die App zu installieren, zu nutzen oder Nachrichten darin zu lesen oder zu beantworten.

- Wer die App nicht nutzt, erleidet dadurch keinerlei Nachteile. Alle dienstlich relevanten Informationen werden weiterhin über die offiziellen Kanäle verteilt.
- Es besteht keine Erwartung, über die App außerhalb der Arbeitszeit erreichbar zu sein. Benachrichtigungen können jederzeit pro Gruppe stummgeschaltet werden.
- Die Teilnahme kann jederzeit, ohne Angabe von Gründen und ohne Nachteile beendet werden (siehe Abschnitt 7).
- Auch das Einstellen eigener Inhalte — Nachrichten, Dateien, Umfragen, Feedback — ist stets freiwillig. Lese-Bestätigungen in der Instructor Info dokumentieren ausschließlich die Kenntnisnahme eines Eintrags in dieser App; verbindliche Schulungs- und Kenntnisnahmenachweise laufen weiterhin über die offiziellen Systeme.

# 4. Rein informativer Charakter — genehmigte Handbücher sind maßgeblich
Sämtliche Inhalte in Instructor Connect dienen ausschließlich der Information und der informellen internen Abstimmung. Sie sind unverbindlich und ersetzen keine offiziellen Anweisungen, Verfahren, Freigaben oder Dokumente.

Verbindlich sind ausschließlich die genehmigten Handbücher und Verfahren der Organisation (z. B. Training Manual, Betriebs- und Verfahrensdokumentation für den Simulatorbetrieb) in ihrer jeweils gültigen, freigegebenen Fassung sowie die offiziellen Anweisungen der verantwortlichen Führungskräfte. Das gilt auch für Formulare des Grading Tools und Dokumente der Instructor Info: maßgeblich ist stets die genehmigte Fassung im offiziellen Dokumentationssystem.

Bei Widersprüchen zwischen Inhalten dieser App und einem genehmigten Handbuch oder einer offiziellen Anweisung gilt ausnahmslos das Handbuch bzw. die offizielle Anweisung.

# 5. Vertraulichkeit, Verschlüsselung und Gruppenzugriff
Alle Daten und Inhalte in Instructor Connect werden vertraulich behandelt. Der Zugang ist ausschließlich registrierten Mitgliedern vorbehalten; Konten werden nur vom Admin angelegt und dabei mindestens einer Gruppe zugewiesen — eine Selbstregistrierung existiert nicht. Chats und gruppenbezogene Instructor-Info-Einträge sind nur für Mitglieder der jeweiligen Gruppe zugänglich.

Die Datenübertragung erfolgt transportverschlüsselt (TLS). Eine Ende-zu-Ende-Verschlüsselung besteht bewusst nicht: technische Administratoren könnten Inhalte prinzipiell einsehen, etwa zur Fehlerbehebung oder Moderation. Bitte teile daher keine sensiblen privaten Inhalte oder vertraulichen personenbezogenen Dokumente über die App.

- Inhalte, Screenshots, Exporte, Ausdrucke und Zugangsdaten dürfen nicht an Außenstehende weitergegeben werden. Das gilt insbesondere für Grading-Formulare und Kontrolllisten, die personenbezogene Bewertungs- und Bestätigungsdaten enthalten.
- Die App kann Inhalte für die Offline-Nutzung auf dem Gerät zwischenspeichern. Schütze dein Gerät daher mit Code oder Biometrie und melde dich auf fremden Geräten ab.
- Die Daten werden ausschließlich für den Betrieb der App verwendet und nicht an Dritte weitergegeben.

# 6. Kein Backup — automatische Löschung
Für die Inhalte dieser App wird keine Datensicherung (Backup) erstellt. Chat-Nachrichten und ihre Anhänge werden nach Ablauf der für die jeweilige Gruppe eingestellten Aufbewahrungsdauer automatisch und unwiederbringlich gelöscht; Anhänge werden dabei stets gemeinsam mit der Nachricht entfernt. Grading-Formulare verschwinden nach einer Woche aus der persönlichen Ansicht; die Aufbewahrung im Admin-Panel ersetzt keine offizielle Ausbildungsdokumentation.

Darüber hinaus kann es — etwa bei technischen Störungen — jederzeit zu einem vollständigen Verlust von Inhalten kommen. Verlasse dich daher niemals darauf, dass eine Information in der App dauerhaft verfügbar bleibt: Alles Wichtige gehört zusätzlich in die offiziellen Kanäle und Dokumentationssysteme.

# 7. Löschung von Teilnehmerkonten
Jedes Teilnehmerkonto kann jederzeit durch den Admin deaktiviert oder vollständig gelöscht werden. Ein Anspruch auf Nutzung der App besteht nicht.

Ebenso kann jede Teilnehmerin und jeder Teilnehmer die Löschung des eigenen Kontos jederzeit und ohne Angabe von Gründen verlangen. Eine formlose Mitteilung an den Admin genügt (siehe Abschnitt 9); die Löschung wird zeitnah umgesetzt.

Mit der Löschung erlischt der Zugang zur App. Bereits erstellte Chat-Inhalte unterliegen weiterhin der automatischen Löschung nach Abschnitt 6.

# 8. Nutzungsregeln
- Über die App werden keine sicherheitskritischen oder für Training und Simulatorbetrieb verbindlichen Anweisungen erteilt oder entgegengenommen.
- Safety-relevante Ereignisse und Beobachtungen sind ausschließlich über die offiziellen Meldewege (Safety Reporting) zu melden — nicht über den Chat, das Feedback-Modul oder die Instructor Info.
- Grading-Formulare sind wahrheitsgemäß und vollständig auszufüllen; Unterschriften dürfen nur von der jeweils unterschreibenden Person selbst geleistet werden.
- Es gilt ein respektvoller, professioneller Umgangston. Der Admin kann Inhalte entfernen und Personen für das Senden im Chat sperren, wenn dem widersprochen wird.
- Feedback über das Feedback-Modul ist bewusst nicht anonym: Name und E-Mail-Adresse der absendenden Person sind für die Empfänger sichtbar.

# 9. Kontakt — auch für Löschwünsche
Fragen, Anregungen und Löschwünsche richte bitte an den Admin — direkt in der App über das Modul „Who to call“ oder per E-Mail. Ein Löschwunsch wird ohne Nachfragen und ohne Angabe von Gründen umgesetzt.`

export const IMPRINT_EN = `These notes govern the use of Instructor Connect, the internal communication app for instructors of a simulator-only training operation. Please read them carefully — they describe the character of the app, your rights, and the limits of what the app is intended for.

# 1. Operator and responsibility
Instructor Connect is operated exclusively for internal use. The admin is responsible for operation, user administration and content moderation.

The full address and further contact details will be added here before productive operation.

# 2. Purpose and modules of the app
Instructor Connect is an internal, centrally managed tool for instructors. It currently comprises the following modules:

- Grading Tool: digital assessment forms per OM Appendix 5 (grading sheets, additional training, record of attendance, deferred item). Forms are always in English. Signatures are given live on the device only and are never stored or reused; once signed by both parties a form is locked read-only. Completed forms are emailed automatically to the configured recipients — the Deferred Item (Form 310) always additionally to the Training Admin. Forms remain visible in your own view for one week; in the admin panel they are kept without limit. Printouts and exports always carry date, time and name of the exporting person.
- Lesson Plan: library of lesson plans per aircraft type. You only see the types assigned to you in the admin panel.
- Chat: group chats with polls and automatic deletion after the configured retention period. Access is restricted to members of the respective group. The admin can block individuals from sending in chat; reading remains possible.
- Instructor Info: information library with categories, validity period (no end date: UFN — until further notice) and target groups. Entries with target groups are visible to their members only. Marked entries require a read confirmation; admins can see who has confirmed and export a control list.
- Feedback: feedback to a selectable recipient, optionally marked "urgent" and with a photo or PDF attachment. Feedback is not anonymous and remains stored for admins until deleted there.
- Who to call: internal contact directory.

The app is a supplementary offer. It is expressly not an official instruction, reporting or documentation system of the organisation.

# 3. Voluntary use
Using Instructor Connect is entirely voluntary in every respect. There is no employment-related or other obligation to install the app, to use it, or to read or answer messages in it.

- Not using the app entails no disadvantage whatsoever. All work-related information will continue to be distributed through the official channels.
- There is no expectation of being reachable through the app outside working hours. Notifications can be muted per group at any time.
- Participation can be ended at any time, without giving reasons and without disadvantage (see section 7).
- Posting your own content — messages, files, polls, feedback — is always voluntary as well. Read confirmations in Instructor Info document nothing more than that an entry in this app has been noted; binding training and acknowledgement records continue to run through the official systems.

# 4. Informational character only — approved manuals prevail
All content in Instructor Connect serves information and informal internal coordination only. It is non-binding and does not replace any official instructions, procedures, approvals or documents.

Only the organisation's approved manuals and procedures (e.g. Training Manual, operating and procedural documentation for simulator operations) in their current approved revision, together with official instructions from the responsible post holders, are binding. This also applies to Grading Tool forms and Instructor Info documents: the approved revision in the official documentation system always prevails.

In case of any conflict between content in this app and an approved manual or an official instruction, the manual or official instruction prevails without exception.

# 5. Confidentiality, encryption and group access
All data and content in Instructor Connect are treated confidentially. Access is restricted to registered members; accounts are created by the admin only and are assigned to at least one group on creation — there is no self-registration. Chats and group-scoped Instructor Info entries are accessible to members of the respective group only.

Data transmission is transport-encrypted (TLS). There is deliberately no end-to-end encryption: technical administrators could in principle access content, for instance for troubleshooting or moderation. Therefore, please do not share sensitive private content or confidential personal documents via the app.

- Content, screenshots, exports, printouts and login credentials must not be passed on to outsiders. This applies in particular to grading forms and control lists, which contain personal assessment and confirmation data.
- The app may cache content on your device for offline use. Protect your device with a passcode or biometrics and sign out on shared devices.
- Data is used exclusively to operate the app and is not passed on to third parties.

# 6. No backup — automatic deletion
No backup is made of the content of this app. Chat messages and their attachments are deleted automatically and irretrievably once the retention period configured for the respective group has elapsed; attachments are always deleted together with their message. Grading forms disappear from your personal view after one week; their retention in the admin panel does not replace official training records.

Beyond that, content may be lost completely at any time, for example due to technical failures. Never rely on information remaining permanently available in the app: anything important also belongs in the official channels and documentation systems.

# 7. Deletion of participant accounts
Any participant account can be deactivated or completely deleted by the admin at any time. There is no entitlement to use the app.

Likewise, every participant can request the deletion of their own account at any time and without giving reasons. An informal message to the admin is sufficient (see section 9); the deletion will be carried out promptly.

Deletion ends access to the app. Chat content already created remains subject to automatic deletion as per section 6.

# 8. Rules of use
- No safety-critical instructions, nor instructions binding for training or simulator operations, are issued or received via the app.
- Safety-relevant events and observations must be reported exclusively through the official reporting channels (safety reporting) — not via chat, the feedback module or Instructor Info.
- Grading forms must be completed truthfully and completely; signatures may only be given by the signing person themselves.
- A respectful, professional tone applies. The admin may remove content and block individuals from sending in chat where this is violated.
- Feedback via the feedback module is deliberately not anonymous: the sender's name and email address are visible to the recipients.

# 9. Contact — including deletion requests
Please address questions, suggestions and deletion requests to the admin — directly in the app via the "Who to call" module or by email. A deletion request will be carried out without queries and without reasons having to be given.`
