import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, bowtie, bubble } from './h.ts'
const FG = 'F&G layout convention (NFPA 170 / ISO 7240-style plan symbols; legends vary by company)'
const tagF = { 'Tag number': 'tag' }
const sq = (s: string, size = 22) => R(30, 20, 60, 60) + T(60, 50 + size * 0.36, s, size)
const ci = (s: string, size = 22) => C(60, 50, 30) + T(60, 50 + size * 0.36, s, size)
export default {
  'point-gas-detector': {
    svg: svg('0 0 120 100', ci('G') + T(60, 96, 'HC', 12, 'normal')),
    e: {
      standard: FG + '; ISA 5.1 AT / GD tag',
      drawn: 'On F&G layouts: a circle (or hexagon / triangle on some legends) with G, GD or the gas (HC, H2S, H2) inside or beside it, placed at the detector position with its tag. On cause & effect and some P&IDs it is an AT / GD bubble with the gas and LEL set points written beside it.',
      tags: ['GD', 'GDH', 'GDT'],
      isa: ['AT', 'GD', 'AE'],
      notes: 'Point detectors are single symbols; open-path detectors are a pair joined by a beam line. Toxic (H2S, CO) detectors use the same symbol with the gas name; a separate toxic-gas-detector component covers electrochemical cells.',
      datasheet: { form: 'Gas detector datasheet (IEC 60079-29-1 / -29-2)', fields: { Mounting: 'mount', 'Mounting height': 'height', 'Sensor type': 'sensor', 'Target gas': 'gas', 'Sunshade / deluge hood': 'sunshade', 'Integral junction box': 'junction', ...tagF } },
    },
  },
  'flame-detector': {
    svg: svg('0 0 144 100', C(30, 50, 22) + T(30, 58, 'F', 22) + P('M52 50l82-38M52 50l82 38', DASH) + P('M112 22a60 60 0 0 1 0 56', THIN)),
    e: {
      standard: FG + '; cone of vision per NORSOK Z-001 / ISA TR84.00.07 mapping practice',
      drawn: 'A detector symbol (circle with F or FD, or a small triangle) with a wedge or cone drawn from it showing the field of view, aimed into the area it covers; the tilt angle is often written beside it.',
      tags: ['FD', 'IR3', 'UV/IR'],
      isa: ['BE', 'BT', 'FD'],
      notes: 'The cone of vision identifies it. A pair of symbols joined by a beam line is an open-path gas detector. ISA uses B (burner / combustion) for flame: BE / BT / BSH on some P&IDs.',
      datasheet: { form: 'Flame detector datasheet (EN 54-10 / FM 3260)', fields: { Mounting: 'mount', 'Mounting height': 'height', 'Tilt (down)': 'tilt', 'Pan': 'pan', 'Weather hood': 'hood', ...tagF } },
    },
  },
  'open-path-gas-detector': {
    svg: svg('0 0 180 80', R(6, 24, 32, 32) + T(22, 47, 'Tx', 13) + R(142, 24, 32, 32) + T(158, 47, 'Rx', 13) + P('M38 40h96', DASH) + P('M126 34l10 6-10 6', FILL)),
    e: {
      standard: FG + '; IEC 60079-29-4',
      drawn: 'Two symbols, a transmitter and a receiver, at the two ends of a straight dashed beam line across the area, often labelled OGD with the path length and LEL·m set points.',
      tags: ['OGD', 'OPGD', 'GD'],
      isa: ['AT', 'GD'],
      notes: 'The beam line between a pair of symbols identifies it; a single symbol with a cone is a flame detector. Some legends draw an arrow from transmitter to receiver.',
      datasheet: { form: 'Open-path gas detector datasheet (IEC 60079-29-4)', fields: { Mounting: 'mount', 'Path length': 'separation', 'Mounting height': 'height', ...tagF } },
    },
  },
  'manual-call-point': {
    svg: svg('0 0 120 100', R(30, 20, 60, 60) + C(60, 50, 12, FILL)),
    e: {
      standard: FG + '; EN 54-11, ISO 7010 sign',
      drawn: 'A square with a filled circle (or a small square) in the middle, at the call point position on escape routes and exits, labelled MAC / MCP; ESD push-buttons use the same box marked ESD or with a different fill.',
      tags: ['MAC', 'MCP', 'ESD PB'],
      isa: ['HS', 'HAS'],
      notes: 'NFPA-style US legends draw the pull station as a square with F or a hand. On P&IDs and C&E charts a manual call point is an HS bubble feeding the F&G logic.',
      datasheet: { form: 'Manual call point datasheet (EN 54-11)', fields: { Type: 'kind', Mounting: 'mount', 'Mounting height': 'height', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  'alarm-beacon': {
    svg: svg('0 0 120 120', C(60, 36, 18) + P('M47 23l26 26M73 23L47 49', 'stroke-width="2"') + P('M60 6V0M28 36h-8M92 36h8M36 14l-6-6M84 14l6-6', THIN) + P('M46 72h28l12-10v40L74 92H46z') + P('M60 54v18')),
    e: {
      standard: 'IEC 60617 (lamp, horn) / ' + FG,
      drawn: 'On F&G and PA/GA layouts: a lamp symbol (circle with ×) with short light rays for the beacon, and a horn outline (trumpet) for the sounder, labelled with the colour and the GA / F&G status it shows.',
      tags: ['XL', 'XA', 'BCN', 'SNDR'],
      isa: ['XL', 'XA', 'YL'],
      notes: 'Circle with × alone is a general lamp (lighting); the rays and colour note mark a status beacon. Sounders alone are a horn outline or a bell.',
      datasheet: { form: 'Visual / audible alarm device datasheet (EN 54-23 / EN 54-3)', fields: { 'Lens colour': 'colour', Sounder: 'sounder', Mounting: 'mount', 'Mounting height': 'height', 'Flash rate': 'flash', ...tagF } },
    },
  },
  'deluge-valve-skid': {
    svg: svg('0 0 200 110', P('M4 80h22M58 80h22M120 80h22M174 80h22') + bowtie(42, 80, 16, 12) + bowtie(158, 80, 16, 12) + bowtie(100, 80, 20, 14) + P('M100 80V50') + R(86, 26, 28, 24) + T(100, 44, 'S', 14) + T(42, 106, 'LO', 11) + T(158, 106, 'LO', 11)),
    e: {
      standard: 'ISO 10628-2 valves + NFPA 15 / NFPA 170 deluge convention',
      drawn: 'On the firewater P&ID: a deluge valve (valve body with a solenoid release box, tagged DV / XV) between two locked-open (LO) isolation valves, feeding a dry deluge pipe network drawn to the nozzles; often inside a dashed skid boundary.',
      tags: ['DV', 'XV', 'SDV'],
      isa: ['XV', 'XY (solenoid)', 'PSL (trip)'],
      notes: 'Look for the firewater (FW) line, the LO marks and the dry pipe downstream. A plain ESDV on a process line is esd-valve. Some legends draw the deluge valve as a check-valve body with a clapper.',
      datasheet: { form: 'Deluge valve datasheet (NFPA 15 / EN 12259-9)', fields: { Size: 'nps', 'Pressure class': 'rating', 'Isolation valves': 'isolation', 'Skid frame': 'frame', ...tagF } },
    },
  },
  'fire-monitor': {
    svg: svg('0 0 120 120', P('M40 116V72') + C(40, 62, 10) + P('M48 56l40-28M54 66l40-28M88 28l6 10') + P('M30 116h20') + P('M86 74a50 50 0 0 0 0-70', DASH + ' ' + THIN)),
    e: {
      standard: FG + '; NFPA 170-style fire protection symbol',
      drawn: 'On fire-protection layouts: a riser with a swivel (small circle) and a tapered nozzle barrel, sometimes with an arc showing the throw or the oscillation sector; on the firewater P&ID it is a branch off the ring main with an LO isolation valve and FM / MON tag.',
      tags: ['FM', 'MON'],
      notes: 'A hose reel shows a drum with coiled hose; a hydrant is a riser with outlets and no barrel. Foam monitors are the same symbol with a foam (AFFF) supply.',
      datasheet: { form: 'Fire monitor datasheet (EN 15767 / NFPA 15)', fields: { 'Inlet size': 'nps', 'Pressure class': 'rating', 'Riser height': 'height', 'Oscillating': 'oscillating', ...tagF } },
    },
  },
  'hose-reel': {
    svg: svg('0 0 120 110', C(50, 50, 32) + C(50, 50, 18) + C(50, 50, 5, FILL) + P('M82 50h20l14-6v12l-14-6') + P('M50 82v24')),
    e: {
      standard: FG,
      drawn: 'Circle with a smaller concentric circle (the drum) and the hose leaving to a nozzle, labelled HR; on the firewater P&ID a small branch off the ring main with a ball valve and HR tag.',
      tags: ['HR', 'FHR'],
      notes: 'Concentric circles = reel. A riser with a nozzle barrel is a fire monitor; a box with letters FE or a cylinder outline is an extinguisher.',
      datasheet: { form: 'Fire hose reel datasheet (EN 671-1)', fields: { 'Reel style': 'style', 'Inlet size': 'nps', 'Pressure class': 'rating', 'Hose length': 'hoseLength', ...tagF } },
    },
  },
  'safety-shower': {
    svg: svg('0 0 120 130', P('M40 126V30h20') + P('M50 30h28a14 10 0 0 1-28 0z') + P('M56 50l-4 14M64 52v14M72 50l4 14', DASH + ' ' + THIN) + P('M40 84h26') + P('M66 78a14 8 0 0 0 28 0z') + P('M28 126h24')),
    e: {
      standard: 'Layout plan convention; ISO 7010 sign; ANSI Z358.1',
      drawn: 'On layouts: a shower head (dome) on a pipe with spray lines and an eyewash bowl, or a box marked SS / EW with the ISO 7010 green sign; on utility P&IDs a small potable-water branch ending in an SS tag.',
      tags: ['SS', 'EW', 'SSEW'],
      notes: 'Placed near chemical injection, battery rooms and laboratories. A box marked EW alone is a standalone eyewash.',
      datasheet: { form: 'Emergency shower and eyewash datasheet (ANSI Z358.1 / EN 15154)', fields: { 'Inlet size': 'nps', 'Shower head height': 'headHeight', 'Foot treadle': 'foot', 'Flow alarm': 'alarm', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  'fire-extinguisher': {
    svg: svg('0 0 100 120', P('M34 40a16 16 0 0 1 32 0v72H34z') + P('M44 24v-8h14M58 16l14 10v16') + T(50, 90, 'FE', 14)),
    e: {
      standard: FG + '; ISO 7010 safety sign',
      drawn: 'On fire-protection layouts: a small extinguisher outline or a triangle / square with the agent letters (DP, CO2, FOAM) and size (e.g. 9 kg); wheeled units are marked W or with wheels.',
      tags: ['FE', 'EXT'],
      notes: 'Legends vary widely; read the letters for the agent and capacity. Not shown on P&IDs.',
      datasheet: { form: 'Portable extinguisher schedule (EN 3-7 / NFPA 10)', fields: { Unit: 'unit', Agent: 'agent', Capacity: 'capacity', Quantity: 'count', 'Cabinet door': 'door', Mounting: 'mount', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  windsock: {
    svg: svg('0 0 140 120', P('M30 116V16M18 116h24') + P('M30 16l90 12v20L30 56z') + P('M60 20v32M90 24v28', THIN)),
    e: {
      standard: 'Layout plan convention; CAP 437 / ICAO Annex 14 helideck marking',
      drawn: 'On helideck and platform layouts: a mast with a truncated cone (the sock) streaming from it, sometimes only a small circle at the mast position labelled WS.',
      tags: ['WS'],
      notes: 'Located clear of the helideck obstacle-free sector, visible from the approach. Not shown on P&IDs.',
      datasheet: { form: 'Helideck windsock specification (CAP 437 / ICAO Annex 14 Vol II)', fields: { 'Mast height': 'height', 'Sock length': 'length', Colour: 'colour', Lighting: 'lighting', ...tagF } },
    },
  },
  'heat-detector': {
    svg: svg('0 0 120 100', ci('H')),
    e: {
      standard: FG,
      drawn: 'Circle (or square on NFPA-style legends) with H or HD, placed on the ceiling plan of enclosed modules or near specific equipment (turbine hoods, battery rooms); fixed-temperature or rate-of-rise noted beside it.',
      tags: ['HD', 'TSH'],
      isa: ['TSH', 'TAH'],
      notes: 'Letters inside the circle distinguish detector types: H heat, S smoke, F flame, G gas. On some P&IDs heat detection is a TSH bubble or a fusible-plug loop on the instrument air.',
      datasheet: { form: 'Heat detector datasheet (EN 54-5)', fields: { Mounting: 'mount', 'Drop rod length': 'drop', 'Rated temperature': 'rating', ...tagF } },
    },
  },
  'smoke-detector': {
    svg: svg('0 0 120 100', ci('S')),
    e: {
      standard: FG,
      drawn: 'Circle (or square) with S or SD on the ceiling plan of enclosed rooms: LER, CCR, accommodation and HVAC ducts (duct detectors marked D).',
      tags: ['SD'],
      notes: 'Same family as the heat detector: read the letter. BS-style legends draw a smoke detector as a circle with S; NFPA-style may use a square or SD in a circle.',
      datasheet: { form: 'Smoke detector datasheet (EN 54-7)', fields: { 'Drop rod length': 'drop', 'Remote indicator LED': 'alarm', ...tagF } },
    },
  },
  'life-ring': {
    svg: svg('0 0 120 120', C(60, 60, 44) + C(60, 60, 26) + P('M60 16v18M60 86v18M16 60h18M86 60h18', 'stroke-width="7"')),
    e: {
      standard: 'Layout plan convention (lifesaving appliance plan); SOLAS LSA Code, ISO 7010 sign',
      drawn: 'On escape and lifesaving appliance plans: a ring (two concentric circles) with four bands, at each lifebuoy station; a light or smoke signal is marked L / S beside it.',
      tags: ['LB'],
      notes: 'Only on escape / lifesaving plans, never on P&IDs.',
      datasheet: { form: 'Lifesaving appliance schedule (SOLAS LSA Code 2.1)', fields: { Mounting: 'mount', 'Mounting height': 'height', 'Light / smoke signal': 'signal', 'Station name': 'name', ...tagF } },
    },
  },
}
