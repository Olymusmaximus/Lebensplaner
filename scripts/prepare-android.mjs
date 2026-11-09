// Passt das von Capacitor erzeugte Android-Projekt an:
//  - eigene Icons & Startbild
//  - Versionsnummer (steigt mit jedem Build automatisch)
//  - Signatur mit deinem Upload-Schlüssel (nur wenn vorhanden)
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const RES = 'android/app/src/main/res';
if (!existsSync(RES)) throw new Error('Android-Projekt fehlt – zuerst "npx cap add android" ausführen.');

// 1) Icons & Startbild
cpSync('android-res', RES, { recursive: true });
console.log('✔ Icons und Startbild kopiert');

// 1b) Benachrichtigungs-Berechtigung (Android 13+)
const MAN = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(MAN)) {
  let m = readFileSync(MAN, 'utf8');
  if (!m.includes('android.permission.POST_NOTIFICATIONS')) {
    m = m.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>\n');
    writeFileSync(MAN, m);
  }
  console.log('✔ Benachrichtigungen erlaubt');
}

// 2) Version + Signatur
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const groovy = 'android/app/build.gradle', kts = 'android/app/build.gradle.kts';

if (existsSync(groovy)) {
  let g = readFileSync(groovy, 'utf8');
  if (!/versionCode\s+\d+/.test(g)) throw new Error('versionCode nicht gefunden');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${run}`)
       .replace(/versionName\s+"[^"]*"/, `versionName "1.0.${run}"`);
  if (!g.includes('signingConfigs')) {
    g = g.replace(/android\s*\{/, m => `${m}
    signingConfigs {
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias(System.getenv("ANDROID_KEY_ALIAS") ?: "upload")
                keyPassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }`);
    const before = g;
    g = g.replace(/buildTypes\s*\{\s*release\s*\{/, m => `${m}
            if (System.getenv("ANDROID_KEYSTORE_PATH")) { signingConfig signingConfigs.release }`);
    if (g === before) throw new Error('buildTypes.release nicht gefunden');
  }
  writeFileSync(groovy, g);
} else if (existsSync(kts)) {
  let g = readFileSync(kts, 'utf8');
  g = g.replace(/versionCode\s*=\s*\d+/, `versionCode = ${run}`)
       .replace(/versionName\s*=\s*"[^"]*"/, `versionName = "1.0.${run}"`);
  if (!g.includes('signingConfigs')) {
    g = g.replace(/android\s*\{/, m => `${m}
    signingConfigs {
        create("release") {
            System.getenv("ANDROID_KEYSTORE_PATH")?.let {
                storeFile = file(it)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "upload"
                keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }`);
    const before = g;
    g = g.replace(/(getByName\("release"\)|release)\s*\{/, m => `${m}
            if (System.getenv("ANDROID_KEYSTORE_PATH") != null) { signingConfig = signingConfigs.getByName("release") }`);
    if (g === before) throw new Error('buildTypes.release nicht gefunden');
  }
  writeFileSync(kts, g);
} else {
  throw new Error('android/app/build.gradle nicht gefunden');
}
console.log(`✔ Version 1.0.${run} (Code ${run}) eingetragen, Signatur vorbereitet`);
