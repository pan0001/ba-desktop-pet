"""Export complete furniture prefabs, retaining their own animation clips."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile
import UnityPy


def main():
    parser = argparse.ArgumentParser()
    for name in ["bundles", "inventory", "exporter", "blender", "output"]:
        parser.add_argument("--" + name, type=pathlib.Path, required=True)
    parser.add_argument("--only", default="")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    rows = json.loads(args.inventory.read_text(encoding="utf8"))["bundles"]
    by_cab = {cab.lower(): row for row in rows for cab in row["serializedFiles"]}
    seeds = [(pathlib.PurePosixPath(container).stem, row, container) for row in rows
             if row["file"].startswith("cafe-_mxload-prefabs-") for container in row["containers"]
             if container.lower().endswith(".prefab")]
    if args.only:
        seeds = [seed for seed in seeds if seed[0] in args.only.split(",")]
    converter = pathlib.Path(__file__).with_name("convert-fbx.py").resolve()
    revision = hashlib.sha256(args.inventory.read_bytes() + args.exporter.read_bytes() + converter.read_bytes()).hexdigest()
    args.output.mkdir(parents=True, exist_ok=True)

    def export(seed):
        name, row, container = seed
        if not name.replace("_", "").replace("-", "").isalnum():
            return {"id": name, "status": "failed", "error": "Unsupported prefab identifier"}
        job = args.output / name
        job.mkdir(exist_ok=True)
        result_path = job / "result.json"
        if result_path.exists():
            prior = json.loads(result_path.read_text(encoding="utf8"))
            if (args.retry_failed or prior.get("sourceRevision") == revision) and prior.get("status") == "converted" and (job / "model.glb").exists():
                return prior
        result = {"id": name, "source": row["file"], "sourceRevision": revision, "status": "failed"}
        try:
            env = UnityPy.load(str(args.bundles / row["file"]))
            root_id = str(env.container[container].path_id)
            selected = {row["file"]: row}
            for record in rows:
                if any(clip.lower().startswith(name.lower() + "_") for clip in record["animations"]):
                    selected[record["file"]] = record
            queue = list(selected.values())
            missing = set()
            while queue:
                for dependency in queue.pop()["dependencies"]:
                    record = by_cab.get(dependency.rsplit("/", 1)[-1].lower())
                    if not record:
                        missing.add(dependency)
                    elif record["file"] not in selected:
                        selected[record["file"]] = record
                        queue.append(record)
            stage = job / "bundles"
            stage.mkdir(exist_ok=True)
            for file in selected:
                if not (stage / file).exists():
                    try:
                        os.link(args.bundles / file, stage / file)
                    except OSError as error:
                        if getattr(error, "winerror", None) != 1142:
                            raise
                        import shutil
                        shutil.copyfile(args.bundles / file, stage / file)
            result["unresolvedDependencies"] = sorted(missing)
            result["sourceAnimations"] = sorted({clip for row in selected.values() for clip in row["animations"]
                                                 if clip.lower().startswith(name.lower() + "_")})
            destination = pathlib.Path(tempfile.mkdtemp(prefix="fbx-", dir=job))
            result["fbxDirectory"] = destination.name
            environment = dict(os.environ, BA_EXPORT_PREFAB=name, BA_EXPORT_PREFAB_ID=root_id)
            environment.pop("BA_EXPORT_CHARACTER", None)
            with (job / "export.log").open("w", encoding="utf8") as log:
                subprocess.run([str(args.exporter), str(stage), "-m", "splitObjects", "--fbx-animation", "all",
                    "-o", str(destination), "--log-level", "warning"], env=environment,
                    stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
            sources = list(destination.rglob("*.fbx"))
            if len(sources) != 1:
                raise ValueError(f"Expected one prefab FBX, got {len(sources)}")
            with (job / "convert.log").open("w", encoding="utf8") as log:
                subprocess.run([str(args.blender), "--background", "--threads", "2", "--python", str(converter), "--",
                    str(sources[0]), str(job / "model.glb"), "furniture"], stdout=log,
                    stderr=subprocess.STDOUT, check=True, timeout=180)
            report = json.loads((job / "model.report.json").read_text(encoding="utf8"))
            if not report["meshes"]:
                raise ValueError("Prefab has no mesh geometry")
            missing_clips = set(result["sourceAnimations"]) - set(report["animations"])
            result.update({"status": "converted", "report": report, "missingAnimations": sorted(missing_clips)})
        except Exception as exc:
            result["error"] = str(exc)
        result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
        return result

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(export, seeds):
            results.append(result)
            (args.output / "coverage.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8")
            print(f"{len(results)}/{len(seeds)} {result['id']}: {result['status']} {result.get('error', '')}", flush=True)


if __name__ == "__main__":
    main()
