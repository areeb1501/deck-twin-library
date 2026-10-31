// The home hero's plan drawing: its data, and the sheet both the prerendered drawing and the 3D camera frame in metres. No three.js here.
import data from '../pages/homePlan.json'

export interface PlanItem {
  tag: string
  component: string
  x: number
  z: number
  w: number
  d: number
}
export interface PlanLine {
  tag: string
  path: number[][]
}
export interface PlanEnd {
  label: string
  x: number
  z: number
}

export const PLAN = data as { items: PlanItem[]; lines: PlanLine[]; ends: PlanEnd[] }

/** the drawn sheet, world x and z in metres */
export const SHEET = { cx: 0, cz: -3.5, w: 80, h: 47 }
