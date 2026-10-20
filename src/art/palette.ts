// Locked palette from the art bible (美术规范), plus a few tints mixed from it.
export const P = {
  teal: '#8FC9BE', tealDeep: '#5FA9A3', tealLight: '#BFE1D7',
  lily: '#7FB069', lilyDeep: '#4F8A4B', lilyLight: '#B3D392',
  frog: '#9CCB5A', frogDeep: '#6F9E3C', cream: '#F4E9C8', paper: '#F6EEDC', paperShade: '#E3D3B3',
  orange: '#E9824E', orangeDeep: '#C4633A', blue: '#3F5E78', blueLight: '#7393AB',
  ink: '#4A3B30', gold: '#E8B74A', red: '#D9534F', pink: '#EFAFA2',
  bank: '#DCD9B6', bankDeep: '#C5C8A0', road: '#EADFC4', roadDeep: '#D6C7A3',
  kraft: '#D6B184', kraftTop: '#E6C99E', wood: '#C19468', woodLight: '#D9B48A', woodDeep: '#94683F',
  white: '#FBF7EE', mustard: '#E2AE48', silver: '#D8D4C8', inkSoft: '#7A6A5C',
} as const;

export const INK = P.ink;

/** House-number plate colors; parcel labels use the same color as their house. */
export const PLATE_COLORS = [P.tealDeep, P.gold, P.blue, P.orange, P.red, P.lilyDeep] as const;
export const plateText = (color: string) => (color === P.gold ? P.ink : P.white);
