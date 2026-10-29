import { svg, T, P, C, R, FILL, WHITE, THIN } from './h.ts'
export default {
  'small-bore-fitting': {
    svg: svg('0 0 130 110', P('M4 70h40M86 70h40') + R(44, 54, 42, 32) + P('M50 70h30', THIN) + P('M65 54V8') + P('M57 54V36h16v18', THIN) + P('M40 64v12M90 64v12', 'stroke-width="2"')),
    e: {
      standard: 'Isometric / piping class convention (ASME B16.11); P&IDs show only the connection',
      drawn: 'Not drawn as a separate item on P&IDs: small-bore vents, drains and instrument connections appear as short ¾"–2" lines off the main line. On isometrics the forged fitting (elbow, tee, coupling, union, cap, plug, swage) is drawn with SW or THD weld / thread marks and called up in the bill of materials.',
      tags: ['SW', 'THD', 'SB'],
      notes: 'A short NPS ≤ 2 branch with a valve and cap or plug (vent / drain) on a P&ID is made of these fittings. Class 3000 / 6000 comes from the piping class.',
      datasheet: { form: 'Piping class / small-bore bill of materials (ASME B16.11, MSS SP-83 / SP-95)', fields: { 'Fitting type': 'kind', 'End connection': 'end', 'Nominal size': 'nps', 'Reduced size (swage)': 'smallNps', 'Pressure class': 'pressureClass', 'Pipe schedule': 'schedule' } },
    },
  },
  'pipe-clamp': {
    svg: svg('0 0 120 140', P('M60 4v30') + C(60, 40, 6) + P('M30 54h60') + C(60, 84, 24) + P('M36 84a24 24 0 0 1 48 0', 'stroke-width="5"') + P('M36 84V54M84 84V54') + P('M44 58v-8M76 58v-8', THIN) + P('M50 112h20', 'stroke-width="4"')),
    e: {
      standard: 'Piping support convention (isometric / support detail); MSS SP-58 / SP-69',
      drawn: 'Not on P&IDs. On support drawings and isometrics a hanger is marked at the support point with its type (e.g. a rod hanger with a clamp, MSS type 3 or 4), and in detail the pipe circle is shown gripped by the clamp straps hanging from a rod.',
      tags: ['PS', 'H', 'HGR'],
      notes: 'A clamp hanging on a rod is a hanger; a shoe on steel is a pipe-support. Riser clamps carry vertical pipe at floor penetrations.',
      datasheet: { form: 'Pipe support schedule (MSS SP-58 / SP-69)', fields: { 'Clamp type': 'type', 'Pipe size': 'nps', 'Hanger rod length': 'rod', Finish: 'finish' } },
    },
  },
}
