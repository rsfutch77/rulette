const { onDocumentWritten, onDocumentRead } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// Constants
const DAILY_TRANSACTION_LIMIT = 10000;
const TRANSACTION_TRACKING_COLLECTION = 'serverTransactionTracking';

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Date string
 */
function getTodayDateString() {
  const today = new Date();
  return today.getFullYear() + '-' + 
         String(today.getMonth() + 1).padStart(2, '0') + '-' + 
         String(today.getDate()).padStart(2, '0');
}

/**
 * Increment transaction counter and check killswitch
 * @param {string} operationType - 'read' or 'write'
 * @param {string} collection - The collection being accessed
 * @param {string} docId - The document ID
 */
async function incrementTransactionCounter(operationType, collection, docId) {
  try {
    const todayDate = getTodayDateString();
    const trackingDocRef = db.collection(TRANSACTION_TRACKING_COLLECTION).doc(todayDate);
    
    // Get current tracking document
    const trackingDoc = await trackingDocRef.get();
    
    if (!trackingDoc.exists) {
      // Create new tracking document for today
      await trackingDocRef.set({
        date: todayDate,
        totalTransactions: 1,
        readOperations: operationType === 'read' ? 1 : 0,
        writeOperations: operationType === 'write' ? 1 : 0,
        killswitchActivated: false,
        createdAt: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
        lastOperation: {
          type: operationType,
          collection: collection,
          docId: docId,
          timestamp: FieldValue.serverTimestamp()
        }
      });
      
      console.log(`[KILLSWITCH] Created new tracking document for ${todayDate}`);
    } else {
      // Update existing tracking document
      const currentData = trackingDoc.data();
      const newTotalTransactions = (currentData.totalTransactions || 0) + 1;
      
      const updateData = {
        totalTransactions: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp(),
        lastOperation: {
          type: operationType,
          collection: collection,
          docId: docId,
          timestamp: FieldValue.serverTimestamp()
        }
      };
      
      if (operationType === 'read') {
        updateData.readOperations = FieldValue.increment(1);
      } else if (operationType === 'write') {
        updateData.writeOperations = FieldValue.increment(1);
      }
      
      // Check if we've hit the limit
      if (newTotalTransactions >= DAILY_TRANSACTION_LIMIT) {
        updateData.killswitchActivated = true;
        updateData.killswitchActivatedAt = FieldValue.serverTimestamp();
        
        console.error(`[KILLSWITCH] ACTIVATED! Daily limit reached: ${newTotalTransactions}/${DAILY_TRANSACTION_LIMIT}`);
        console.error(`[KILLSWITCH] Triggered by ${operationType} on ${collection}/${docId}`);
      }
      
      await trackingDocRef.update(updateData);
      
      console.log(`[KILLSWITCH] ${operationType} operation logged. Count: ${newTotalTransactions}/${DAILY_TRANSACTION_LIMIT} (${collection}/${docId})`);
    }
  } catch (error) {
    console.error('[KILLSWITCH] Error incrementing transaction counter:', error);
    
    // In case of error, activate killswitch as fail-safe
    try {
      const todayDate = getTodayDateString();
      const trackingDocRef = db.collection(TRANSACTION_TRACKING_COLLECTION).doc(todayDate);
      await trackingDocRef.set({
        killswitchActivated: true,
        killswitchActivatedAt: FieldValue.serverTimestamp(),
        errorActivated: true,
        lastError: error.message
      }, { merge: true });
    } catch (failsafeError) {
      console.error('[KILLSWITCH] Failed to activate emergency killswitch:', failsafeError);
    }
  }
}

// Track writes to gameSessions collection
exports.trackGameSessionWrites = onDocumentWritten('gameSessions/{sessionId}', async (event) => {
  await incrementTransactionCounter('write', 'gameSessions', event.params.sessionId);
});

// Track writes to players collection
exports.trackPlayerWrites = onDocumentWritten('players/{playerId}', async (event) => {
  await incrementTransactionCounter('write', 'players', event.params.playerId);
});

// Note: Firestore triggers don't have read triggers in the same way,
// so we'll need to implement read tracking differently.
// For now, we'll focus on write operations which are more critical for rate limiting.

/**
 * Cloud Function to manually check and reset killswitch (for admin use)
 */
exports.checkKillswitchStatus = require('firebase-functions').https.onCall(async (data, context) => {
  try {
    const todayDate = getTodayDateString();
    const trackingDocRef = db.collection(TRANSACTION_TRACKING_COLLECTION).doc(todayDate);
    const trackingDoc = await trackingDocRef.get();
    
    if (!trackingDoc.exists) {
      return {
        date: todayDate,
        killswitchActive: false,
        totalTransactions: 0,
        message: 'No transactions recorded today'
      };
    }
    
    const data = trackingDoc.data();
    return {
      date: todayDate,
      killswitchActive: data.killswitchActivated || false,
      totalTransactions: data.totalTransactions || 0,
      readOperations: data.readOperations || 0,
      writeOperations: data.writeOperations || 0,
      dailyLimit: DAILY_TRANSACTION_LIMIT,
      remainingTransactions: Math.max(0, DAILY_TRANSACTION_LIMIT - (data.totalTransactions || 0))
    };
  } catch (error) {
    console.error('[KILLSWITCH] Error checking status:', error);
    throw new Error('Failed to check killswitch status');
  }
});

/**
 * Admin function to reset killswitch (use with caution)
 */
exports.resetKillswitch = require('firebase-functions').https.onCall(async (data, context) => {
  // Add authentication check here in production
  if (!context.auth || !context.auth.token.admin) {
    throw new Error('Unauthorized: Admin access required');
  }
  
  try {
    const todayDate = data.date || getTodayDateString();
    const trackingDocRef = db.collection(TRANSACTION_TRACKING_COLLECTION).doc(todayDate);
    
    await trackingDocRef.update({
      killswitchActivated: false,
      resetAt: FieldValue.serverTimestamp(),
      resetBy: context.auth.uid
    });
    
    console.log(`[KILLSWITCH] Reset by admin: ${context.auth.uid} for date: ${todayDate}`);
    
    return {
      success: true,
      message: `Killswitch reset for ${todayDate}`,
      resetBy: context.auth.uid
    };
  } catch (error) {
    console.error('[KILLSWITCH] Error resetting killswitch:', error);
    throw new Error('Failed to reset killswitch');
  }
});