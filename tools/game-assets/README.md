# Local game asset import (work in progress)

This pipeline reads already downloaded Unity bundles. It does not alter the game,
emulator configuration, saves, or another application's ADB server. Raw bundles
and intermediate FBX files remain outside the desktop pet's source tree.

## Current workflow

1. Copy character, café prefab, café animation and shared-resource bundles from
   the local game, verifying file sizes. Keep a resumable source manifest.
2. Run `inventory.py BUNDLES INDEX.json` with UnityPy to record containers,
   serialized-file IDs, dependencies, animator names and clip names.
3. Run `node tools/game-assets/sync-kivo.mjs CACHE` to cache public student
   metadata from Kivo, including language-specific names and source IDs.
4. Match exact development/model names to Kivo records. Do not conflate costumes
   or treat scenario props, NPCs and shared bundles as playable students.
5. Compile `AnimationExport.cs` beside AssetStudioModCLI 0.19.0 (.NET Framework),
   using its existing assembly configuration as the launcher's `.exe.config`.
   This small adapter adds AnimationClip to the CLI's parsed asset types; the
   upstream Animator-mode list otherwise drops animation clips even with
   `--fbx-animation all`. The original third-party binaries remain unchanged.
6. Run `export-students.py --help` for paths. It resolves available dependencies,
   exports one complete café prefab per student, and uses Blender 5.1 to convert
   the FBX to GLB. Each export has logs, source provenance and a result record.
7. Validate skinning, café idle/walk/pickup, bounds, expression materials and halo
   attachment in the real desktop renderer before adding it to the app catalogue.
   `node tools/game-assets/validate-halos.cjs EXPORT_DIRECTORY [group,...]` runs
   the renderer's material, mouth, special-halo and animation adapters, samples
   idle/walk/pickup/fall, and checks for detached geometry and invisible halos.
   `--catalog` in place of the directory audits the currently installed models.
   Reports and thumbnails go to `test-results/content-import/halo-audit`.
   These checks establish visibility and attachment, not complete visual fidelity;
   inspect the thumbnails and full-size runtime views before approving a model.
8. Run `extract-face-profiles.py --bundles BUNDLES --inventory INDEX.json
   --output scripts/game-face-profiles.js` to recover disabled facial renderers
   from the original cafe prefab. FBX/glTF otherwise shows alternate faces at
   the same time. This restores default visibility, not Unity animation events.

## Important fidelity checks

- Prefer the full café prefab. A base `_Mesh` export can omit the separately
  attached halo; a successful body render is insufficient.
- Blender's legacy FBX importer can create an armature parent after recording
  bind matrices. The converter repairs only an unambiguous single `None` parent
  entry in memory, retaining the original matrices and weights. It does not edit
  the installed Blender importer.
- An FBX clip can have separate armature and prop actions. Named NLA tracks merge
  them back into one glTF animation, retaining prop motion.
- Conversion success does not certify visual correctness or resolve missing
  dependencies. Do not silently advertise failed models as supported.
- Keep Kivo IDs distinct from the existing desktop pet's student/care IDs, which
  must remain stable across upgrades.
- Do not overwrite an existing complete model with an incomplete local export.
  In particular, local CH0163 references missing material CAB
  `bf074bab36f1820020db15d0f1666b67`: its halo mesh is present but has no material.
  Existing Kivo model 265 retains `Chinatsu_Original_Halo` and remains the usable
  source for this costume. A mesh-name check alone would miss this failure.
- Scratch previews under `assets/game-staging` are ignored by Git and excluded
  from packaging; approved assets must enter the actual catalogue explicitly.
- Shared bundles can reach NTFS's hard-link limit during a large import. Both
  exporters fall back to a file copy for Windows error 1142. `--retry-failed`
  preserves successful conversions and retries failures without repeating them.

## Install and validate students

The selected model source is exclusively Kivo (`modelSource: "kivo"` in
`student-overrides.json`). `cache-kivo-models.mjs` downloads public bodies with
resumable completed-file caching. `install-students.mjs` installs those cached
models into `assets/media/student-imports.json`, without reading game exports. It preserves
legacy character/care IDs, rejects incorrect shared-costume links, and supports
verified global-catalogue links in `student-overrides.json`. Then run:

```text
node tools/build-catalog.cjs
node tools/sync-companion-assets.mjs --students-only
node tools/build-student-initiatives.cjs
node tools/game-assets/validate-halos.cjs --catalog
node tests/face-desktop.cjs
node tools/game-assets/write-student-coverage.cjs
```

The last step requires passing render reports with matching current model hashes.
See `docs/student-adaptation.md` for coverage and remaining source gaps. Student
portraits, names, first-run Chinese/Japanese/English UI selection, daily voices
and invitations are integrated. Voice language defaults independently to Japanese.
Original furniture exports still need interaction matching and app integration.

Sources: [UnityPy](https://github.com/K0lb3/UnityPy),
[AssetStudioMod](https://github.com/aelurum/AssetStudioMod),
[Kivo](https://kivo.wiki/). Models retain their original game ownership; source
attribution is not a claim that the desktop pet authored those assets.
