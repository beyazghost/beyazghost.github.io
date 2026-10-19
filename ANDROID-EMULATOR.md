# Android Emulator Build — Pixel 7 (API 36)

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
"$SM" "system-images;android-36;google_apis;x86_64"
```

The system image is a large download (~2 GB). Run it in the background if your shell
times out:

```bash
$SM "system-images;android-36;google_apis;x86_64" &
```

Verify:

```bash
"$SM" --list_installed | grep -i system-image
# system-images;android-36;google_apis;x86_64 | 7 | Google APIs Intel x86_64 Atom System Image
```

## 4. Create the Pixel 7 AVD

```bash
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
AM="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

echo "no" | "$AM" create avd -n pixel7 \
  -k "system-images;android-36;google_apis;x86_64" \
  -d "pixel_7" --force
```

## 5. Tune for this host (2020 MBP i5, 16 GB RAM)

Edit `~/.config/.android/avd/pixel7.avd/config.ini`:

```ini
hw.ramSize=4096M
hw.cpu.ncore=4
hw.gpu.enabled=no
hw.gpu.mode=auto
```

(`hw.gpu.enabled=no` + `-gpu host` at launch is also fine; keep `hw.gpu.mode=auto`.)

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
# expect: pixel7
```

## 7. Launch the emulator GUI

Create `~/run-pixel7.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
exec "$ANDROID_HOME/emulator/emulator" -avd pixel7 "$@"
```

```bash
chmod +x ~/run-pixel7.sh
~/run-pixel7.sh
```

Launch variants:

- Normal GUI: `~/run-pixel7.sh`
- With GPU passthrough: `~/run-pixel7.sh -gpu host`
- Headless / no window: `~/run-pixel7.sh -no-window -gpu swiftshader_indirect`
- Wipe data on boot (already passed at launch above): `-wipe-data`

Close the emulator window to stop it.

## 8. Verify with adb

In a separate shell:

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices
# expect: emulator-5554 device
```

## Notes / gotchas

- There is a pre-existing, broken `PixelEmergencyTest` AVD (missing system image).
  Ignore it; only `pixel7` is usable.
- The emulator ran as QEMU under KVM (`/dev/kvm`) on this host.
- First boot on a 2020 i5 takes ~1–2 minutes to reach the home screen.
- Disk usage after full install: ~5.6 GB under `~/android-sdk`. Monitor root disk
  before installing additional system images.

## Build status

**Successful.** Toolchain verified: `adb` 1.0.41, emulator 37.2.12, AVD `pixel7`
(API 36, Google APIs, x86_64) boots to GUI.
