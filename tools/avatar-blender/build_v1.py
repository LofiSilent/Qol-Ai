import sys, math, random
sys.path.insert(0, '/tmp/claude-0/-home-user/fc9170e7-9132-505f-a76b-6fc8971ea952/scratchpad')
import bpy, bmesh, mathutils
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import avlib, render_lib as rl

TEX = '/tmp/claude-0/-home-user/fc9170e7-9132-505f-a76b-6fc8971ea952/scratchpad/tex/'
SC = '/tmp/claude-0/-home-user/fc9170e7-9132-505f-a76b-6fc8971ea952/scratchpad/'
random.seed(11)


def img(name, srgb=True):
    im = bpy.data.images.load(TEX + name + '.png')
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im.pack()
    return im


def make_material(name, color_img=None, normal_img=None, base=(1, 1, 1, 1), rough=0.5, sheen=0.0, sheen_tint=(1, 1, 1, 1),
                  normal_strength=1.0, uv_scale=(1, 1), coat=0.0, spec=0.5, alpha=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = rough
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Tint'].default_value = sheen_tint
    if coat and 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.04
    bsdf.inputs['Specular IOR Level'].default_value = spec
    uv = nt.nodes.new('ShaderNodeUVMap')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (uv_scale[0], uv_scale[1], 1)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    if color_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = color_img; t.extension = 'REPEAT'
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = normal_img; t.extension = 'REPEAT'
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def set_uv_cylinder(obj, turns=3.0, zrange=None):
    me = obj.data
    uvl = me.uv_layers.new(name='UVMap') if 'UVMap' not in me.uv_layers else me.uv_layers['UVMap']
    me.uv_layers.active = uvl
    zs = [v.co.z for v in me.vertices]
    z0, z1 = zrange or (min(zs), max(zs))
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (math.atan2(co.x, -co.y) / (2 * math.pi) + .5) * turns
            v = (co.z - z0) / (z1 - z0)
            uvl.data[li].uv = (u, v)


def set_uv_box(obj, scale=3.0):
    """Бокс-проекция по доминирующей оси нормали грани (для тканей)."""
    me = obj.data
    uvl = me.uv_layers.new(name='UVMap') if 'UVMap' not in me.uv_layers else me.uv_layers['UVMap']
    me.uv_layers.active = uvl
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            if ax == 0: uv = (c.y, c.z)
            elif ax == 1: uv = (c.x, c.z)
            else: uv = (c.x, c.y)
            uvl.data[li].uv = (uv[0] * scale, uv[1] * scale)


def set_uv_planar_eye(obj):
    me = obj.data
    uvl = me.uv_layers.new(name='UVMap') if 'UVMap' not in me.uv_layers else me.uv_layers['UVMap']
    me.uv_layers.active = uvl
    xs = [v.co.x for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    r = max(max(xs) - min(xs), max(zs) - min(zs)) / 2
    for poly in me.polygons:
        for li in poly.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((c.x - cx) / (2 * r) + .5, (c.z - cz) / (2 * r) + .5)


def assign_all_slots(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0


def head_bvh(body):
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    return tree, bm


def copy_weights(src_obj, dst_obj, src_tree_bm_points):
    pass


def build_bangs(arm, body, hair_mat):
    tree, _ = head_bvh(body)
    me = bpy.data.meshes.new('Qol_Hair_Bangs')
    verts, faces, uvs = [], [], []
    seg = 14
    strands = []
    for side in (-1, 1):
        K = 20
        for k in range(K):
            u = k / (K - 1)
            x0 = side * (0.004 + 0.016 * u) + 0.010            # пробор чуть правее центра
            z0 = 1.793 + 0.004 * (1 - u)
            xe = side * (0.052 + 0.020 * u) + 0.004
            ze = 1.690 + 0.022 * (1 - u) + random.uniform(-0.006, 0.006)
            w0 = 0.024 + random.uniform(-0.003, 0.005)
            layer = random.uniform(0.003, 0.009)
            strands.append((x0, z0, xe, ze, w0, layer))
    for (x0, z0, xe, ze, w0, layer) in strands:
        pts = []
        for i in range(seg + 1):
            t = i / seg
            x = x0 + (xe - x0) * (t ** 1.25)
            z = z0 + (ze - z0) * t - 0.006 * math.sin(t * math.pi)
            z = min(z, 1.7965)
            hit = tree.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)))
            if hit[0] is None:
                pts.append(None); continue
            loc, nrm = hit[0], hit[1]
            off = layer + 0.002 * math.sin(t * math.pi)
            pts.append((loc + nrm * off, nrm))
        if any(p is None for p in pts):
            continue
        base_i = len(verts)
        for i, (p, n) in enumerate(pts):
            t = i / seg
            a = pts[max(i - 1, 0)][0]; b = pts[min(i + 1, seg)][0]
            tan = (b - a).normalized()
            side = n.cross(tan).normalized()
            w = w0 * (1 - t ** 2.3) * 0.5 + 0.0004
            verts.append(p - side * w); verts.append(p + side * w)
            uvs.append((0.0, 1 - t)); uvs.append((1.0, 1 - t))
        for i in range(seg):
            a = base_i + i * 2
            faces.append((a, a + 1, a + 3, a + 2))
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    # u: ширина ленты в диапазоне полосы текстуры, v: вдоль длины (пряди идут вдоль v)
    for pi, poly in enumerate(me.polygons):
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uvl.data[li].uv = (random.Random(vi // 2 // (seg + 1)).random() * 0.9 + uvs[vi][0] * 0.08, uvs[vi][1] * 0.35 + 0.3)
    obj = bpy.data.objects.new('Qol_Hair_Bangs', me)
    bpy.context.scene.collection.objects.link(obj)
    me.materials.append(hair_mat)
    # веса: копия от ближайшей вершины головы
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    kd = mathutils.kdtree.KDTree(len(bm.verts))
    for v in bm.verts:
        kd.insert(body.matrix_world @ v.co, v.index)
    kd.balance()
    gname = {g.index: g.name for g in body.vertex_groups}
    for v in me.vertices:
        _, idx, _ = kd.find(v.co)
        for g in body.data.vertices[idx].groups:
            if g.weight > 0.001:
                nm = gname[g.group]
                vg = obj.vertex_groups.get(nm) or obj.vertex_groups.new(name=nm)
                vg.add([v.index], g.weight, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    smooth = [p.use_smooth for p in me.polygons]
    for p in me.polygons: p.use_smooth = True
    return obj



def build_scalp_cap(arm, body, hair_mat, z_min=1.771, lift=0.0035):
    """Волосяная «шапка» поверх кожи темени и верха лба: убирает видимую лысину над чёлкой."""
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    bm.faces.ensure_lookup_table()
    keep = []
    for f in bm.faces:
        c = f.calc_center_median()
        ax = min(abs(c.x) / 0.065, 1.0)
        edge = 1.762 - 0.020 * ax ** 1.6 + 0.0022 * math.sin(c.x * 260.0) + 0.0016 * math.sin(c.x * 610.0 + 1.3)
        if c.z > edge and c.y < 0.06:
            keep.append(f)
    # соседство с лицом: оставляем только верх головы (z выше линии волос) — глаза/брови ниже границы
    for f in bm.faces:
        f.select = False
    sel = set(keep)
    for f in list(bm.faces):
        if f not in sel:
            bm.faces.remove(f)
    for v in list(bm.verts):
        if not v.link_faces:
            bm.verts.remove(v)
    bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.active
    if dl is not None:
        bm.verts.layers.deform.remove(dl)
    me = bpy.data.meshes.new('Qol_Hair_ScalpCap')
    # поднять вдоль нормали
    bm.normal_update()
    ctr = Vector((0, -0.01, 1.70))
    for v in bm.verts:
        n = v.normal.copy()
        if n.dot(v.co - ctr) < 0:
            n = -n
        v.co += n * lift
    bm.to_mesh(me); bm.free()
    obj = bpy.data.objects.new('Qol_Hair_ScalpCap', me)
    bpy.context.scene.collection.objects.link(obj)
    me.materials.append(hair_mat)
    set_uv_cylinder(obj, turns=3.0, zrange=(1.27, 1.83))
    # веса от ближайшей вершины тела
    kd = mathutils.kdtree.KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(body.matrix_world @ v.co, v.index)
    kd.balance()
    gname = {g.index: g.name for g in body.vertex_groups}
    for v in me.vertices:
        _, idx, _ = kd.find(v.co)
        for g in body.data.vertices[idx].groups:
            if g.weight > 0.001:
                nm = gname[g.group]
                vg = obj.vertex_groups.get(nm) or obj.vertex_groups.new(name=nm)
                vg.add([v.index], g.weight, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    for p in me.polygons: p.use_smooth = True
    return obj

def main():
    arm = avlib.load()
    avlib.normalize_for_export()    # работаем в исходных метрах/иерархии
    ob = {o.name: o for o in avlib.meshes()}
    body = ob['CC_Base_Body']

    # ---- волосы ----
    hair_mat = make_material('Qol black hair / unified satin', img('hair_color'), img('hair_normal', False),
                             rough=0.42, sheen=0.12, sheen_tint=(0.25, 0.16, 0.10, 1), normal_strength=0.8, spec=0.55)
    for n in ('Qol_Long_Hair', 'Qol_Hairline_Fine_Edge'):
        o = ob[n]
        set_uv_cylinder(o, turns=3.0)
        assign_all_slots(o, hair_mat)
    bangs = build_bangs(arm, body, hair_mat)
    scalp = build_scalp_cap(arm, body, hair_mat)

    # ---- глаза ----
    iris_mat = make_material('Natural brown radial iris', img('iris_color'), None, rough=0.18, coat=1.0, spec=0.6)
    for n in ('Iris and pupil L', 'Iris and pupil R'):
        o = ob[n]
        set_uv_planar_eye(o)
        assign_all_slots(o, iris_mat)

    # ---- одежда ----
    wool = make_material('Qol tailored collar', img('wool_color'), img('wool_normal', False), rough=0.78, sheen=0.08,
                         sheen_tint=(0.12, 0.16, 0.22, 1), normal_strength=0.9, uv_scale=(1, 1))
    blouse = make_material('Qol ivory blouse', img('blouse_color'), img('blouse_normal', False), rough=0.62, sheen=0.12, sheen_tint=(0.6, 0.58, 0.52, 1),
                           normal_strength=0.7)
    for n, mat in (('Qol_Business_Jacket_Body', wool), ('Qol_casual_Sleeve_L', wool), ('Qol_casual_Sleeve_R', wool),
                   ('Qol_Business_Ivory_Blouse', blouse), ('Qol_Business_Cuff_L', blouse), ('Qol_Business_Cuff_R', blouse)):
        o = ob[n]
        set_uv_box(o, scale=4.0 if mat is wool else 6.0)
        assign_all_slots(o, mat)
    out = SC + 'avatar_v1.glb'
    return out


if __name__ == '__main__':
    out = main()
    mode = sys.argv[-1]
    if mode == 'render':
        rl.setup_render((800, 800), 24)
        rl.shoot(SC + 'v1_front.png')
        rl.shoot(SC + 'v1_three.png', loc=(0.9, -0.9, 1.7), target=(0, 0, 1.68), lens=70)
        pass
    else:
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_skins=True,
                                  export_morph=True, export_apply=False, export_yup=True,
                                  export_image_format='JPEG', export_jpeg_quality=85)
        print('exported', out)
