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

function serializableState(state) {
  return {
    schemaVersion: 1,
    collection: state?.collection && typeof state.collection === "object" ? state.collection : {},
    preferences: state?.preferences && typeof state.preferences === "object" ? state.preferences : {}
  };
}

function fingerprint(state) {
  const normalized = serializableState(state);
  const collection = Object.fromEntries(Object.entries(normalized.collection).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ collection, preferences: normalized.preferences });
}

function mergeWithoutLoss(localState, cloudState) {
  const local = serializableState(localState);
  const cloud = serializableState(cloudState);
  const collection = { ...cloud.collection };
  for (const [key, localQuantity] of Object.entries(local.collection)) {
    collection[key] = Math.max(Number(collection[key]) || 0, Number(localQuantity) || 0);
  }
  return {
    schemaVersion: 1,
    collection,
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
  elements.signInButton.textContent = busy ? "Connexion…" : "Se connecter";
}

function authMessage(error) {
  return {
    "auth/invalid-email": "L’adresse e-mail n’est pas valide.",
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/user-disabled": "Ce compte a été désactivé.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
    "auth/network-request-failed": "Connexion réseau indisponible.",
    "auth/email-already-in-use": "Un compte existe déjà avec cette adresse e-mail.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
    "auth/missing-password": "Saisissez votre mot de passe."
  }[error?.code] || "Firebase n’a pas pu effectuer cette opération.";
}

async function writeCloudState({ notify = false } = {}) {
  if (!currentUser || !userDocument || !cloudReady) return;
  if (!navigator.onLine) {
    bridge.setCloudStatus({
      user: currentUser,
      status: "offline",
      label: "Sauvegarde locale en attente",
      detail: "La synchronisation reprendra automatiquement au retour d’Internet."
    });
    return;
  }

  const state = serializableState(bridge.getState());
  bridge.setCloudStatus({
    user: currentUser,
    status: "syncing",
    detail: "Envoi de votre collection vers Firebase…"
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
      detail: "Vos shiny et leurs quantités sont à jour dans Firebase."
    });
    if (notify) bridge.showToast("Collection synchronisée avec Firebase.");
  } catch (error) {
    console.error("Échec de la sauvegarde Firebase", error);
    bridge.setCloudStatus({
      user: currentUser,
      status: navigator.onLine ? "error" : "offline",
      label: navigator.onLine ? "Sauvegarde Firebase impossible" : "Sauvegarde locale en attente",
      detail: error?.code === "permission-denied"
        ? "Les règles Firestore doivent autoriser users/{uid}/apps/shinydex."
        : "La copie locale est intacte. Une nouvelle tentative sera faite automatiquement."
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
        bridge.applySyncedState(merged, "Sauvegarde locale et cloud fusionnées.");
        cloudReady = true;
        lastCloudState = fingerprint(cloud);
        if (fingerprint(merged) !== lastCloudState) {
          scheduleCloudSave(0);
        } else {
          bridge.setCloudStatus({
            user,
            status: snapshot.metadata.fromCache && !navigator.onLine ? "offline" : "synced",
            detail: "Votre collection Firebase a été chargée."
          });
        }
        return;
      }

      if (!snapshot.exists()) return;
      const cloud = serializableState(snapshot.data());
      const remoteFingerprint = fingerprint(cloud);
      if (!snapshot.metadata.hasPendingWrites && remoteFingerprint !== fingerprint(bridge.getState())) {
        bridge.applySyncedState(cloud, "Collection mise à jour depuis un autre appareil.");
      }
      lastCloudState = remoteFingerprint;
      bridge.setCloudStatus({
        user,
        status: snapshot.metadata.hasPendingWrites
          ? "syncing"
          : (snapshot.metadata.fromCache && !navigator.onLine ? "offline" : "synced"),
        detail: snapshot.metadata.hasPendingWrites
          ? "Firebase confirme vos dernières modifications…"
          : "Vos shiny et leurs quantités sont à jour dans Firebase."
      });
    },
    error => {
      console.error("Échec de la lecture Firebase", error);
      cloudReady = true;
      bridge.setCloudStatus({
        user,
        status: "error",
        label: "Lecture Firebase impossible",
        detail: error?.code === "permission-denied"
          ? "Publiez les règles Firestore fournies dans le dépôt."
          : "La sauvegarde locale reste disponible."
      });
    }
  );
}

async function authenticate(mode) {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  setAuthError();
  if (!email || !password) {
    setAuthError("Saisissez votre adresse e-mail et votre mot de passe.");
    return;
  }
  if (mode === "create" && password.length < 6) {
    setAuthError("Le mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  setAuthBusy(true);
  try {
    if (mode === "create") {
      await createUserWithEmailAndPassword(auth, email, password);
      bridge.showToast("Compte créé. Votre Shinydex va être sauvegardé.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      bridge.showToast("Connexion réussie.");
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
  elements.togglePasswordButton.textContent = reveal ? "Masquer" : "Afficher";
  elements.togglePasswordButton.setAttribute("aria-label", reveal ? "Masquer le mot de passe" : "Afficher le mot de passe");
});
elements.resetPasswordButton.addEventListener("click", async () => {
  const email = elements.authEmail.value.trim();
  setAuthError();
  if (!email) {
    setAuthError("Saisissez d’abord votre adresse e-mail.");
    return;
  }
  setAuthBusy(true);
  try {
    await sendPasswordResetEmail(auth, email);
    bridge.showToast("Si ce compte existe, un e-mail de réinitialisation a été envoyé.");
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
    bridge.showToast("Déconnecté. La sauvegarde locale reste disponible.");
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
      detail: "La copie locale fonctionne. Firebase reprendra au retour d’Internet."
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
          detail: "Chargement de votre sauvegarde Firebase…"
        });
        listenToCloud(user);
      } else {
        bridge.setCloudStatus({
          status: "local",
          detail: "Connectez-vous pour retrouver votre Shinydex sur tous vos appareils."
        });
      }
    });
  });
