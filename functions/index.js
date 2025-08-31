const { onDocumentWritten } = require('firebase-functions/v2/firestore');
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
 * Clean up old daily stats entries, keeping only the last 30 days
 * @param {Object} dailyStats - Current daily stats object
 * @param {string} currentDate - Current date string
 * @returns {Object} Cleaned daily stats object
 */
function cleanupOldDailyStats(dailyStats, currentDate) {
  if (!dailyStats) return {};
  
  const daysToKeep = 14;
  const currentDateObj = new Date(currentDate);
  const cutoffDate = new Date(currentDateObj.getTime() - (daysToKeep * 24 * 60 * 60 * 1000));
  const cutoffDateString = cutoffDate.toISOString().split('T')[0];
  
  const cleanedStats = {};
  for (const [dateKey, stats] of Object.entries(dailyStats)) {
    if (dateKey >= cutoffDateString) {
      cleanedStats[dateKey] = stats;
    } else {
      console.log(`[TRACKING] Removing old daily stats for ${dateKey}`);
    }
  }
  
  return cleanedStats;
}

/**
 * Check if it's a new day and clean up old daily stats if needed
 * @param {Object} currentData - Current tracking document data
 * @param {string} todayDate - Today's date string
 * @returns {boolean} True if cleanup was needed
 */
function shouldCleanupDailyStats(currentData, todayDate) {
  if (!currentData.dailyStats) return false;
  
  // Check if today's date already exists in daily stats
  const todayExists = todayDate in currentData.dailyStats;
  
  // If today doesn't exist, it's a new day and we should cleanup
  if (!todayExists) {
    console.log(`[TRACKING] New day detected (${todayDate}). Previous day data will be preserved, old data cleaned up.`);
    return true;
  }
  
  return false;
}

/**
 * Increment transaction counter
 * @param {string} operationType - 'read', 'write', 'create', or 'update'
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
            writeOperations: ['write', 'create', 'update'].includes(operationType) ? 1 : 0,
            createOperations: operationType === 'create' ? 1 : 0,
            updateOperations: operationType === 'update' ? 1 : 0,
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
      
      // Check if we need to clean up old daily stats (new day detected)
      const needsCleanup = shouldCleanupDailyStats(currentData, todayDate);
      
      const updateData = {
        totalTransactions: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp()
      };
      
      // If it's a new day, clean up old daily stats and initialize new date
      if (needsCleanup) {
        const cleanedDailyStats = cleanupOldDailyStats(currentData.dailyStats, todayDate);
        
        // Initialize today's stats in the cleaned data
        cleanedDailyStats[todayDate] = {
          totalTransactions: 1,
          readOperations: operationType === 'read' ? 1 : 0,
          writeOperations: ['write', 'create', 'update'].includes(operationType) ? 1 : 0,
          createOperations: operationType === 'create' ? 1 : 0,
          updateOperations: operationType === 'update' ? 1 : 0,
          lastOperation: {
            type: operationType,
            collection: collection,
            docId: docId,
            timestamp: FieldValue.serverTimestamp()
          }
        };
        
        updateData.dailyStats = cleanedDailyStats;
        console.log(`[TRACKING] Cleaned up old daily stats and initialized new date: ${todayDate}`);
      } else {
        // Normal day - increment existing values
        updateData[`dailyStats.${todayDate}.totalTransactions`] = FieldValue.increment(1);
        updateData[`dailyStats.${todayDate}.lastOperation`] = {
          type: operationType,
          collection: collection,
          docId: docId,
          timestamp: FieldValue.serverTimestamp()
        };
      }
      
      // Only add increment operations if it's NOT a new day (cleanup wasn't needed)
      if (!needsCleanup) {
        if (operationType === 'read') {
          updateData[`dailyStats.${todayDate}.readOperations`] = FieldValue.increment(1);
        } else if (['write', 'create', 'update'].includes(operationType)) {
          updateData[`dailyStats.${todayDate}.writeOperations`] = FieldValue.increment(1);
          
          if (operationType === 'create') {
            updateData[`dailyStats.${todayDate}.createOperations`] = FieldValue.increment(1);
          } else if (operationType === 'update') {
            updateData[`dailyStats.${todayDate}.updateOperations`] = FieldValue.increment(1);
          }
        }
      }
      // If cleanup was needed, the stats were already initialized above with correct values
      
      
      await trackingDocRef.update(updateData);
      
      console.log(`[TRACKING] ${operationType} operation logged. Count: ${newTotalTransactions}/${DAILY_TRANSACTION_LIMIT} (${collection}/${docId})`);
    }
  } catch (error) {
    console.error('[TRACKING] Error incrementing transaction counter:', error);
  }
}

// Track writes to gameSessions collection
exports.trackGameSessionWrites = onDocumentWritten('gameSessions/{sessionId}', async (event) => {
  // Determine if this is a create or update operation
  const operationType = event.data.before.exists ? 'update' : 'create';
  await incrementTransactionCounter(operationType, 'gameSessions', event.params.sessionId);
});

// Track writes to players collection
exports.trackPlayerWrites = onDocumentWritten('players/{playerId}', async (event) => {
  // Determine if this is a create or update operation
  const operationType = event.data.before.exists ? 'update' : 'create';
  await incrementTransactionCounter(operationType, 'players', event.params.playerId);
});