/**
 * Demo grocery catalog seeds. NOT real prices: plausible US shelf prices typed
 * in by hand, then spread per retailer by `grocery.ts`.
 *
 * A "kind" is one type of item (e.g. whole milk, 1 gal). Each kind yields:
 *   - one store-brand product per retailer that sells it under its own label
 *     (Great Value, Kroger, Good & Gather / up & up, Kirkland Signature,
 *     Member's Mark). Those are each other's 'equivalent' offers — the same
 *     kind of item by construction, never a guess;
 *   - any number of national-brand products, the same GTIN at every store.
 */

/** [brand, product name without brand, size, street price, extra highlights]. */
export type NationalRow = [brand: string, name: string, size: string, price: number, tags?: string[]];

export interface GroceryKind {
  /** Item name without a brand, e.g. "Whole Milk". */
  name: string;
  /** Store-brand package size at regular grocers, e.g. "1 gal". */
  size: string;
  /** Store-brand street price for that size. */
  price: number;
  tags: string[];
  keywords?: string[];
  /** Bulk package the warehouse clubs sell under their own label: [size, price]. */
  club?: [size: string, price: number];
  /** False: no store-brand version exists (fresh produce sold loose, etc.). */
  storeBrand?: false;
  /** False: Target does not sell a store-brand version. */
  target?: false;
  nationals?: NationalRow[];
}

const k = (name: string, size: string, price: number, tags: string[], extra: Partial<GroceryKind> = {}): GroceryKind => ({ name, size, price, tags, ...extra });
/** A kind with no store-brand version: only the listed products exist. */
const only = (name: string, keywords: string[], nationals: NationalRow[]): GroceryKind => ({ name, size: '', price: 0, tags: [], keywords, storeBrand: false, nationals });

export const FRESH = 'Fresh Produce';

export const GROCERY: Record<string, GroceryKind[]> = {
  Produce: [
    only('Fruit', ['fruit', 'fresh'], [
      [FRESH, 'Bananas', '1 lb', 0.58, ['Sold by the pound']],
      [FRESH, 'Gala Apples', '3 lb', 3.97, ['3 lb bag']],
      [FRESH, 'Navel Oranges', '4 lb', 4.98, ['4 lb bag']],
      [FRESH, 'Hass Avocado', '1 ct', 0.88, ['Each']],
      [FRESH, 'Lemon', '1 ct', 0.64, ['Each']],
      [FRESH, 'Red Seedless Grapes', '2 lb', 4.96, ['2 lb bag']],
      ["Driscoll's", 'Strawberries', '16 oz', 3.48, ['1 lb clamshell']],
      ["Driscoll's", 'Blueberries', '11 oz', 3.98, ['11 oz clamshell']],
    ]),
    only('Vegetables', ['vegetable', 'veggies', 'fresh'], [
      [FRESH, 'Russet Potatoes', '5 lb', 3.47, ['5 lb bag']],
      [FRESH, 'Yellow Onions', '3 lb', 2.78, ['3 lb bag']],
      [FRESH, 'Roma Tomatoes', '1 lb', 1.28, ['Sold by the pound']],
      [FRESH, 'Broccoli Crowns', '1 lb', 1.98, ['Sold by the pound']],
      [FRESH, 'Cucumber', '1 ct', 0.72, ['Each']],
      [FRESH, 'Green Bell Pepper', '1 ct', 0.78, ['Each']],
      [FRESH, 'Garlic Bulb', '1 ct', 0.58, ['Each']],
      [FRESH, 'Romaine Hearts', '3 ct', 3.48, ['3 hearts']],
      ['Bolthouse Farms', 'Baby Carrots', '16 oz', 1.48, ['Peeled', 'Ready to eat']],
      ['Fresh Express', 'Baby Spinach', '5 oz', 2.98, ['Washed', 'Ready to eat']],
    ]),
  ],
  'Dairy & Eggs': [
    k('Whole Milk', '1 gal', 3.36, ['Vitamin D', 'Grade A'], {
      club: ['2 x 1 gal', 6.19],
      nationals: [
        ['Horizon Organic', 'Whole Milk', '64 fl oz', 5.48, ['Organic', 'Half gallon']],
        ['Lactaid', 'Whole Milk', '64 fl oz', 4.86, ['Lactose free', 'Half gallon']],
      ],
    }),
    k('2% Reduced Fat Milk', '1 gal', 3.36, ['2% milkfat', 'Grade A'], {
      nationals: [['fairlife', '2% Ultra-Filtered Milk', '52 fl oz', 4.98, ['Lactose free', '13g protein']]],
    }),
    k('Large White Eggs', '12 ct', 2.72, ['Grade A', 'One dozen'], {
      keywords: ['egg', 'dozen'],
      club: ['24 ct', 4.89],
      nationals: [
        ["Eggland's Best", 'Large White Eggs', '12 ct', 3.98, ['Grade A', 'One dozen']],
        ['Vital Farms', 'Pasture-Raised Large Brown Eggs', '12 ct', 6.48, ['Pasture raised', 'One dozen']],
      ],
    }),
    k('Salted Butter Sticks', '16 oz', 3.98, ['4 sticks', 'Grade AA'], {
      club: ['4 x 16 oz', 13.49],
      nationals: [
        ["Land O'Lakes", 'Salted Butter Sticks', '16 oz', 5.28, ['4 sticks']],
        ['Kerrygold', 'Pure Irish Salted Butter', '8 oz', 4.24, ['Grass-fed', 'Imported']],
      ],
    }),
    k('Shredded Mild Cheddar Cheese', '8 oz', 2.22, ['Finely shredded'], {
      club: ['40 oz', 8.98],
      nationals: [
        ['Kraft', 'Shredded Mild Cheddar Cheese', '8 oz', 3.24, ['Finely shredded']],
        ['Tillamook', 'Medium Cheddar Cheese Block', '16 oz', 5.97, ['Aged 60 days']],
      ],
    }),
    k('Plain Nonfat Greek Yogurt', '32 oz', 3.74, ['0% milkfat', 'High protein'], {
      club: ['48 oz', 5.69],
      nationals: [
        ['Chobani', 'Plain Nonfat Greek Yogurt', '32 oz', 5.98, ['0% milkfat', 'High protein']],
        ['Fage', 'Total 2% Plain Greek Yogurt', '32 oz', 6.24, ['2% milkfat']],
        ['Yoplait', 'Original Strawberry Yogurt', '6 oz', 0.72, ['Single cup']],
      ],
    }),
    k('Cream Cheese', '8 oz', 1.68, ['Brick'], { nationals: [['Philadelphia', 'Original Cream Cheese', '8 oz', 3.12, ['Brick']]] }),
    k('Sour Cream', '16 oz', 1.98, ['Original'], { nationals: [['Daisy', 'Pure & Natural Sour Cream', '16 oz', 2.64, ['Original']]] }),
    k('Half & Half', '32 fl oz', 2.74, ['Ultra-pasteurized'], {
      keywords: ['creamer'],
      nationals: [['Coffee mate', 'French Vanilla Liquid Coffee Creamer', '32 fl oz', 4.18, ['Lactose free']]],
    }),
    k('Unsweetened Almond Milk', '64 fl oz', 2.68, ['Dairy free', 'Half gallon'], {
      keywords: ['plant milk', 'non dairy'],
      nationals: [
        ['Silk', 'Unsweetened Almond Milk', '64 fl oz', 3.78, ['Dairy free', 'Half gallon']],
        ['Almond Breeze', 'Original Almond Milk', '64 fl oz', 3.58, ['Dairy free', 'Half gallon']],
        ['Oatly', 'Original Oat Milk', '64 fl oz', 4.98, ['Dairy free', 'Half gallon']],
      ],
    }),
    k('Mozzarella String Cheese', '12 ct', 3.24, ['Low-moisture part-skim'], { club: ['48 ct', 9.98], nationals: [['Sargento', 'Mozzarella String Cheese', '12 ct', 4.48, ['Light']]] }),
  ],
  'Meat & Seafood': [
    k('Boneless Skinless Chicken Breasts', '3 lb', 8.94, ['Fresh', 'No added hormones'], {
      target: false,
      club: ['6 lb', 15.99],
      nationals: [['Tyson', 'Boneless Skinless Chicken Breasts', '2.5 lb', 9.47, ['Fresh', 'All natural']]],
    }),
    k('80% Lean Ground Beef', '1 lb', 5.24, ['80% lean / 20% fat'], { keywords: ['hamburger', 'mince'], club: ['4 lb', 17.96] }),
    k('93% Lean Ground Turkey', '1 lb', 4.84, ['93% lean'], { target: false, nationals: [['Jennie-O', '93% Lean Ground Turkey', '16 oz', 5.24, ['93% lean']]] }),
    k('Hickory Smoked Bacon', '16 oz', 4.47, ['Classic cut'], {
      club: ['4 x 16 oz', 15.98],
      nationals: [
        ['Oscar Mayer', 'Naturally Hardwood Smoked Bacon', '16 oz', 6.97, ['Classic cut']],
        ['Wright', 'Thick Cut Hickory Smoked Bacon', '24 oz', 9.47, ['Thick cut']],
      ],
    }),
    k('Atlantic Salmon Fillets', '1 lb', 9.97, ['Fresh', 'Skin on'], { target: false, keywords: ['fish'], club: ['3 lb', 26.99] }),
    k('Oven Roasted Turkey Breast Lunch Meat', '9 oz', 3.48, ['Sliced', 'Deli style'], {
      keywords: ['deli', 'cold cuts'],
      nationals: [
        ['Oscar Mayer', 'Deli Fresh Oven Roasted Turkey Breast', '9 oz', 4.98, ['Sliced']],
        ['Hillshire Farm', 'Smoked Sausage Rope', '14 oz', 3.98, ['Fully cooked']],
        ['Ball Park', 'Beef Franks', '8 ct', 5.48, ['Hot dogs']],
      ],
    }),
  ],
  Bakery: [
    k('White Sandwich Bread', '20 oz', 1.42, ['Sliced loaf'], {
      nationals: [
        ['Wonder', 'Classic White Bread', '20 oz', 2.98, ['Sliced loaf']],
        ['Sara Lee', 'Artesano Bakery Bread', '20 oz', 3.48, ['Thick sliced']],
      ],
    }),
    k('100% Whole Wheat Bread', '20 oz', 1.97, ['Sliced loaf', 'Whole grain'], {
      nationals: [
        ["Nature's Own", '100% Whole Wheat Bread', '20 oz', 3.47, ['Sliced loaf', 'Whole grain']],
        ["Dave's Killer Bread", '21 Whole Grains and Seeds Organic Bread', '27 oz', 5.98, ['Organic', 'Whole grain']],
      ],
    }),
    k('Hamburger Buns', '8 ct', 1.46, ['Sliced'], { nationals: [['Ball Park', 'Hamburger Buns', '8 ct', 3.28, ['Sliced']]] }),
    k('Soft Taco Flour Tortillas', '10 ct', 1.98, ['8 inch'], { nationals: [['Mission', 'Soft Taco Flour Tortillas', '10 ct', 2.98, ['8 inch']]] }),
    k('Plain Bagels', '6 ct', 2.24, ['Pre-sliced'], { nationals: [["Thomas'", 'Plain Bagels', '6 ct', 4.48, ['Pre-sliced']]] }),
    k('English Muffins', '6 ct', 1.48, ['Fork split'], { nationals: [["Thomas'", 'Original English Muffins', '6 ct', 3.98, ['Fork split']]] }),
  ],
  Pantry: [
    k('Long Grain White Rice', '5 lb', 3.34, ['Enriched'], {
      club: ['25 lb', 13.48],
      nationals: [
        ["Ben's Original", 'Long Grain White Rice', '5 lb', 6.98, ['Enriched']],
        ['Minute', 'Instant White Rice', '28 oz', 4.48, ['Ready in 5 minutes']],
        ['Lundberg', 'Organic Long Grain Brown Rice', '2 lb', 5.48, ['Organic', 'Gluten free', 'Whole grain']],
      ],
    }),
    k('Jasmine Rice', '5 lb', 5.98, ['Thai fragrant rice'], { club: ['25 lb', 19.99], nationals: [['Mahatma', 'Jasmine Rice', '5 lb', 7.48, ['Thai fragrant rice']]] }),
    k('Spaghetti Pasta', '16 oz', 0.98, ['Enriched macaroni product'], {
      keywords: ['noodles'],
      club: ['6 x 16 oz', 5.49],
      nationals: [
        ['Barilla', 'Spaghetti Pasta', '16 oz', 1.84, ['Al dente in 10 minutes']],
        ['Barilla', 'Gluten Free Penne Pasta', '12 oz', 2.98, ['Gluten free', 'Corn and rice']],
        ['Banza', 'Chickpea Rotini Pasta', '8 oz', 3.48, ['Gluten free', 'High protein']],
      ],
    }),
    k('Penne Rigate Pasta', '16 oz', 0.98, ['Enriched macaroni product'], { nationals: [['Barilla', 'Penne Pasta', '16 oz', 1.84, ['Al dente in 11 minutes']]] }),
    k('Dry Black Beans', '16 oz', 1.52, ['Dried beans'], { nationals: [['Goya', 'Dry Black Beans', '16 oz', 2.18, ['Dried beans']]] }),
    k('Dry Pinto Beans', '32 oz', 2.24, ['Dried beans'], { target: false }),
    k('All-Purpose Flour', '5 lb', 2.38, ['Enriched', 'Bleached'], {
      club: ['25 lb', 8.99],
      nationals: [
        ['Gold Medal', 'All-Purpose Flour', '5 lb', 4.18, ['Enriched', 'Bleached']],
        ['King Arthur', 'Unbleached All-Purpose Flour', '5 lb', 5.47, ['Unbleached', 'Non-GMO']],
      ],
    }),
    k('Granulated Sugar', '4 lb', 3.14, ['Pure cane'], { club: ['10 lb', 7.99], nationals: [['Domino', 'Granulated Sugar', '4 lb', 4.28, ['Pure cane']]] }),
    k('Vegetable Oil', '48 fl oz', 3.98, ['Soybean oil', 'Cholesterol free'], {
      keywords: ['cooking oil'],
      nationals: [['Crisco', 'Pure Vegetable Oil', '48 fl oz', 5.48, ['Soybean oil']]],
    }),
    k('Extra Virgin Olive Oil', '17 fl oz', 5.98, ['Cold pressed'], {
      keywords: ['cooking oil', 'evoo'],
      club: ['67.6 fl oz', 17.99],
      nationals: [
        ['Bertolli', 'Extra Virgin Olive Oil', '16.9 fl oz', 8.98, ['Rich taste']],
        ['California Olive Ranch', 'Extra Virgin Olive Oil', '16.9 fl oz', 10.97, ['Cold pressed']],
        ['Pompeian', 'Smooth Extra Virgin Olive Oil', '16 fl oz', 7.48, ['First cold pressed']],
      ],
    }),
    k('Creamy Peanut Butter', '16 oz', 1.94, ['Smooth'], {
      club: ['48 oz', 5.98],
      nationals: [
        ['Jif', 'Creamy Peanut Butter', '16 oz', 3.16, ['Smooth']],
        ['Skippy', 'Creamy Peanut Butter', '16.3 oz', 3.24, ['Smooth']],
      ],
    }),
    k('Concord Grape Jelly', '30 oz', 2.42, ['Squeezable'], { nationals: [["Smucker's", 'Concord Grape Jelly', '20 oz', 2.98, ['Squeezable']]] }),
    k('Traditional Pasta Sauce', '24 oz', 1.47, ['Tomato', 'Jar'], {
      keywords: ['marinara', 'spaghetti sauce'],
      nationals: [
        ['Prego', 'Traditional Pasta Sauce', '24 oz', 2.38, ['Tomato', 'Jar']],
        ["Rao's Homemade", 'Marinara Sauce', '24 oz', 6.88, ['No added sugar', 'Keto friendly']],
      ],
    }),
    k('Macaroni & Cheese Dinner', '7.25 oz', 0.58, ['Box', 'Original'], {
      keywords: ['mac and cheese'],
      nationals: [
        ['Kraft', 'Original Macaroni & Cheese Dinner', '7.25 oz', 1.24, ['Box']],
        ["Annie's", 'Shells & White Cheddar Macaroni & Cheese', '6 oz', 1.78, ['Organic pasta']],
      ],
    }),
    k('Tomato Ketchup', '24 oz', 1.24, ['Squeeze bottle'], { nationals: [['Heinz', 'Tomato Ketchup', '20 oz', 3.48, ['Squeeze bottle']]] }),
    k('Real Mayonnaise', '30 fl oz', 2.98, ['Jar'], { keywords: ['mayo'], nationals: [["Hellmann's", 'Real Mayonnaise', '30 fl oz', 5.98, ['Jar']]] }),
  ],
  'Canned Goods': [
    k('Canned Black Beans', '15 oz', 0.86, ['Canned', 'Ready to eat'], {
      club: ['8 x 15 oz', 6.48],
      nationals: [
        ["Bush's Best", 'Canned Black Beans', '15 oz', 1.38, ['Canned']],
        ['Goya', 'Canned Black Beans', '15.5 oz', 1.42, ['Canned']],
      ],
    }),
    k('Canned Diced Tomatoes', '14.5 oz', 0.96, ['Canned', 'In tomato juice'], {
      nationals: [
        ["Hunt's", 'Canned Diced Tomatoes', '14.5 oz', 1.34, ['Canned']],
        ['Ro-Tel', 'Original Diced Tomatoes & Green Chilies', '10 oz', 1.28, ['Canned', 'Mild heat']],
      ],
    }),
    k('Canned Whole Kernel Corn', '15.25 oz', 0.64, ['Canned', 'Golden sweet'], { nationals: [['Del Monte', 'Canned Whole Kernel Corn', '15.25 oz', 1.38, ['Canned']]] }),
    k('Canned Cut Green Beans', '14.5 oz', 0.64, ['Canned'], { nationals: [['Del Monte', 'Canned Cut Green Beans', '14.5 oz', 1.38, ['Canned']]] }),
    k('Chunk Light Tuna in Water', '5 oz', 0.92, ['Canned', 'Wild caught'], {
      keywords: ['fish'],
      club: ['8 x 5 oz', 6.98],
      nationals: [
        ['StarKist', 'Chunk Light Tuna in Water', '5 oz', 1.12, ['Canned', 'Wild caught']],
        ['Bumble Bee', 'Solid White Albacore Tuna in Water', '5 oz', 1.98, ['Canned', 'Albacore']],
      ],
    }),
    k('Chicken Broth', '32 oz', 1.48, ['Carton', 'Fat free'], {
      keywords: ['stock'],
      club: ['6 x 32 oz', 8.99],
      nationals: [
        ['Swanson', 'Chicken Broth', '32 oz', 2.48, ['Carton']],
        ['Pacific Foods', 'Organic Free Range Chicken Broth', '32 oz', 3.48, ['Organic', 'Carton']],
      ],
    }),
    k('Condensed Chicken Noodle Soup', '10.5 oz', 0.72, ['Canned', 'Condensed'], {
      nationals: [
        ["Campbell's", 'Condensed Chicken Noodle Soup', '10.75 oz', 1.26, ['Canned', 'Condensed']],
        ['Progresso', 'Traditional Chicken Noodle Soup', '19 oz', 2.48, ['Canned', 'Ready to serve']],
      ],
    }),
  ],
  Snacks: [
    k('Classic Potato Chips', '8 oz', 1.97, ['Original'], {
      nationals: [
        ["Lay's", 'Classic Potato Chips', '8 oz', 3.98, ['Original']],
        ['Pringles', 'Original Potato Crisps', '5.2 oz', 1.98, ['Canister']],
      ],
    }),
    k('Tortilla Chips', '13 oz', 2.18, ['Restaurant style'], {
      club: ['40 oz', 5.49],
      nationals: [
        ['Tostitos', 'Scoops! Tortilla Chips', '10 oz', 4.48, ['Party size']],
        ['Doritos', 'Nacho Cheese Tortilla Chips', '9.25 oz', 4.98, ['Nacho cheese']],
      ],
    }),
    k('Medium Chunky Salsa', '16 oz', 1.98, ['Jar', 'Medium'], { nationals: [['Tostitos', 'Medium Chunky Salsa', '15.5 oz', 3.98, ['Jar', 'Medium']]] }),
    k('Deluxe Mixed Nuts', '15.25 oz', 7.48, ['Lightly salted', 'No peanuts'], { club: ['40 oz', 15.99], nationals: [['Planters', 'Deluxe Mixed Nuts', '15.25 oz', 9.98, ['Sea salt']]] }),
    k('Chewy Chocolate Chip Granola Bars', '10 ct', 2.12, ['Individually wrapped'], {
      club: ['60 ct', 9.98],
      nationals: [
        ['Quaker', 'Chewy Chocolate Chip Granola Bars', '8 ct', 2.98, ['Individually wrapped']],
        ['Nature Valley', "Oats 'n Honey Crunchy Granola Bars", '12 ct', 3.48, ['Whole grain']],
      ],
    }),
    k('Baked Cheese Crackers', '12.4 oz', 2.24, ['Made with real cheese'], {
      nationals: [
        ['Cheez-It', 'Original Baked Cheese Crackers', '12.4 oz', 4.28, ['Made with real cheese']],
        ['Ritz', 'Original Crackers', '13.7 oz', 3.98, ['Buttery']],
        ['Goldfish', 'Cheddar Baked Snack Crackers', '6.6 oz', 2.48, ['Made with real cheese']],
      ],
    }),
    k('Chocolate Sandwich Cookies', '14.3 oz', 1.98, ['Creme filled'], {
      nationals: [
        ['Oreo', 'Chocolate Sandwich Cookies', '13.29 oz', 4.28, ['Creme filled']],
        ['Chips Ahoy!', 'Original Chocolate Chip Cookies', '13 oz', 3.98, ['Crunchy']],
      ],
    }),
    k('Butter Microwave Popcorn', '6 ct', 2.18, ['Bags'], { nationals: [["Orville Redenbacher's", 'Butter Microwave Popcorn', '6 ct', 4.28, ['Bags']]] }),
  ],
  Beverages: [
    k('Purified Drinking Water', '24 x 16.9 fl oz', 3.48, ['24 bottles'], {
      keywords: ['bottled water'],
      club: ['40 x 16.9 fl oz', 4.49],
      nationals: [['Dasani', 'Purified Water', '24 x 16.9 fl oz', 6.98, ['24 bottles']]],
    }),
    k('100% Orange Juice No Pulp', '52 fl oz', 3.12, ['Not from concentrate'], {
      keywords: ['oj'],
      club: ['2 x 59 fl oz', 8.99],
      nationals: [
        ['Tropicana', 'Pure Premium No Pulp Orange Juice', '52 fl oz', 4.48, ['Not from concentrate']],
        ['Simply', 'Orange Pulp Free Juice', '52 fl oz', 4.58, ['Not from concentrate']],
      ],
    }),
    k('100% Apple Juice', '64 fl oz', 1.98, ['From concentrate'], { nationals: [["Mott's", '100% Apple Juice', '64 fl oz', 3.28, ['No added sugar']]] }),
    k('Cola Soda', '2 L', 1.18, ['2 liter bottle'], {
      keywords: ['pop', 'soft drink'],
      nationals: [
        ['Coca-Cola', 'Classic Soda', '12 x 12 fl oz', 7.98, ['12 cans']],
        ['Coca-Cola', 'Classic Soda Bottle', '2 L', 2.48, ['2 liter bottle']],
        ['Pepsi', 'Cola Soda', '12 x 12 fl oz', 7.48, ['12 cans']],
        ['Gatorade', 'Lemon-Lime Thirst Quencher', '8 x 20 fl oz', 6.98, ['8 bottles', 'Sports drink']],
      ],
    }),
    k('Lime Sparkling Water', '12 x 12 fl oz', 3.68, ['12 cans', 'Zero calories'], {
      keywords: ['seltzer'],
      club: ['35 x 12 fl oz', 9.89],
      nationals: [['LaCroix', 'Lime Sparkling Water', '12 x 12 fl oz', 5.48, ['12 cans', 'Zero calories']]],
    }),
    k('Classic Roast Ground Coffee', '30.5 oz', 7.98, ['Medium roast', 'Canister'], {
      club: ['48 oz', 15.99],
      nationals: [
        ['Folgers', 'Classic Roast Ground Coffee', '25.9 oz', 9.97, ['Medium roast', 'Canister']],
        ['Maxwell House', 'Original Roast Ground Coffee', '30.6 oz', 9.48, ['Medium roast', 'Canister']],
        ['Starbucks', 'Pike Place Roast Ground Coffee', '12 oz', 8.98, ['Medium roast', 'Bag']],
      ],
    }),
    k('Breakfast Blend Coffee Pods', '48 ct', 14.98, ['Light roast', 'Single serve'], {
      keywords: ['k-cup', 'keurig'],
      club: ['120 ct', 34.99],
      nationals: [['Green Mountain Coffee Roasters', 'Breakfast Blend K-Cup Pods', '24 ct', 14.98, ['Light roast', 'Single serve']]],
    }),
    k('Black Tea Bags', '100 ct', 2.24, ['Family size box'], { nationals: [['Lipton', 'Black Tea Bags', '100 ct', 4.98, ['Family size box']]] }),
  ],
  Frozen: [
    k('Frozen Broccoli Florets', '12 oz', 1.16, ['Steamable bag'], { club: ['4 lb', 6.98], nationals: [['Birds Eye', 'Steamfresh Frozen Broccoli Florets', '10.8 oz', 2.48, ['Steamable bag']]] }),
    k('Frozen Mixed Vegetables', '12 oz', 1.16, ['Steamable bag', 'Carrots, corn, peas, green beans'], {}),
    k('Frozen Whole Strawberries', '16 oz', 2.98, ['No sugar added'], { club: ['6 lb', 10.99] }),
    k('Vanilla Ice Cream', '48 fl oz', 2.97, ['1.5 quart'], {
      nationals: [
        ['Breyers', 'Natural Vanilla Ice Cream', '48 fl oz', 4.97, ['1.5 quart']],
        ["Ben & Jerry's", 'Half Baked Ice Cream', '16 fl oz', 4.98, ['Pint']],
      ],
    }),
    k('Rising Crust Pepperoni Pizza', '28 oz', 3.98, ['Frozen pizza', '12 inch'], {
      nationals: [
        ['DiGiorno', 'Rising Crust Pepperoni Frozen Pizza', '27.5 oz', 6.97, ['12 inch']],
        ['Red Baron', 'Classic Crust Pepperoni Frozen Pizza', '20.6 oz', 4.48, ['12 inch']],
        ["Totino's", 'Pepperoni Party Pizza', '9.8 oz', 1.68, ['Thin crust']],
      ],
    }),
    k('Frozen Chicken Nuggets', '32 oz', 5.97, ['Fully cooked', 'Breaded'], { club: ['5 lb', 13.99], nationals: [['Tyson', 'Frozen Chicken Nuggets', '32 oz', 7.98, ['Fully cooked', 'Breaded']]] }),
    k('Frozen Crinkle Cut French Fries', '32 oz', 2.67, ['Oven ready'], { nationals: [['Ore-Ida', 'Golden Crinkles French Fries', '32 oz', 4.48, ['Oven ready', 'Gluten free']]] }),
    k('Frozen Homestyle Waffles', '10 ct', 1.98, ['Toaster ready'], { nationals: [['Eggo', 'Homestyle Frozen Waffles', '10 ct', 2.98, ['Toaster ready']]] }),
    k('Frozen Large Raw Shrimp', '12 oz', 5.98, ['Peeled & deveined', 'Tail on'], { target: false, keywords: ['seafood'], club: ['2 lb', 15.99] }),
  ],
  Breakfast: [
    k('Toasted Oats Cereal', '12 oz', 1.97, ['Whole grain oats'], {
      nationals: [
        ['Cheerios', 'Original Toasted Oats Cereal', '8.9 oz', 3.68, ['Whole grain oats', 'Gluten free']],
        ['Cheerios', 'Honey Nut Cereal', '10.8 oz', 3.98, ['Whole grain oats', 'Gluten free']],
      ],
    }),
    k('Frosted Flakes Cereal', '13.5 oz', 1.97, ['Sweetened corn flakes'], { nationals: [["Kellogg's", 'Frosted Flakes Cereal', '13.5 oz', 3.98, ['Sweetened corn flakes']]] }),
    k('Old Fashioned Oats', '42 oz', 3.98, ['100% whole grain', 'Canister'], {
      keywords: ['oatmeal'],
      club: ['10 lb', 9.49],
      nationals: [
        ['Quaker', 'Old Fashioned Oats', '42 oz', 5.48, ['100% whole grain', 'Canister']],
        ["Bob's Red Mill", 'Gluten Free Old Fashioned Rolled Oats', '32 oz', 6.48, ['Gluten free', 'Whole grain']],
        ['Quaker', 'Maple & Brown Sugar Instant Oatmeal', '10 ct', 3.48, ['Packets']],
      ],
    }),
    k('Original Pancake & Waffle Mix', '32 oz', 1.98, ['Just add water'], {
      nationals: [
        ['Pearl Milling Company', 'Original Pancake & Waffle Mix', '32 oz', 3.28, ['Just add water']],
        ['Kodiak', 'Buttermilk Power Cakes Pancake & Waffle Mix', '20 oz', 5.48, ['14g protein', 'Whole grain']],
      ],
    }),
    k('Original Pancake Syrup', '24 fl oz', 2.24, ['Squeeze bottle'], { nationals: [["Mrs. Butterworth's", 'Original Pancake Syrup', '24 fl oz', 3.98, ['Squeeze bottle']]] }),
    k('100% Pure Maple Syrup', '12.5 fl oz', 6.98, ['Grade A', 'Amber'], { club: ['33.8 fl oz', 12.99] }),
    only('Toaster Pastries', ['breakfast pastry'], [['Pop-Tarts', 'Frosted Strawberry Toaster Pastries', '8 ct', 2.48, ['Individually wrapped pairs']]]),
  ],
  Baby: [
    k('Diapers Size 3', '82 ct', 15.97, ['16-28 lb', 'Hypoallergenic'], {
      keywords: ['nappies'],
      club: ['192 ct', 39.99],
      nationals: [
        ['Pampers', 'Swaddlers Diapers Size 3', '78 ct', 28.94, ['16-28 lb']],
        ['Huggies', 'Little Snugglers Diapers Size 3', '76 ct', 28.97, ['16-28 lb']],
      ],
    }),
    k('Fragrance Free Baby Wipes', '240 ct', 5.42, ['Hypoallergenic', '3 packs'], {
      club: ['900 ct', 17.99],
      nationals: [
        ['Huggies', 'Natural Care Sensitive Baby Wipes', '168 ct', 6.97, ['Fragrance free']],
        ['Pampers', 'Sensitive Baby Wipes', '168 ct', 6.94, ['Fragrance free']],
      ],
    }),
    k('Infant Formula Powder with Iron', '35 oz', 21.98, ['Milk-based', '0-12 months'], {
      club: ['42 oz', 24.99],
      nationals: [
        ['Similac', '360 Total Care Infant Formula Powder', '30.8 oz', 46.98, ['Milk-based', '0-12 months']],
        ['Enfamil', 'NeuroPro Infant Formula Powder', '28.3 oz', 49.98, ['Milk-based', '0-12 months']],
      ],
    }),
    only('Baby Food', ['puree'], [
      ['Gerber', '2nd Foods Banana Baby Food', '8 oz', 1.78, ['2 tubs', 'Sitter']],
      ['Happy Baby', 'Organics Stage 2 Pears, Kale & Spinach Pouch', '4 oz', 1.68, ['Organic', 'Pouch']],
    ]),
  ],
  Household: [
    k('Paper Towels Double Rolls', '6 ct', 6.47, ['2-ply', 'Choose-a-size sheets'], {
      club: ['12 ct', 21.99],
      nationals: [
        ['Bounty', 'Select-A-Size Paper Towels Double Rolls', '6 ct', 15.97, ['2-ply']],
        ['Viva', 'Signature Cloth Paper Towels', '6 ct', 12.98, ['Soft texture']],
      ],
    }),
    k('Ultra Soft Toilet Paper Mega Rolls', '12 ct', 6.74, ['2-ply', 'Septic safe'], {
      keywords: ['bath tissue', 'tp'],
      club: ['30 ct', 23.99],
      nationals: [
        ['Charmin', 'Ultra Soft Toilet Paper Mega Rolls', '12 ct', 13.97, ['2-ply', 'Septic safe']],
        ['Cottonelle', 'Ultra Comfort Toilet Paper Mega Rolls', '12 ct', 12.48, ['2-ply']],
        ['Scott', '1000 Toilet Paper Rolls', '12 ct', 10.98, ['1-ply', '1000 sheets per roll']],
      ],
    }),
    k('Original Liquid Laundry Detergent', '100 fl oz', 6.94, ['64 loads', 'HE compatible'], {
      club: ['194 fl oz', 16.99],
      nationals: [
        ['Tide', 'Original Liquid Laundry Detergent', '92 fl oz', 12.97, ['64 loads', 'HE compatible']],
        ['all', 'Free Clear Liquid Laundry Detergent', '88 fl oz', 10.97, ['Sensitive skin', 'Fragrance free']],
        ['Tide', 'PODS Original Laundry Detergent Pacs', '42 ct', 13.47, ['HE compatible']],
      ],
    }),
    k('Ultra Dish Soap', '40 fl oz', 2.97, ['Original scent'], { keywords: ['dishwashing liquid'], nationals: [['Dawn', 'Ultra Original Dish Soap', '19.4 fl oz', 2.98, ['Original scent']]] }),
    k('Tall Kitchen Drawstring Trash Bags', '45 ct', 6.48, ['13 gallon', 'Unscented'], {
      keywords: ['garbage bags'],
      club: ['200 ct', 19.99],
      nationals: [
        ['Glad', 'ForceFlex Tall Kitchen Drawstring Trash Bags', '40 ct', 8.97, ['13 gallon']],
        ['Hefty', 'Ultra Strong Tall Kitchen Drawstring Trash Bags', '40 ct', 7.98, ['13 gallon']],
      ],
    }),
    k('Disinfecting Wipes', '75 ct', 2.98, ['Lemon scent', 'Kills 99.9% of germs'], {
      club: ['304 ct', 13.99],
      nationals: [
        ['Clorox', 'Disinfecting Wipes', '75 ct', 4.97, ['Bleach free']],
        ['Lysol', 'Disinfecting Wipes', '80 ct', 4.98, ['Lemon & lime blossom']],
      ],
    }),
    k('Facial Tissues', '160 ct', 1.48, ['2-ply', 'Flat box'], { nationals: [['Kleenex', 'Trusted Care Facial Tissues', '160 ct', 2.18, ['2-ply', 'Flat box']]] }),
    k('Gallon Storage Bags', '40 ct', 3.42, ['Double zipper'], { keywords: ['zip bags'], nationals: [['Ziploc', 'Gallon Storage Bags', '38 ct', 5.28, ['Grip n seal']]] }),
    k('Dishwasher Detergent Pacs', '60 ct', 9.98, ['Fresh scent'], {
      keywords: ['dishwasher pods'],
      club: ['115 ct', 17.99],
      nationals: [['Cascade', 'Platinum ActionPacs Dishwasher Detergent', '36 ct', 13.97, ['Fresh scent']]],
    }),
    k('Regular Bleach', '121 fl oz', 3.48, ['Concentrated'], { target: false, nationals: [['Clorox', 'Disinfecting Bleach', '81 fl oz', 5.48, ['Concentrated']]] }),
  ],
};

/** Singular search noun per category. */
export const GROCERY_CATEGORY_NOUN: Record<string, string> = {
  Produce: 'produce',
  'Dairy & Eggs': 'dairy',
  'Meat & Seafood': 'meat',
  Bakery: 'bread',
  Pantry: 'pantry',
  'Canned Goods': 'canned',
  Snacks: 'snack',
  Beverages: 'drink',
  Frozen: 'frozen',
  Breakfast: 'breakfast',
  Baby: 'baby',
  Household: 'household',
};

/** Categories Amazon ships (shelf-stable only). */
export const SHELF_STABLE = new Set(['Pantry', 'Canned Goods', 'Snacks', 'Beverages', 'Breakfast', 'Baby', 'Household']);

export const GROCERY_TRENDING = ['milk', 'eggs', 'bread', 'rice', 'pasta', 'chicken breast', 'coffee', 'paper towels', 'bananas', 'cereal'];
