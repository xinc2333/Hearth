// 澜江市: the map data holds together (docs/world.md §4).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { districtAt, lanjiang } from '../src/plugins/tabletop/world/city/index.ts';
import { inside } from '../src/plugins/tabletop/world/city/geo.ts';
import { mapSvg } from '../src/plugins/tabletop/world/map-svg.ts';

const city = lanjiang();

test('every station and landmark lies in a district', () => {
    for (const s of city.stations.values()) assert.ok(districtAt(city, s.at), `${s.name} is outside every district`);
    for (const p of city.places) assert.ok(p.district, `${p.name} is outside every district`);
});

test('districts cover the mainland without overlapping', () => {
    const [x0, y0, x1, y1] = city.bounds;
    let land = 0;
    for (let x = x0; x <= x1; x += 0.5) {
        for (let y = y0; y <= y1; y += 0.5) {
            const point = [x + 0.013, y + 0.017] as const;
            const owners = city.districts.filter(d => d.outline.some(part => inside(point, part)));
            assert.ok(owners.length <= 1, `(${x}, ${y}) is in ${owners.map(d => d.name).join('、')}`);
            if (!inside(point, city.mainland)) continue;
            land++;
            assert.equal(owners.length, 1, `(${x}, ${y}) is on the mainland but in no district`);
        }
    }
    assert.ok(land > 4000);
});

test('the city is Shanghai at half the distances', () => {
    const total = city.districts.reduce((s, d) => s + d.area, 0);
    assert.ok(total > 1450 && total < 1850, `land area ${total} km²`);
    const people = city.districts.reduce((s, d) => s + d.population, 0);
    assert.ok(people > 600 && people < 650, `population ${people} 万`);
    // 市民广场 is the origin; 望江嘴 sits across the river about 1.3 km away.
    const square = city.stations.get('市民广场')!.at;
    const lujiazui = city.stations.get('望江嘴')!.at;
    assert.ok(Math.hypot(square[0] - lujiazui[0], square[1] - lujiazui[1]) < 1.6);
    assert.equal(districtAt(city, lujiazui)?.name, '江东区');
    assert.equal(districtAt(city, square)?.name, '中城区');
});

test('lines stop at known stations and transfers are shared', () => {
    for (const l of city.lines) for (const n of l.stations) assert.ok(city.stations.has(n), `${l.name}: ${n}`);
    assert.deepEqual(city.stations.get('市民广场')!.lines.sort(), ['L1', 'L2', 'L6']);
    assert.ok(city.stations.get('世纪广场')!.lines.length >= 3);
});

test('everyday places fill the streets, each with its own name and id', () => {
    const everyday = city.places.filter(p => !p.landmark);
    assert.ok(everyday.length > 600, `${everyday.length} everyday places`);
    assert.equal(new Set(city.places.map(p => p.id)).size, city.places.length);
    assert.equal(new Set(city.places.map(p => p.name)).size, city.places.length);
    for (const p of everyday) assert.ok(!city.lakes.some(l => inside(p.at, l.outline)), `${p.name} is in a lake`);
    // The same build makes the same places.
    assert.deepEqual(everyday.slice(0, 5).map(p => p.name), lanjiang().places.filter(p => !p.landmark).slice(0, 5).map(p => p.name));
});

test('the map draws at every level of detail', () => {
    const marker = { at: [3, 3] as const, label: '你', kind: 'self' as const };
    const whole = mapSvg(city, { markers: [marker] });
    const part = mapSvg(city, { view: [-10, -8, 10, 7], markers: [marker] });
    const streets = mapSvg(city, { view: [-1.5, -1, 1.5, 1], markers: [marker] });
    for (const svg of [whole, part, streets]) {
        assert.match(svg, /^<svg /);
        assert.doesNotMatch(svg, /NaN|undefined/);
    }
    assert.doesNotMatch(whole, /市民广场</);
    assert.match(part, /市民广场</);
    assert.match(streets, /pattern id="grid-zhongcheng"/);
    assert.ok(streets.length > part.length / 4);
});
