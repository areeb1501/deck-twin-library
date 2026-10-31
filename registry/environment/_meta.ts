import { defineMeta } from '../meta'

export default defineMeta([
  {
    name: 'ocean',
    title: 'Ocean',
    file: 'ocean.tsx',
    export: 'Ocean',
    description:
      'Animated open sea for offshore scenes, with six Gerstner swell components scaled by the significant wave height. Wind chop and whitecaps are carried in the per-pixel normals, and a physical water material (IOR 1.333) provides Fresnel, sun glints and environment reflections. Foam rings form around legs, risers and piles (`foam`: [x, z, radius]). The surface is slightly transparent looking down, so an underwater jacket remains visible. The origin is at mean sea level (y = 0), and the polar LOD grid follows the camera and respects scene fog.',
    standards: ['Gerstner (trochoidal) waves'],
    tags: ['sea', 'water', 'waves', 'ocean', 'offshore', 'environment'],
    anchor: 'base',
    params: [
      { key: 'waveHeight', label: 'Wave height Hs', type: 'number', min: 0, max: 6, step: 0.1, unit: 'm' },
      { key: 'wind', label: 'Wind', type: 'number', min: 0, max: 30, step: 0.5, unit: 'm/s' },
      { key: 'opacity', label: 'Opacity (looking down)', type: 'number', min: 0.4, max: 1, step: 0.02 },
      { key: 'speed', label: 'Speed', type: 'number', min: 0, max: 3, step: 0.1 },
      { key: 'color', label: 'Water colour', type: 'color' },
      { key: 'night', label: 'Night', type: 'bool' },
      { key: 'radius', label: 'Radius', type: 'number', min: 200, max: 8000, step: 100, unit: 'm' },
      { key: 'follow', label: 'Follow camera', type: 'bool' },
    ],
    viewer: { env: 'day', view: [1, 0.24, 1.1], frame: { target: [0, 0, 0], radius: 16 } },
  },
  {
    name: 'sky',
    title: 'Sky and lights',
    file: 'sky.tsx',
    export: 'Sky',
    description:
      'Drop-in sky and lighting rig with day and night modes. Day mode has a physical (Preetham) sky, a warm sun with soft shadows, a hemisphere fill, an offline environment map baked from the sky and Lightformers (no network), exponential haze and a horizon band that hides the sea and sky seam. Night mode has a star dome with a moon in the sun direction, cool moonlight, a warm fill standing in for deck floodlights (`deckLights`) and a dark environment map. Set `lights: false` to keep your own lights; `preview` adds a reference pile with chrome and matte spheres standing in the sea.',
    standards: ['Preetham sky model (three.js Sky)'],
    tags: ['sky', 'sun', 'moon', 'stars', 'night', 'lighting', 'environment', 'fog'],
    anchor: 'base',
    params: [
      { key: 'mode', label: 'Mode', type: 'select', options: ['day', 'night'] },
      { key: 'elevation', label: 'Sun / moon elevation', type: 'number', min: 2, max: 85, step: 1, unit: '°' },
      { key: 'azimuth', label: 'Sun / moon bearing', type: 'number', min: 0, max: 360, step: 1, unit: '°' },
      { key: 'haze', label: 'Haze', type: 'number', min: 0, max: 4, step: 0.1 },
      { key: 'deckLights', label: 'Night deck lights', type: 'number', min: 0, max: 2, step: 0.1 },
      { key: 'stars', label: 'Stars', type: 'bool' },
      { key: 'lights', label: 'Lights', type: 'bool' },
      { key: 'preview', label: 'Reference scene', type: 'bool' },
    ],
    preview: { preview: true },
    viewer: { env: 'none', view: [1, 0.22, 1.1] },
  },
])
