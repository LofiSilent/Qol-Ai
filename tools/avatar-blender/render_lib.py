import bpy, math, mathutils


def setup_render(res=(900, 900), samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w') if not bpy.context.scene.world else bpy.context.scene.world
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.06, 0.27, 0.46, 1)
    bg.inputs[1].default_value = 1.0
    return sc


def add_light(name, loc, energy, size=1.5, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = loc
    d = mathutils.Vector((0, 0, 1.55)) - mathutils.Vector(loc)
    lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return lo


def camera(loc, target, lens=85):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens
    co = bpy.data.objects.new('cam', cd)
    bpy.context.scene.collection.objects.link(co)
    co.location = loc
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = co
    return co


def shoot(path, loc=(0, -1.1, 1.66), target=(0, 0, 1.64), lens=85):
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o, do_unlink=True)
    add_light('key', (0.9, -1.6, 2.3), 140, 1.2, (1, 0.95, 0.9))
    add_light('fill', (-1.4, -1.2, 1.8), 45, 1.5, (0.85, 0.92, 1))
    add_light('rim', (-0.6, 1.4, 2.2), 70, 1.0, (1, 0.8, 0.6))
    camera(loc, target, lens)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
