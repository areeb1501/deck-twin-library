# Sizing when the drawing doesn't say

Use these rules of thumb only to fill gaps, and tell the user which values you assumed. They produce plausible geometry. They are not a design.

## Pressure class from design pressure (carbon steel, ≤ 38 °C, ASME B16.5)

| Design pressure | Class |
|---|---|
| ≤ 19 barg | 150 |
| ≤ 51 barg | 300 |
| ≤ 102 barg | 600 |
| ≤ 153 barg | 900 |
| ≤ 255 barg | 1500 |
| ≤ 425 barg | 2500 |

Line classes in tags often carry the class as a digit: 1 → 150, 3 → 300, 6 → 600, 9 → 900, 15 → 1500, 25 → 2500, as in `8"-PG-2101-D6A-N` (Class 600). This is a common convention, not a universal one; the project's piping class index wins.

## Line size from flow (velocity rule)

`ID (m) = sqrt(4 × Q / (π × v))`, where Q is in m³/s at line conditions. Round up to the next NPS.

| Service | Velocity v |
|---|---|
| Liquid, pump suction | 1–1.5 m/s |
| Liquid, pump discharge | 2–3 m/s |
| Gas | 10–20 m/s |
| Multiphase | 3–8 m/s |
| Flare header | up to Mach 0.5 |

Conversions: 1 bbl/d = 1.84 × 10⁻⁶ m³/s. 1 MMscfd ≈ 0.328 m³/s at standard conditions, then divide by the absolute pressure in bar for line conditions (approximately).

Quick picks:

| Flow | Size |
|---|---|
| 10 000 bbl/d liquid discharge | 4" |
| 50 000 bbl/d liquid discharge | 8" |
| 50 MMscfd gas at 35 barg | 10–12" |

## Vessels

| Item | Rule |
|---|---|
| Horizontal 3-phase separator | L/D ≈ 3–5. Liquid retention 3–5 min at half full. For 20 000–60 000 bbl/d, typical ID is 2.4–3.6 m and T/T 8–14 m. |
| Gas scrubber | Vertical, L/D ≈ 3–4. 1.2–2.4 m ID for 50–150 MMscfd. |
| Column (TEG contactor) | 1.5–2.5 m ID, 10–20 m tall |
| Design pressure | About 10 % above the maximum operating pressure (at least +2 bar) |
| Nozzles | Inlet = inlet line size. Gas outlet ≈ inlet size or one size smaller. Liquid outlet ≈ two sizes smaller. PSV 2–4". |

## Pumps

`kW ≈ (Q [m³/h] × ΔP [bar]) / (36 × η)`, with η ≈ 0.6–0.75. Round up to the next IEC output, and `info` shows the frame.

Typical offshore values:

| Pump | Power |
|---|---|
| Export pump | 300–1 000 kW |
| Produced water pump | 75–250 kW |
| Chemical metering pump | 0.37–4 kW |

## Compressors and drivers

- **Compressor type:**
  - Centrifugal: 20–300 MMscfd at 5–20 MW.
  - Reciprocating: under 30 MMscfd, high ratio.
  - Screw: instrument air and low-pressure boost.
- **Gas turbine generators:**
  - Offshore: 5–40 MW each, normally N+1.
  - Emergency diesel generator: 0.5–2 MW.

## Steel and decks

| Item | Typical size |
|---|---|
| Production deck | 40–80 m × 30–60 m. Build it from `deck-module` tiles of 10–30 m. |
| Deck spacing | 8–10 m from cellar to production deck, the same again to the weather deck |
| Pipe rack | 6 m bays, 6–10 m wide, tiers at 4.5 / 6 / 7.5 m |
| Pedestal crane | Boom 30–50 m. SWL 10–50 t. |
