"""Resumable student prefab conversion using the local, read-only bundle index."""
import argparse
import concurrent.futures
import json
import hashlib
import os
import pathlib
import re
import subprocess
import time
import tempfile
import shutil


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundles", type=pathlib.Path, required=True)
    parser.add_argument("--inventory", type=pathlib.Path, required=True)
    parser.add_argument("--mapping", type=pathlib.Path, required=True)
    parser.add_argument("--exporter", type=pathlib.Path, required=True)
    parser.add_argument("--blender", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--only", default="")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    records = json.loads(args.inventory.read_text(encoding="utf8"))["bundles"]
    by_name = {r["file"]: r for r in records}
    by_cab = {cab.lower(): r for r in records for cab in r["serializedFiles"]}
    groups = json.loads(args.mapping.read_text(encoding="utf8"))["mapped"]
    if args.only:
        groups = {key: value for key, value in groups.items() if key in args.only.split(",")}
    args.output.mkdir(parents=True, exist_ok=True)
    converter = pathlib.Path(__file__).with_name("convert-fbx.py").resolve()
    revision = hashlib.sha256(args.inventory.read_bytes() + converter.read_bytes() + args.exporter.read_bytes()
                              + pathlib.Path(__file__).read_bytes()).hexdigest()

    def export(group):
        job = args.output / group
        job.mkdir(exist_ok=True)
        result_file = job / "result.json"
        if result_file.exists():
            previous = json.loads(result_file.read_text(encoding="utf8"))
            if previous.get("status") == "converted" and (args.retry_failed or previous.get("sourceRevision") == revision) and (job / "model.glb").is_file():
                return previous
        result = {"group": group, "kivoIds": groups[group], "status": "failed", "sourceRevision": revision}
        try:
            prefixes = (f"assets-_mx-characters-{group}-", f"character-{group}-",
                        f"cafe-characteranimation-{group}-")
            selected = {r["file"] for r in records if r["file"].startswith(prefixes)
                        and not any(f"-{kind}-" in r["file"] for kind in ["audio", "timelines"])}
            queue = list(selected)
            missing = set()
            while queue:
                for dependency in by_name[queue.pop()]["dependencies"]:
                    record = by_cab.get(dependency.rsplit("/", 1)[-1].lower())
                    if not record:
                        missing.add(dependency)
                    elif record["file"] not in selected:
                        selected.add(record["file"])
                        queue.append(record["file"])
            models = [m["name"] for file in selected for m in by_name[file]["models"]]
            # The café prefab also contains separately attached halo meshes.
            candidates = [n for n in models if n.lower() == "cafe_" + group]
            if not candidates:
                candidates = [n for n in models if n.lower() == group + "_mesh"]
            if not candidates:
                raise ValueError("No matching café or base-mesh Animator: " + ", ".join(models))
            model = candidates[0]
            stage = job / "bundles"
            stage.mkdir(exist_ok=True)
            for file in selected:
                target = stage / file
                if not target.exists():
                    try:
                        os.link(args.bundles / file, target)
                    except OSError as error:
                        if getattr(error, "winerror", None) != 1142:
                            raise
                        # NTFS limits a file to 1024 hard links; shared shader
                        # bundles are reused by more than a thousand prefabs.
                        shutil.copyfile(args.bundles / file, target)
            result.update({"prefab": model, "bundleCount": len(selected), "unresolvedDependencies": sorted(missing)})
            environment = dict(os.environ, BA_EXPORT_CHARACTER="1")
            fbx_directory = pathlib.Path(tempfile.mkdtemp(prefix="fbx-", dir=job))
            result["fbxDirectory"] = fbx_directory.name
            with (job / "export.log").open("w", encoding="utf8") as log:
                subprocess.run([str(args.exporter), str(stage), "-m", "animator", "--fbx-animation", "all",
                    "--filter-by-name", "^" + re.escape(model) + "$", "--filter-with-regex",
                    "-o", str(fbx_directory), "--log-level", "warning"], env=environment,
                    stdout=log, stderr=subprocess.STDOUT, check=True, timeout=180)
            sources = [p for p in fbx_directory.rglob("*.fbx") if p.stem == model]
            if len(sources) != 1:
                raise ValueError(f"Expected one prefab FBX, got {len(sources)}")
            with (job / "convert.log").open("w", encoding="utf8") as log:
                subprocess.run([str(args.blender), "--background", "--threads", "2", "--python", str(converter),
                    "--", str(sources[0]), str(job / "model.glb")], stdout=log, stderr=subprocess.STDOUT,
                    check=True, timeout=240)
            report = json.loads((job / "model.report.json").read_text(encoding="utf8"))
            if not report["meshes"] or not any(re.search(r"_(Cafe|Coffee)_Idle$", n, re.I) for n in report["animations"]):
                raise ValueError("Missing visible mesh or café idle animation")
            if not report["halos"]:
                raise ValueError("Missing halo mesh; requires separate halo adaptation")
            result.update({"status": "converted", "report": report})
        except Exception as exc:
            result["error"] = str(exc)
        result_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
        return result

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(export, groups):
            results.append(result)
            (args.output / "coverage.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8")
            print(f"{len(results)}/{len(groups)} {result['group']}: {result['status']} {result.get('error', '')}", flush=True)
    if any(r["status"] != "converted" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
