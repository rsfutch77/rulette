// Mock main.js
import { jest } from '@jest/globals';

export const auth = {
  currentUser: null
};

export const db = {};

// Mock Firebase functions
export const createFirestoreGameSession = jest.fn(() => Promise.resolve());
export const initializeFirestorePlayer = jest.fn(() => Promise.resolve());
export const updateFirestorePlayerStatus = jest.fn(() => Promise.resolve());
export const updateFirestorePlayerHand = jest.fn(() => Promise.resolve());
export const updateFirestoreRefereeCard = jest.fn(() => Promise.resolve());
export const getFirestoreGameSession = jest.fn(() => Promise.resolve({ exists: true, data: () => ({ /* mock data */ }) }));
export const getFirestorePlayer = jest.fn(() => Promise.resolve({ exists: true, data: () => ({ /* mock data */ }) }));
export const getFirestorePlayersInSession = jest.fn(() => Promise.resolve([]));
export const getDevUID = jest.fn(() => 'test-dev-uid');

// Mock Firebase imports
export const collection = jest.fn();
export const doc = jest.fn();
export const setDoc = jest.fn();
export const getDoc = jest.fn();
export const query = jest.fn();
export const where = jest.fn();
export const getDocs = jest.fn();
export const deleteDoc = jest.fn();
export const updateDoc = jest.fn();
export const arrayUnion = jest.fn();
export const onSnapshot = jest.fn();

// Mock CardManager
export const CardManager = jest.fn().mockImplementation(() => ({
  // Add any methods needed for testing
}));

// Mock loadCardData
export const loadCardData = jest.fn().mockResolvedValue({
  deckType1: [],
  deckType2: [],
  deckType3: [],
  deckType4: [],
  deckType5: [],
  deckType6: []
});