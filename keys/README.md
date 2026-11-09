# Test-Schlüssel

`test-debug.keystore` signiert nur die **Test-Versionen** (Debug-APK), solange noch kein Upload-Schlüssel als GitHub-Secret hinterlegt ist.
Er ist fest, damit sich neue Test-Versionen über die alte installieren lassen. Passwort und Alias sind die Android-Standardwerte (`android` / `androiddebugkey`).

Der echte Upload-Schlüssel für den Play Store (`upload.jks`) gehört **nicht** in dieses Repository.
