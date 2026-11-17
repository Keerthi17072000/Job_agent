// Which country a job is in, from its free-text location ("Bengaluru, Karnataka", "Germany, Hungary, UK", "Remote - USA", "Worldwide").
// A job can be open to several regions, so this returns a list. Jobs with no recognisable place return [] and are never hidden for it.
export const ANYWHERE = 'Remote (anywhere)';

const COUNTRIES: [string, RegExp][] = [
  ['India', /\b(india|bengaluru|bangalore|mumbai|navi mumbai|delhi|new delhi|gurgaon|gurugram|noida|greater noida|hyderabad|secunderabad|pune|chennai|kolkata|ahmedabad|kochi|cochin|coimbatore|jaipur|chandigarh|indore|trivandrum|thiruvananthapuram|lucknow|nagpur|bhubaneswar|mysuru|mysore|visakhapatnam|surat|vadodara|karnataka|maharashtra|tamil ?nadu|telangana|kerala|haryana|uttar pradesh|gujarat|rajasthan|west bengal|andhra pradesh)\b/i],
  ['United States', /\b(usa|u\.s\.a?\.?|united states|america|new york|nyc|san francisco|bay area|seattle|austin|boston|chicago|los angeles|denver|atlanta|miami|dallas|houston|san jose|palo alto|mountain view|sunnyvale|menlo park|redwood city|washington,? d\.?c\.?|california|texas|florida|massachusetts|colorado|oregon|illinois|virginia|new jersey|north carolina|arizona|pittsburgh|philadelphia|san diego|portland|salt lake city)\b|,\s*(CA|NY|TX|WA|MA|IL|CO|FL|VA|NJ|OR|DC|NC|AZ|PA|GA)\b/i],
  ['United Kingdom', /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|london|manchester|edinburgh|glasgow|birmingham|bristol|leeds|cambridge|belfast|oxford|cardiff)\b/i],
  ['Germany', /\b(germany|deutschland|berlin|munich|münchen|munchen|hamburg|frankfurt|cologne|köln|koln|stuttgart|düsseldorf|dusseldorf|dortmund|essen|leipzig|dresden|hanover|hannover|nuremberg|nürnberg|bremen|bonn|karlsruhe|mannheim|bavaria|bayern|hessen|nordrhein|baden|sachsen|niedersachsen|rhineland|schleswig|brandenburg|thüringen|mecklenburg|saarland)\b/i],
  ['Canada', /\b(canada|toronto|vancouver|montreal|montréal|ottawa|calgary|edmonton|waterloo|ontario|british columbia|quebec|alberta)\b/i],
  ['Australia', /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra)\b/i],
  ['Singapore', /\bsingapore\b/i], ['United Arab Emirates', /\b(uae|united arab emirates|dubai|abu dhabi)\b/i],
  ['Netherlands', /\b(netherlands|holland|amsterdam|rotterdam|utrecht|eindhoven|the hague|den haag)\b/i], ['France', /\b(france|paris|lyon|marseille|toulouse)\b/i],
  ['Spain', /\b(spain|madrid|barcelona|valencia)\b/i], ['Ireland', /\b(ireland|dublin|cork|galway)\b/i], ['Poland', /\b(poland|warsaw|krakow|kraków|wroclaw|wrocław|gdansk|poznan)\b/i],
  ['Switzerland', /\b(switzerland|zurich|zürich|geneva|basel|lausanne)\b/i], ['Austria', /\b(austria|vienna|wien|graz)\b/i], ['Italy', /\b(italy|milan|rome|turin)\b/i],
  ['Portugal', /\b(portugal|lisbon|porto)\b/i], ['Belgium', /\b(belgium|brussels|antwerp)\b/i], ['Denmark', /\b(denmark|copenhagen)\b/i], ['Sweden', /\b(sweden|stockholm|gothenburg)\b/i],
  ['Hungary', /\b(hungary|budapest)\b/i], ['Romania', /\b(romania|bucharest|cluj)\b/i], ['Japan', /\b(japan|tokyo|osaka)\b/i], ['Philippines', /\b(philippines|manila)\b/i],
  ['Brazil', /\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i], ['Mexico', /\b(mexico|méxico|mexico city)\b/i], ['South Africa', /\b(south africa|johannesburg|cape town)\b/i], ['Israel', /\b(israel|tel aviv)\b/i],
];
// A posting for "APAC" or "Europe" is open to every country in that group.
const GROUPS: [RegExp, string[]][] = [
  [/\bapac\b|asia[- ]pacific/i, ['India', 'Singapore', 'Australia', 'Japan', 'Philippines']],
  [/\bemea\b|\beurope\b|\beu\b|european union/i, ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Spain', 'Ireland', 'Poland', 'Switzerland', 'Austria', 'Italy', 'Portugal', 'Belgium', 'Denmark', 'Sweden', 'Hungary', 'Romania']],
  [/\bemea\b/i, ['United Arab Emirates', 'South Africa', 'Israel']],
];
const ANY = /\b(worldwide|anywhere|global|work from home|wfh|distributed|remote)\b/i;

export const REGION_OPTIONS = [...COUNTRIES.map(([c]) => c), ANYWHERE];

export function regionsOf(location: string): string[] {
  const l = location ?? '', out = new Set<string>();
  for (const [c, re] of COUNTRIES) if (re.test(l)) out.add(c);
  for (const [re, cs] of GROUPS) if (re.test(l)) cs.forEach(c => out.add(c));
  if (!out.size && ANY.test(l)) out.add(ANYWHERE);
  if (out.size && /\b(worldwide|anywhere)\b/i.test(l)) out.add(ANYWHERE);
  return [...out];
}

/** The region to pre-select for a person: the country of their own location, if recognised. */
export const defaultRegion = (location: string) => regionsOf(location).find(r => r !== ANYWHERE) ?? '';

/** Does a job open to `regions` belong in a search for `region`? Unknown places are kept; `region` '' means any. */
export const inRegion = (regions: string[], region: string | undefined, includeRemote = true) =>
  !region || !regions.length || regions.includes(region) || (includeRemote && regions.includes(ANYWHERE));

const DIAL: [RegExp, string][] = [[/^\+?\s*\(?91\)?[\s-]?/, 'India'], [/^\+\s*44/, 'United Kingdom'], [/^\+\s*49/, 'Germany'], [/^\+\s*61/, 'Australia'], [/^\+\s*65/, 'Singapore'], [/^\+\s*971/, 'United Arab Emirates'], [/^\+\s*33/, 'France'], [/^\+\s*31/, 'Netherlands'],
  [/^\+\s*353/, 'Ireland'], [/^\+\s*34/, 'Spain'], [/^\+\s*39/, 'Italy'], [/^\+\s*41/, 'Switzerland'], [/^\+\s*46/, 'Sweden'], [/^\+\s*55/, 'Brazil'], [/^\+\s*52/, 'Mexico'], [/^\+\s*27/, 'South Africa'], [/^\+\s*81/, 'Japan'], [/^\+\s*1[\s-]/, 'United States']];
/** The country a phone number belongs to, when the resume gives no place: +91 is India, +44 the UK, and a bare 10-digit number starting 6-9 is an Indian mobile. */
export function regionFromPhone(phone: string): string {
  const p = (phone ?? '').trim();
  return DIAL.find(([re]) => re.test(p))?.[1] ?? (/^[6-9]\d{4}[\s-]?\d{5}$/.test(p.replace(/^0/, '')) ? 'India' : '');
}
