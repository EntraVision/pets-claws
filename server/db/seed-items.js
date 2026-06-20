require('dotenv').config();
const pool = require('./index');
const { hashPassword } = require('../middleware/auth');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const username of ['mahound', 'labib']) {
      await client.query(
        `INSERT INTO users (username, password_hash, role, active)
         VALUES ($1,$2,'admin',true)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role='admin', active=true`,
        [username, hashPassword('1234')]
      );
    }

    const categories = [
      ['Dog Food', 'Dry food, wet food, and treats for dogs'],
      ['Cat Food', 'Dry food, cans, treats, and supplements for cats'],
      ['Litter & Hygiene', 'Cat litter, pads, sprays, and cleaning supplies'],
      ['Accessories', 'Collars, toys, bowls, beds, and grooming basics'],
      ['Health Supplies', 'Non-clinic vitamins and basic pet-care products'],
    ];
    const categoryIds = {};
    for (const [name, description] of categories) {
      const result = await client.query(
        `INSERT INTO categories (name, description)
         VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id, name`,
        [name, description]
      );
      categoryIds[result.rows[0].name] = result.rows[0].id;
    }

    const suppliers = [
      ['PetWorld Distribution', 'orders@petworld.example', '+961-01-100-100', 'Beirut warehouse'],
      ['Happy Paws Wholesale', 'sales@happypaws.example', '+961-03-200-200', 'Mount Lebanon'],
      ['VetCare Supplies', 'hello@vetcare.example', '+961-70-300-300', 'Tripoli'],
    ];
    const supplierIds = {};
    for (const supplier of suppliers) {
      const result = await client.query(
        `INSERT INTO suppliers (name, email, phone, address)
         VALUES ($1,$2,$3,$4)
         RETURNING id, name`,
        supplier
      );
      supplierIds[result.rows[0].name] = result.rows[0].id;
    }

    const items = [
      ['Royal Dog Kibble 1kg', 'DOG-KIB-001', '100000001', 'Dog Food', 'PetWorld Distribution', 'kg', 18.500, 5, 2.75, 4.50],
      ['Puppy Chicken Cans 24 Pack', 'DOG-CAN-024', '100000002', 'Dog Food', 'Happy Paws Wholesale', 'piece', 24, 12, 1.10, 1.75],
      ['Cat Tuna Can', 'CAT-CAN-001', '100000003', 'Cat Food', 'Happy Paws Wholesale', 'piece', 48, 20, 0.85, 1.35],
      ['Premium Cat Dry Food 1kg', 'CAT-DRY-001', '100000004', 'Cat Food', 'PetWorld Distribution', 'kg', 9.250, 4, 3.10, 5.25],
      ['Clumping Cat Litter 10kg', 'LIT-CLUMP-10', '100000005', 'Litter & Hygiene', 'PetWorld Distribution', 'piece', 8, 5, 6.50, 9.99],
      ['Training Pads Pack', 'HYG-PAD-030', '100000006', 'Litter & Hygiene', 'Happy Paws Wholesale', 'piece', 14, 6, 4.40, 6.75],
      ['Adjustable Collar Small', 'ACC-COLL-S', '100000007', 'Accessories', 'Happy Paws Wholesale', 'piece', 16, 5, 2.00, 4.50],
      ['Rubber Chew Toy', 'ACC-TOY-001', '100000008', 'Accessories', 'Happy Paws Wholesale', 'piece', 3, 5, 1.30, 3.00],
      ['Omega Pet Vitamins', 'HLT-VIT-001', '100000009', 'Health Supplies', 'VetCare Supplies', 'piece', 6, 4, 5.25, 8.50],
    ];

    for (const item of items) {
      await client.query(
        `INSERT INTO items
         (name, sku, barcode, category_id, supplier_id, unit_type, quantity,
          reorder_warning_quantity, cost_price, sale_price, status, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active','Main store')
         ON CONFLICT (barcode) DO UPDATE SET
          name=EXCLUDED.name, quantity=EXCLUDED.quantity, reorder_warning_quantity=EXCLUDED.reorder_warning_quantity,
          cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price`,
        [item[0], item[1], item[2], categoryIds[item[3]], supplierIds[item[4]], item[5], item[6], item[7], item[8], item[9]]
      );
    }

    for (const name of ['Rent', 'Utilities', 'Supplier Delivery', 'Cleaning', 'Other']) {
      await client.query(
        `INSERT INTO expense_categories (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }

    await client.query('COMMIT');
    console.log('Pets&Claws seed complete. Admins: mahound/1234, labib/1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
