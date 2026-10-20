# Resume Guide — Android Pixel 7 Play Store Emulator

**Date:** 2026-10-20 (host: Omarchy/Arch Linux, 2020 MBP i5, 16 GB RAM)
**Status:** Complete — golden AVD `pixel7-playstore` is ready to launch.

## Where we are

- **SDK:** Installed at `~/android-sdk` (~5.6 GB): emulator 37.2.12, platform-tools, build-tools 34.0.0
- **Golden AVD:** `pixel7-playstore` (API 36, Google Play Store, x86_64, 4 GB RAM, KVM-accelerated)
- **Pre-installed apps:** Signal (`org.thoughtcrime.securesms`), Hushed (`com.hushed.release`), Google Play Store
- **Keyboard pass-through:** Enabled (`hw.keyboard=yes`)
- **Emulator state:** Saved in the AVD — shut down gracefully, ready to relaunch anytime

## Resume steps

### 1. Launch the golden AVD

```bash
export ANDROID_HOME="$HOME/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$HOME/.config/.android/avd"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# GUI mode (recommended)
$ANDROID_HOME/emulator/emulator -avd pixel7-playstore -gpu host -no-snapshot-save
```

Or use the helper script: `~/run-pixel7.sh`

### 2. Verify both apps are present

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices
# expect: emulator-5554 device

adb shell pm list packages | grep -iE "signal|hushed"
# expect: package:org.thoughtcrime.securesms
#         package:com.hushed.release
```

### 3. Shut down gracefully when done

```bash
adb -s emulator-5554 emu kill
```

## Key file locations

- SDK: `~/android-sdk/`
- AVDs: `~/.config/.android/avd/` (`pixel7-playstore.avd` is the golden one)
- Launcher helper: `~/run-pixel7.sh` (launches `pixel7-playstore` with GUI)
- Shell env: `~/.bashrc` / `~/.bash_profile` (ANDROID_HOME, PATH already set)
- Documentation: `ANDROID-EMULATOR.md` (full build instructions)

## Build status

**Complete.** Both Signal and Hushed are installed side-by-side on the `pixel7-playstore`
AVD. The emulator boots to GUI, keyboard pass-through works, and all app state
persists across reboots. Flagged as the golden emulator image — launch anytime
with `~/run-pixel7.sh`.
