# ⟡ Arise

*Your life. Your level. Your system.* – dein Lebensplaner mit Terminen, Schichten, Quests, Routinen und Finanzen.

Termine, Quests, Routinen und Notizen – mit Level & XP, im dunklen Quest-Design oder in Pastell.
Läuft als **Android-App** und als **Web-Version am PC**. Beide synchronisieren über Firebase.

| | Link |
|---|---|
| 📱 Android-App (APK) | [Arise.apk herunterladen](https://github.com/Olymusmaximus/Lebensplaner/releases/latest/download/Arise.apk) |
| 💻 PC-Version | https://olymusmaximus.github.io/Lebensplaner/ |
| 🛒 Play-Store-Datei | `Arise-PlayStore.aab` unter [Releases](https://github.com/Olymusmaximus/Lebensplaner/releases/latest) |

## So funktioniert's

Bei jeder Änderung im Repository baut GitHub Actions automatisch (Datei `.github/workflows/build.yml`):

1. die Web-App (`npm run build` → `dist/`) und veröffentlicht sie auf GitHub Pages,
2. das Android-Projekt mit Capacitor 8 (Ziel: Android 16 / API 36),
3. eine **APK** zum direkten Installieren und – sobald der Upload-Schlüssel hinterlegt ist – eine signierte **AAB** für den Play Store,
4. eine neue **Release** mit beiden Dateien.

## Einmalige Einrichtung

### 1. Firebase (Sync)
- Projekt auf https://console.firebase.google.com anlegen, Web-App registrieren.
- Den `firebaseConfig`-Block in `src/config.js` eintragen.
- **Authentication → E-Mail/Passwort** aktivieren.
- **Firestore** anlegen (Standort `europe-west3`, Produktionsmodus) und die Regeln aus `firestore.rules` einfügen.

Ohne Firebase-Daten läuft die App im Modus „nur auf diesem Gerät“.

### 2. GitHub Pages (PC-Version)
**Settings → Pages → Source: „GitHub Actions“** auswählen.

### 3. Upload-Schlüssel (signierte App)
Unter **Settings → Secrets and variables → Actions** zwei Secrets anlegen:
- `ANDROID_KEYSTORE_BASE64` – der Schlüssel (`upload.jks`) als Base64
- `ANDROID_KEYSTORE_PASSWORD` – das Passwort

Ohne Schlüssel wird eine Test-Version (Debug-APK) gebaut.
⚠️ Wenn du von der Test- auf die signierte Version wechselst, die Test-App vorher deinstallieren (deine Daten liegen im Konto und bleiben erhalten).

## App aufs Handy
1. Auf dem Handy den APK-Link oben öffnen und die Datei herunterladen.
2. Antippen → bei Nachfrage „Installation aus dieser Quelle zulassen“ erlauben → Installieren.
3. Mit demselben Konto anmelden wie am PC.

## Später in den Play Store
- Google-Play-Entwicklerkonto (einmalig 25 US$).
- Neue App anlegen, `Arise-PlayStore.aab` in einen **geschlossenen Test** hochladen.
- Neue private Konten: 12 Tester müssen 14 Tage lang dabei sein, dann Produktionszugang beantragen.
- Benötigt werden außerdem: Datenschutzerklärung (`public/datenschutz.html` → PC-Version `/datenschutz.html`), Seite zum Konto löschen (`/konto-loeschen.html`), Store-Grafiken (`store/`). In beiden HTML-Seiten vorher Name und E-Mail eintragen.
- Die App-ID ist `de.lebensplaner.app` (in `capacitor.config.json`). Sie lässt sich nach dem ersten Upload in den Play Store nicht mehr ändern.

## Projektaufbau
```
src/            App-Code (app.js), Styles, index.html, config.js
public/         Icons, Manifest, Datenschutz, Konto löschen
android-res/    Android-Icons und Startbild
scripts/        build.mjs (Web-Build), prepare-android.mjs (Version, Signatur, Icons)
store/          Grafiken für den Play Store
firestore.rules Sicherheitsregeln für Firestore
```

Lokal bauen (Node 22, JDK 21, Android SDK):
```
npm install
npm run build
npm run android:prepare
cd android && ./gradlew assembleDebug
```
