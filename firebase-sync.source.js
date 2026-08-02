import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTWDJmQzzNyHLrq1xaVybYET3kpdB6zWQ",
  authDomain: "pokemon-shinydex.firebaseapp.com",
  projectId: "pokemon-shinydex",
  storageBucket: "pokemon-shinydex.firebasestorage.app",
  messagingSenderId: "276783664285",
  appId: "1:276783664285:web:00de71076fd5e29e459874"
};

const bridge = window.SHINYDEX_APP;
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const EXCEPTION_VALUE = "exception";

const elements = Object.fromEntries([
  "authForm", "authEmail", "authPassword", "authError", "signInButton",
  "createAccountButton", "resetPasswordButton", "togglePasswordButton",
  "syncNowButton", "signOutButton"
].map(id => [id, document.getElementById(id)]));

let currentUser = null;
let userDocument = null;
let unsubscribe = null;
let saveTimer = null;
let cloudReady = false;
let lastCloudState = "";

function tr(key, values) {
  return bridge.t(key, values);
}

function serializableState(state) {
  return {
    schemaVersion: 3,
    collection: state?.collection && typeof state.collection === "object" ? state.collection : {},
    huntRecords: state?.huntRecords && typeof state.huntRecords === "object" ? state.huntRecords : {},
    preferences: state?.preferences && typeof state.preferences === "object" ? state.preferences : {}
  };
}

function fingerprint(state) {
  const normalized = serializableState(state);
  const collection = Object.fromEntries(Object.entries(normalized.collection).sort(([a], [b]) => a.localeCompare(b)));
  const huntRecords = Object.fromEntries(Object.entries(normalized.huntRecords).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ collection, huntRecords, preferences: normalized.preferences });
}

function mergeWithoutLoss(localState, cloudState) {
  const local = serializableState(localState);
  const cloud = serializableState(cloudState);
  const collection = { ...cloud.collection };
  for (const [key, localQuantity] of Object.entries(local.collection)) {
    const cloudQuantity = collection[key];
    const numericQuantity = Math.max(
      cloudQuantity === EXCEPTION_VALUE ? 0 : (Number(cloudQuantity) || 0),
      localQuantity === EXCEPTION_VALUE ? 0 : (Number(localQuantity) || 0)
    );
    collection[key] = numericQuantity > 0
      ? numericQuantity
      : (cloudQuantity === EXCEPTION_VALUE || localQuantity === EXCEPTION_VALUE)
        ? EXCEPTION_VALUE
        : 0;
  }
  const huntRecords = { ...cloud.huntRecords };
  for (const [id, localRecord] of Object.entries(local.huntRecords)) {
    const cloudRecord = huntRecords[id];
    if (!cloudRecord || (Number(localRecord?.updatedAt) || 0) >= (Number(cloudRecord?.updatedAt) || 0)) {
      huntRecords[id] = localRecord;
    }
  }
  return {
    schemaVersion: 3,
    collection,
    huntRecords,
    preferences: { ...local.preferences, ...cloud.preferences }
  };
}

function setAuthError(message = "") {
  elements.authError.textContent = message;
  elements.authError.hidden = !message;
}

function setAuthBusy(busy) {
  elements.signInButton.disabled = busy;
  elements.createAccountButton.disabled = busy;
  elements.resetPasswordButton.disabled = busy;
  elements.signInButton.textContent = tr(busy ? "authSigningIn" : "signIn");
}

function authMessage(error) {
  const key = {
    "auth/invalid-email": "authInvalidEmail",
    "auth/invalid-credential": "authInvalidCredential",
    "auth/user-disabled": "authDisabled",
    "auth/too-many-requests": "authTooMany",
    "auth/network-request-failed": "authNetwork",
    "auth/email-already-in-use": "authEmailUsed",
    "auth/weak-password": "authWeakPassword",
    "auth/missing-password": "authMissingPassword"
  }[error?.code] || "firebaseError";
  return tr(key);
}

async function writeCloudState({ notify = false } = {}) {
  if (!currentUser || !userDocument || !cloudReady) return;
  if (!navigator.onLine) {
    bridge.setCloudStatus({
      user: currentUser,
      status: "offline",
      labelKey: "cloudWaiting",
      detailKey: "cloudResume"
    });
    return;
  }

  const state = serializableState(bridge.getState());
  bridge.setCloudStatus({
    user: currentUser,
    status: "syncing",
    detailKey: "cloudSending"
  });

  try {
    await setDoc(userDocument, {
      ...state,
      dataGeneratedAt: bridge.dataGeneratedAt,
      updatedAt: serverTimestamp()
    });
    lastCloudState = fingerprint(state);
    bridge.setCloudStatus({
      user: currentUser,
      status: "synced",
      detailKey: "cloudUpToDate"
    });
    if (notify) bridge.showToast(tr("cloudSyncedToast"));
  } catch (error) {
    console.error("Échec de la sauvegarde Firebase", error);
    bridge.setCloudStatus({
      user: currentUser,
      status: navigator.onLine ? "error" : "offline",
      labelKey: navigator.onLine ? "cloudImpossible" : "cloudWaiting",
      detailKey: error?.code === "permission-denied"
        ? "cloudRulesNeeded"
        : "cloudLocalSafe"
    });
  }
}

function scheduleCloudSave(delay = 650) {
  if (!currentUser || !cloudReady) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeCloudState(), delay);
}

function listenToCloud(user) {
  unsubscribe?.();
  cloudReady = false;
  userDocument = doc(db, "users", user.uid, "apps", "shinydex");
  let firstSnapshot = true;

  unsubscribe = onSnapshot(
    userDocument,
    { includeMetadataChanges: true },
    snapshot => {
      if (firstSnapshot) {
        firstSnapshot = false;
        const local = bridge.getState();
        if (!snapshot.exists()) {
          cloudReady = true;
          scheduleCloudSave(0);
          return;
        }

        const cloud = serializableState(snapshot.data());
        const merged = mergeWithoutLoss(local, cloud);
        bridge.applySyncedState(merged, tr("cloudMerged"));
        cloudReady = true;
        lastCloudState = fingerprint(cloud);
        if (fingerprint(merged) !== lastCloudState) {
          scheduleCloudSave(0);
        } else {
          bridge.setCloudStatus({
            user,
            status: snapshot.metadata.fromCache && !navigator.onLine ? "offline" : "synced",
            detailKey: "cloudLoaded"
          });
        }
        return;
      }

      if (!snapshot.exists()) return;
      const cloud = serializableState(snapshot.data());
      const remoteFingerprint = fingerprint(cloud);
      if (!snapshot.metadata.hasPendingWrites && remoteFingerprint !== fingerprint(bridge.getState())) {
        bridge.applySyncedState(cloud, tr("cloudOtherDevice"));
      }
      lastCloudState = remoteFingerprint;
      bridge.setCloudStatus({
        user,
        status: snapshot.metadata.hasPendingWrites
          ? "syncing"
          : (snapshot.metadata.fromCache && !navigator.onLine ? "offline" : "synced"),
        detailKey: snapshot.metadata.hasPendingWrites
          ? "cloudConfirming"
          : "cloudUpToDate"
      });
    },
    error => {
      console.error("Échec de la lecture Firebase", error);
      cloudReady = true;
      bridge.setCloudStatus({
        user,
        status: "error",
        labelKey: "cloudReadImpossible",
        detailKey: error?.code === "permission-denied"
          ? "cloudPublishRules"
          : "cloudLocalAvailable"
      });
    }
  );
}

async function authenticate(mode) {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  setAuthError();
  if (!email || !password) {
    setAuthError(tr("authFillBoth"));
    return;
  }
  if (mode === "create" && password.length < 6) {
    setAuthError(tr("authWeakPassword"));
    return;
  }

  setAuthBusy(true);
  try {
    if (mode === "create") {
      await createUserWithEmailAndPassword(auth, email, password);
      bridge.showToast(tr("accountCreated"));
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      bridge.showToast(tr("loginDone"));
    }
    elements.authPassword.value = "";
  } catch (error) {
    setAuthError(authMessage(error));
  } finally {
    setAuthBusy(false);
  }
}

elements.authForm.addEventListener("submit", event => {
  event.preventDefault();
  authenticate("signin");
});

elements.createAccountButton.addEventListener("click", () => authenticate("create"));
elements.togglePasswordButton.addEventListener("click", () => {
  const reveal = elements.authPassword.type === "password";
  elements.authPassword.type = reveal ? "text" : "password";
  elements.togglePasswordButton.textContent = tr(reveal ? "hide" : "show");
  elements.togglePasswordButton.setAttribute("aria-label", tr(reveal ? "hide" : "show"));
});
elements.resetPasswordButton.addEventListener("click", async () => {
  const email = elements.authEmail.value.trim();
  setAuthError();
  if (!email) {
    setAuthError(tr("enterEmailFirst"));
    return;
  }
  setAuthBusy(true);
  try {
    await sendPasswordResetEmail(auth, email);
    bridge.showToast(tr("resetEmailSent"));
  } catch (error) {
    setAuthError(authMessage(error));
  } finally {
    setAuthBusy(false);
  }
});
elements.syncNowButton.addEventListener("click", () => writeCloudState({ notify: true }));
elements.signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    bridge.showToast(tr("signedOut"));
  } catch (error) {
    bridge.showToast(authMessage(error));
  }
});

document.addEventListener("shinydex:local-change", () => scheduleCloudSave());
window.addEventListener("online", () => {
  if (currentUser) writeCloudState();
});
window.addEventListener("offline", () => {
  if (currentUser) {
    bridge.setCloudStatus({
      user: currentUser,
      status: "offline",
      detailKey: "cloudLocalCopy"
    });
  }
});

setPersistence(auth, browserLocalPersistence)
  .catch(error => console.warn("Persistance de connexion Firebase indisponible", error))
  .finally(() => {
    onAuthStateChanged(auth, user => {
      clearTimeout(saveTimer);
      unsubscribe?.();
      unsubscribe = null;
      currentUser = user;
      userDocument = null;
      cloudReady = false;
      lastCloudState = "";
      setAuthError();

      if (user) {
        bridge.setCloudStatus({
          user,
          status: "syncing",
          detailKey: "cloudLoading"
        });
        listenToCloud(user);
      } else {
        bridge.setCloudStatus({
          status: "local",
          detailKey: "cloudConnectPrompt"
        });
      }
    });
  });

document.addEventListener("shinydex:language-change", () => {
  setAuthBusy(elements.signInButton.disabled);
  const reveal = elements.authPassword.type === "text";
  elements.togglePasswordButton.textContent = tr(reveal ? "hide" : "show");
  elements.togglePasswordButton.setAttribute("aria-label", tr(reveal ? "hide" : "show"));
  if (currentUser) {
    bridge.setCloudStatus({
      user: currentUser,
      status: cloudReady ? "synced" : "syncing",
      detailKey: cloudReady ? "cloudUpToDate" : "cloudLoading"
    });
  }
});
