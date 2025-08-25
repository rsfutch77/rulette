const { onDocumentWritten, onDocumentRead } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { https } = require('firebase-functions');

initializeApp();
const db = getFirestore();

// Constants
const DAILY_TRANSACTION_LIMIT = 10000;
const TRANSACTION_TRACKING_COLLECTION = 'serverTransactionTracking';

/**
 * Get today's date as a string in YYYY-MM-DD format
 * @returns {string} Today's date string
 */
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Increment transaction counter
 * @param {string} operationType - 'read' or 'write'
 * @param {string} collection - The collection being accessed
 * @param {string} docId - The document ID
 */
async function incrementTransactionCounter(operationType, collection, docId) {
  try {
    const todayDate = getTodayDateString();
    const trackingDocRef = db.collection(TRANSACTION_TRACKING_COLLECTION).doc('tracking');
    
    // Get current tracking document
    const trackingDoc = await trackingDocRef.get();
    
    if (!trackingDoc.exists) {
      // Create tracking document if it doesn't exist
      await trackingDocRef.set({
        totalTransactions: 1,
        createdAt: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
        dailyStats: {
          [todayDate]: {
            totalTransactions: 1,
            readOperations: operationType === 'read' ? 1 : 0,
            writeOperations: operationType === 'write' ? 1 : 0,
            lastOperation: {
              type: operationType,
              collection: collection,
              docId: docId,
              timestamp: FieldValue.serverTimestamp()
            }
          }
        }
      });
      
      console.log(`[TRACKING] Created new tracking document for 'tracking' with daily stats for ${todayDate}`);
    } else {
      // Update existing tracking document
      const currentData = trackingDoc.data();
      const newTotalTransactions = (currentData.totalTransactions || 0) + 1;
      
      const updateData = {
        totalTransactions: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp(),
        [`dailyStats.${todayDate}.totalTransactions`]: FieldValue.increment(1),
        [`dailyStats.${todayDate}.lastOperation`]: {
          type: operationType,
          collection: collection,
          docId: docId,
          timestamp: FieldValue.serverTimestamp()
        }
      };
      
      if (operationType === 'read') {
        updateData[`dailyStats.${todayDate}.readOperations`] = FieldValue.increment(1);
      } else if (operationType === 'write') {
        updateData[`dailyStats.${todayDate}.writeOperations`] = FieldValue.increment(1);
      }
      
      
      await trackingDocRef.update(updateData);
      
      console.log(`[TRACKING] ${operationType} operation logged. Count: ${newTotalTransactions}/${DAILY_TRANSACTION_LIMIT} (${collection}/${docId})`);
    }
  } catch (error) {
    console.error('[TRACKING] Error incrementing transaction counter:', error);
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