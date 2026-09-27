"""Index local Unity bundles without modifying the game or its source files.

Requires UnityPy. Keep the raw bundle directory and generated intermediate index
outside the application package. The index records dependencies and provenance;
finding a mesh does not imply it is ready to ship as a desktop character.
"""
import argparse
import collections
import concurrent.futures
import json
import pathlib
import time
import UnityPy


def inspect(path):
    env = UnityPy.load(str(path))
    record = {"file": path.name, "bytes": path.stat().st_size,
              "types": dict(collections.Counter(o.type.name for o in env.objects)),
              "containers": list(env.container), "animations": [], "models": [], "dependencies": [],
              "serializedFiles": [asset.name for asset in env.assets]}
    for asset in env.assets:
        record["dependencies"].extend(x.path for x in asset.externals)
    for obj in env.objects:
        if obj.type.name == "AnimationClip":
            data = obj.read()
            record["animations"].append(data.m_Name)
        elif obj.type.name == "Animator":
            data = obj.read()
            go = data.m_GameObject.read()
            record["models"].append({"name": go.m_Name, "pathId": str(obj.path_id)})
    return record


def safely_inspect(path):
    try:
        return inspect(path), None
    except Exception as exc:
        return None, {"file": path.name, "error": str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("bundles", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    previous = {}
    if args.output.exists():
        previous = {x["file"]: x for x in json.loads(args.output.read_text(encoding="utf8"))["bundles"]}
    records, failures = [], []
    files = sorted(args.bundles.glob("*.bundle"))
    started = time.monotonic()
    def save():
        payload = {"schemaVersion": 1, "bundles": records, "failures": failures}
        temp = args.output.with_suffix(".partial.json")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf8")
        temp.replace(args.output)
    pending = []
    for path in files:
        cached = previous.get(path.name)
        if cached and "serializedFiles" in cached and cached["bytes"] == path.stat().st_size:
            records.append(cached)
        else:
            pending.append(path)
    with concurrent.futures.ProcessPoolExecutor(max_workers=3) as executor:
        for record, error in executor.map(safely_inspect, pending, chunksize=1):
            if error:
                failures.append(error)
            else:
                records.append(record)
            if (len(records) + len(failures)) % 250 == 0:
                save()
                print(f"Indexed {len(records)}/{len(files)}; failures={len(failures)}", flush=True)
    save()
    print(json.dumps({"bundles": len(records), "failures": len(failures),
                      "seconds": round(time.monotonic() - started, 1)}), flush=True)


if __name__ == "__main__":
    main()
