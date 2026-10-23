/* Materials and the textures they use. */
import * as THREE from 'three';
import { r3, type Mat } from './r3';
import { carpetTex, chevronTex, gradientTex, speckleTex, texFrom, woodTex } from './textures';

export function M(
  color: THREE.ColorRepresentation,
  rough?: number | null,
  metal?: number,
  extra?: THREE.MeshStandardMaterialParameters
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(
    Object.assign(
      { color, roughness: rough == null ? 0.7 : rough, metalness: metal || 0, envMapIntensity: 0.75 },
      extra || {}
    )
  );
}
export function makeMaterials(): void {
  const R3 = r3();
  const floor = (tex: THREE.Texture, rough: number, tint?: string): THREE.MeshStandardMaterial =>
    M(tint || '#ffffff', rough, 0, { map: tex });
  R3.tex = {
    wood: woodTex(),
    vinyl: speckleTex('#eef2ef', ['#c9d3cd', '#b4c3bb', '#ffffff', '#9fb2a8'], 2.0),
    vinylGrey: speckleTex('#e2e5e6', ['#c3c8cb', '#aeb5ba', '#ffffff'], 2.0),
    corridor: speckleTex('#e9e7e2', ['#cfcbc3', '#b9b4aa', '#ffffff', '#a39d92'], 2.4, 4, 'rgba(150,145,135,0.55)'),
    tile: speckleTex('#e8eef1', ['#ffffff', '#cbd5db'], 1.2, 6, 'rgba(160,172,180,0.8)'),
    carpet: carpetTex(),
    ao: texFrom(
      gradientTex(
        [
          [0, '#000'],
          [1, '#fff']
        ],
        4,
        64,
        true
      ),
      1,
      1,
      false
    ),
    chevron: chevronTex()
  };
  R3.mat = {
    floorWood: floor(R3.tex.wood, 0.55),
    floorVinyl: floor(R3.tex.vinyl, 0.42),
    floorGrey: floor(R3.tex.vinylGrey, 0.5),
    floorCorridor: floor(R3.tex.corridor, 0.38),
    floorTile: floor(R3.tex.tile, 0.3),
    floorCarpet: floor(R3.tex.carpet, 1),
    wall: M('#f4f3ef', 0.92),
    wallExt: M('#e8e6e0', 0.95),
    cap: M('#37414a', 0.7),
    base: M('#cfcdc6', 0.95),
    ground: M('#d9ddda', 1),
    paving: M('#c9c5bc', 0.95),
    frame: M('#59636c', 0.42, 0.45),
    sill: M('#e9e8e3', 0.5),
    glass: new THREE.MeshStandardMaterial({
      color: '#bcd6e5',
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
      envMapIntensity: 1.8,
      depthWrite: false
    }),
    door: M('#c69e70', 0.55),
    white: M('#f2f2ef', 0.55),
    wood: M('#c9a376', 0.6),
    woodDark: M('#8a6644', 0.6),
    metal: M('#6a737b', 0.4, 0.6),
    chrome: M('#d8dcdf', 0.22, 1),
    vinylTeal: M('#4a8f99', 0.42),
    fabricBlue: M('#56729a', 0.9),
    fabricSlate: M('#5d6b78', 0.9),
    fabricWarm: M('#b98d63', 0.95),
    fabricMint: M('#8fb8a6', 0.92),
    plant: M('#5b8f4c', 0.85, 0, { flatShading: true }),
    plantDark: M('#3f7041', 0.85, 0, { flatShading: true }),
    pot: M('#e9e5de', 0.6),
    soil: M('#4a3a2c', 1),
    screen: M('#10161c', 0.25, 0.2, { emissive: new THREE.Color('#2b5d8a'), emissiveIntensity: 0.6 }),
    paper: M('#fbfaf6', 0.9),
    ceramic: M('#f7f7f4', 0.16),
    rug: M('#d2c4ae', 1),
    rugInner: M('#c4b59c', 1),
    red: M('#c0392b', 0.5),
    blueBin: M('#3f6fa8', 0.55),
    cardboard: M('#c9a679', 0.9),
    counterTop: M('#e7ebed', 0.32),
    steel: M('#b9c0c6', 0.28, 0.85),
    bag: M('#6d8fb4', 0.9),
    trunk: M('#7a5a3c', 0.9),
    leaf: M('#86b464', 0.85, 0, { flatShading: true }),
    leaf2: M('#64a05a', 0.85, 0, { flatShading: true }),
    hedge: M('#6c9d58', 0.9, 0, { flatShading: true }),
    mattress: M('#eef3f6', 0.8),
    blanket: M('#8fb0cf', 0.9)
  };
  R3.mat.ao = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    alphaMap: R3.tex.ao,
    depthWrite: false
  });
}
export function m2(): Record<string, Mat> {
  return r3().mat;
}
