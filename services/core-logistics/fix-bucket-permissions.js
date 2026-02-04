const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function fixBucketPermissions() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for admin operations
  );
  
  try {
    console.log('🔧 Updating driver-documents bucket to public...');
    
    // Update bucket to be public
    const { error } = await supabase.storage.updateBucket('driver-documents', {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
    
    if (error) {
      console.error('❌ Error updating bucket:', error);
    } else {
      console.log('✅ Bucket updated to public successfully!');
      
      // Test public access
      console.log('🧪 Testing public URL access...');
      const { data } = supabase.storage
        .from('driver-documents')
        .getPublicUrl('47d6ecf1-7c93-4910-83e9-5e392e862096/drivers_license/51e795ee-677c-45e8-9dd8-bdc35ea2fda4.pdf');
      
      console.log('📋 Public URL:', data.publicUrl);
    }
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixBucketPermissions();