import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import defaultFirebaseConfig from '../firebase-applet-config.json';

function pickEnvValue(envValue: string | undefined, fallback: string): string {
  const trimmed = typeof envValue === 'string' ? envValue.trim() : '';
  return trimmed ? trimmed : fallback;
}

export const activeFirebaseConfig = {
  ...defaultFirebaseConfig,
  projectId: pickEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, defaultFirebaseConfig.projectId),
  appId: pickEnvValue(import.meta.env.VITE_FIREBASE_APP_ID, defaultFirebaseConfig.appId),
  apiKey: pickEnvValue(import.meta.env.VITE_FIREBASE_API_KEY, defaultFirebaseConfig.apiKey),
  authDomain: pickEnvValue(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    defaultFirebaseConfig.authDomain
  ),
  firestoreDatabaseId: pickEnvValue(
    import.meta.env.VITE_FIREBASE_DATABASE_ID,
    defaultFirebaseConfig.firestoreDatabaseId
  ),
  storageBucket: pickEnvValue(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    defaultFirebaseConfig.storageBucket
  ),
  messagingSenderId: pickEnvValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    defaultFirebaseConfig.messagingSenderId
  ),
  oAuthClientId: pickEnvValue(
    import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID,
    defaultFirebaseConfig.oAuthClientId
  ),
};

const app = initializeApp(activeFirebaseConfig);
export const db = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
