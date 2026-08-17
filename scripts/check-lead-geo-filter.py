#!/usr/bin/env python3
"""
check-lead-geo-filter.py — the geographic lead filter, tested in both directions.

Tests the module the pipeline imports, not a copy of it.

This filter DROPS leads, which is destructive: a false positive means a real prospect never gets a
video or an email, silently. So the cases that matter most here are the ones asserting it does NOT
drop — missing coordinates, a small batch, a lead at the edge of the metro.

Exit 0 = correct, 1 = a case regressed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
sel = import_module('select-emailable-leads') if False else None
# hyphenated module name → load by path
import importlib.util
spec = importlib.util.spec_from_file_location(
    'sel', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'select-emailable-leads.py'))
sel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sel)

CULVER = (34.0211, -118.3965)


def lead(name, lat=None, lng=None, email='a@b.com', city=''):
    return {'Business Name': name, 'email': email, 'City': city,
            'Latitude': '' if lat is None else str(lat),
            'Longitude': '' if lng is None else str(lng)}


# A realistic metro batch: leads scattered AROUND Culver City, not ramping away from it — a one-sided
# ramp puts the median at the ramp's midpoint rather than the metro centre, which is a property of the
# fixture, not of the code under test.
def metro(n=8):
    return [lead(f'Local Biz {i}', CULVER[0] + (i - n // 2) * 0.004, CULVER[1] - (i - n // 2) * 0.004)
            for i in range(n)]


failed = 0


def check(desc, got, want):
    global failed
    ok = got == want
    if not ok:
        failed += 1
    print(f"  {'✓' if ok else '✗'} {desc}  (expected={want} actual={got})")


# ---- drops the real defects ----
rows = metro() + [
    lead('Tyler Chase Collective', 29.2729133, -137.2687824),   # open Pacific, shipped a blank map
    lead('Enchantment Designs', 30.83, -100.11),                 # rural Texas under a Culver City badge
    lead('Kaitie Brainerd Photography', 34.42, -119.70),         # Santa Barbara, 81 mi
]
kept, excl = sel.select(rows, 60.0)
names = {n for n, _ in excl}
check('drops the open-Pacific lead that shipped a blank map', 'Tyler Chase Collective' in names, True)
check('drops the rural-Texas lead', 'Enchantment Designs' in names, True)
check('drops the Santa Barbara lead at 81 mi', 'Kaitie Brainerd Photography' in names, True)
check('keeps every in-metro lead', len(kept), 8)

# ---- 🔴 must NOT drop: this filter is destructive ----
rows = metro() + [lead('No Coords Co', None, None)]
kept, excl = sel.select(rows, 60.0)
check('🔴 a lead with NO coordinates is kept (absence of evidence)', 'No Coords Co' in kept, True)

rows = metro() + [lead('Null Island Co', 0, 0)]
kept, excl = sel.select(rows, 60.0)
check('🔴 a 0,0 coordinate is kept, not treated as a location', 'Null Island Co' in kept, True)

rows = metro() + [lead('Edge Of Metro', 34.44, -118.40)]   # ~29 mi north
kept, excl = sel.select(rows, 60.0)
check('🔴 a lead 29 mi out (real metro spread) is kept', 'Edge Of Metro' in kept, True)

small = [lead('A', 34.02, -118.39), lead('B', 29.27, -137.27)]
kept, excl = sel.select(small, 60.0)
check('🔴 too few points → filter disables itself, drops nothing', len(excl), 0)

rows = metro() + [lead('No Email Co', 29.27, -137.27, email='')]
kept, excl = sel.select(rows, 60.0)
check('a non-emailable lead is not selected at all', 'No Email Co' in kept, False)

rows = metro() + [lead('Bad Coord Co', 'abc', 'def')]
kept, excl = sel.select(rows, 60.0)
check('🔴 an unparseable coordinate is kept, not crashed on', 'Bad Coord Co' in kept, True)

# ---- the centre is self-calibrating ----
c = sel.batch_centre(metro(20))
check('median centre lands on the metro', round(sel.haversine_mi(c, CULVER)) <= 2, True)

# ---- negative control: without the filter these defects ship ----
kept_all, _ = sel.select(metro() + [lead('Tyler Chase Collective', 29.2729133, -137.2687824)], 1e9)
check('negative control: an infinite radius keeps the ocean lead (filter is what drops it)',
      'Tyler Chase Collective' in kept_all, True)

print(f"\n{'❌ ' + str(failed) + ' geo-filter case(s) regressed.' if failed else '✅ all geo-filter cases correct.'}")
sys.exit(1 if failed else 0)
