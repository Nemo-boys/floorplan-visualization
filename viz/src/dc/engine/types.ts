/* Data center model. Units: millimetres for geometry (origin bottom-left, x east, y north, the viewer's
   convention), kW for power and heat, US dollars for money. Everything here is plain data: no DOM, no three.js. */

export type Cooling = 'liquid' | 'hybrid' | 'air';
export type Redundancy = 'N' | 'N+1' | '2N';

/* What the person asked for, read from the brief and the simple controls. */
export interface Basis {
  itKw: number; // IT load the building must carry
  cooling: Cooling | null; // null: compare all three
  coolingRedundancy: Redundancy;
  powerRedundancy: Redundancy;
  priceKwh: number; // electricity, $/kWh
  years: number; // cost horizon
  utilization: number; // average IT load as a share of the design load
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomType =
  | 'data_hall'
  | 'ups_room'
  | 'battery_room'
  | 'electrical_room'
  | 'mechanical_room'
  | 'mmr'
  | 'noc'
  | 'office'
  | 'staging'
  | 'loading_dock'
  | 'storage'
  | 'corridor'
  | 'generator_yard'
  | 'cooling_yard';

export interface Room extends Rect {
  id: string;
  type: RoomType;
  name: string;
  outdoor: boolean;
}

export interface Door {
  id: string;
  rooms: [string, string]; // second is 'outside' for exterior doors
  x: number; // centre of the opening
  y: number;
  width: number;
  axis: 'x' | 'y'; // the wall the door sits in runs along this axis
}

export type EquipKind =
  | 'rack'
  | 'cdu'
  | 'crah'
  | 'pdu'
  | 'ups'
  | 'battery'
  | 'switchgear'
  | 'generator'
  | 'transformer'
  | 'drycooler';

export type Facing = 'N' | 'S' | 'E' | 'W';

export interface Equip extends Rect {
  id: string;
  kind: EquipKind;
  room: string;
  height: number; // mm
  facing: Facing; // the front (air intake for racks)
  label: string;
  kw?: number; // rack design load
  capacityKw?: number; // units, UPS modules, generators, PDUs
  row?: string;
  side?: 'A' | 'B'; // power path
}

export interface Row {
  id: string;
  hall: string;
  facing: Facing;
  racks: string[];
  units: string[]; // in-row cooling units
  pdus: string[];
  rect: Rect;
}

export interface Aisle {
  id: string;
  hall: string;
  kind: 'cold' | 'hot';
  rect: Rect;
}

export interface RackProfile {
  key: Cooling;
  name: string; // plain language
  hardware: string; // what kind of machine, "-class" because these are planning profiles
  kw: number;
  depth: number;
  weightKg: number;
  gpus: number;
  liquidShare: number; // share of heat that leaves through liquid (CDUs)
  itCost: number; // $ per rack, estimate
}

/* One generated option: rooms, equipment and the numbers derived from them. */
export interface Design {
  id: string;
  title: string; // "Liquid-cooled"
  summary: string; // one plain sentence
  basis: Basis;
  profile: RackProfile;
  site: Rect;
  building: Rect;
  rooms: Room[];
  doors: Door[];
  equipment: Equip[];
  rows: Row[];
  aisles: Aisle[];
  itKw: number; // installed rack load (racks x kW)
  racks: number;
}
