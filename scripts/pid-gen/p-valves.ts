import { svg, T, P, C, R, FILL, WHITE, bowtie, wheel, stubs, THIN } from './h.ts'
const ISO = 'ISO 10628-2 / ISO 14617-8 / PIP PIC001'
const tagF = { 'Tag number': 'tag' }
const body = (extra = '') => stubs() + bowtie(60, 50, 30, 16, extra)
export default {
  'gate-valve': {
    e: {
      standard: ISO,
      drawn: 'Two triangles meeting at their points (bow-tie) across the line, unfilled. A short stem with a T on top marks the handwheel; a gear operator is sometimes drawn as a small box on the stem.',
      tags: ['HV', 'XV (manual)'],
      notes: 'A filled dot at the centre means globe; a circle means ball; a bar through the centre means butterfly. A fully black bow-tie is the same valve normally closed (NC). LO / CSO / LC / CSC written beside it are locked or car-sealed positions, not a different valve.',
      datasheet: { form: 'Valve datasheet (API 600 / ASME B16.34)', fields: { Size: 'nps', 'Pressure class': 'rating', Operator: 'operator', ...tagF } },
    },
  },
  'ball-valve': {
    svg: svg('0 0 120 80', body() + C(60, 50, 8, WHITE) + wheel(60, 42, 22)),
    e: {
      standard: ISO,
      drawn: 'Bow-tie across the line with an open circle at the centre where the triangle points meet. Manual valves may show a stem with a T or a lever.',
      tags: ['HV'],
      notes: 'Open circle = ball; filled dot = globe; plain bow-tie = gate. The same body under a square actuator with an S or a fail-close note is an ESDV / SDV / XV (esd-valve). Some legends write FB / RB beside it for full or reduced bore.',
      datasheet: { form: 'Ball valve datasheet (API 6D / ISO 17292)', fields: { Size: 'nps', 'Pressure class': 'rating', Bore: 'bore', 'Ball mounting': 'mounting', Operator: 'operator', ...tagF } },
    },
  },
  'esd-valve': {
    svg: svg('0 0 120 110', stubs(80) + bowtie(60, 80, 30, 16) + C(60, 80, 8, WHITE) + P('M60 72V44') + R(42, 22, 36, 22) + P('M78 33h10') + R(88, 25, 16, 16) + T(96, 38, 'S', 12) + T(60, 107, 'FC', 11)),
    e: {
      standard: 'ISA 5.1 (actuator) on an ISO 10628-2 ball valve body; IEC 61511 SIS final element',
      drawn: 'Ball-valve bow-tie (circle at the centre) under a rectangular spring-return piston actuator, usually with a small box marked S (solenoid) on the actuator and "FC" beside the body. The tag bubble reads ESDV, SDV or XV.',
      tags: ['ESDV', 'SDV', 'XV', 'SSV'],
      isa: ['ESDV', 'SDV', 'XV', 'ZSO/ZSC'],
      notes: 'Same symbol with FO and tag BDV is a blowdown valve. A dome actuator means a control valve; a circle with M means an MOV. Limit switches (ZSO / ZSC) and the SOV are accessories of this valve, not separate items. Some legends draw a gate body instead of a ball; the ESDV tag decides.',
      datasheet: { form: 'Actuated on/off valve datasheet (API 6D / ISO 14313 + actuator sheet, IEC 61508 SIL data)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'blowdown-valve': {
    svg: svg('0 0 120 110', stubs(80) + bowtie(60, 80, 30, 16, FILL) + C(60, 80, 8, WHITE) + P('M60 72V44') + R(42, 22, 36, 22) + P('M78 33h10') + R(88, 25, 16, 16) + T(96, 38, 'S', 12) + T(60, 107, 'FO', 11)),
    e: {
      standard: 'ISA 5.1 (actuator) on an ISO 10628-2 ball valve body; API 521 depressuring',
      drawn: 'Actuated ball valve like an ESDV (rectangular spring-return actuator, solenoid box) but marked FO, usually drawn black-filled or marked NC because it is normally closed. It sits on a line from the vessel or compressor to the flare header, often followed by a restriction orifice (RO).',
      tags: ['BDV'],
      isa: ['BDV', 'XV', 'ZSO/ZSC'],
      notes: 'Tell it from an ESDV by the FO mark, the flare (FL / BD) line it sits on and the BDV tag. The restriction orifice downstream is drawn as a pair of short bars across the line (like an orifice plate) tagged RO.',
      datasheet: { form: 'Blowdown valve datasheet (API 6D + actuator sheet, API 521 depressuring case)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'control-valve': {
    svg: svg('0 0 120 90', stubs(70) + bowtie(60, 70, 30, 16) + P('M60 70V36') + P('M38 36h44a22 22 0 0 0-44 0z')),
    e: {
      standard: 'ISA 5.1 / ISO 10628-2 (control valve with diaphragm actuator)',
      drawn: 'Bow-tie body with a stem up to a dome (half circle on a flat base): the spring-diaphragm actuator. A tag bubble such as LV, PV, FV, TV, PCV, LCV, FCV, TCV sits next to it, often with FC / FO / FL and a bypass globe valve drawn around it.',
      tags: ['CV'],
      isa: ['LV', 'PV', 'FV', 'TV', 'PCV', 'LCV', 'FCV', 'TCV', 'HCV', 'PDV'],
      notes: 'Dome = diaphragm actuator (control valve). A rectangle = piston actuator (usually on/off: ESDV / SDV / XV / BDV). A circle with M = MOV. A self-acting regulator (PCV with no signal line, impulse line to the pipe) uses the same body with a sensing line instead of a positioner signal.',
      datasheet: { form: 'Control valve specification sheet (IEC 60534-7 / ISA-75.25 / ISA-TR20.00.01)', fields: { 'Body size': 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'pressure-safety-valve': {
    svg: svg('0 0 110 124', P('M46 98v22M80 66h26') + P('M26 98h40L46 66zM80 46v40L46 66z') + P('M46 66v-8l-11-5 22-7-22-7 22-7-22-7 11-5v-4M33 16h26')),
    e: {
      standard: 'ISO 10628-2 / PIP PIC001 / ISA 5.1',
      drawn: 'Angle body: one triangle pointing up from the inlet below and one pointing in from the outlet on the side, meeting at a right angle, with a zig-zag spring rising from the meeting point to a short cap line. The set pressure and orifice letter (e.g. 3K4, set 42 barg) are written beside it.',
      tags: ['PSV', 'PRV', 'TSV', 'RV'],
      isa: ['PSV', 'PRV', 'TSV', 'PSE (rupture disc)'],
      notes: 'The spring zig-zag tells it from a check valve or a plain angle valve. A rupture disc (PSE) is drawn as a curved disc between flanges with no spring. Size code like 3K4 means 3" inlet, K orifice, 4" outlet. The outlet line goes to the flare header (FL / RV) or to atmosphere; on a pilot-operated PSV a small pilot box is drawn beside the spring.',
      datasheet: { form: 'Pressure relief valve datasheet (API 526 / API 520, ISA-TR20.00.01 form)', fields: { 'Orifice letter': 'orifice', 'Inlet flange rating': 'inletRating', Bonnet: 'bonnet', 'Lifting lever': 'lever', 'Balanced bellows': 'bellows', ...tagF } },
    },
  },
  'globe-valve': {
    svg: svg('0 0 120 80', body() + C(60, 50, 6, FILL) + wheel(60, 50, 22)),
    e: {
      standard: ISO,
      drawn: 'Bow-tie across the line with a solid black dot at the centre where the triangles meet, and a handwheel stem with a T. Often found as the bypass around a control valve or as a throttling valve.',
      tags: ['HV', 'HCV'],
      notes: 'Solid dot = globe; open circle = ball; plain bow-tie = gate. A bow-tie with a dome actuator is a control valve, which is a globe body too: the actuator decides.',
      datasheet: { form: 'Globe valve datasheet (API 623 / BS 1873 / ASME B16.34)', fields: { Size: 'nps', 'Pressure class': 'rating', Operator: 'operator', ...tagF } },
    },
  },
  'swing-check-valve': {
    svg: svg('0 0 120 80', stubs() + P('M30 34v32l30-16z') + P('M90 34v32L60 50z', FILL) + P('M44 20h30M66 14l8 6-8 6', THIN)),
    e: {
      standard: ISO,
      drawn: 'Bow-tie with one triangle filled black (the downstream half) and often a small arrow showing the free-flow direction. Some legends draw a single triangle pointing at a bar instead.',
      tags: ['CHV', 'NRV'],
      notes: 'P&IDs rarely distinguish swing, dual-plate and piston checks: read the valve code in the line class or the valve datasheet. Flow is allowed in the direction the arrow (or the open triangle) points.',
      datasheet: { form: 'Check valve datasheet (API 6D / BS 1868 / ASME B16.34)', fields: { Size: 'nps', 'Pressure class': 'rating', 'Lever and counterweight': 'counterweight', ...tagF } },
    },
  },
  'dual-plate-check-valve': {
    svg: svg('0 0 120 80', stubs(50, 4, 36, 84, 116) + P('M36 50h4M68 50h16') + P('M36 30v40M84 30v40') + P('M40 36v28l28-14z') + P('M68 34v32', 'stroke-width="4"') + P('M50 18h24M66 12l8 6-8 6', THIN)),
    e: {
      standard: 'ISO 14617-8 non-return symbol / PIP PIC001',
      drawn: 'Non-return symbol (a triangle pointing at a bar across the line) squeezed between two flange marks, because the wafer body sits between the pipe flanges. Many legends just use the general check-valve bow-tie with one half filled.',
      tags: ['CHV', 'NRV'],
      notes: 'Wafer-type (API 594) is usually only visible from the valve code or a "W" / "DP" note. Treat any check-valve symbol on a line ≥ NPS 3 in water or gas service with a wafer valve code as this component; otherwise use swing-check-valve.',
      datasheet: { form: 'Wafer check valve datasheet (API 594 Type A)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'butterfly-valve': {
    svg: svg('0 0 120 80', stubs() + bowtie(60, 50, 30, 16) + P('M60 28v44') + C(60, 50, 4, FILL) + P('M60 28V20M48 20h24')),
    e: {
      standard: ISO,
      drawn: 'Bow-tie with a straight bar through the centre at right angles to the line (the disc), often with a dot at its middle. Older legends draw two vertical lines with a diagonal between them.',
      tags: ['HV', 'BFV'],
      notes: 'Bar through the centre = butterfly; circle = ball; filled dot = globe; two close parallel bars = knife gate. Common in seawater, cooling and firewater lines.',
      datasheet: { form: 'Butterfly valve datasheet (API 609 / ISO 5752 / EN 593)', fields: { Size: 'nps', 'Pressure class': 'rating', 'Body style': 'style', Operator: 'operator', ...tagF } },
    },
  },
  'plug-valve': {
    svg: svg('0 0 120 80', body() + R(54, 40, 12, 20, WHITE) + P('M60 40V22M48 22h24')),
    e: {
      standard: ISO,
      drawn: 'Bow-tie with a small rectangle (the plug) at the centre where the triangles meet; manual plug valves show a wrench or T on the stem.',
      tags: ['HV'],
      notes: 'Legends vary: some draw a plug valve as a bow-tie with a filled triangle-in-circle, others as a ball valve with "P" or "PLUG". Check the legend; the valve code in the line class confirms it.',
      datasheet: { form: 'Plug valve datasheet (API 599 / API 6D)', fields: { Size: 'nps', 'Pressure class': 'rating', Operator: 'operator', ...tagF } },
    },
  },
  'motor-operated-valve': {
    svg: svg('0 0 120 100', stubs(76) + bowtie(60, 76, 30, 16) + P('M60 76V48') + C(60, 30, 18) + T(60, 36, 'M', 16)),
    e: {
      standard: 'ISA 5.1 (electric motor actuator) on an ISO 10628-2 gate body',
      drawn: 'Valve bow-tie with a stem to a circle containing M: the electric motor actuator. The tag bubble is usually MOV, XV or HV, and the valve fails in place (FL / FAI).',
      tags: ['MOV', 'XV'],
      isa: ['MOV', 'XV', 'HV', 'ZSO/ZSC'],
      notes: 'Circle with M = motor actuator; dome = diaphragm (control valve); rectangle = piston or spring-return (ESDV / BDV). A square with "M" is used by some legends for the same thing.',
      datasheet: { form: 'Valve datasheet (API 600) + electric actuator datasheet (ISO 5210 / IEC 60034)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'needle-valve': {
    svg: svg('0 0 100 80', stubs(54, 4, 30, 70, 96) + bowtie(50, 54, 20, 12) + P('M50 54V18M40 18h20') + P('M45 34h10l-5 12z', FILL)),
    e: {
      standard: ISO,
      drawn: 'Small bow-tie on an instrument, sample, vent or drain line (NPS 1 and below) with a stem ending in a pointed needle at the seat; often unlabelled, next to a gauge or transmitter.',
      tags: ['HV'],
      notes: 'Usually drawn smaller than line valves and attached to instrument tubing. Many P&IDs show instrument root and manifold valves only as a generic small gate symbol, or not at all; treat them as detail unless asked.',
      datasheet: { form: 'Instrument valve datasheet (MSS SP-99 / ASME B16.34)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'check-valve-piston': {
    svg: svg('0 0 120 80', stubs() + P('M30 34v32l30-16z') + P('M90 34v32L60 50z', FILL) + C(60, 50, 6, WHITE) + P('M44 20h30M66 14l8 6-8 6', THIN)),
    e: {
      standard: ISO,
      drawn: 'Check-valve bow-tie (downstream half filled, flow arrow) with the globe-pattern dot at the centre on some legends; on most P&IDs it is drawn exactly like any check valve.',
      tags: ['CHV', 'NRV'],
      notes: 'Identify it from the valve code (lift / piston check, usually small-bore or high-pressure, NPS 2 and below) rather than the symbol. Swing and dual-plate checks use the same base symbol.',
      datasheet: { form: 'Check valve datasheet (BS 1868 / API 602 / ASME B16.34)', fields: { Size: 'nps', 'Pressure class': 'rating', ...tagF } },
    },
  },
  'knife-gate-valve': {
    svg: svg('0 0 120 80', body() + P('M57 26v48M63 26v48') + P('M60 26V18M48 18h24')),
    e: {
      standard: ISO,
      drawn: 'Gate-valve bow-tie with a thin slab (two close parallel bars) drawn through the centre, standing proud of the body, and a handwheel stem.',
      tags: ['HV'],
      notes: 'Legends vary: some show a knife gate as a plain gate bow-tie with "KG" written beside it. A single bar through the centre is a butterfly. Typical in slurry, sand, drain and low-pressure water service.',
      datasheet: { form: 'Knife gate valve datasheet (MSS SP-81)', fields: { Size: 'nps', ...tagF } },
    },
  },
}
