/**
 * Nigerian States - Complete list of 36 states + FCT
 * Used for city-tiered pricing configuration
 */

export interface NigerianState {
  name: string;
  capital: string;
  geoPoliticalZone: string;
  code: string;
}

export const NIGERIAN_STATES: NigerianState[] = [
  { name: 'Abia', capital: 'Umuahia', geoPoliticalZone: 'South East', code: 'AB' },
  { name: 'Adamawa', capital: 'Yola', geoPoliticalZone: 'North East', code: 'AD' },
  { name: 'Akwa Ibom', capital: 'Uyo', geoPoliticalZone: 'South South', code: 'AK' },
  { name: 'Anambra', capital: 'Awka', geoPoliticalZone: 'South East', code: 'AN' },
  { name: 'Bauchi', capital: 'Bauchi', geoPoliticalZone: 'North East', code: 'BA' },
  { name: 'Bayelsa', capital: 'Yenagoa', geoPoliticalZone: 'South South', code: 'BY' },
  { name: 'Benue', capital: 'Makurdi', geoPoliticalZone: 'North Central', code: 'BE' },
  { name: 'Borno', capital: 'Maiduguri', geoPoliticalZone: 'North East', code: 'BO' },
  { name: 'Cross River', capital: 'Calabar', geoPoliticalZone: 'South South', code: 'CR' },
  { name: 'Delta', capital: 'Asaba', geoPoliticalZone: 'South South', code: 'DE' },
  { name: 'Ebonyi', capital: 'Abakaliki', geoPoliticalZone: 'South East', code: 'EB' },
  { name: 'Edo', capital: 'Benin City', geoPoliticalZone: 'South South', code: 'ED' },
  { name: 'Ekiti', capital: 'Ado-Ekiti', geoPoliticalZone: 'South West', code: 'EK' },
  { name: 'Enugu', capital: 'Enugu', geoPoliticalZone: 'South East', code: 'EN' },
  { name: 'FCT', capital: 'Abuja', geoPoliticalZone: 'North Central', code: 'FC' },
  { name: 'Gombe', capital: 'Gombe', geoPoliticalZone: 'North East', code: 'GO' },
  { name: 'Imo', capital: 'Owerri', geoPoliticalZone: 'South East', code: 'IM' },
  { name: 'Jigawa', capital: 'Dutse', geoPoliticalZone: 'North West', code: 'JI' },
  { name: 'Kaduna', capital: 'Kaduna', geoPoliticalZone: 'North West', code: 'KD' },
  { name: 'Kano', capital: 'Kano', geoPoliticalZone: 'North West', code: 'KN' },
  { name: 'Katsina', capital: 'Katsina', geoPoliticalZone: 'North West', code: 'KT' },
  { name: 'Kebbi', capital: 'Birnin Kebbi', geoPoliticalZone: 'North West', code: 'KE' },
  { name: 'Kogi', capital: 'Lokoja', geoPoliticalZone: 'North Central', code: 'KO' },
  { name: 'Kwara', capital: 'Ilorin', geoPoliticalZone: 'North Central', code: 'KW' },
  { name: 'Lagos', capital: 'Ikeja', geoPoliticalZone: 'South West', code: 'LA' },
  { name: 'Nasarawa', capital: 'Lafia', geoPoliticalZone: 'North Central', code: 'NA' },
  { name: 'Niger', capital: 'Minna', geoPoliticalZone: 'North Central', code: 'NI' },
  { name: 'Ogun', capital: 'Abeokuta', geoPoliticalZone: 'South West', code: 'OG' },
  { name: 'Ondo', capital: 'Akure', geoPoliticalZone: 'South West', code: 'ON' },
  { name: 'Osun', capital: 'Osogbo', geoPoliticalZone: 'South West', code: 'OS' },
  { name: 'Oyo', capital: 'Ibadan', geoPoliticalZone: 'South West', code: 'OY' },
  { name: 'Plateau', capital: 'Jos', geoPoliticalZone: 'North Central', code: 'PL' },
  { name: 'Rivers', capital: 'Port Harcourt', geoPoliticalZone: 'South South', code: 'RI' },
  { name: 'Sokoto', capital: 'Sokoto', geoPoliticalZone: 'North West', code: 'SO' },
  { name: 'Taraba', capital: 'Jalingo', geoPoliticalZone: 'North East', code: 'TA' },
  { name: 'Yobe', capital: 'Damaturu', geoPoliticalZone: 'North East', code: 'YO' },
  { name: 'Zamfara', capital: 'Gusau', geoPoliticalZone: 'North West', code: 'ZA' }
];

export const GEO_POLITICAL_ZONES: Record<string, string[]> = {
  'North Central': ['Benue', 'FCT', 'Kogi', 'Kwara', 'Nasarawa', 'Niger', 'Plateau'],
  'North East': ['Adamawa', 'Bauchi', 'Borno', 'Gombe', 'Taraba', 'Yobe'],
  'North West': ['Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Sokoto', 'Zamfara'],
  'South East': ['Abia', 'Anambra', 'Ebonyi', 'Enugu', 'Imo'],
  'South South': ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Rivers'],
  'South West': ['Ekiti', 'Lagos', 'Ogun', 'Ondo', 'Osun', 'Oyo']
};

export const CITY_TIERS = ['high', 'middle', 'low', 'national'] as const;
export type CityTier = typeof CITY_TIERS[number];

/**
 * Validate if a state name exists
 */
export function isValidState(stateName: string): boolean {
  return NIGERIAN_STATES.some(
    s => s.name.toLowerCase() === stateName.toLowerCase()
  );
}

/**
 * Get state by name (case-insensitive)
 */
export function getStateByName(stateName: string): NigerianState | undefined {
  return NIGERIAN_STATES.find(
    s => s.name.toLowerCase() === stateName.toLowerCase()
  );
}

/**
 * Get states by geopolitical zone
 */
export function getStatesByZone(zone: string): NigerianState[] {
  const zoneStates = GEO_POLITICAL_ZONES[zone];
  if (!zoneStates) return [];
  
  return NIGERIAN_STATES.filter(s => zoneStates.includes(s.name));
}

/**
 * Get geopolitical zone for a state
 */
export function getStateZone(stateName: string): string | null {
  const state = getStateByName(stateName);
  return state?.geoPoliticalZone || null;
}

/**
 * Get all state names as array
 */
export function getStateNames(): string[] {
  return NIGERIAN_STATES.map(s => s.name);
}
