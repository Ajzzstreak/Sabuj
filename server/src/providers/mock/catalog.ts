import type { RetailerId } from '../../contract.js';

export interface CatalogSeed {
  title: string;
  brand: string;
  category: string;
  /** Typical street price in USD; per-retailer prices are spread around it. */
  basePrice: number;
  highlights: string[];
  /** Extra search keywords not present in the title. */
  keywords?: string[];
  /** Restrict to these retailers (e.g. first-party devices). */
  only?: RetailerId[];
}

type Row = [title: string, brand: string, basePrice: number, highlights: string[], extra?: Pick<CatalogSeed, 'keywords' | 'only'>];

const ELECTRONICS: RetailerId[] = ['amazon', 'walmart', 'target', 'bestbuy', 'costco', 'samsclub'];

const CATALOG: Record<string, Row[]> = {
  'Rice Cookers': [
    ['Zojirushi NS-TSC10 5.5-Cup Micom Rice Cooker & Warmer', 'Zojirushi', 194.99, ['5.5-cup', 'Fuzzy logic', 'Keep warm', 'Steam basket'], { keywords: ['japanese', 'neuro fuzzy'] }],
    ['Zojirushi NP-HCC10 5.5-Cup Induction Heating Rice Cooker', 'Zojirushi', 329.99, ['5.5-cup', 'Induction heating', 'GABA brown setting', 'Made in Japan'], { keywords: ['ih', 'japanese'] }],
    ['Tiger JBV-A10U 5.5-Cup Micom Rice Cooker', 'Tiger', 89.99, ['5.5-cup', 'Tacook synchro-cooking', '4 menu settings'], { keywords: ['japanese'] }],
    ['Aroma ARC-914SBD 8-Cup Digital Rice Cooker & Food Steamer', 'Aroma', 34.99, ['8-cup cooked', 'Digital controls', 'Steam tray', 'Delay timer'], { keywords: ['budget', 'steamer'] }],
    ['Cuckoo CR-0655F 6-Cup Micom Rice Cooker', 'Cuckoo', 109.99, ['6-cup', 'Fuzzy logic', 'Nonstick pot', '12 menu modes'], { keywords: ['korean'] }],
    ['Instant Zest 8-Cup Rice and Grain Cooker', 'Instant', 39.99, ['8-cup cooked', 'One-touch programs', 'Steamer included'], { keywords: ['instant pot', 'grain'] }],
    ['Toshiba TRCS01 6-Cup Fuzzy Logic Rice Cooker', 'Toshiba', 129.99, ['6-cup', 'Fuzzy logic', '7 cooking functions', 'Keep warm 24h'], { keywords: ['japanese'] }],
    ['Dash Mini 2-Cup Rice Cooker', 'Dash', 21.99, ['2-cup', 'Compact', 'Keep warm', 'One-switch'], { keywords: ['small', 'dorm'] }],
  ],
  'Air Fryers': [
    ['Ninja AF101 4-Quart Air Fryer', 'Ninja', 89.99, ['4-qt', '4 functions', 'Dishwasher-safe basket'], { keywords: ['airfryer'] }],
    ['Cosori Pro LE 5-Quart Air Fryer', 'Cosori', 99.99, ['5-qt', '9 presets', 'Shake reminder', 'Quiet operation'], { keywords: ['airfryer'] }],
    ['Instant Vortex Plus 6-Quart Air Fryer with ClearCook', 'Instant', 119.99, ['6-qt', 'Clear window', '6-in-1', 'Odor filter'], { keywords: ['instant pot', 'airfryer'] }],
    ['Philips Premium Airfryer XXL', 'Philips', 279.99, ['7-qt', 'Fat removal tech', 'Fits whole chicken'], { keywords: ['air fryer', 'large'] }],
    ['Ninja Foodi DZ201 8-Quart DualZone Air Fryer', 'Ninja', 179.99, ['8-qt', 'Two baskets', 'Smart Finish', '6 functions'], { keywords: ['dual basket', 'airfryer'] }],
    ['Gourmia 7-Quart Digital Air Fryer', 'Gourmia', 69.99, ['7-qt', '10 presets', 'Guided cooking'], { keywords: ['airfryer', 'budget'] }],
    ['Chefman TurboFry Touch 5-Quart Air Fryer', 'Chefman', 54.99, ['5-qt', 'Touch controls', 'Shake alert'], { keywords: ['airfryer', 'budget'] }],
  ],
  'Coffee Makers': [
    ['Keurig K-Elite Single-Serve K-Cup Coffee Maker', 'Keurig', 149.99, ['Single-serve', 'Iced setting', '75-oz reservoir', 'Strong brew'], { keywords: ['pod', 'kcup'] }],
    ['Keurig K-Mini Single-Serve Coffee Maker', 'Keurig', 79.99, ['Single-serve', 'Under 5 in. wide', '6-12 oz cups'], { keywords: ['pod', 'kcup', 'small'] }],
    ['Nespresso VertuoPlus Coffee and Espresso Machine', 'Nespresso', 169.99, ['Coffee + espresso', 'Centrifusion', '40-oz tank'], { keywords: ['pod', 'capsule', 'espresso machine'] }],
    ['Breville Barista Express Espresso Machine BES870XL', 'Breville', 699.95, ['Built-in grinder', '15-bar pump', 'Steam wand', 'Stainless steel'], { keywords: ['espresso machine', 'latte', 'cappuccino'] }],
    ['Ninja CE251 12-Cup Programmable Coffee Brewer', 'Ninja', 79.99, ['12-cup', 'Programmable', 'Small-batch mode', 'Warming plate'], { keywords: ['drip'] }],
    ['Mr. Coffee 12-Cup Programmable Coffee Maker', 'Mr. Coffee', 34.99, ['12-cup', 'Programmable', 'Auto shut-off'], { keywords: ['drip', 'budget'] }],
    ['Technivorm Moccamaster KBGV Select 10-Cup Coffee Maker', 'Technivorm', 329.99, ['10-cup', 'SCA certified', 'Copper heating element', 'Handmade'], { keywords: ['drip', 'pour over'] }],
  ],
  'Kitchen Appliances': [
    ['Instant Pot Duo 7-in-1 Electric Pressure Cooker 6-Quart', 'Instant', 89.99, ['6-qt', '7-in-1', 'Pressure cook', 'Slow cook'], { keywords: ['instapot', 'multi cooker', 'multicooker'] }],
    ['Vitamix 5200 Professional-Grade Blender', 'Vitamix', 449.95, ['64-oz', 'Variable speed', '7-year warranty'], { keywords: ['smoothie'] }],
    ['Ninja BL610 Professional 72-Oz Countertop Blender', 'Ninja', 89.99, ['72-oz', '1000 watts', 'Total Crushing blades'], { keywords: ['smoothie'] }],
    ['KitchenAid Artisan Series 5-Quart Tilt-Head Stand Mixer', 'KitchenAid', 449.99, ['5-qt', '10 speeds', 'Tilt-head', '10+ attachments'], { keywords: ['baking', 'kitchen aid'] }],
    ['Cuisinart 14-Cup Food Processor DFP-14BCNY', 'Cuisinart', 229.95, ['14-cup', '720 watts', 'Stainless blades'], { keywords: ['chopper'] }],
    ['NutriBullet Pro 900-Watt Personal Blender', 'NutriBullet', 89.99, ['900 watts', 'Personal size', 'To-go cups'], { keywords: ['smoothie', 'nutri bullet'] }],
    ['Breville Smart Oven Air Fryer Pro Toaster Oven', 'Breville', 399.95, ['13 functions', 'Convection', 'Fits 14-lb turkey', 'Air fry'], { keywords: ['countertop oven'] }],
  ],
  TVs: [
    ['Samsung 65-Inch Class Q60D QLED 4K Smart TV', 'Samsung', 797.99, ['65-inch', 'QLED', '4K', 'Tizen'], { keywords: ['television', '65 inch'], only: ELECTRONICS }],
    ['LG 55-Inch Class C4 OLED evo 4K Smart TV', 'LG', 1296.99, ['55-inch', 'OLED', '144Hz', 'Dolby Vision'], { keywords: ['television', '55 inch', 'gaming'], only: ELECTRONICS }],
    ['Sony 65-Inch BRAVIA 7 Mini LED QLED 4K Google TV', 'Sony', 1499.99, ['65-inch', 'Mini LED', '120Hz', 'Google TV'], { keywords: ['television', '65 inch'], only: ELECTRONICS }],
    ['TCL 55-Inch Q6 QLED 4K Smart Google TV', 'TCL', 349.99, ['55-inch', 'QLED', '4K', 'Google TV'], { keywords: ['television', '55 inch', 'budget'], only: ELECTRONICS }],
    ['Hisense 65-Inch U8N Mini-LED ULED 4K Google TV', 'Hisense', 999.99, ['65-inch', 'Mini-LED', '144Hz', '3000 nits'], { keywords: ['television', '65 inch'], only: ELECTRONICS }],
    ['Vizio 50-Inch V-Series 4K UHD Smart TV', 'Vizio', 268.0, ['50-inch', '4K', 'Dolby Vision', 'SmartCast'], { keywords: ['television', '50 inch', 'budget'], only: ELECTRONICS }],
    ['Roku 43-Inch Select Series 4K HDR Smart TV', 'Roku', 229.99, ['43-inch', '4K HDR', 'Roku OS'], { keywords: ['television', '43 inch', 'budget'], only: ['amazon', 'walmart', 'target', 'bestbuy'] }],
  ],
  Headphones: [
    ['Sony WH-1000XM5 Wireless Noise Canceling Headphones', 'Sony', 349.99, ['Over-ear', 'ANC', '30-hr battery', 'Multipoint'], { keywords: ['noise cancelling', 'bluetooth', 'xm5'], only: ELECTRONICS }],
    ['Bose QuietComfort Ultra Wireless Headphones', 'Bose', 429.0, ['Over-ear', 'ANC', 'Immersive audio', '24-hr battery'], { keywords: ['noise cancelling', 'bluetooth', 'qc'], only: ELECTRONICS }],
    ['Apple AirPods Pro (2nd Generation) with USB-C', 'Apple', 239.99, ['In-ear', 'ANC', 'Spatial audio', 'USB-C case'], { keywords: ['earbuds', 'noise cancelling', 'airpod'], only: ELECTRONICS }],
    ['Apple AirPods 4 Wireless Earbuds', 'Apple', 129.0, ['In-ear', 'H2 chip', '30-hr with case'], { keywords: ['earbuds', 'airpod'], only: ELECTRONICS }],
    ['Beats Studio Pro Wireless Headphones', 'Beats', 249.99, ['Over-ear', 'ANC', 'USB-C lossless', '40-hr battery'], { keywords: ['noise cancelling', 'bluetooth'], only: ELECTRONICS }],
    ['Samsung Galaxy Buds3 Pro Wireless Earbuds', 'Samsung', 229.99, ['In-ear', 'ANC', 'IP57', 'Galaxy AI'], { keywords: ['earbuds', 'noise cancelling'], only: ELECTRONICS }],
    ['JBL Tune 770NC Wireless Over-Ear Headphones', 'JBL', 99.95, ['Over-ear', 'Adaptive ANC', '70-hr battery'], { keywords: ['noise cancelling', 'bluetooth', 'budget'], only: ELECTRONICS }],
    ['Anker Soundcore Space One Noise Cancelling Headphones', 'Anker', 89.99, ['Over-ear', 'ANC', '55-hr battery', 'LDAC'], { keywords: ['bluetooth', 'budget'], only: ['amazon', 'walmart', 'target', 'bestbuy'] }],
  ],
  Laptops: [
    ['Apple MacBook Air 13-Inch M3 8GB 256GB', 'Apple', 1099.0, ['13.6-inch', 'M3 chip', '18-hr battery', 'Fanless'], { keywords: ['notebook', 'mac'], only: ELECTRONICS }],
    ['Dell XPS 13 Laptop Intel Core Ultra 7 16GB 512GB', 'Dell', 1199.99, ['13.4-inch', 'Core Ultra 7', '16GB RAM', '512GB SSD'], { keywords: ['notebook', 'ultrabook', 'windows'], only: ELECTRONICS }],
    ['HP Pavilion 15.6-Inch Laptop Ryzen 5 16GB 512GB', 'HP', 649.99, ['15.6-inch', 'Ryzen 5', '16GB RAM', '512GB SSD'], { keywords: ['notebook', 'windows'], only: ELECTRONICS }],
    ['Lenovo IdeaPad Slim 5 14-Inch Laptop 16GB 512GB', 'Lenovo', 699.99, ['14-inch OLED', 'Ryzen 7', '16GB RAM'], { keywords: ['notebook', 'windows'], only: ELECTRONICS }],
    ['ASUS Zenbook 14 OLED Laptop Core Ultra 5 16GB 512GB', 'ASUS', 849.99, ['14-inch OLED', 'Core Ultra 5', '2.8 lb'], { keywords: ['notebook', 'ultrabook', 'windows'], only: ELECTRONICS }],
    ['Acer Aspire 5 15.6-Inch Laptop Core i5 8GB 512GB', 'Acer', 499.99, ['15.6-inch', 'Core i5', '8GB RAM', '512GB SSD'], { keywords: ['notebook', 'windows', 'budget'], only: ELECTRONICS }],
    ['Microsoft Surface Laptop 7 13.8-Inch Snapdragon X Plus', 'Microsoft', 999.99, ['13.8-inch', 'Snapdragon X Plus', 'Copilot+ PC', 'Touchscreen'], { keywords: ['notebook', 'windows'], only: ELECTRONICS }],
  ],
  Vacuums: [
    ['Dyson V15 Detect Cordless Stick Vacuum', 'Dyson', 749.99, ['Cordless', 'Laser dust detection', '60-min runtime', 'HEPA'], { keywords: ['vacuum cleaner', 'stick'] }],
    ['Dyson V8 Cordless Stick Vacuum', 'Dyson', 349.99, ['Cordless', '40-min runtime', 'Converts to handheld'], { keywords: ['vacuum cleaner', 'stick'] }],
    ['Shark Navigator Lift-Away NV360 Upright Vacuum', 'Shark', 199.99, ['Upright', 'Lift-away pod', 'HEPA filter', 'Bagless'], { keywords: ['vacuum cleaner', 'corded'] }],
    ['iRobot Roomba j7+ Self-Emptying Robot Vacuum', 'iRobot', 599.99, ['Robot', 'Self-emptying', 'Obstacle avoidance', 'Smart mapping'], { keywords: ['robot vacuum', 'robovac'] }],
    ['Bissell CrossWave All-in-One Wet Dry Vacuum', 'Bissell', 229.99, ['Wet/dry', 'Vacuums and washes', 'Multi-surface'], { keywords: ['vacuum cleaner', 'mop'] }],
    ['Shark IQ Robot Self-Empty XL Robot Vacuum', 'Shark', 399.99, ['Robot', 'Self-empty base', 'Home mapping', '45-day capacity'], { keywords: ['robot vacuum', 'robovac'] }],
    ['eufy RoboVac 11S Slim Robot Vacuum', 'eufy', 179.99, ['Robot', 'Slim 2.85 in.', 'Quiet', '100-min runtime'], { keywords: ['robot vacuum', 'budget', 'anker'] }],
  ],
  'Smart Home': [
    ['Amazon Echo Dot (5th Gen) Smart Speaker with Alexa', 'Amazon', 49.99, ['Alexa', 'Improved audio', 'Temperature sensor'], { keywords: ['smart speaker'], only: ['amazon', 'target', 'bestbuy'] }],
    ['Google Nest Hub (2nd Gen) Smart Display', 'Google', 99.99, ['7-inch display', 'Google Assistant', 'Sleep sensing'], { keywords: ['smart speaker', 'smart display'], only: ['walmart', 'target', 'bestbuy', 'costco'] }],
    ['Ring Battery Video Doorbell', 'Ring', 99.99, ['1440p HD', 'Head-to-toe view', 'Battery powered'], { keywords: ['doorbell camera', 'security'], only: ELECTRONICS }],
    ['Google Nest Thermostat Smart Programmable Wi-Fi', 'Google', 129.99, ['Energy savings', 'App control', 'Easy install'], { keywords: ['smart thermostat'], only: ELECTRONICS }],
    ['ecobee Smart Thermostat Premium', 'ecobee', 249.99, ['Room sensor included', 'Air quality monitor', 'Built-in Alexa'], { keywords: ['smart thermostat'], only: ELECTRONICS }],
    ['Philips Hue White and Color Ambiance Starter Kit', 'Philips', 179.99, ['3 bulbs + bridge', '16M colors', 'Voice control'], { keywords: ['smart lights', 'smart bulb'], only: ELECTRONICS }],
    ['TP-Link Kasa Smart Plug Mini 4-Pack', 'TP-Link', 29.99, ['4-pack', 'No hub needed', 'Schedules', 'Voice control'], { keywords: ['smart outlet', 'wifi plug'], only: ['amazon', 'walmart', 'target', 'bestbuy'] }],
    ['Arlo Essential Outdoor Security Camera (2nd Gen)', 'Arlo', 99.99, ['2K video', 'Wire-free', 'Color night vision'], { keywords: ['security camera', 'wifi camera'], only: ELECTRONICS }],
  ],
  Toys: [
    ['LEGO Star Wars Millennium Falcon 75257 Building Set', 'LEGO', 169.99, ['1,353 pieces', 'Ages 9+', '7 minifigures'], { keywords: ['building blocks', 'legos'] }],
    ['LEGO Classic Large Creative Brick Box 10698', 'LEGO', 59.99, ['790 pieces', 'Ages 4+', 'Storage box'], { keywords: ['building blocks', 'legos'] }],
    ['Barbie Dreamhouse Dollhouse Playset', 'Barbie', 199.0, ['3 stories', '75+ pieces', 'Pool and slide'], { keywords: ['doll house', 'mattel'] }],
    ['Hot Wheels 20-Car Gift Pack', 'Hot Wheels', 21.99, ['20 cars', '1:64 scale', 'Ages 3+'], { keywords: ['toy cars', 'mattel'] }],
    ['Nintendo Switch OLED Model Console', 'Nintendo', 349.99, ['7-inch OLED', '64GB storage', 'Dock included'], { keywords: ['video game', 'gaming console'], only: ELECTRONICS }],
    ['Melissa & Doug Wooden Building Blocks Set 100-Piece', 'Melissa & Doug', 24.99, ['100 blocks', 'Solid wood', 'Ages 3+'], { keywords: ['toddler'] }],
    ['Magna-Tiles Classic 100-Piece Magnetic Building Set', 'Magna-Tiles', 119.99, ['100 pieces', 'Magnetic', 'STEM', 'Ages 3+'], { keywords: ['magnatiles', 'magnetic tiles'] }],
    ['NERF Elite 2.0 Commander RD-6 Blaster', 'NERF', 14.99, ['6-dart drum', '12 darts', 'Ages 8+'], { keywords: ['dart gun', 'hasbro'] }],
  ],
  'Personal Care': [
    ['Oral-B iO Series 9 Rechargeable Electric Toothbrush', 'Oral-B', 299.99, ['7 modes', '3D tracking', 'Magnetic charger'], { keywords: ['oral b', 'power toothbrush'] }],
    ['Philips Sonicare 4100 Rechargeable Electric Toothbrush', 'Philips', 49.96, ['Pressure sensor', '2-min timer', '14-day battery'], { keywords: ['power toothbrush', 'budget'] }],
    ['Dyson Supersonic Hair Dryer', 'Dyson', 429.99, ['Fast drying', 'Heat control', '5 attachments'], { keywords: ['blow dryer', 'hairdryer'] }],
    ['Braun Series 9 Pro Electric Shaver', 'Braun', 329.99, ['Wet & dry', 'ProLift trimmer', '60-min battery'], { keywords: ['razor', 'electric razor'] }],
    ['Philips Norelco OneBlade Hybrid Trimmer and Shaver', 'Philips', 37.96, ['Trim, edge, shave', 'Wet & dry', '45-min battery'], { keywords: ['razor', 'beard trimmer'] }],
    ['Waterpik Aquarius Water Flosser WP-660', 'Waterpik', 99.99, ['10 pressure settings', '7 tips', '90-sec capacity'], { keywords: ['water pick', 'dental'] }],
    ['Revlon One-Step Volumizer Hair Dryer and Hot Air Brush', 'Revlon', 39.99, ['Dry + style', 'Oval brush', '3 heat settings'], { keywords: ['blow dryer', 'hairdryer'] }],
    ['Theragun Mini Portable Massage Gun', 'Therabody', 199.0, ['Pocket-sized', '3 speeds', '150-min battery'], { keywords: ['massager', 'percussion'] }],
  ],
};

/** Singular search noun per category, used for suggestions and matching. */
export const CATEGORY_NOUN: Record<string, string> = {
  'Rice Cookers': 'rice cooker',
  'Air Fryers': 'air fryer',
  'Coffee Makers': 'coffee maker',
  'Kitchen Appliances': 'kitchen appliance',
  TVs: 'tv',
  Headphones: 'headphones',
  Laptops: 'laptop',
  Vacuums: 'vacuum',
  'Smart Home': 'smart home',
  Toys: 'toys',
  'Personal Care': 'personal care',
};

export const CATEGORIES = Object.keys(CATALOG);

export const SEEDS: CatalogSeed[] = Object.entries(CATALOG).flatMap(([category, rows]) =>
  rows.map(([title, brand, basePrice, highlights, extra]) => ({
    title,
    brand,
    category,
    basePrice,
    highlights,
    ...extra,
  })),
);

export const TRENDING_QUERIES = [
  'rice cooker',
  'air fryer',
  'oled tv',
  'noise cancelling headphones',
  'robot vacuum',
  'espresso machine',
  'macbook air',
  'lego',
  'electric toothbrush',
  'smart thermostat',
];
