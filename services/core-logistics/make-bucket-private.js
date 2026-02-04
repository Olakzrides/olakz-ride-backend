const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function makeBucketPrivate() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    console.log('🔒 Making driver-documents bucket private for security...');
    
    // Update bucket to be private
    const { error } = await supabase.storage.updateBucket('driver-documents', {
      public: false, // Private for security
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
    
    if (error) {
      console.error('❌ Error updating bucket:', error);
    } else {
      console.log('✅ Bucket is now private and secure!');
      console.log('📋 Documents will now require signed URLs for access');
    }
    
  } catch (error) {
    console.error('❌ Failed to make bucket private:', error);
  }
}

makeBucketPrivate();