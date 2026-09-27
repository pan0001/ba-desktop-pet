"""Blender background conversion of an exported game prefab to a self-contained GLB.

Usage: blender --background --python convert-fbx.py -- input.fbx output.glb
No source meshes, UVs, bone weights or textures are replaced with approximations.
"""
import bpy
import json
import pathlib
import re
import sys
from io_scene_fbx import import_fbx

# Some game rigs have no FBX armature parent. Blender creates that parent after
# collecting bind matrices, leaving their dictionary key as None. Reattach only
# this unambiguous single-parent entry; preserve both matrices and all weights.
repaired_bindings = []
original_link_hierarchy = import_fbx.FbxImportHelperNode.link_hierarchy
def link_hierarchy(node, *args):
    if node.is_armature:
        for mesh in node.meshes:
            if node not in mesh.armature_setup and set(mesh.armature_setup) == {None}:
                mesh.armature_setup[node] = mesh.armature_setup.pop(None)
                repaired_bindings.append(mesh.fbx_name)
    return original_link_hierarchy(node, *args)
import_fbx.FbxImportHelperNode.link_hierarchy = link_hierarchy

arguments = sys.argv[sys.argv.index("--") + 1:]
source, destination = map(pathlib.Path, arguments[:2])
kind = arguments[2] if len(arguments) > 2 else "student"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source), use_anim=True)
all_actions = list(bpy.data.actions)
animation_names = set()
for obj in bpy.data.objects:
    if obj.animation_data:
        obj.animation_data.action = None
for action in all_actions:
    # AssetStudio / FBX adds an armature and layer prefix to the real clip name.
    parts = action.name.split("|")
    name = parts[-2] if len(parts) >= 3 else action.name
    keep = name.lower().startswith(source.stem.lower() + "_") if kind == "furniture" else bool(re.search(r"_(Cafe|Coffee|Formation)_|_Vital_Death$|_Victory_(Start|End)$", name, re.I))
    if keep:
        target = bpy.data.objects.get(parts[0]) if len(parts) >= 3 else None
        if target:
            target.animation_data_create()
            track = target.animation_data.nla_tracks.new()
            track.name = name
            strip = track.strips.new(name, int(action.frame_range[0]), action)
            if action.slots:
                strip.action_slot = action.slots[0]
            animation_names.add(name)
    else:
        bpy.data.actions.remove(action)
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    shader = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if shader:
        shader.inputs["Metallic"].default_value = 0
        shader.inputs["Roughness"].default_value = 1
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB",
    export_animations=True, export_animation_mode="NLA_TRACKS", export_merge_animation="NLA_TRACK",
    export_optimize_animation_size=True, export_force_sampling=True,
    export_materials="EXPORT", export_cameras=False, export_lights=False)
report = {"source": source.name, "meshes": len([o for o in bpy.data.objects if o.type == "MESH"]),
          "halos": [o.name for o in bpy.data.objects if o.type == "MESH" and
                    ("halo" in o.name.lower() or any("halo" in m.name.lower() for m in o.data.materials if m))],
          "armatures": len([o for o in bpy.data.objects if o.type == "ARMATURE"]),
          "animations": sorted(animation_names), "repairedBindings": repaired_bindings,
          "bytes": destination.stat().st_size}
destination.with_suffix(".report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
print("CONVERSION " + json.dumps(report), flush=True)
