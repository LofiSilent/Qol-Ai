// Geometry trimming for the packaged avatar: drop triangles nobody can see, optionally simplify,
// then rewrite the vertex streams without unreferenced vertices. Works on plain (uncompressed)
// glTF accessors and only touches primitives that have no morph targets.
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export class Geometry {
  constructor(gltf, binary) { this.g = gltf; this.binary = binary; }

  layout(accessorIndex) {
    const a = this.g.accessors[accessorIndex];
    if (a.sparse || a.bufferView === undefined) throw Error('Unsupported accessor layout');
    const view = this.g.bufferViews[a.bufferView];
    const size = COMPONENT_BYTES[a.componentType] * COMPONENTS[a.type];
    return { a, size, stride: view.byteStride || size, base: (view.byteOffset || 0) + (a.byteOffset || 0) };
  }

  floats(accessorIndex) {
    const { a, size, stride, base } = this.layout(accessorIndex);
    if (a.componentType !== 5126) throw Error('Float accessor expected');
    const n = COMPONENTS[a.type], out = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = this.binary.readFloatLE(base + i * stride + k * 4);
    return out;
  }

  indices(accessorIndex) {
    const { a, stride, base } = this.layout(accessorIndex);
    const out = new Uint32Array(a.count);
    for (let i = 0; i < a.count; i++) {
      const at = base + i * stride;
      out[i] = a.componentType === 5125 ? this.binary.readUInt32LE(at) : a.componentType === 5123 ? this.binary.readUInt16LE(at) : this.binary.readUInt8(at);
    }
    return out;
  }

  addView(buffer) {
    const pad = (4 - (this.binary.length % 4)) % 4;
    if (pad) this.binary = Buffer.concat([this.binary, Buffer.alloc(pad)]);
    const offset = this.binary.length;
    this.binary = Buffer.concat([this.binary, buffer]);
    this.g.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length });
    return this.g.bufferViews.length - 1;
  }

  // New accessor holding only the given source vertices (rows copied byte-for-byte).
  gather(accessorIndex, keptVertices) {
    const { a, size, stride, base } = this.layout(accessorIndex);
    const out = Buffer.alloc(keptVertices.length * size);
    keptVertices.forEach((v, i) => this.binary.copy(out, i * size, base + v * stride, base + v * stride + size));
    const accessor = { bufferView: this.addView(out), byteOffset: 0, componentType: a.componentType, count: keptVertices.length, type: a.type };
    if (a.normalized) accessor.normalized = true;
    if (a.type === 'VEC3' && a.componentType === 5126) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < keptVertices.length; i++) for (let k = 0; k < 3; k++) { const v = out.readFloatLE(i * 12 + k * 4); min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v); }
      if (a.min) { accessor.min = min; accessor.max = max; }
    }
    this.g.accessors.push(accessor);
    return this.g.accessors.length - 1;
  }

  // keepTriangle(a, b, c, positions) -> boolean. simplify({indices, positions, normals, uvs}) -> Uint32Array.
  rewrite(primitive, { keepTriangle, simplify } = {}) {
    if (primitive.targets?.length || primitive.indices === undefined) return null;
    const positions = this.floats(primitive.attributes.POSITION);
    let indices = this.indices(primitive.indices);
    const before = { vertices: positions.length / 3, triangles: indices.length / 3 };
    if (keepTriangle) {
      const kept = [];
      for (let i = 0; i < indices.length; i += 3) if (keepTriangle(indices[i], indices[i + 1], indices[i + 2], positions)) kept.push(indices[i], indices[i + 1], indices[i + 2]);
      indices = Uint32Array.from(kept);
    }
    if (simplify) {
      const normals = primitive.attributes.NORMAL !== undefined ? this.floats(primitive.attributes.NORMAL) : null;
      const uvs = primitive.attributes.TEXCOORD_0 !== undefined ? this.floats(primitive.attributes.TEXCOORD_0) : null;
      indices = simplify({ indices, positions, normals, uvs });
    }
    const used = new Uint8Array(positions.length / 3);
    for (const i of indices) used[i] = 1;
    const kept = [], remap = new Int32Array(used.length).fill(-1);
    used.forEach((u, i) => { if (u) { remap[i] = kept.length; kept.push(i); } });
    for (const [name, accessorIndex] of Object.entries(primitive.attributes)) primitive.attributes[name] = this.gather(accessorIndex, kept);
    const wide = kept.length > 65535, out = Buffer.alloc(indices.length * (wide ? 4 : 2));
    indices.forEach((v, i) => (wide ? out.writeUInt32LE(remap[v], i * 4) : out.writeUInt16LE(remap[v], i * 2)));
    this.g.accessors.push({ bufferView: this.addView(out), byteOffset: 0, componentType: wide ? 5125 : 5123, count: indices.length, type: 'SCALAR' });
    primitive.indices = this.g.accessors.length - 1;
    return { before, after: { vertices: kept.length, triangles: indices.length / 3 } };
  }
}
