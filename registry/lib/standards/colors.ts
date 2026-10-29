// RAL Classic paint colours, ISO 14726 / BS 1710 pipe identification and ISO 3864 safety colours. Hex values are approximate sRGB (RAL publishes CIELAB).

export const RAL: Record<string, string> = {
  '1003': '#F9A800', // signal yellow
  '1004': '#E49E00', // golden yellow
  '1007': '#E88C00', // daffodil yellow
  '1018': '#FACA30', // zinc yellow
  '1021': '#F6B600', // rape yellow
  '1023': '#F7B500', // traffic yellow
  '2004': '#E25303', // pure orange
  '2008': '#ED6B21', // bright red orange
  '3000': '#A72920', // flame red
  '3001': '#9B2423', // signal red
  '3020': '#BB1E10', // traffic red
  '5005': '#154889', // signal blue
  '5012': '#0089B6', // light blue
  '5015': '#007CB0', // sky blue
  '6001': '#366735', // emerald green
  '6002': '#325928', // leaf green
  '6005': '#0F4336', // moss green
  '6018': '#48A43F', // yellow green
  '6032': '#237F52', // signal green
  '7001': '#8A9597', // silver grey
  '7004': '#9EA0A1', // signal grey
  '7011': '#555D61', // iron grey
  '7016': '#383E42', // anthracite grey
  '7031': '#5B686D', // blue grey
  '7032': '#B9B9A8', // pebble grey
  '7035': '#CBD0CC', // light grey
  '7037': '#7A7B7A', // dusty grey
  '7038': '#B4B8B0', // agate grey
  '7040': '#9DA3A6', // window grey
  '7042': '#8F9695', // traffic grey A
  '7044': '#B7B3A8', // silk grey
  '9001': '#E9E0D2', // cream
  '9002': '#D7D5CB', // grey white
  '9003': '#ECECE7', // signal white
  '9005': '#0E0E10', // jet black
  '9006': '#A1A1A0', // white aluminium
  '9010': '#F1ECE1', // pure white
  '9016': '#F1F0EA', // traffic white
}

export type Service =
  | 'oil' | 'gas' | 'multiphase' | 'water' | 'seawater' | 'firewater' | 'steam' | 'air' | 'nitrogen'
  | 'chemical' | 'flare' | 'drain' | 'fuel-gas' | 'diesel' | 'potable' | 'cooling'

// band: basic identification colour (oils brown, gases yellow ochre, water green, steam silver grey,
// air light blue, fire red, acids/alkalis violet, other liquids black, fresh water blue). flow: UI colour.
export const SERVICE: Record<Service, { label: string; code: string; band: string; flow: string }> = {
  oil: { label: 'Crude oil', code: 'PO', band: '#7A4A24', flow: '#A8641E' },
  gas: { label: 'Hydrocarbon gas', code: 'PG', band: '#C59A2C', flow: '#F2C230' },
  multiphase: { label: 'Well fluids (multiphase)', code: 'PM', band: '#6B4E2E', flow: '#C98B3A' },
  water: { label: 'Produced water', code: 'PW', band: '#3C7A47', flow: '#3FB6A8' },
  seawater: { label: 'Seawater', code: 'SW', band: '#48A43F', flow: '#2FA36B' },
  firewater: { label: 'Firewater', code: 'FW', band: '#A72920', flow: '#FF3B30' },
  steam: { label: 'Steam', code: 'ST', band: '#A6A9A3', flow: '#E6E6E6' },
  air: { label: 'Instrument / plant air', code: 'IA', band: '#8FB8D8', flow: '#9FD0FF' },
  nitrogen: { label: 'Nitrogen', code: 'NG', band: '#C59A2C', flow: '#7FD1C7' },
  chemical: { label: 'Chemical injection', code: 'CI', band: '#6D4C8A', flow: '#B18CFF' },
  flare: { label: 'Flare / relief', code: 'FL', band: '#C59A2C', flow: '#FF7A2F' },
  drain: { label: 'Closed drain', code: 'CD', band: '#2B2B2B', flow: '#8E8E93' },
  'fuel-gas': { label: 'Fuel gas', code: 'FG', band: '#C59A2C', flow: '#FFD84D' },
  diesel: { label: 'Diesel', code: 'DF', band: '#7A4A24', flow: '#D08A3C' },
  potable: { label: 'Potable water', code: 'DW', band: '#0089B6', flow: '#4AA8FF' },
  cooling: { label: 'Cooling medium', code: 'CM', band: '#3C7A47', flow: '#4AA8E0' },
}

// ISO 3864-4 safety colours (approx sRGB of the RAL references).
export const SAFETY = {
  yellow: '#F9A800', // RAL 1003
  red: '#9B2423', // RAL 3001
  green: '#237F52', // RAL 6032
  blue: '#154889', // RAL 5005
} as const
