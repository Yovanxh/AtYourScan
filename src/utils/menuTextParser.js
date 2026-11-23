/**
 * src/utils/menuTextParser.js
 * 
 * High-performance, robust Natural Language & Semi-Structured Menu Text Parser.
 * Automatically ingests raw multi-step menu prompts containing:
 * - Step 1: Dynamic Category tables (Name, Course Classification, Dietary Scope)
 * - Step 2: Dish entries under Category headers with base prices, multi-size variations (R/M/L),
 *   descriptions, and dietary classifications.
 */

export const SAMPLE_MASTER_MENU_PROMPT = `Step 1: Create the Categories First(Use the Dynamic Category Builder form. All items on this menu are 100% vegetarian, so set Dietary Scope to Veg Only across all categories).   Category Display Name   JPGCourse Classification   JPGDietary Scope   JPGHot BeveragesBeveragesVeg Only   Thick Cold CoffeeBeveragesVeg Only   Thick ShakesBeveragesVeg Only   Exclusive Chocolate ShakesBeveragesVeg Only   MocktailsBeveragesVeg Only   SaladAppetizers / StartersVeg Only   FriesAppetizers / StartersVeg Only   Open Toast & Garlic BreadAppetizers / StartersVeg Only   MomosAppetizers / StartersVeg Only   PizzaMain Course   Veg Only   Pizza ManiaMain Course   Veg Only   BurgerMain Course   Veg Only   Grilled SandwichMain Course   Veg Only   Classic Non-Grilled SandwichMain Course   Veg Only   Dessert & Chocolate ManiaDessertVeg Only   Step 2: Dish Creation Entries(Use the Manual Dish Creation & Recipe BOM form. Set Dietary Classification to Vegetarian for every entry).   Category: Hot BeveragesTea | Price: 20 | Description: Classic hot brewed tea   Hot Coffee | Price: 30 | Description: Freshly brewed hot coffee   Hot Chocolate | Price: 50 | Description: Rich warm chocolate beverage   Cappuccino | Price: 50 | Description: Espresso with steamed milk and dense milk foam   Café Mocha | Price: 60 | Description: Coffee infused with rich chocolate and steamed milk   Category: Thick Cold CoffeeThick Cold Coffee | Price: 50 | Description: Rich and creamy blended thick cold coffee   Thick white Cold Coffee | Price: 50 | Description: Creamy white chocolate blended cold coffee   Cold Americano Coffee | Price: 50 | Description: Chilled black espresso over ice and water   Regular Cold Coffee | Price: 50 | Description: Classic chilled sweetened coffee   FWC Spl. Cold Coffee | Price: 70 | Description: House special signature thick cold coffee   Thick Cold Coffee Crush | Price: 70 | Description: Thick blended cold coffee with chocolate/wafer crush   Thick white Cold Coffee Crush | Price: 70 | Description: Creamy white cold coffee with crushed mix-ins   Milky Oreo | Price: 70 | Description: Cold coffee blended with crunchy Oreo cookies   Brownie Coffee | Price: 120 | Description: Blended cold coffee with rich chocolate brownie chunks   Category: Thick ShakesStrawberry | Price: 50 | Description: Classic chilled strawberry thick shake   Blackcurrant | Price: 50 | Description: Tangy and sweet blackcurrant thick shake   Mango | Price: 70 | Description: Sweet tropical mango thick shake   Butterscotch | Price: 70 | Description: Rich butterscotch blended thick shake   Gulkand | Price: 70 | Description: Refreshing sweet rose petal gulkand thick shake   Pista | Price: 70 | Description: Creamy pistachio thick shake   Category: Exclusive Chocolate ShakesCAD-B | Price: 120 | Description: Signature ultra-thick rich chocolate fudge shake   Oreo | Price: 120 | Description: Blended Oreo cookies with rich chocolate thick shake   Almond | Price: 140 | Description: Rich chocolate shake loaded with crushed roasted almonds   Kitkat | Price: 140 | Description: Thick chocolate shake blended with crispy KitKat wafers   Choco Brownie Crumble | Price: 150 | Description: Loaded chocolate thick shake with brownie crumble   Ferrero Shake | Price: 150 | Description: Premium hazelnut chocolate thick shake   Category: MocktailsHouse Special Mint Mozito | Price: 90 | Description: Fresh mint leaves, lime, sugar, and sparkling soda   Melon Cooler | Price: 90 | Description: Chilled refreshing melon flavored mocktail   Blue Curacao | Price: 90 | Description: Tangy citrus blue curacao mocktail over ice   Ice Tea | Price: 90 | Description: Classic chilled sweetened iced tea   Green Apple | Price: 90 | Description: Crisp tart green apple cooler with soda   Category: Salad & FriesGreen Salad | Price: 60 | Description: Fresh cut garden vegetables   Classic Fries | Price: 20 | Description: Simple crispy salted fries   Masala Fries | Price: 30 | Description: Peri peri masala delight sprinkled fries   Cheesy Fries | Price: 50 | Description: Golden crispy fries topped with cheesy sauce   Mayo Fries | Price: 50 | Description: Crispy fries drizzled with creamy mayonnaise sauce   Peri Peri Fries | Price: 60 | Description: Fries tossed in spicy peri peri sauce   Tandoori Fries | Price: 60 | Description: Crispy fries coated in rich tandoori sauce   Category: Open Toast & Garlic BreadStuffed Garlic Bread | Price: 30 | Description: Oven-baked bread stuffed with garlic butter and herbs   Cheese Garlic Toast | Price: 40 | Description: Crispy toasted bread topped with melted cheese and garlic   Garlic Breadsticks | Price: 60 | Description: Freshly baked garlic herb breadsticks   Category: MomosMix Veg Momos | Price: 100 | Description: Steamed dumplings filled with mixed seasoned vegetables   Paneer Momos | Price: 120 | Description: Steamed momos packed with spiced minced paneer   Cheese Corn Momos | Price: 120 | Description: Steamed dumplings with sweet corn and melted cheese   Paneer Tikka Momos | Price: 130 | Description: Dumplings stuffed with smokey paneer tikka filling   Veg Kurkure Momos | Price: 140 | Description: Crunchy fried momos coated in a crispy outer batter   Category: BurgersClassic Veggie Burger | Price: 70 | Description: Mayo, fresh vegetables, crisp lettuce, veg patty   Peri Peri Paradise | Price: 80 | Description: Peri peri sauce, fresh vegetables, crisp lettuce, veg patty   Exotic Spinach Burger | Price: 90 | Description: Mayo, fresh vegetables, lettuce, seasoned spinach patty   Cheesy Burger | Price: 100 | Description: Cheese sauce, fresh vegetables, veg patty, cheese slice   Maharaja Burger | Price: 110 | Description: 2 veg patties, tandoori sauce, fresh vegetables, cheese slice   Spicy Paneer Burger | Price: 130 | Description: Tandoori sauce, fresh vegetables, paneer patty, cheese slice   Category: Sandwiches (Grilled & Non-Grilled)Bread Butter | Price: 30 | Description: Fresh bread slices layered with salted butter   Bread Butter Chutney | Price: 40 | Description: Fresh bread layered with butter and spicy green chutney   Veg Sandwich | Price: 60 | Description: Non-grilled classic cold sandwich with fresh sliced veggies   Veg Grilled | Price: 70 | Description: Fresh veggies toasted in grilled bread   Veg Cheese Grilled | Price: 70 | Description: Mayonnaise, cheese, and crunchy veggies grilled to perfection   Veg Corn Grilled | Price: 70 | Description: Mayonnaise, sweet juicy corn, and veggies   Veg Spicy Grilled | Price: 70 | Description: Peri peri sauce, seasoned vegetables, grilled crisp   Tandoori Paneer Grilled | Price: 70 | Description: Tandoori sauce, juicy spiced paneer, and veggies   Cheesy Corn Grilled | Price: 80 | Description: Cheesy sauce, mozzarella cheese, and golden corn   Category: Pizza ManiaOnion Pizza | Price: 130 | Description: Mozzarella cheese with crunchy onion   Tomato Pizza | Price: 130 | Description: Mozzarella cheese with sliced fresh tomato   Capsicum Pizza | Price: 130 | Description: Mozzarella cheese with crisp green capsicum   Mashroom Pizza | Price: 140 | Description: Mozzarella cheese with fresh sliced mushroom   Paneer Pizza | Price: 140 | Description: Mozzarella cheese with soft paneer cubes   Category: Pizza (Multi-size entry format)(If your form takes a single base price, use the Regular (R) price as default; if entering per size, use the R/M/L values):   Margherita Pizza | Price: 140 (M: 220, L: 320) | Description: Loaded with mozzarella cheese   Farm Fresh Pizza | Price: 150 (M: 240, L: 340) | Description: Mozzarella cheese, tomato, onion, capsicum   Cheese & Corn Pizza | Price: 150 (M: 240, L: 340) | Description: Mozzarella cheese, sweet & juicy corn   Golden Corn Pizza | Price: 160 (M: 260, L: 360) | Description: Mozzarella cheese, sweet corn, onion, red paprika   Indiana Hot & Spicy Pizza | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese, tomato, onion, capsicum, mushroom, hot & spicy masala   Mexicana Stylo Pizza | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese, tomato, onion, capsicum, jalapeno, oregano   Americano Pizza | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese, onion, capsicum, jalapeno, black olives, red paprika   Vegetarian Feast Pizza | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese, onion, capsicum, corn, mushroom, black olives   Peri Peri Supreme | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese, onion, tomato, capsicum, peri peri sauce   Double Cheese Pizza | Price: 180 (M: 280, L: 380) | Description: Mozzarella cheese with extra melted cheese   Indiana Tandoori Paneer Pizza | Price: 190 (M: 290, L: 390) | Description: Mozzarella cheese, onion, capsicum, juicy paneer with tandoori masala   Paneer Makhani Pizza | Price: 190 (M: 290, L: 390) | Description: Mozzarella cheese, tomato, onion, capsicum, paneer, makhani sauce   Spicy Premium Paneer Pizza | Price: 200 (M: 300, L: 400) | Description: Mozzarella cheese, onion, tomato, capsicum, red paprika, paneer, corn   Category: Dessert & Chocolate ManiaSeezling Brownie | Price: 60 | Description: Sizzling rich chocolate brownie served warm   Chocolate Grilled Sandwich | Price: 90 | Description: Grilled crispy sandwich filled with warm sweet chocolate sauce`;

/**
 * Parses free-form or semi-structured menu text into structured categories and dishes.
 * Supports:
 * - Multi-line Key-Value format (Category Display Name, Dish Name, Price, Description)
 * - Multi-size price variations in either Price or Description field (Regular/Medium/Large or R/M/L)
 * - Legacy pipe-delimited Step 1 & Step 2 format
 * - Markdown tables and list formats
 * 
 * @param {string} rawText - Raw user text input
 * @returns {{
 *   categories: Array<{ name: string, course_type: string, dietary_scope: string }>,
 *   dishes: Array<{
 *     name: string,
 *     category: string,
 *     price: number,
 *     variations: Array<{ size: string, price: number }>,
 *     description: string,
 *     dietary_tag: string,
 *     is_available: boolean
 *   }>,
 *   summary: {
 *     totalCategories: number,
 *     totalDishes: number,
 *     dietaryScope: string,
 *     multiSizeCount: number
 *   }
 * }}
 */
export function parseMenuPrompt(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      categories: [],
      dishes: [],
      summary: { totalCategories: 0, totalDishes: 0, dietaryScope: 'Veg Only', multiSizeCount: 0 }
    };
  }

  const text = rawText.trim();
  const categoriesMap = new Map(); // lowercase name -> category object
  const dishes = [];

  function normalizeCourse(course) {
    if (!course) return 'Main Course';
    const c = String(course).trim();
    if (/Beverage|Drink|Shake|Coffee|Tea|Mocktail/i.test(c)) return 'Beverage';
    if (/Appetizer|Starter|Salad|Fries|Toast|Bread|Momo/i.test(c)) return 'Starter';
    if (/Dessert|Sweet|Chocolate/i.test(c)) return 'Dessert';
    return 'Main Course';
  }

  function normalizeDietary(dietary) {
    if (!dietary) return 'Veg Only';
    const d = String(dietary).trim();
    if (/Veg\s*Only|Vegetarian|^Veg$/i.test(d)) return 'Veg Only';
    if (/Non-Veg|Non\s*Vegetarian/i.test(d)) return 'Non-Veg';
    if (/Vegan/i.test(d)) return 'Vegan';
    return d;
  }

  function cleanCategoryName(raw) {
    if (!raw) return '';
    let name = String(raw).replace(/^[-–—=*#\s[\]]+|[-–—=*#\s[\]]+$/g, '').trim();
    // remove parenthesized notes like "(Multi-size entry format)(...)" or "(Dynamic Category Builder)"
    name = name.replace(/\([^)]*\)/g, '').trim();
    name = name.replace(/^Category\s*:\s*/i, '').trim();
    return name;
  }

  // --- 1. EXTRACT CATEGORIES ---

  // Strategy 1A: Key-Value category blocks
  // e.g. "Category Display Name: Hot Beverages\nCourse Classification: Beverages\nDietary Scope: Veg Only"
  const catBlockRegex = /(?:Category(?:\s+Display)?\s+Name)\s*:\s*([^\r\n]+)/gi;
  let catMatch;
  while ((catMatch = catBlockRegex.exec(text)) !== null) {
    const rawName = cleanCategoryName(catMatch[1]);
    if (!rawName) continue;

    // Look ahead within next 250 chars for Course Classification and Dietary Scope
    const afterIdx = catMatch.index + catMatch[0].length;
    const windowText = text.substring(afterIdx, afterIdx + 250);

    const courseMatch = windowText.match(/(?:Course(?:\s+Classification)?)\s*:\s*([^\r\n]+)/i);
    const dietaryMatch = windowText.match(/(?:Dietary(?:\s+Scope)?)\s*:\s*([^\r\n]+)/i);

    const course = normalizeCourse(courseMatch ? courseMatch[1] : rawName);
    const dietary = normalizeDietary(dietaryMatch ? dietaryMatch[1] : 'Veg Only');

    if (!categoriesMap.has(rawName.toLowerCase())) {
      categoriesMap.set(rawName.toLowerCase(), {
        name: rawName,
        course_type: course,
        dietary_scope: dietary
      });
    }
  }

  // Strategy 1B: Legacy Step 1 format
  const step1Match = text.match(/Step\s*1\s*:\s*(.*?)(?=Step\s*2|$)/is);
  if (step1Match) {
    let cleaned = step1Match[1].replace(/Create\s+the\s+Categories\s+First\s*\([^)]*\)/gi, '');
    cleaned = cleaned.replace(/Category\s+Display\s+Name/gi, '');
    cleaned = cleaned.replace(/JPG\s*Course\s+Classification/gi, '');
    cleaned = cleaned.replace(/JPG\s*Dietary\s+Scope/gi, '');
    cleaned = cleaned.replace(/JPG/gi, '');

    const catRegex = /([A-Za-z0-9\s&'/+–-]+?)\s*(Beverages|Appetizers\s*\/\s*Starters|Main\s*Course|Dessert|Starters|Appetizers)\s*(Veg\s*Only|Non-Veg|Vegan|All|Vegetarian)/gi;
    let match;
    while ((match = catRegex.exec(cleaned)) !== null) {
      let rawName = match[1].trim();
      let course = normalizeCourse(match[2]);
      let dietary = normalizeDietary(match[3]);

      if (rawName && !categoriesMap.has(rawName.toLowerCase())) {
        categoriesMap.set(rawName.toLowerCase(), {
          name: rawName,
          course_type: course,
          dietary_scope: dietary
        });
      }
    }
  }

  // Helper to extract base price and variations from price and description text
  function extractVariationsAndPrice(priceRaw, descRaw) {
    let basePrice = 0;
    const priceNumMatch = String(priceRaw || '').match(/([0-9]+(?:\.[0-9]+)?)/);
    if (priceNumMatch) {
      basePrice = parseFloat(priceNumMatch[1]);
    }

    const variations = [];
    const varPattern = /\(([^)]*(?:Regular|Medium|Large|R|M|L)\s*[:\-=]\s*[0-9]+[^)]*)\)/i;

    const priceVarMatch = String(priceRaw || '').match(varPattern);
    const descVarMatch = String(descRaw || '').match(varPattern);

    const targetVarString = (priceVarMatch ? priceVarMatch[1] : '') + ' ' + (descVarMatch ? descVarMatch[1] : '');

    if (targetVarString.trim()) {
      const pairMatches = [...targetVarString.matchAll(/(Regular|Medium|Large|R|M|L)\s*[:\-=]\s*([0-9]+(?:\.[0-9]+)?)/gi)];
      for (const pm of pairMatches) {
        const rawCode = pm[1].trim();
        const p = parseFloat(pm[2]);
        let sizeName = 'Regular';
        if (/^m(?:edium)?$/i.test(rawCode)) sizeName = 'Medium';
        else if (/^l(?:arge)?$/i.test(rawCode)) sizeName = 'Large';
        else if (/^r(?:egular)?$/i.test(rawCode)) sizeName = 'Regular';

        if (!variations.some(v => v.size === sizeName)) {
          variations.push({ size: sizeName, price: p });
        }
      }
    }

    // Always ensure Regular variation exists
    if (!variations.some(v => v.size === 'Regular')) {
      variations.unshift({ size: 'Regular', price: basePrice });
    } else {
      const reg = variations.find(v => v.size === 'Regular');
      if (reg && (!basePrice || basePrice === 0)) {
        basePrice = reg.price;
      }
    }

    // Clean description by removing parenthesized variations
    let cleanDesc = String(descRaw || '').replace(varPattern, '').replace(/\s+/g, ' ').trim();
    cleanDesc = cleanDesc.replace(/^[,\s;:\-|]+|[,\s;:\-|]+$/g, '').trim();

    return { basePrice, variations, cleanDesc };
  }

  function inferCategoryFromDish(name, desc) {
    const combined = `${name} ${desc}`.toLowerCase();
    if (/brownie|dessert|chocolate|ice\s*cream|pastry|cake|sundae|sweet|kulfi/i.test(combined)) {
      return { name: 'Dessert & Chocolate Mania', course: 'Dessert' };
    }
    if (/pizza\s*mania/i.test(combined)) {
      return { name: 'Pizza Mania', course: 'Main Course' };
    }
    if (/pizza/i.test(combined)) {
      return { name: 'Pizza', course: 'Main Course' };
    }
    if (/burger/i.test(combined)) {
      return { name: 'Burger', course: 'Main Course' };
    }
    if (/sandwich|bread\s*butter|toast/i.test(combined)) {
      if (/garlic\s*bread|garlic\s*toast/i.test(combined)) {
        return { name: 'Open Toast & Garlic Bread', course: 'Starter' };
      }
      return { name: 'Sandwich', course: 'Main Course' };
    }
    if (/momo/i.test(combined)) {
      return { name: 'Momos', course: 'Starter' };
    }
    if (/fries/i.test(combined)) {
      return { name: 'Fries', course: 'Starter' };
    }
    if (/salad/i.test(combined)) {
      return { name: 'Salad', course: 'Starter' };
    }
    if (/garlic\s*bread|garlic\s*toast/i.test(combined)) {
      return { name: 'Open Toast & Garlic Bread', course: 'Starter' };
    }
    if (/cold\s*coffee/i.test(combined)) {
      return { name: 'Thick Cold Coffee', course: 'Beverage' };
    }
    if (/chocolate\s*shake|cad-b|oreo\s*shake|ferrero/i.test(combined)) {
      return { name: 'Exclusive Chocolate Shakes', course: 'Beverage' };
    }
    if (/shake/i.test(combined)) {
      return { name: 'Thick Shakes', course: 'Beverage' };
    }
    if (/mocktail|cooler|curacao|mozito|mojito/i.test(combined)) {
      return { name: 'Mocktails', course: 'Beverage' };
    }
    if (/coffee|tea|cappuccino|mocha|latte|hot\s*chocolate/i.test(combined)) {
      return { name: 'Hot Beverages', course: 'Beverage' };
    }
    return { name: 'General', course: 'Main Course' };
  }

  // --- 2. EXTRACT DISHES ---

  // Strategy 2A: Multi-line Key-Value format (e.g. Dish Name: ... \n Price: ... \n Description: ...)
  if (/Dish\s+Name\s*:/i.test(text) || /Item\s+Name\s*:/i.test(text)) {
    const lines = text.split(/\r?\n/);
    let currentCategory = 'General';

    const isCategoryHeader = (line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(?:[-–—=*#\s[\]]+)?Category\s*:\s*([^-–—=*#\r\n\]]+?)(?:[-–—=*#\s[\]]+)?$/i);
      if (match) return cleanCategoryName(match[1]);
      return null;
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      const catFound = isCategoryHeader(line);
      if (catFound) {
        currentCategory = catFound;
        if (!categoriesMap.has(currentCategory.toLowerCase())) {
          categoriesMap.set(currentCategory.toLowerCase(), {
            name: currentCategory,
            course_type: normalizeCourse(currentCategory),
            dietary_scope: 'Veg Only'
          });
        }
        i++;
        continue;
      }

      const dishNameMatch = line.match(/^(?:Dish|Item)?\s*Name\s*:\s*([^\r\n]+)/i);
      if (dishNameMatch) {
        const dishName = dishNameMatch[1].trim();
        let priceStr = '';
        let descStr = '';

        i++;
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          if (!nextLine) {
            i++;
            continue;
          }

          if (isCategoryHeader(nextLine) || /^(?:Dish|Item)?\s*Name\s*:/i.test(nextLine)) {
            break;
          }

          const priceMatch = nextLine.match(/^(?:Price|Rate)\s*:\s*([^\r\n]+)/i);
          if (priceMatch) {
            priceStr = priceMatch[1].trim();
            i++;
            continue;
          }

          const descMatch = nextLine.match(/^(?:Description|Desc)\s*:\s*([^\r\n]+)/i);
          if (descMatch) {
            descStr = descMatch[1].trim();
            i++;
            while (i < lines.length) {
              const contLine = lines[i].trim();
              if (!contLine || isCategoryHeader(contLine) || /^(?:Dish|Item)?\s*Name\s*:/i.test(contLine) || /^(?:Price|Rate)\s*:/i.test(contLine)) {
                break;
              }
              descStr += ' ' + contLine;
              i++;
            }
            continue;
          }

          i++;
        }

        const { basePrice, variations, cleanDesc } = extractVariationsAndPrice(priceStr, descStr);

        let assignedCat = currentCategory;
        if (assignedCat === 'General') {
          const inferred = inferCategoryFromDish(dishName, cleanDesc);
          assignedCat = inferred.name;
          if (!categoriesMap.has(assignedCat.toLowerCase())) {
            categoriesMap.set(assignedCat.toLowerCase(), {
              name: assignedCat,
              course_type: inferred.course,
              dietary_scope: 'Veg Only'
            });
          }
        }

        dishes.push({
          name: dishName,
          category: assignedCat,
          price: basePrice,
          variations,
          description: cleanDesc,
          dietary_tag: 'Veg',
          is_available: true
        });

        continue;
      }

      i++;
    }
  }

  // Strategy 2B: Pipe-delimited chained format (e.g. Category: ... Dish | Price: ... | Description: ...)
  if (dishes.length === 0) {
    let step2Text = text;
    const step2Match = text.match(/Step\s*2\s*:\s*(.*)/is);
    if (step2Match) {
      step2Text = step2Match[1];
    }

    const rawBlocks = step2Text.split(/(?:^|\s+)Category\s*:\s*/i);

    for (const block of rawBlocks) {
      const trimmed = block.trim();
      if (!trimmed || !trimmed.includes('| Price:')) continue;

      const firstPriceIdx = trimmed.indexOf('| Price:');
      let headerPrefix = trimmed.substring(0, firstPriceIdx).trim();

      let matchedCatName = '';
      let firstDishName = '';

      const parenIdx = headerPrefix.indexOf('(');
      let testPrefix = headerPrefix;
      if (parenIdx !== -1) {
        testPrefix = headerPrefix.substring(0, parenIdx).trim();
      }

      const known = Array.from(categoriesMap.values()).map(c => c.name).find(c => testPrefix.toLowerCase().startsWith(c.toLowerCase()));
      if (known) {
        matchedCatName = known;
        const afterCat = headerPrefix.substring(headerPrefix.indexOf(known) + known.length);
        const colonIdx = afterCat.lastIndexOf(':');
        if (colonIdx !== -1) {
          firstDishName = afterCat.substring(colonIdx + 1).trim();
        } else {
          firstDishName = afterCat.replace(/^\s*\([^)]*\)\s*/, '').trim();
        }
      } else if (headerPrefix.includes(':')) {
        const parts = headerPrefix.split(':');
        matchedCatName = parts[0].replace(/\([^)]*\)/g, '').trim();
        firstDishName = parts.slice(1).join(':').trim();
      } else {
        const words = headerPrefix.split(/\s+/);
        if (words.length > 1) {
          matchedCatName = words.slice(0, -1).join(' ');
          firstDishName = words[words.length - 1];
        } else {
          matchedCatName = headerPrefix;
          firstDishName = '';
        }
      }

      matchedCatName = cleanCategoryName(matchedCatName) || 'General';

      let canonicalCat = matchedCatName;
      if (canonicalCat === 'Burgers') canonicalCat = 'Burger';
      if (canonicalCat.toLowerCase().includes('sandwiches')) canonicalCat = 'Grilled Sandwich';
      if (canonicalCat.toLowerCase().includes('salad & fries')) canonicalCat = 'Salad';
      if (canonicalCat.toLowerCase().startsWith('pizza')) {
        if (canonicalCat.toLowerCase().includes('mania')) {
          canonicalCat = 'Pizza Mania';
        } else {
          canonicalCat = 'Pizza';
        }
      }

      if (!categoriesMap.has(canonicalCat.toLowerCase())) {
        categoriesMap.set(canonicalCat.toLowerCase(), {
          name: canonicalCat,
          course_type: normalizeCourse(canonicalCat),
          dietary_scope: 'Veg Only'
        });
      }

      const fullItemsText = (firstDishName ? firstDishName + ' ' : '') + trimmed.substring(firstPriceIdx);
      const segments = fullItemsText.split(/\|\s*Price\s*:\s*/i);
      let currentItemName = segments[0].trim();

      for (let j = 1; j < segments.length; j++) {
        const seg = segments[j].trim();
        const descIdx = seg.search(/\|\s*Description\s*:\s*/i);
        let pricePart = '';
        let descPart = '';
        let nextDishName = '';

        if (descIdx !== -1) {
          pricePart = seg.substring(0, descIdx).trim();
          const afterDesc = seg.substring(descIdx).replace(/^\|\s*Description\s*:\s*/i, '').trim();

          if (j < segments.length - 1) {
            const splitMatch = afterDesc.split(/\r?\n|(?<=\S)\s{2,}(?=[A-Za-z0-9])/);
            if (splitMatch.length > 1) {
              descPart = splitMatch[0].trim();
              nextDishName = splitMatch.slice(1).join(' ').trim();
            } else {
              const multiSpaceIdx = afterDesc.search(/\s{2,}/);
              if (multiSpaceIdx !== -1) {
                descPart = afterDesc.substring(0, multiSpaceIdx).trim();
                nextDishName = afterDesc.substring(multiSpaceIdx).trim();
              } else {
                descPart = afterDesc;
              }
            }
          } else {
            descPart = afterDesc;
          }
        } else {
          pricePart = seg;
        }

        const { basePrice, variations, cleanDesc } = extractVariationsAndPrice(pricePart, descPart);
        let cleanName = currentItemName.replace(/^[:\-–—\s]+/, '').trim();

        let assignedCat = canonicalCat;
        if (assignedCat === 'Salad' && cleanName.toLowerCase().includes('fries')) {
          assignedCat = 'Fries';
        }
        if (assignedCat === 'Grilled Sandwich') {
          if (cleanDesc.toLowerCase().includes('non-grilled') || cleanName.toLowerCase().includes('non-grilled') || cleanName.toLowerCase().includes('butter')) {
            assignedCat = 'Classic Non-Grilled Sandwich';
          }
        }

        if (!categoriesMap.has(assignedCat.toLowerCase())) {
          categoriesMap.set(assignedCat.toLowerCase(), {
            name: assignedCat,
            course_type: normalizeCourse(assignedCat),
            dietary_scope: 'Veg Only'
          });
        }

        if (cleanName) {
          dishes.push({
            name: cleanName,
            category: assignedCat,
            price: basePrice,
            variations,
            description: cleanDesc,
            dietary_tag: 'Veg',
            is_available: true
          });
        }

        currentItemName = nextDishName;
      }
    }
  }

  // Ensure all dishes' categories exist in categoriesMap
  for (const dish of dishes) {
    if (!categoriesMap.has(dish.category.toLowerCase())) {
      categoriesMap.set(dish.category.toLowerCase(), {
        name: dish.category,
        course_type: normalizeCourse(dish.category),
        dietary_scope: 'Veg Only'
      });
    }
  }

  const categories = Array.from(categoriesMap.values());
  const multiSizeCount = dishes.filter(d => d.variations && d.variations.length > 1).length;

  return {
    categories,
    dishes,
    summary: {
      totalCategories: categories.length,
      totalDishes: dishes.length,
      dietaryScope: 'Veg Only',
      multiSizeCount
    }
  };
}
