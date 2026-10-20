# Android Emulator Build — Pixel 7 Play Store (API 36)

Reproducible steps used to set up a Pixel 7 Android emulator on this Linux machine
(Omarchy/Arch, KVM-accelerated) for testing.

> The SDK is installed in `~/android-sdk` (outside the git repo) so the multi-gigabyte
> downloads are never committed. Only this markdown file lives in the repo.

## Host environment (verified)

- OS: Omarchy / Arch Linux (`/etc/os-release` ID=omarchy)
- Shell: `/usr/bin/bash`
- RAM: 16 GB total
- Disk: ~22 GB free on root (keep an eye on this — SDK + images are ~5–6 GB)
- KVM: available (`/dev/kvm` present, vmx/svm CPU flag present)
- Java: `/usr/bin/java` and `/usr/bin/javac` present
- Download tools: `curl`, `wget`, `unzip` present

## 🏆 Golden AVD: `pixel7-playstore`

**This is the AVD to launch every time.** It comes pre-installed with:

| App | Package | Status |
|-----|---------|--------|
| **Signal** | `org.thoughtcrime.securesms` | ✅ Installed & functional |
| **Hushed** | `com.hushed.release` | ✅ Installed & functional |
| **Google Play Store** | `com.android.vending` | ✅ Built-in (Play Store image) |
| **Keyboard pass-through** | `hw.keyboard = yes` | ✅ Enabled |

### Launch the golden AVD

```bash
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# GUI mode (recommended)
$ANDROID_HOME/emulator/emulator -avd pixel7-playstore -gpu host -no-snapshot-save

# Headless (no window)
$ANDROID_HOME/emulator/emulator -avd pixel7-playstore -no-window -gpu host -no-snapshot-save
```

## Helper script

Create `~/run-pixel7.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
exec "$ANDROID_HOME/emulator/emulator" -avd pixel7-playstore -gpu host -no-snapshot-save "$@"
```

```bash
chmod +x ~/run-pixel7.sh
~/run-pixel7.sh
```

Close the emulator window to stop it gracefully (state is preserved in the AVD).

---

## 1. Install Android SDK command-line tools

```bash
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
curl -fsSL --max-time 540 -o tools.zip \
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -o -q tools.zip
mv cmdline-tools latest
```

## 2. Accept SDK licenses

```bash
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
```

## 3. Install packages

```bash
export ANDROID_HOME="$HOME/android-sdk"
SM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

"$SM" "platform-tools" "build-tools;34.0.0" "emulator"
"$SM" "system-images;android-36;google_apis_playstore;x86_64"
```

The system image is a large download (~2 GB). Run it in the background if your shell
times out:

```bash
$SM "system-images;android-36;google_apis_playstore;x86_64" &
```

Verify:

```bash
"$SM" --list_installed | grep -i system-image
```

## 4. Create the Pixel 7 Play Store AVD

```bash
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
AM="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

echo "no" | "$AM" create avd -n pixel7-playstore \
  -k "system-images;android-36;google_apis_playstore;x86_64" \
  -d "pixel_7" --force
```

## 5. Tune for this host (2020 MBP i5, 16 GB RAM)

Edit `~/.config/.android/avd/pixel7-playstore.avd/config.ini`:

```ini
hw.ramSize=4096M
hw.cpu.ncore=4
hw.keyboard=yes
hw.gpu.mode=auto
```

## 6. Shell environment (persistent)

Add to `~/.bashrc` and/or `~/.bash_profile`:

```bash
# Android SDK
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/build-tools/34.0.0:$PATH"
```

Then `source ~/.bashrc` (or open a new shell) and verify:

```bash
adb version
emulator -version
emulator -list-avds
# expect: pixel7-playstore (and pixel7 if kept)
```

## 7. Install Signal + Hushed (done once on golden AVD)

```bash
# Signal
curl -fsSL --max-time 120 -o signal.apk \
  "https://updates.signal.org/android/Signal-Android-website-prod-universal-release-unsigned.apk"
adb install -r signal.apk

# Hushed
curl -fsSL --max-time 300 -C - -o hushed.apk \
  "https://d.apkpure.net/b/APK/com.hushed.release?version=latest"
adb install -r hushed.apk

# Verify
adb shell pm list packages | grep -iE "signal|hushed"
```

## 8. Verify with adb

In a separate shell:

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices
# expect: emulator-5554 device

adb shell pm list packages | grep -iE "signal|hushed"
# expect: package:org.thoughtcrime.securesms
#         package:com.hushed.release
```

## Notes / gotchas

- There is a pre-existing, broken `PixelEmergencyTest` AVD (missing system image).
  Ignore it; only `pixel7-playstore` is the golden AVD.
- A second AVD `pixel7` (Google APIs, no Play Store) also exists but is not the
  daily driver.
- The emulator ran as QEMU under KVM (`/dev/kvm`) on this host.
- First boot on a 2020 i5 takes ~1–2 minutes to reach the home screen.
- Disk usage after full install: ~5.6 GB under `~/android-sdk`. Monitor root disk
  before installing additional system images.
- Keyboard pass-through is enabled (`hw.keyboard=yes`). Type directly from the host
  keyboard; `Esc`=Back, `F3`=Home, `Enter`/`Space`=select, Arrow keys=DPAD.
- Always shut down gracefully with `adb -s emulator-5554 emu kill` so AVD state
  (installed apps, accounts, Signal session) is preserved.

## Build status

**Complete and verified.** The golden AVD `pixel7-playstore` (API 36, Google Play
Store, x86_64) has Signal and Hushed installed side-by-side, keyboard pass-through
enabled, and boots to GUI. Shut down gracefully; state persists across reboots.
Launch anytime with `~/run-pixel7.sh`.
