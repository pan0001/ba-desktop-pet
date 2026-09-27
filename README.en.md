# BA Desktop Pet

[简体中文](README.md) | [日本語](README.ja.md) | **English**

Bring Blue Archive students to your desktop: let them walk around, pat their heads, hear their voices, and watch them use furniture while you work.

Supports **Windows x64** and **macOS 13+ (Apple silicon / Intel)**, with Chinese, Japanese, and English interfaces. Models, voices, and furniture download from GitHub on demand; downloaded content works offline.

[Download the latest stable release](https://github.com/pan0001/ba-desktop-pet/releases/latest) · [1.13.1 release notes](docs/releases/v1.13.1.md) · [Report an issue](https://github.com/pan0001/ba-desktop-pet/issues)

## Download and install

No Node.js installation or source checkout is needed. Choose a file for your system:

| System | File | How to use |
| --- | --- | --- |
| Windows x64 | `BA-Desktop-Pet-1.13.1-Setup-x64.exe` | Recommended. Supports in-app differential updates. |
| Windows x64 | `BA-Desktop-Pet-1.13.1-Portable-x64.exe` | No installation required. Replace manually to upgrade. |
| Apple silicon Mac | `BA-Desktop-Pet-1.13.1-macOS-arm64.dmg` | Open and drag the app into Applications. |
| Intel Mac | `BA-Desktop-Pet-1.13.1-macOS-x64.dmg` | Open and drag the app into Applications. |

Matching ZIP files are available for Mac. Release files include `SHA256SUMS.txt`. The app does not yet use a production code-signing certificate. Mac builds are ad-hoc signed and not notarized, so the system may block opening them.

## First launch

1. Choose the interface language. Japanese voices are the default.
2. Open Settings → **Companion**, search for a student, and click her card. Missing resources download first.
3. **Blue: shown on the desktop. Grey: put away.** Click again to toggle. Select up to six students, or put everyone away. Your selection is restored on restart.
4. Choose furniture under **Voice & furniture** and drag it into place. Compatible students interact near an empty seat; double-click a seated student to let her leave.

The initial installation includes the app, catalogues, portraits, and furniture thumbnails. You do not need every student. Downloads can be cancelled or retried; **Downloaded only** filters content available offline.

## Companionship and interactions

- Click for a response, or move the pointer back and forth over the head to pat it, with original voices, subtitles, and emotional effects.
- Drag to pick up a student. Her body swings around the grab point, hair follows with a delay, and a quick flick before release adds momentum.
- Walk above the taskbar / Dock or on supported window edges. After a high fall, students may get up or ask Sensei for help.
- Place up to six independent furniture items. Two- and three-student interactions require matching students; arbitrary combinations are not supported.
- Bond, mood, energy, hunger, snacks, gifts, achievements, and proactive invitations. Variants of the same student share care progress.
- Japanese audio with matching Chinese subtitles by default; some Chinese voice banks are available. **Changing the interface language does not translate subtitles.** Includes speech mouth movement, café animations, and optional effects.

The catalogue contains 276 character / costume entries, 280 models, and 1,015 furniture items. Some students still lack models or everyday voices; see the [adaptation list (Chinese)](docs/student-adaptation.md).

Right-click a student for the menu. On Windows, double-click the notification-area icon for settings; on Mac, click the menu-bar icon. Use `Ctrl + Alt + B` / `⌘ + ⌥ + B` to show or hide. Closing settings does not quit the app; use **Quit pet**.

## Incremental updates

| Content | Where | Download behavior |
| --- | --- | --- |
| App, features, interface | Settings → **Updates** → **Check for updates** | Windows Setup prefers differential downloads; portable and Mac builds require manual replacement. |
| Models, voices, furniture | **Check resource updates**, then select an item with an update | Only changed packs download; unchanged installed packs are reused. |

**Windows Setup:** downloading an update reuses the previous installer cache and fetches changed file blocks. If the cache or old blockmap is missing, or differential downloading fails, it falls back to the full installer. After verification, choose **Restart and install**; settings, resources, and bond progress are retained. Checking does not download automatically, and ordinary exit does not install updates. Versions 1.11 and earlier need one manual installation of the current Setup build first.

**Resources:** incremental at the pack level, not binary patches inside GLB files. Furniture is grouped by category, with shared downloads. Packs are verified with SHA-256 before use. The card controls and buttons in 1.13.1 require an app update; checking resource updates alone does not upgrade the interface.

**Mac / portable:** update checking is available, but download the matching package and replace the app manually. Automatic differential installation is not currently supported on Mac.

## Data and troubleshooting

Windows data directory: `%APPDATA%/ba-desktop-pet/`. Mac: `~/Library/Application Support/ba-desktop-pet/`.

`settings.json` stores preferences, `care.json` stores care progress, and `resources/` stores downloaded content. Upgrading or reinstalling does not intentionally remove these files. Put away students or furniture before removing resources they use; removing a model does not remove bond progress. Quit the old instance before replacing the app.

If a student is missing, check her blue card, pause / hide settings, and try **Find pet**. Include your OS, app version, reproduction steps, and screenshots in reports; do not upload saves containing personal information.

## Development

Requires Node.js 22.12+. Local Mac builds also require Xcode Command Line Tools.

```sh
npm ci
npm run build:native
npm start
npm test
```

Windows: `npm run release:win`. Mac: `npm run release:mac`. Output: `dist/releases/v1.13.1/`. Builds use on-demand resources by default and do not publish automatically. See the [detailed guide (Chinese)](docs/guide.zh-CN.md) for further usage and development notes.

Stable publishing retains previous Setup / blockmap files and uploads new installers, `latest.yml`, and blockmap with verified checksums. Users do not need to download metadata manually. All three platform targets must pass builds and packaged-app checks before publishing.

## Assets and credits

This is an unofficial fan project, unaffiliated with the game publisher. Student models use resources processed by Kivotos Library. See [third-party notices](THIRD_PARTY_NOTICES.md) for other assets and components. Characters, audio, and artwork belong to their respective rights holders.
