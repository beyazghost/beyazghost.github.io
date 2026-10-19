# Resume Guide — Android Pixel 7 Play Store Emulator

**Date:** 2026-10-19 (host: Omarchy/Arch Linux, 2020 MBP i5, 16 GB RAM)
**Status:** Play Store system image download in progress; emulator GUI previously shut down cleanly.

## Where we left off

- Base SDK installed at `~/android-sdk` (~5.6 GB): emulator 37.2.12, platform-tools 37.0.1, build-tools 34.0.0.
- Base AVD `pixel7` created (API 36, `google_apis` image — NO Play Store). Verified booting earlier.
- **Download in progress:** `system-images;android-36;google_apis_playstore;x86_64` (Play Store-enabled image).
  - Background process: `bgp_15278fd270017w8QrTduUzoxwz` (PID 164881)
  - Last seen: ~736 MB downloaded into `/home/chosen/android-sdk/.temp/`
- Emulator GUI was stopped gracefully (`background_process stop`). No emulator running now.

## Resume steps (tomorrow)

### 1. Check the download

```bash
# Check if the background download is still running
background_process status bgp_15278fd270017w8QrTduUzoxwz

# Check downloaded size
du -sh /home/chosen/android-sdk/.temp/
```

- If still running: let it finish or re-check in a few minutes.
- If stopped/exited: re-run:
  ```bash
  export ANDROID_HOME=/home/chosen/android-sdk ANDROID_SDK_ROOT=/home/chosen/android-sdk
  /home/chosen/android-sdk/cmdline-tools/latest/bin/sdkmanager "system-images;android-36;google_apis_playstore;x86_64"
  ```

### 2. Create the Play Store AVD

Once the image is installed:

```bash
export ANDROID_HOME=/home/chosen/android-sdk
export ANDROID_SDK_ROOT=/home/chosen/android-sdk
export ANDROID_AVD_HOME=/home/chosen/.config/.android/avd
AM="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

echo "no" | "$AM" create avd -n pixel7-playstore \
  -k "system-images;android-36;google_apis_playstore;x86_64" \
  -d "pixel_7" --force
```

### 3. Verify

```bash
export ANDROID_HOME=/home/chosen/android-sdk
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
emulator -list-avds
# expect: pixel7  pixel7-playstore
```

### 4. Launch Play Store emulator

```bash
export ANDROID_HOME=/home/chosen/android-sdk
export ANDROID_SDK_ROOT=/home/chosen/android-sdk
export ANDROID_AVD_HOME=/home/chosen/.config/.android/avd
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

/home/chosen/android-sdk/emulator/emulator -avd pixel7-playstore -gpu host
```

### 5. Confirm Play Store present

- Once booted, open the app drawer on the emulated Pixel 7 and look for the **Store** / **Play Store** app.

## Key file locations

- SDK: `~/android-sdk/`
- Downloads in progress: `~/android-sdk/.temp/`
- AVDs: `~/.config/.android/avd/` (`pixel7.avd` exists; `pixel7-playstore.avd` to be created)
- Launcher helper: `~/run-pixel7.sh` (edit to use `pixel7-playstore` if desired)
- Shell env: `~/.bashrc` / `~/.bash_profile` (ANDROID_HOME, PATH already set)

## Build status

**In progress.** Base emulator works; Play Store image downloading. Resume at step 1 above.
