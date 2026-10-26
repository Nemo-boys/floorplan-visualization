/* Plain-language explanations, written so someone new to data centers knows what each thing is for. */
import type { EquipKind, RoomType } from '../engine/types';

export const ROOM_HELP: Record<RoomType, string> = {
  data_hall: 'Where the computers live. Racks stand in rows: their fronts breathe cold air from one aisle and blow hot air out the back into the next.',
  ups_room: 'Big battery-backed power units. If the grid flickers, they keep the computers running until the generators start, about 10–15 seconds later.',
  battery_room: 'The batteries behind the UPS units. Kept apart from the computers because batteries are a fire risk.',
  electrical_room: 'Switchgear: giant circuit breakers that route power from the grid or the generators to the UPS units.',
  mechanical_room: 'Pumps and heat exchangers that move water between the halls and the outdoor coolers.',
  mmr: 'Where internet fibre from outside carriers enters the building and connects to the network.',
  noc: 'The control room. Staff watch power, cooling and the network here, around the clock.',
  office: 'Desks and meeting rooms for the people who run the site.',
  staging: 'New racks are unpacked and tested here before they roll into a hall.',
  loading_dock: 'Trucks deliver racks and spare parts here.',
  storage: 'Spare parts, so a broken unit can be swapped quickly.',
  corridor: 'Wide hallways, big enough to wheel a crated rack from the loading dock to the halls.',
  generator_yard: 'Diesel generators and grid transformers. The generators take over if the grid fails.',
  cooling_yard: 'Outdoor coolers that dump the heat from the halls into the air.'
};

export const EQUIP_HELP: Record<EquipKind, { name: string; text: string }> = {
  rack: { name: 'Rack', text: 'A cabinet of computers. Its power draw becomes heat that the cooling has to remove.' },
  cdu: { name: 'Liquid cooler (CDU)', text: 'Pumps cool water through pipes to the chips and carries their heat away. Liquid moves heat far better than air.' },
  crah: { name: 'Air handler (CRAH)', text: 'A big fan and cooling coil. It blows cold air into the aisles in front of the racks.' },
  pdu: { name: 'Power panel', text: 'Splits power from the UPS into circuits for each rack in the row.' },
  ups: { name: 'UPS block', text: 'Keeps power steady and bridges the seconds between a grid failure and the generators starting.' },
  battery: { name: 'Battery string', text: 'Lithium-ion batteries that feed the UPS for a few minutes if the power goes out.' },
  switchgear: { name: 'Switchgear', text: 'Heavy-duty breakers that switch the site between grid and generator power.' },
  generator: { name: 'Generator', text: 'A diesel engine and alternator in a container. Starts automatically when the grid fails.' },
  transformer: { name: 'Transformer', text: 'Steps the grid’s high voltage down to what the building uses.' },
  drycooler: { name: 'Outdoor cooler', text: 'Big fans blowing over radiators, like a car radiator the size of a truck. Heat from the halls leaves the building here.' }
};

/* PUE in one sentence. */
export const pueSentence = (pue: number): string =>
  `For every 1 kW the computers use, about ${Math.round((pue - 1) * 100) / 100} kW more goes to cooling and power losses.`;
