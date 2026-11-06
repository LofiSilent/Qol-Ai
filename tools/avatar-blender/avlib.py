"""Общие функции для сборки аватара в headless Blender."""
import bpy, mathutils

SRC = '/home/user/Qol-Ai/src/assets/model/avatar.glb'


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    for o in list(bpy.context.scene.objects):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    return next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def normalize_for_export():
    """Вернуть исходную иерархию: арматура (масштаб .01, кости в см) в корне,
    меши в корне с масштабом 1 и вершинами в метрах — как в оригинальном GLB."""
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    for o in meshes():
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes():
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes()[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True, isolate_users=True)


def export(path):
    normalize_for_export()
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=True,
                              export_skins=True, export_morph=True, export_apply=False, export_yup=True,
                              export_image_format='AUTO', export_texcoords=True, export_normals=True)
    print('exported', path)
