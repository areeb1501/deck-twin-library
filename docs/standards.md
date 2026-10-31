# Standards & data

The `lib/standards/` folder holds the dimensional tables that drive every component. All values are returned in metres.

> **Reference values.** These tables were transcribed from the standards listed below for visualisation. Check them against the current edition before using them for design, procurement or fabrication. Values marked `approx` or `typical` in the source are interpolations or typical industry practice, not standard values.

| File | Standard | Functions |
|---|---|---|
| `pipe.ts` | ASME B36.10M / B36.19M, NPS 1/8–48, schedules 5S–XXS | `pipeOD`, `pipeWall`, `pipeID`, `pipeMass`, `dn`, `NPS_SIZES` |
| `flange.ts` | ASME B16.5 weld-neck RF, Class 150–2500 (NPS 1/2–24); B16.47 Series A (NPS 26–48); B16.48 spectacle blinds | `flange`, `studLength`, `blindThickness`, `spectacleBlind`, `RATINGS` |
| `fittings.ts` | ASME B16.9 butt-weld: LR/SR elbows, tees, reducers, caps, stub ends | `elbow90`, `elbow45`, `elbow180`, `tee`, `reducer`, `cap`, `stubEnd` |
| `valves.ts` | ASME B16.10 face-to-face; API 609 butterfly; API 594 dual-plate check; ISA 75.08.01 control valves; API 526 PSV orifices D–T | `faceToFace`, `handwheelDia`, `stemHeight`, `psv`, `PSV_ORIFICES` |
| `vessel.ts` | ASME BPVC VIII-1: UG-27 shell and UG-32 head thickness, head depths, typical saddle and nozzle layouts | `shellThickness`, `headThickness`, `headDepth`, `torispherical`, `saddle`, `nozzleStandout`, `skirtHeight` |
| `steel.ts` | EN 10365 (IPE, HEA, HEB, UPN), EN 10056 angles, EN 10210 CHS/SHS/RHS, AISC W-shapes | `SECTIONS`, `section`, `GRATING` |
| `motors.ts` | IEC 60072 / 60034 TEFC frames 80–450, with standard outputs | `iecMotor`, `IEC_POWERS` |
| `access.ts` | ISO 14122-2/3/4, OSHA 1910: handrails, stairs, ladders, cages | `ACCESS`, `stairFlight` |
| `colors.ts` | ISO 14726 / BS 1710 line identification, ISO 3864 safety colours, common RAL colours | `SERVICE`, `SAFETY`, `RAL` |

## Size snapping

Every accessor accepts any number and snaps it to the nearest tabulated size. Where a class does not define a size, the accessor falls back to the nearest class that does, and ties go to the higher class. For example, a Class 2500 NPS 16 flange uses Class 1500. No accessor throws, so a component never crashes on an unusual prop.

## Examples

```ts
import { flange, faceToFace, pipeOD, shellThickness, iecMotor } from './components/deck-twin/lib/standards'

flange(8, 600)                // { od: 0.4191, thickness: 0.0556, raisedFace: 0.2697, bolts: 12, boltDia: 0.0286, boltCircle: 0.3493, … }
faceToFace('gate', 6, 300)    // 0.403  (B16.10, 15-7/8")
pipeOD(10)                    // 0.273
shellThickness(40, 2.4)       // 0.040  (UG-27: 35.4 mm + 3 mm CA, rounded up to 40 mm plate; SA-516-70, E = 1)
iecMotor(110, 4)              // { frame: '315S', shaftHeight: 0.315, … }
```

## Flange convention

`thickness` and `hubLength` **exclude** the raised face for every class. B16.5 includes the 1.6 mm face in the Class 150/300 values. It is subtracted here so that all classes behave the same way. The distance from the weld end to the face is `hubLength + raisedFaceHeight`.
