#!/usr/bin/env python3
"""
select-emailable-leads.py — pick the leads that get a video, and reject geographically impossible ones.

stdout: one business name per line (process these)
stderr: "<name>\t<miles>" per excluded lead (for the run log)

WHY THE GEOGRAPHIC FILTER EXISTS (2026-08-17)
Businesses that hide their street address — service-area businesses — get ARBITRARY coordinates from
Google. Tyler Chase Collective came back at 29.27,-137.27: the open Pacific, ~1,150 mi from Culver City.
Its Maps card rendered a SOLID BLANK BLUE map, and it SHIPPED, carrying a "#34 Currently Ranking for
Wedding photographers in Culver City, CA" badge over empty ocean. Every gate passed it — card open, hero
photo fine, rank overlay present, scale bar reading "2 mi" — because the zoom rule checks the scale
NUMBER and never that the map shows anywhere real. Lexx Wake Photo (#64) and Catherine Lacey shipped the
same way. Enchantment Designs rendered rural Texas (Fort McKavett) and Kaitie Brainerd rendered Santa
Barbara, both under a Culver City badge — worse than blank, because they look deliberate.

WHY THE MEDIAN, NOT A HARDCODED CITY
The batch median is the metro centre by construction: 219 of 262 leads across 08-14/15/16 sat within
5 mi of it, and on the 08-16 batch it landed 1.1 mi from Culver City's true centre. So this works for
any search area without geocoding.

WHY DISTANCE, NOT THE EMPTY City FIELD
All 22 bogus leads had an empty City — but so did 24 GOOD leads inside the metro, which a City-based
rule would have thrown away.

WHY 60 MILES IS NOT A TUNED NUMBER
Measured on three nights: the farthest legitimate lead was 36.5 mi, the nearest bogus one 61.4 mi, and
the 40-60 mi band was empty. The threshold sits in that gap.
"""
import csv
import math
import sys

EARTH_RADIUS_MI = 3959.0
MIN_POINTS_FOR_MEDIAN = 5   # too few points to trust a centre → filter disables itself


def haversine_mi(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2)
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def coords(row):
    """(lat, lng), or None when absent/unparseable. 0,0 is Google's null island, not a location."""
    try:
        lat = float(row.get('Latitude') or 0)
        lng = float(row.get('Longitude') or 0)
    except (TypeError, ValueError):
        return None
    return None if (lat == 0 and lng == 0) else (lat, lng)


def is_emailable(row):
    email = (row.get('email', '') or '').strip()
    return bool(email) and '@' in email and not email.startswith('user@') and not email.endswith('.our')


def batch_centre(rows):
    """Median lat/lng of every row that has one. None when there is not enough signal."""
    pts = [c for c in (coords(r) for r in rows) if c]
    if len(pts) < MIN_POINTS_FOR_MEDIAN:
        return None
    lats = sorted(p[0] for p in pts)
    lngs = sorted(p[1] for p in pts)
    mid = len(pts) // 2
    return (lats[mid], lngs[mid])


def select(rows, radius_mi=60.0):
    """→ (kept names, [(name, miles)] excluded). Fails OPEN on a missing coordinate."""
    centre = batch_centre(rows)
    kept, excluded = [], []
    for row in rows:
        if not is_emailable(row):
            continue
        name = row.get('Business Name') or ''
        point = coords(row)
        # Absence of a coordinate is not evidence of a bad one, and dropping a lead is destructive.
        # Only a coordinate we CAN measure, and that is implausibly far, is excluded.
        if centre and point:
            miles = haversine_mi(centre, point)
            if miles > radius_mi:
                excluded.append((name, miles))
                continue
        kept.append(name)
    return kept, excluded


def main():
    if len(sys.argv) < 2:
        print("usage: select-emailable-leads.py <step-2.csv> [radius_mi]", file=sys.stderr)
        return 2
    radius = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    with open(sys.argv[1]) as fh:
        rows = list(csv.DictReader(fh))
    kept, excluded = select(rows, radius)
    for name in kept:
        print(name)
    for name, miles in excluded:
        print(f"{name}\t{miles:.0f}", file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
