import { Client } from 'pg';

const CONNECTION_STRING = process.env.DATABASE_URL || 
  'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres';

async function verify() {
  console.log('=== Starting Ordering Upgrade Verification ===');
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    // 1. Verify schema columns on orders
    console.log('\n1. Checking information_schema.columns on orders...');
    const orderCols = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'orders'
        AND column_name IN ('payment_status', 'payment_method', 'utr_number', 'updated_at', 'status')
      ORDER BY column_name;
    `);
    console.log(orderCols.rows);

    // 2. Verify schema columns on order_items
    console.log('\n2. Checking information_schema.columns on order_items...');
    const itemCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'order_items'
        AND column_name IN ('item_name', 'unit_price', 'notes', 'order_id', 'menu_item_id', 'quantity')
      ORDER BY column_name;
    `);
    console.log(itemCols.rows);

    // 3. Verify publication
    console.log('\n3. Checking pg_publication_tables for supabase_realtime...');
    const pubs = await client.query(`
      SELECT pubname, tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      ORDER BY tablename;
    `);
    console.log(pubs.rows);

    // 4. Test RPC invocation: create_order_atomic
    console.log('\n4. Testing create_order_atomic RPC invocation...');
    const testOrderId = `test-ord-${Date.now()}`;
    const testPayload = {
      id: testOrderId,
      venue_id: 'cafe-first-way-cafe-hotc',
      table_number: 99,
      source: 'QR_DINE_IN',
      status: 'in_kitchen',
      payment_method: 'UPI',
      payment_status: 'PENDING',
      is_pay_later: false,
      session_token: 'test-session-xyz',
      customer_name: 'Test Customer M1',
      items: [
        {
          id: 'test-item-1',
          menu_item_id: 'test-item-1',
          name: 'Classic Masala Dosa',
          dish_name: 'Classic Masala Dosa',
          quantity: 2,
          price: 120.00,
          unit_price: 120.00,
          notes: 'Crispy, extra chutney'
        },
        {
          id: 'test-item-2',
          menu_item_id: 'test-item-2',
          name: 'Filter Coffee',
          dish_name: 'Filter Coffee',
          quantity: 1,
          price: 45.00,
          unit_price: 45.00,
          notes: 'Strong'
        }
      ]
    };

    const rpcCall = await client.query(
      'SELECT public.create_order_atomic($1::jsonb) AS result;',
      [JSON.stringify(testPayload)]
    );
    const createdOrder = rpcCall.rows[0]?.result;
    console.log('create_order_atomic result order ID:', createdOrder?.id);
    console.log('create_order_atomic status:', createdOrder?.status);
    console.log('create_order_atomic total_amount:', createdOrder?.total_amount);
    console.log('create_order_atomic items count in JSON:', createdOrder?.items?.length);

    if (createdOrder?.id !== testOrderId) {
      throw new Error(`Order ID mismatch: expected ${testOrderId}, got ${createdOrder?.id}`);
    }
    if (createdOrder?.status !== 'in_kitchen') {
      throw new Error(`Order status mismatch: expected 'in_kitchen', got ${createdOrder?.status}`);
    }
    if (Number(createdOrder?.total_amount) !== 285.00) {
      throw new Error(`Total amount mismatch: expected 285.00, got ${createdOrder?.total_amount}`);
    }

    // 5. Verify order_items child table entries
    console.log('\n5. Checking order_items child table for created order...');
    const childItems = await client.query(
      'SELECT id, order_id, menu_item_id, quantity, item_name, unit_price, notes FROM public.order_items WHERE order_id = $1 ORDER BY item_name;',
      [testOrderId]
    );
    console.log('Child items in order_items:', childItems.rows);
    if (childItems.rowCount !== 2) {
      throw new Error(`Expected 2 child order items, found ${childItems.rowCount}`);
    }

    // 6. Test Idempotency (calling RPC again with same ID)
    console.log('\n6. Testing Idempotency of create_order_atomic with identical ID...');
    const idempotentCall = await client.query(
      'SELECT public.create_order_atomic($1::jsonb) AS result;',
      [JSON.stringify(testPayload)]
    );
    const replayedOrder = idempotentCall.rows[0]?.result;
    console.log('Replayed order ID:', replayedOrder?.id);
    if (replayedOrder?.id !== testOrderId) {
      throw new Error('Idempotent replay failed to return existing order');
    }

    // Verify child items were NOT duplicated
    const countCheck = await client.query(
      'SELECT count(*) FROM public.order_items WHERE order_id = $1;',
      [testOrderId]
    );
    console.log('Child item count after idempotent call (should remain 2):', countCheck.rows[0].count);
    if (parseInt(countCheck.rows[0].count, 10) !== 2) {
      throw new Error('Duplicate child order items detected after idempotent replay!');
    }

    // 7. Test Cascade Delete via foreign key
    console.log('\n7. Testing Foreign Key ON DELETE CASCADE...');
    await client.query('DELETE FROM public.orders WHERE id = $1;', [testOrderId]);
    const itemsRemaining = await client.query(
      'SELECT count(*) FROM public.order_items WHERE order_id = $1;',
      [testOrderId]
    );
    console.log('Child items count after deleting parent order (should be 0):', itemsRemaining.rows[0].count);
    if (parseInt(itemsRemaining.rows[0].count, 10) !== 0) {
      throw new Error('Foreign key cascade delete did not remove child items!');
    }

    console.log('\n=== ALL VERIFICATION CHECKS PASSED PERFECTLY! ===\n');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verify();
