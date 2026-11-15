/* Geometría WGS84 y exportación de observaciones. */
(() => {
  'use strict';
  function polygons(geometry) {
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  }

  function bounds(geometry) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons(geometry)) {
      for (const [x, y] of polygon[0]) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
    return box;
  }

  function union(boxes) {
    return [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])),
      Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
  }

  const inBox = ([x, y], b) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
  const containsBox = (outer, inner) => inBox(inner.slice(0, 2), outer) && inBox(inner.slice(2), outer);

  function ringPosition([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      if (Math.abs((x-ax)*(by-ay) - (y-ay)*(bx-ax)) < 1e-12 &&
          x >= Math.min(ax, bx) && x <= Math.max(ax, bx) &&
          y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 0;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside ? 1 : -1;
  }

  function inside(point, shape) {
    if (!inBox(point, shape.box)) return false;
    return polygons(shape.geometry).some(([shell, ...holes]) =>
      ringPosition(point, shell) >= 0 && holes.every(hole => ringPosition(point, hole) !== 1));
  }

  function validatePark(data) {
    const features = data.type === 'FeatureCollection' ? data.features : [
      data.type === 'Feature' ? data : {type: 'Feature', geometry: data, properties: {}}
    ];
    if (!Array.isArray(features) || !features.length || features.length > 40) throw Error('Carga únicamente la capa del parque en un GeoJSON.');
    if (features.some(f => typeof f?.properties?.Distrito === 'string')) {
      throw Error('Esta capa contiene distritos. Selecciona el polígono del Parque Nacional Tunari.');
    }
    let vertices = 0;
    for (const feature of features) {
      const g = feature?.geometry;
      if (!g || !['Polygon', 'MultiPolygon'].includes(g.type)) throw Error('Usa geometrías Polygon o MultiPolygon.');
      for (const polygon of polygons(g)) {
        if (!polygon.length) throw Error('Geometría vacía.');
        for (const ring of polygon) {
          vertices += ring.length;
          if (vertices > 250000 || ring.length < 4 || ring.some(p =>
            !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) ||
            !inBox(p, [-68, -19, -64, -16]))) throw Error('Revisa que el GeoJSON sea WGS84 (longitud, latitud) y corresponda a Cochabamba.');
          if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw Error('El GeoJSON contiene un anillo abierto.');
        }
      }
    }
    return {type: 'FeatureCollection', features: features.map(f => ({
      type: 'Feature', geometry: f.geometry, properties: {}
    }))};
  }

  function csv(header, rows) {
    const escape = value => {
      let s = String(value ?? '');
      if (typeof value === 'string' && /^[=+@-]/.test(s) && !/^-[\d.]+$/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    return '\uFEFF' + [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  }

  window.FireAnalysis = {bounds, union, inBox, containsBox, inside, validatePark, csv};
})();
