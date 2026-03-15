/**
 * Flutterwave Biller Code Verification Script
 * 
 * This script fetches the actual biller codes from Flutterwave API
 * to verify the correct codes for Nigerian telecom networks.
 * 
 * Run this BEFORE running the database migration to ensure
 * you have the correct biller codes.
 * 
 * Usage:
 *   node services/platform-service/scripts/verify-flutterwave-billers.js
 */

require('dotenv').config({ path: './.env' });
const axios = require('axios');

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_BASE_URL = process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';

if (!FLUTTERWAVE_SECRET_KEY) {
  console.error('❌ Error: FLUTTERWAVE_SECRET_KEY not found in .env file');
  console.log('\nPlease add your Flutterwave secret key to services/platform-service/.env:');
  console.log('FLUTTERWAVE_SECRET_KEY=your_secret_key_here\n');
  process.exit(1);
}

async function fetchBillCategories() {
  try {
    console.log('🔍 Fetching bill categories from Flutterwave...\n');
    
    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/bill-categories`, {
      headers: {
        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status === 'success') {
      console.log('✅ Successfully fetched bill categories\n');
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch bill categories');
    }
  } catch (error) {
    console.error('❌ Error fetching bill categories:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchBillers(categoryId) {
  try {
    const response = await axios.get(
      `${FLUTTERWAVE_BASE_URL}/bill-categories/${categoryId}/billers`,
      {
        headers: {
          'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === 'success') {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch billers');
    }
  } catch (error) {
    console.error(`❌ Eror fetching billers for category ${categoryId}:`, error.response?.data || error.message);
    return [];
  }
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  FLUTTERWAVE BILLER CODE VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Fetch all bill categories
    const categories = await fetchBillCategories();
    
    console.log('📋 Available Bill Categories:');
    console.log('─────────────────────────────────────────────────────────\n');
    
    categories.forEach((category, index) => {
      console.log(`${index + 1}. ${category.name} (ID: ${category.id})`);
      console.log(`   Biller Code: ${category.biller_code || 'N/A'}`);
      console.log(`   Description: ${category.description || 'N/A'}\n`);
    });

    // Step 2: Find airtime/data categories
    const airtimeCategory = categories.find(cat => 
      cat.name.toLowerCase().includes('airtime') || 
      cat.biller_code?.toLowerCase().includes('airtime')
    );

    const dataCategory = categories.find(cat => 
      cat.name.toLowerCase().includes('data') || 
      cat.biller_code?.toLowerCase().includes('data')
    );

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  NIGERIAN TELECOM NETWORKS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 3: Fetch billers for airtime
    if (airtimeCategory) {
      console.log(`🔍 Fetching AIRTIME billers for category: ${airtimeCategory.name}\n`);
      const airtimeBillers = await fetchBillers(airtimeCategory.id);
      
      console.log('📱 AIRTIME BILLERS:');
      console.log('─────────────────────────────────────────────────────────\n');
      
      const nigerianNetworks = ['MTN', 'GLO', 'AIRTEL', '9MOBILE', 'ETISALAT'];
      
      airtimeBillers.forEach(biller => {
        const isNigerian = nigerianNetworks.some(network => 
          biller.name.toUpperCase().includes(network)
        );
        
        if (isNigerian) {
          console.log(`✓ ${biller.name}`);
          console.log(`  Biller Code: ${biller.biller_code}`);
          console.log(`  Country: ${biller.country || 'N/A'}`);
          console.log(`  Label: ${biller.label_name || 'N/A'}\n`);
        }
      });
    }

    // Step 4: Fetch billers for data
    if (dataCategory) {
      console.log(`\n🔍 Fetching DATA billers for category: ${dataCategory.name}\n`);
      const dataBillers = await fetchBillers(dataCategory.id);
      
      console.log('📊 DATA BILLERS:');
      console.log('─────────────────────────────────────────────────────────\n');
      
      const nigerianNetworks = ['MTN', 'GLO', 'AIRTEL', '9MOBILE', 'ETISALAT'];
      
      dataBillers.forEach(biller => {
        const isNigerian = nigerianNetworks.some(network => 
          biller.name.toUpperCase().includes(network)
        );
        
        if (isNigerian) {
          console.log(`✓ ${biller.name}`);
          console.log(`  Biller Code: ${biller.biller_code}`);
          console.log(`  Country: ${biller.country || 'N/A'}`);
          console.log(`  Label: ${biller.label_name || 'N/A'}\n`);
        }
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  RECOMMENDED SQL UPDATE');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('After verifying the biller codes above, update the migration file:');
    console.log('services/platform-service/prisma/migrations/20260310_create_bills_tables/migration.sql\n');
    console.log('Replace the INSERT statement with the correct biller codes.\n');

    console.log('Example:');
    console.log('─────────────────────────────────────────────────────────');
    console.log("INSERT INTO network_providers (name, code, flw_biller_code, ...) VALUES");
    console.log("('MTN', 'mtn', 'ACTUAL_MTN_CODE', ...),");
    console.log("('GLO', 'glo', 'ACTUAL_GLO_CODE', ...),");
    console.log("('Airtel', 'airtel', 'ACTUAL_AIRTEL_CODE', ...),");
    console.log("('9Mobile', '9mobile', 'ACTUAL_9MOBILE_CODE', ...);\n");

    console.log('✅ Verification complete!\n');

  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
