import { count, eq } from 'drizzle-orm';
import { db, pool } from './index';
import {
  categories,
  brands,
  vehicleMakes,
  vehicleModels,
  products,
  productFitments,
  productPartNumbers,
  stockMovements,
  receiptCounters,
  settings,
} from './schema';
import { user } from './auth-schema';

async function seed() {
  const dbUrl = process.env.DATABASE_URL || '';

  // 1. Refuse to run unless database name ends in _dev
  let dbName = '';
  try {
    const parsed = new URL(dbUrl);
    dbName = parsed.pathname.replace(/^\//, '');
  } catch {
    console.error('Invalid DATABASE_URL configuration.');
    process.exit(1);
  }

  if (!dbName.endsWith('_dev')) {
    console.error(
      `Safety check failed: database "${dbName}" does not end with "_dev". Seed aborted.`,
    );
    process.exit(1);
  }

  // 2. Check if products already has rows
  const existingProducts = await db.select({ count: count() }).from(products);
  const prodCount = Number(existingProducts[0]?.count ?? 0);
  if (prodCount > 0) {
    console.log(`Database already has ${prodCount} products. Skipping seed.`);
    await pool.end();
    return;
  }

  // 3. Ensure at least one owner exists to attribute opening stock movements
  const owners = await db.select().from(user).where(eq(user.role, 'owner')).limit(1);
  if (owners.length === 0) {
    console.error('\nError: No store owner found in the database.');
    console.error('Please create an owner account first using:');
    console.error('  npm run create-owner -- --email <email> --name <name>\n');
    await pool.end();
    process.exit(1);
  }
  const owner = owners[0];

  console.log(`Seeding database "${dbName}" as owner: ${owner.name} (${owner.email})...`);

  // Execute all seed writes in ONE transaction
  await db.transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // Settings
    // -------------------------------------------------------------------------
    await tx
      .insert(settings)
      .values({
        id: 1,
        shopName: 'Colombo Auto Spares & Parts',
        address: 'No. 142, Panchikawatta Road, Colombo 10, Sri Lanka',
        phone: '+94 11 234 5678',
        receiptFooter: 'Thank you! Parts can be exchanged within 7 days with this bill.',
        cashierMaxDiscountPct: '5.00',
      })
      .onConflictDoNothing();

    // -------------------------------------------------------------------------
    // Receipt Counter for current year
    // -------------------------------------------------------------------------
    const currentYear = new Date().getFullYear();
    await tx
      .insert(receiptCounters)
      .values({
        year: currentYear,
        lastNumber: 0,
      })
      .onConflictDoNothing();

    // -------------------------------------------------------------------------
    // Categories (~10)
    // -------------------------------------------------------------------------
    const categoryData = [
      { name: 'Brakes' },
      { name: 'Filters' },
      { name: 'Engine' },
      { name: 'Suspension' },
      { name: 'Electrical' },
      { name: 'Lighting' },
      { name: 'Cooling' },
      { name: 'Body' },
      { name: 'Transmission' },
      { name: 'Oils & Fluids' },
    ];
    const insertedCategories = await tx
      .insert(categories)
      .values(categoryData)
      .returning();
    const catMap = new Map(insertedCategories.map((c) => [c.name, c.id]));

    // -------------------------------------------------------------------------
    // Brands (10)
    // -------------------------------------------------------------------------
    const brandData = [
      { name: 'Toyota Genuine' },
      { name: 'Denso' },
      { name: 'NGK' },
      { name: 'Bosch' },
      { name: 'Mobil' },
      { name: 'Ferodo' },
      { name: 'KYB' },
      { name: 'AISIN' },
      { name: 'Valeo' },
      { name: 'Osram' },
    ];
    const insertedBrands = await tx
      .insert(brands)
      .values(brandData)
      .returning();
    const brandMap = new Map(insertedBrands.map((b) => [b.name, b.id]));

    // -------------------------------------------------------------------------
    // Vehicle Makes & Models (Common in Sri Lanka)
    // -------------------------------------------------------------------------
    const makesWithModels: { make: string; models: string[] }[] = [
      {
        make: 'Toyota',
        models: ['Axio', 'Corolla', 'Vitz', 'Aqua', 'Premio', 'Prius', 'HiAce'],
      },
      {
        make: 'Suzuki',
        models: ['Alto', 'Wagon R', 'Swift', 'Every'],
      },
      {
        make: 'Nissan',
        models: ['Sunny', 'March', 'Caravan'],
      },
      {
        make: 'Honda',
        models: ['Fit', 'Vezel', 'Civic', 'Grace'],
      },
      {
        make: 'Mitsubishi',
        models: ['Lancer', 'Montero'],
      },
      {
        make: 'Mazda',
        models: ['Demio'],
      },
      {
        make: 'Perodua',
        models: ['Axia'],
      },
    ];

    const modelMap = new Map<string, number>(); // Key: "Make Model" -> model.id
    for (const item of makesWithModels) {
      const [insertedMake] = await tx
        .insert(vehicleMakes)
        .values({ name: item.make })
        .returning();

      for (const mName of item.models) {
        const [insertedModel] = await tx
          .insert(vehicleModels)
          .values({
            makeId: insertedMake.id,
            name: mName,
          })
          .returning();
        modelMap.set(`${item.make} ${mName}`, insertedModel.id);
      }
    }

    // -------------------------------------------------------------------------
    // 40+ Realistic Vehicle Spare Parts Catalog
    // -------------------------------------------------------------------------
    interface PartSeed {
      sku: string;
      name: string;
      partNumber: string;
      category: string;
      brand: string;
      description: string;
      unit: string;
      binLocation: string;
      costPrice: string;
      sellingPrice: string;
      stockQty: number;
      reorderLevel: number;
      alternates: { partNumber: string; kind: 'oem' | 'alternate' }[];
      fitments: { makeModel: string; yearFrom?: number; yearTo?: number }[];
    }

    const partsSeedData: PartSeed[] = [
      // 1. Brakes
      {
        sku: 'BRK-001',
        name: 'Front Brake Pads Set (Axio / Premio)',
        partNumber: '04465-12610',
        category: 'Brakes',
        brand: 'Toyota Genuine',
        description: 'Ceramic front disc brake pads set for NZE141 / NZE161 models',
        unit: 'set',
        binLocation: 'A1-01',
        costPrice: '6500.00',
        sellingPrice: '8900.00',
        stockQty: 18,
        reorderLevel: 8,
        alternates: [
          { partNumber: '04465-02220', kind: 'oem' },
          { partNumber: 'D2274-02', kind: 'alternate' },
        ],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2020 },
        ],
      },
      {
        sku: 'BRK-002',
        name: 'Front Brake Pads Ferodo Premium (Axio / Corolla)',
        partNumber: 'FDB1617',
        category: 'Brakes',
        brand: 'Ferodo',
        description: 'High performance low-dust front brake pads',
        unit: 'set',
        binLocation: 'A1-02',
        costPrice: '5200.00',
        sellingPrice: '7400.00',
        stockQty: 12,
        reorderLevel: 6,
        alternates: [{ partNumber: '04465-12610', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Corolla', yearFrom: 2010, yearTo: 2018 },
        ],
      },
      {
        sku: 'BRK-003',
        name: 'Front Brake Pads (Suzuki Alto 800)',
        partNumber: '55810M68K00',
        category: 'Brakes',
        brand: 'Bosch',
        description: 'Front disc brake shoe pad set for Suzuki Alto 800 / K10',
        unit: 'set',
        binLocation: 'A1-03',
        costPrice: '2800.00',
        sellingPrice: '3950.00',
        stockQty: 4, // Below reorder level!
        reorderLevel: 10,
        alternates: [{ partNumber: '55810-68K00-000', kind: 'oem' }],
        fitments: [{ makeModel: 'Suzuki Alto', yearFrom: 2010, yearTo: 2022 }],
      },
      {
        sku: 'BRK-004',
        name: 'Front Brake Pads (Suzuki Wagon R MH34S/MH44S)',
        partNumber: '55810-72M00',
        category: 'Brakes',
        brand: 'Ferodo',
        description: 'Semi-metallic front brake pad set for Japanese Wagon R FX/FZ',
        unit: 'set',
        binLocation: 'A1-04',
        costPrice: '3600.00',
        sellingPrice: '4850.00',
        stockQty: 14,
        reorderLevel: 6,
        alternates: [
          { partNumber: '55810-72M01', kind: 'oem' },
          { partNumber: 'AN-769WK', kind: 'alternate' },
        ],
        fitments: [{ makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2017 }],
      },
      {
        sku: 'BRK-005',
        name: 'Rear Brake Shoes (Toyota Vitz / Aqua)',
        partNumber: '04495-52110',
        category: 'Brakes',
        brand: 'Toyota Genuine',
        description: 'Rear drum brake lining shoe set for compact hybrids',
        unit: 'set',
        binLocation: 'A1-05',
        costPrice: '4800.00',
        sellingPrice: '6500.00',
        stockQty: 7,
        reorderLevel: 5,
        alternates: [{ partNumber: 'K2342', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Vitz', yearFrom: 2010, yearTo: 2019 },
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2020 },
        ],
      },
      {
        sku: 'BRK-006',
        name: 'Front Brake Disc Rotor (Toyota Axio / Fielder)',
        partNumber: '43512-12670',
        category: 'Brakes',
        brand: 'Bosch',
        description: 'Vented front brake rotor disc pair',
        unit: 'pair',
        binLocation: 'A2-01',
        costPrice: '14500.00',
        sellingPrice: '18900.00',
        stockQty: 5,
        reorderLevel: 3,
        alternates: [{ partNumber: 'BD1284', kind: 'alternate' }],
        fitments: [{ makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 }],
      },

      // 2. Filters
      {
        sku: 'FLT-001',
        name: 'Engine Oil Filter (Toyota Aqua / Vitz / Prius)',
        partNumber: '04152-YZZA6',
        category: 'Filters',
        brand: 'Toyota Genuine',
        description: 'Cartridge oil filter element with O-rings',
        unit: 'pcs',
        binLocation: 'B1-01',
        costPrice: '1250.00',
        sellingPrice: '1750.00',
        stockQty: 45,
        reorderLevel: 15,
        alternates: [
          { partNumber: '04152-37010', kind: 'oem' },
          { partNumber: 'W68/3', kind: 'alternate' },
        ],
        fitments: [
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2021 },
          { makeModel: 'Toyota Prius', yearFrom: 2009, yearTo: 2016 },
          { makeModel: 'Toyota Vitz', yearFrom: 2010, yearTo: 2019 },
        ],
      },
      {
        sku: 'FLT-002',
        name: 'Engine Oil Filter Spin-On (Suzuki Alto / Wagon R)',
        partNumber: '16510-84M00',
        category: 'Filters',
        brand: 'Denso',
        description: 'Compact spin-on canister oil filter for R06A / K10 engines',
        unit: 'pcs',
        binLocation: 'B1-02',
        costPrice: '950.00',
        sellingPrice: '1400.00',
        stockQty: 30,
        reorderLevel: 10,
        alternates: [
          { partNumber: '16510-81403', kind: 'oem' },
          { partNumber: 'W67/2', kind: 'alternate' },
        ],
        fitments: [
          { makeModel: 'Suzuki Alto', yearFrom: 2010, yearTo: 2023 },
          { makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2022 },
        ],
      },
      {
        sku: 'FLT-003',
        name: 'Engine Air Filter (Toyota Axio NFE161 / Aqua)',
        partNumber: '17801-21060',
        category: 'Filters',
        brand: 'Denso',
        description: 'Engine intake panel air filter element',
        unit: 'pcs',
        binLocation: 'B2-01',
        costPrice: '1850.00',
        sellingPrice: '2650.00',
        stockQty: 2, // Below reorder level!
        reorderLevel: 8,
        alternates: [{ partNumber: '17801-0M020', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2020 },
        ],
      },
      {
        sku: 'FLT-004',
        name: 'Cabin AC Filter (Toyota Universal)',
        partNumber: '87139-30040',
        category: 'Filters',
        brand: 'Denso',
        description: 'Activated carbon pollen cabin air conditioning filter',
        unit: 'pcs',
        binLocation: 'B2-02',
        costPrice: '1400.00',
        sellingPrice: '2100.00',
        stockQty: 22,
        reorderLevel: 8,
        alternates: [{ partNumber: '87139-52040', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2020 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2020 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2019 },
        ],
      },
      {
        sku: 'FLT-005',
        name: 'Engine Air Filter (Suzuki Wagon R Stingray MH34S)',
        partNumber: '13780-50M00',
        category: 'Filters',
        brand: 'Bosch',
        description: 'Engine air cleaner element for Suzuki mild hybrid',
        unit: 'pcs',
        binLocation: 'B2-03',
        costPrice: '1600.00',
        sellingPrice: '2350.00',
        stockQty: 15,
        reorderLevel: 6,
        alternates: [{ partNumber: 'PA50M', kind: 'alternate' }],
        fitments: [{ makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2017 }],
      },
      {
        sku: 'FLT-006',
        name: 'Fuel Filter In-Tank (Honda Fit GP5 / Vezel RU3)',
        partNumber: '17048-T5A-000',
        category: 'Filters',
        brand: 'Denso',
        description: 'High pressure in-tank fuel strainer and filter assembly',
        unit: 'pcs',
        binLocation: 'B3-01',
        costPrice: '7500.00',
        sellingPrice: '10500.00',
        stockQty: 6,
        reorderLevel: 4,
        alternates: [{ partNumber: '17048-T5B-000', kind: 'oem' }],
        fitments: [
          { makeModel: 'Honda Fit', yearFrom: 2013, yearTo: 2020 },
          { makeModel: 'Honda Vezel', yearFrom: 2013, yearTo: 2020 },
          { makeModel: 'Honda Grace', yearFrom: 2014, yearTo: 2020 },
        ],
      },

      // 3. Engine & Ignition
      {
        sku: 'ENG-001',
        name: 'Iridium Spark Plug (NGK Laser Iridium)',
        partNumber: 'ILKAR7B11',
        category: 'Engine',
        brand: 'NGK',
        description: 'Long-life fine wire iridium spark plug for modern VVT-i engines',
        unit: 'pcs',
        binLocation: 'C1-01',
        costPrice: '2800.00',
        sellingPrice: '3850.00',
        stockQty: 32,
        reorderLevel: 12,
        alternates: [
          { partNumber: '90919-01275', kind: 'oem' },
          { partNumber: 'SC20HR11', kind: 'alternate' },
        ],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Premio', yearFrom: 2010, yearTo: 2020 },
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2021 },
        ],
      },
      {
        sku: 'ENG-002',
        name: 'Nickel Spark Plug Denso (Suzuki Alto 800)',
        partNumber: 'W16EX-U',
        category: 'Engine',
        brand: 'Denso',
        description: 'U-groove standard copper core spark plug',
        unit: 'pcs',
        binLocation: 'C1-02',
        costPrice: '650.00',
        sellingPrice: '950.00',
        stockQty: 40,
        reorderLevel: 16,
        alternates: [{ partNumber: 'BPR5EY', kind: 'alternate' }],
        fitments: [{ makeModel: 'Suzuki Alto', yearFrom: 2005, yearTo: 2020 }],
      },
      {
        sku: 'ENG-003',
        name: 'Ignition Coil Pack (Toyota 1NZ-FE / 1NZ-FXE)',
        partNumber: '90919-02240',
        category: 'Engine',
        brand: 'Denso',
        description: 'Direct ignition coil pencil type',
        unit: 'pcs',
        binLocation: 'C2-01',
        costPrice: '9200.00',
        sellingPrice: '12800.00',
        stockQty: 8,
        reorderLevel: 4,
        alternates: [
          { partNumber: '90919-02260', kind: 'oem' },
          { partNumber: '099700-0440', kind: 'alternate' },
        ],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 },
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2020 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2018 },
        ],
      },
      {
        sku: 'ENG-004',
        name: 'Engine Valve Cover Gasket (Toyota 1NZ / 2NZ)',
        partNumber: '11213-21011',
        category: 'Engine',
        brand: 'Toyota Genuine',
        description: 'Rubber cylinder head rocker cover seal gasket',
        unit: 'pcs',
        binLocation: 'C2-02',
        costPrice: '2100.00',
        sellingPrice: '3100.00',
        stockQty: 10,
        reorderLevel: 4,
        alternates: [{ partNumber: 'VS50530R', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2016 },
        ],
      },
      {
        sku: 'ENG-005',
        name: 'Auxiliary Drive Fan Belt 4PK850 (Suzuki Wagon R)',
        partNumber: '4PK850',
        category: 'Engine',
        brand: 'Bosch',
        description: 'Multi-rib alternator and water pump serpentine belt',
        unit: 'pcs',
        binLocation: 'C3-01',
        costPrice: '1650.00',
        sellingPrice: '2400.00',
        stockQty: 14,
        reorderLevel: 6,
        alternates: [{ partNumber: '17521-65H10', kind: 'oem' }],
        fitments: [{ makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2020 }],
      },
      {
        sku: 'ENG-006',
        name: 'Alternator Serpentine Belt 6PK1230 (Toyota Premio / Axio)',
        partNumber: '6PK1230',
        category: 'Engine',
        brand: 'Bosch',
        description: 'EPDM synthetic rubber high durability drive belt',
        unit: 'pcs',
        binLocation: 'C3-02',
        costPrice: '2450.00',
        sellingPrice: '3600.00',
        stockQty: 11,
        reorderLevel: 5,
        alternates: [{ partNumber: '90916-02685', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2020 },
        ],
      },

      // 4. Suspension & Steering
      {
        sku: 'SUS-001',
        name: 'Front Shock Absorber Strut LH/RH (Toyota Axio NZE161)',
        partNumber: '339247',
        category: 'Suspension',
        brand: 'KYB',
        description: 'Excel-G gas pressurized twin tube front strut assembly',
        unit: 'pcs',
        binLocation: 'D1-01',
        costPrice: '16500.00',
        sellingPrice: '21500.00',
        stockQty: 6,
        reorderLevel: 4,
        alternates: [{ partNumber: '48510-52L20', kind: 'oem' }],
        fitments: [{ makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 }],
      },
      {
        sku: 'SUS-002',
        name: 'Rear Shock Absorber (Toyota Axio / Aqua)',
        partNumber: '343442',
        category: 'Suspension',
        brand: 'KYB',
        description: 'Excel-G rear gas damper shock absorber',
        unit: 'pcs',
        binLocation: 'D1-02',
        costPrice: '9800.00',
        sellingPrice: '13200.00',
        stockQty: 8,
        reorderLevel: 4,
        alternates: [{ partNumber: '48530-52B20', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2020 },
        ],
      },
      {
        sku: 'SUS-003',
        name: 'Front Lower Ball Joint (Toyota Corolla / Axio)',
        partNumber: '43330-19115',
        category: 'Suspension',
        brand: 'AISIN',
        description: 'Heavy duty front lower suspension control arm ball joint',
        unit: 'pcs',
        binLocation: 'D2-01',
        costPrice: '3200.00',
        sellingPrice: '4500.00',
        stockQty: 12,
        reorderLevel: 6,
        alternates: [{ partNumber: 'SB-3642', kind: 'alternate' }],
        fitments: [{ makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 }],
      },
      {
        sku: 'SUS-004',
        name: 'Front Stabilizer Link Rod (Suzuki Wagon R / Swift)',
        partNumber: '42420-85K00',
        category: 'Suspension',
        brand: 'AISIN',
        description: 'Front anti-roll sway bar link assembly',
        unit: 'pcs',
        binLocation: 'D2-02',
        costPrice: '2100.00',
        sellingPrice: '3150.00',
        stockQty: 1, // Below reorder level!
        reorderLevel: 6,
        alternates: [{ partNumber: 'SL-7590', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Suzuki Swift', yearFrom: 2010, yearTo: 2018 },
        ],
      },
      {
        sku: 'SUS-005',
        name: 'Tie Rod End Out (Nissan Sunny / Tiida)',
        partNumber: '48520-2F025',
        category: 'Suspension',
        brand: 'AISIN',
        description: 'Steering tie rod end outer LH/RH',
        unit: 'pcs',
        binLocation: 'D3-01',
        costPrice: '2600.00',
        sellingPrice: '3750.00',
        stockQty: 6,
        reorderLevel: 4,
        alternates: [{ partNumber: 'SE-4871', kind: 'alternate' }],
        fitments: [{ makeModel: 'Nissan Sunny', yearFrom: 2005, yearTo: 2016 }],
      },

      // 5. Electrical & Lighting
      {
        sku: 'LGT-001',
        name: 'Halogen Headlight Bulb H4 12V 60/55W',
        partNumber: '64193',
        category: 'Lighting',
        brand: 'Osram',
        description: 'Original Line halogen bulb standard P43t fitting',
        unit: 'pcs',
        binLocation: 'E1-01',
        costPrice: '750.00',
        sellingPrice: '1150.00',
        stockQty: 48,
        reorderLevel: 12,
        alternates: [{ partNumber: '12342LL', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Suzuki Alto', yearFrom: 2000, yearTo: 2023 },
          { makeModel: 'Toyota HiAce', yearFrom: 2004, yearTo: 2020 },
          { makeModel: 'Nissan Caravan', yearFrom: 2005, yearTo: 2020 },
        ],
      },
      {
        sku: 'LGT-002',
        name: 'Halogen Fog / Headlight Bulb H11 12V 55W',
        partNumber: '64211',
        category: 'Lighting',
        brand: 'Osram',
        description: 'High performance automotive headlamp bulb PGJ19-2',
        unit: 'pcs',
        binLocation: 'E1-02',
        costPrice: '1350.00',
        sellingPrice: '1950.00',
        stockQty: 16,
        reorderLevel: 6,
        alternates: [{ partNumber: '09471-12211', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Honda Vezel', yearFrom: 2013, yearTo: 2020 },
        ],
      },
      {
        sku: 'LGT-003',
        name: 'Miniature Wedge Bulb T10 12V 5W (Pack of 10)',
        partNumber: '2825-02B',
        category: 'Lighting',
        brand: 'Osram',
        description: 'Clear wedge base interior / parking / plate bulb pack',
        unit: 'pack',
        binLocation: 'E1-03',
        costPrice: '900.00',
        sellingPrice: '1450.00',
        stockQty: 25,
        reorderLevel: 8,
        alternates: [{ partNumber: 'W5W', kind: 'alternate' }],
        fitments: [{ makeModel: 'Toyota Axio', yearFrom: 2000, yearTo: 2024 }],
      },
      {
        sku: 'ELC-001',
        name: 'Starter Motor Assembly (Toyota 1NZ-FE 1.5L)',
        partNumber: '28100-21020',
        category: 'Electrical',
        brand: 'Denso',
        description: 'Reduction type 12V 0.8kW starter motor',
        unit: 'pcs',
        binLocation: 'E2-01',
        costPrice: '28500.00',
        sellingPrice: '36000.00',
        stockQty: 3,
        reorderLevel: 2,
        alternates: [{ partNumber: '428000-0340', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2016 },
        ],
      },
      {
        sku: 'ELC-002',
        name: 'Main Automotive 12V Relay 4-Pin 40A',
        partNumber: '90987-02027',
        category: 'Electrical',
        brand: 'Denso',
        description: 'Micro ISO cooling fan and fuel pump power relay',
        unit: 'pcs',
        binLocation: 'E2-02',
        costPrice: '1200.00',
        sellingPrice: '1850.00',
        stockQty: 20,
        reorderLevel: 6,
        alternates: [{ partNumber: '156700-2870', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2020 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2020 },
        ],
      },

      // 6. Cooling System
      {
        sku: 'COL-001',
        name: 'Engine Coolant Water Pump (Toyota Axio / Premio 1NZ / 2NZ)',
        partNumber: 'WPT-111',
        category: 'Cooling',
        brand: 'AISIN',
        description: 'Die-cast aluminum mechanical water pump with housing gasket',
        unit: 'pcs',
        binLocation: 'F1-01',
        costPrice: '7800.00',
        sellingPrice: '10900.00',
        stockQty: 7,
        reorderLevel: 3,
        alternates: [{ partNumber: '16100-29155', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2018 },
        ],
      },
      {
        sku: 'COL-002',
        name: 'Engine Thermostat 82°C (Toyota Universal)',
        partNumber: '90916-03093',
        category: 'Cooling',
        brand: 'Toyota Genuine',
        description: 'Brass bottom-bypass engine thermostat valve with rubber seal',
        unit: 'pcs',
        binLocation: 'F1-02',
        costPrice: '3200.00',
        sellingPrice: '4600.00',
        stockQty: 11,
        reorderLevel: 4,
        alternates: [{ partNumber: 'WV56TB-82', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2020 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2019 },
        ],
      },
      {
        sku: 'COL-003',
        name: 'Radiator Pressure Cap 1.1 Bar (Toyota / Suzuki / Honda)',
        partNumber: '16401-20353',
        category: 'Cooling',
        brand: 'Denso',
        description: '108 kPa high pressure radiator safety relief cap',
        unit: 'pcs',
        binLocation: 'F1-03',
        costPrice: '1100.00',
        sellingPrice: '1650.00',
        stockQty: 24,
        reorderLevel: 8,
        alternates: [{ partNumber: 'JK422130-0110', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2020 },
          { makeModel: 'Suzuki Wagon R', yearFrom: 2010, yearTo: 2020 },
          { makeModel: 'Honda Fit', yearFrom: 2008, yearTo: 2020 },
        ],
      },

      // 7. Body & Wipers
      {
        sku: 'BDY-001',
        name: 'Clear Advantage Wiper Blade 24" (600mm)',
        partNumber: 'BOSCH-CA-24',
        category: 'Body',
        brand: 'Bosch',
        description: 'Aerodynamic frameless beam wiper blade with graphite coated natural rubber',
        unit: 'pcs',
        binLocation: 'G1-01',
        costPrice: '1950.00',
        sellingPrice: '2800.00',
        stockQty: 18,
        reorderLevel: 6,
        alternates: [{ partNumber: 'DU-060L', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2022 },
          { makeModel: 'Honda Vezel', yearFrom: 2013, yearTo: 2020 },
        ],
      },
      {
        sku: 'BDY-002',
        name: 'Clear Advantage Wiper Blade 14" (350mm)',
        partNumber: 'BOSCH-CA-14',
        category: 'Body',
        brand: 'Bosch',
        description: 'Passenger side / rear aerotwin beam wiper blade',
        unit: 'pcs',
        binLocation: 'G1-02',
        costPrice: '1450.00',
        sellingPrice: '2100.00',
        stockQty: 20,
        reorderLevel: 8,
        alternates: [{ partNumber: 'DU-035L', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Suzuki Alto', yearFrom: 2010, yearTo: 2022 },
        ],
      },
      {
        sku: 'BDY-003',
        name: 'Frameless Wiper Blade 20" (500mm)',
        partNumber: 'BOSCH-CA-20',
        category: 'Body',
        brand: 'Bosch',
        description: 'All-weather beam wiper blade for Japanese domestic vehicles',
        unit: 'pcs',
        binLocation: 'G1-03',
        costPrice: '1750.00',
        sellingPrice: '2500.00',
        stockQty: 3, // Below reorder level!
        reorderLevel: 8,
        alternates: [{ partNumber: 'DU-050L', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Suzuki Wagon R', yearFrom: 2012, yearTo: 2020 },
          { makeModel: 'Suzuki Swift', yearFrom: 2010, yearTo: 2018 },
        ],
      },

      // 8. Transmission & Clutch
      {
        sku: 'TRN-001',
        name: 'Clutch Kit 3-Piece (Suzuki Alto 800)',
        partNumber: 'SZK-042',
        category: 'Transmission',
        brand: 'Valeo',
        description: 'Complete clutch pressure plate, friction disc, and release bearing kit',
        unit: 'set',
        binLocation: 'H1-01',
        costPrice: '15800.00',
        sellingPrice: '21500.00',
        stockQty: 5,
        reorderLevel: 3,
        alternates: [{ partNumber: '22100M68K00', kind: 'oem' }],
        fitments: [{ makeModel: 'Suzuki Alto', yearFrom: 2010, yearTo: 2022 }],
      },
      {
        sku: 'TRN-002',
        name: 'Clutch Cover & Disc Kit (Toyota HiAce KDH200 2KD)',
        partNumber: 'KT-312',
        category: 'Transmission',
        brand: 'AISIN',
        description: 'Heavy duty commercial clutch assembly for 2KD-FTV turbo diesel',
        unit: 'set',
        binLocation: 'H1-02',
        costPrice: '38500.00',
        sellingPrice: '49500.00',
        stockQty: 4,
        reorderLevel: 2,
        alternates: [{ partNumber: '31210-26130', kind: 'oem' }],
        fitments: [{ makeModel: 'Toyota HiAce', yearFrom: 2004, yearTo: 2018 }],
      },
      {
        sku: 'TRN-003',
        name: 'CV Axle Outer Joint Boot Kit (Toyota Axio / Vitz)',
        partNumber: '04438-52010',
        category: 'Transmission',
        brand: 'Toyota Genuine',
        description: 'Flexible rubber drive shaft outer constant velocity boot kit with grease and clamps',
        unit: 'kit',
        binLocation: 'H2-01',
        costPrice: '2900.00',
        sellingPrice: '4200.00',
        stockQty: 10,
        reorderLevel: 5,
        alternates: [{ partNumber: 'FB-2150', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2018 },
          { makeModel: 'Toyota Vitz', yearFrom: 2005, yearTo: 2018 },
        ],
      },

      // 9. Oils & Lubricants
      {
        sku: 'OIL-001',
        name: 'Mobil 1 0W-20 Advanced Fuel Economy Fully Synthetic 4L',
        partNumber: 'MOBIL-0W20-4L',
        category: 'Oils & Fluids',
        brand: 'Mobil',
        description: 'Ultra low viscosity engine oil engineered for hybrid and start-stop engines',
        unit: 'can',
        binLocation: 'O1-01',
        costPrice: '17500.00',
        sellingPrice: '22800.00',
        stockQty: 24,
        reorderLevel: 8,
        alternates: [{ partNumber: '08880-12605', kind: 'oem' }],
        fitments: [
          { makeModel: 'Toyota Aqua', yearFrom: 2011, yearTo: 2024 },
          { makeModel: 'Toyota Axio', yearFrom: 2012, yearTo: 2024 },
          { makeModel: 'Honda Fit', yearFrom: 2013, yearTo: 2024 },
        ],
      },
      {
        sku: 'OIL-002',
        name: 'Mobil Super 2000 10W-40 Premium Semi-Synthetic 4L',
        partNumber: 'MOBIL-10W40-4L',
        category: 'Oils & Fluids',
        brand: 'Mobil',
        description: 'Sludge protection daily engine oil for petrol and diesel passenger vehicles',
        unit: 'can',
        binLocation: 'O1-02',
        costPrice: '12400.00',
        sellingPrice: '16500.00',
        stockQty: 16,
        reorderLevel: 6,
        alternates: [{ partNumber: 'MS2000-1040', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Suzuki Alto', yearFrom: 2000, yearTo: 2020 },
          { makeModel: 'Nissan Sunny', yearFrom: 2000, yearTo: 2018 },
        ],
      },
      {
        sku: 'OIL-003',
        name: 'CVT Fluid TC Toyota Genuine 4L Can',
        partNumber: '08886-02105',
        category: 'Oils & Fluids',
        brand: 'Toyota Genuine',
        description: 'Specially formulated continuously variable transmission fluid for Super CVT',
        unit: 'can',
        binLocation: 'O2-01',
        costPrice: '18500.00',
        sellingPrice: '24500.00',
        stockQty: 12,
        reorderLevel: 4,
        alternates: [{ partNumber: 'CVTF-TC', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2006, yearTo: 2016 },
          { makeModel: 'Toyota Premio', yearFrom: 2007, yearTo: 2016 },
        ],
      },
      {
        sku: 'OIL-004',
        name: 'DOT 4 Brake Fluid 500ml',
        partNumber: 'BOSCH-DOT4-500',
        category: 'Oils & Fluids',
        brand: 'Bosch',
        description: 'High boiling point hydraulic brake and clutch system fluid',
        unit: 'bottle',
        binLocation: 'O2-02',
        costPrice: '1100.00',
        sellingPrice: '1650.00',
        stockQty: 36,
        reorderLevel: 10,
        alternates: [{ partNumber: 'BF-DOT4-500', kind: 'alternate' }],
        fitments: [
          { makeModel: 'Toyota Axio', yearFrom: 2000, yearTo: 2024 },
          { makeModel: 'Suzuki Alto', yearFrom: 2000, yearTo: 2024 },
        ],
      },
      {
        sku: 'OIL-005',
        name: 'Long Life Coolant Red 50/50 Pre-Mixed 4L',
        partNumber: '08889-80072',
        category: 'Oils & Fluids',
        brand: 'Toyota Genuine',
        description: 'Ethylene glycol based anti-corrosion engine radiator coolant fluid',
        unit: 'can',
        binLocation: 'O3-01',
        costPrice: '6200.00',
        sellingPrice: '8500.00',
        stockQty: 2, // Below reorder level!
        reorderLevel: 6,
        alternates: [{ partNumber: 'LLC-RED-4L', kind: 'alternate' }],
        fitments: [{ makeModel: 'Toyota Axio', yearFrom: 2000, yearTo: 2024 }],
      },
    ];

    console.log(`Inserting ${partsSeedData.length} spare parts with stock movements...`);

    // Insert each part, its alternates, fitments, and initial stock movement
    for (const part of partsSeedData) {
      const categoryId = catMap.get(part.category);
      if (!categoryId) {
        throw new Error(`Category not found: ${part.category}`);
      }
      const brandId = brandMap.get(part.brand) || null;

      const [insertedProduct] = await tx
        .insert(products)
        .values({
          sku: part.sku,
          name: part.name,
          partNumber: part.partNumber,
          categoryId,
          brandId,
          description: part.description,
          unit: part.unit,
          binLocation: part.binLocation,
          costPrice: part.costPrice,
          price: part.sellingPrice,
          stockQty: part.stockQty,
          reorderLevel: part.reorderLevel,
          isActive: true,
        })
        .returning();

      // Alternate / OEM numbers
      if (part.alternates.length > 0) {
        await tx.insert(productPartNumbers).values(
          part.alternates.map((alt) => ({
            productId: insertedProduct.id,
            partNumber: alt.partNumber,
            kind: alt.kind,
          })),
        );
      }

      // Fitments
      for (const fit of part.fitments) {
        const modelId = modelMap.get(fit.makeModel);
        if (modelId) {
          await tx.insert(productFitments).values({
            productId: insertedProduct.id,
            vehicleModelId: modelId,
            yearFrom: fit.yearFrom || null,
            yearTo: fit.yearTo || null,
          });
        }
      }

      // Opening stock movement
      if (part.stockQty > 0) {
        await tx.insert(stockMovements).values({
          productId: insertedProduct.id,
          changeQty: part.stockQty,
          qtyAfter: part.stockQty,
          reason: 'opening',
          note: 'Initial opening stock balance',
          createdBy: owner.id,
        });
      }
    }

    console.log('✓ All catalog data, fitments, alternates, and opening stock inserted successfully.');
  });

  await pool.end();
  console.log('Seeding completed successfully!');
}

seed().catch(async (err) => {
  console.error('Seeding failed with error:');
  console.error(err);
  await pool.end();
  process.exit(1);
});
