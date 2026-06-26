import AsyncStorage from '@react-native-async-storage/async-storage';
import { QrProject } from './types';

const STORAGE_KEY = 'qr-projects-v1';

export const loadProjects = async (): Promise<QrProject[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveProjects = async (projects: QrProject[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};
