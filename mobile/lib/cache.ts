import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedTicket } from './types';

const CACHE_KEY = 'tv_ticket_cache';

export async function cacheTickets(tickets: ParsedTicket[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(tickets));
  } catch {
    // Storage full or unavailable — cache is best-effort, safe to drop.
  }
}

export async function loadCachedTickets(): Promise<ParsedTicket[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ParsedTicket[]) : [];
  } catch {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
