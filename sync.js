// Cloud sync through Firebase: shared votes, photos, and judging sessions.
// Firestore layout, all under contests/{YEAR}:
//   votes/{uid}__{address}     one judge's vote for one house
//   photos/{uid}__{address}    that vote's photo, kept apart so vote lists stay small
//   sessions/{CODE}            hostUid, current: {street, num, callId} | null
//   sessions/{CODE}/judges/{uid}  name, doneCallId (last called house they finished)
// Firestore's offline cache queues writes when a phone loses signal.
(function () {
  const cfg = window.LUTH_FIREBASE;
  const listeners = new Set();
  const emit = kind => listeners.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } });

  const Cloud = {
    enabled: !!(cfg && window.LUTH_FB),
    uid: null, votes: [], session: null, sessionCode: null, judges: [], online: navigator.onLine,
    onChange(fn) { listeners.add(fn); },
  };
  window.Cloud = Cloud;
  if (!Cloud.enabled) return;

  const F = window.LUTH_FB;
  const year = String(LUTH_CONFIG.YEAR);
  const app = F.initializeApp(cfg);
  const auth = F.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) {
    db = F.initializeFirestore(app, {}); // Private browsing can block the offline cache.
  }
  if (cfg.useEmulator) {
    F.connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    F.connectFirestoreEmulator(db, 'localhost', 8080);
  }

  const base = ['contests', year];
  const ref = (...p) => F.doc(db, ...base, ...p);
  const col = (...p) => F.collection(db, ...base, ...p);
  const slug = s => s.replace(/[^A-Za-z0-9]+/g, '_');
  Cloud.voteId = address => Cloud.uid + '__' + slug(address);

  addEventListener('online', () => { Cloud.online = true; emit('online'); });
  addEventListener('offline', () => { Cloud.online = false; emit('online'); });

  Cloud.ready = new Promise((resolve, reject) => {
    F.onAuthStateChanged(auth, user => {
      if (!user) { F.signInAnonymously(auth).catch(err => { emit('error'); reject(err); }); return; }
      Cloud.uid = user.uid;
      resolve(user.uid);
    });
  });

  Cloud.ready.then(() => {
    F.onSnapshot(col('votes'), snap => {
      // Skip malformed documents so one bad write can't break standings.
      Cloud.votes = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => typeof v.address === 'string' && typeof v.total === 'number');
      emit('votes');
    }, err => { console.error(err); emit('error'); });
    const saved = localStorage.getItem('luth_session');
    if (saved) watchSession(saved);
  });

  // ---- Votes and photos ----
  Cloud.putVote = async (vote, photo) => {
    const id = Cloud.voteId(vote.address);
    const data = { ...vote, judgeId: Cloud.uid, hasPhoto: !!photo, updatedAt: F.serverTimestamp() };
    delete data.photo;
    upsertLocal({ id, ...data });
    if (photo) photoCache.set(id, photo);
    else photoCache.delete(id);
    // Not awaited: with the offline cache, writes apply locally at once and sync when online.
    F.setDoc(ref('votes', id), data).catch(err => { console.error(err); emit('error'); });
    if (photo) F.setDoc(ref('photos', id), { data: photo, judgeId: Cloud.uid }).catch(console.error);
    else F.deleteDoc(ref('photos', id)).catch(() => {});
  };
  Cloud.removeVote = address => {
    const id = Cloud.voteId(address);
    photoCache.delete(id);
    Cloud.votes = Cloud.votes.filter(v => v.id !== id);
    F.deleteDoc(ref('votes', id)).catch(console.error);
    F.deleteDoc(ref('photos', id)).catch(() => {});
  };
  // Apply a write to the in-memory list now; the snapshot listener confirms it shortly after.
  function upsertLocal(v) {
    const i = Cloud.votes.findIndex(x => x.id === v.id);
    if (i >= 0) Cloud.votes[i] = v; else Cloud.votes.push(v);
  }
  const photoCache = new Map();
  Cloud.photo = async id => {
    if (photoCache.has(id)) return photoCache.get(id);
    const snap = await F.getDoc(ref('photos', id));
    const data = snap.exists() ? snap.data().data : null;
    photoCache.set(id, data);
    return data;
  };

  // ---- Sessions ----
  let unsubSession = null, unsubJudges = null;
  function watchSession(code) {
    stopWatching();
    Cloud.sessionCode = code;
    localStorage.setItem('luth_session', code);
    unsubSession = F.onSnapshot(ref('sessions', code), snap => {
      if (!snap.exists()) { Cloud.leaveSession(); emit('session-missing'); return; }
      Cloud.session = snap.data();
      emit('session');
    }, err => { console.error(err); emit('error'); });
    unsubJudges = F.onSnapshot(col('sessions', code, 'judges'), snap => {
      Cloud.judges = snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      // The host removed this judge (or their entry is gone): drop out locally; they can rejoin by code.
      if (Cloud.uid && !snap.metadata.hasPendingWrites && !Cloud.judges.some(j => j.uid === Cloud.uid)) {
        stopWatching(); Cloud.sessionCode = null; localStorage.removeItem('luth_session');
        emit('removed'); emit('session'); return;
      }
      emit('judges');
    });
  }
  function stopWatching() {
    unsubSession && unsubSession();
    unsubJudges && unsubJudges();
    unsubSession = unsubJudges = null;
    Cloud.session = null; Cloud.judges = [];
  }
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
  Cloud.createSession = async name => {
    await Cloud.ready;
    for (let tries = 0; tries < 5; tries++) {
      const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const r = ref('sessions', code);
      if ((await F.getDoc(r)).exists()) continue;
      await F.setDoc(r, { hostUid: Cloud.uid, hostName: name, current: null, createdAt: F.serverTimestamp() });
      await F.setDoc(ref('sessions', code, 'judges', Cloud.uid), { name, joinedAt: F.serverTimestamp(), doneCallId: null });
      watchSession(code);
      return code;
    }
    throw new Error('Could not create a session code. Try again.');
  };
  Cloud.joinSession = async (code, name) => {
    await Cloud.ready;
    code = code.trim().toUpperCase();
    if (!(await F.getDoc(ref('sessions', code))).exists()) throw new Error('No session with code ' + code);
    await F.setDoc(ref('sessions', code, 'judges', Cloud.uid), { name, joinedAt: F.serverTimestamp(), doneCallId: null });
    watchSession(code);
  };
  Cloud.leaveSession = () => {
    const code = Cloud.sessionCode;
    // A host leaving closes any open house so judges aren't left waiting on it.
    if (Cloud.isHost() && Cloud.session.current) F.updateDoc(ref('sessions', code), { current: null }).catch(() => {});
    if (code && Cloud.uid) F.deleteDoc(ref('sessions', code, 'judges', Cloud.uid)).catch(() => {});
    stopWatching();
    Cloud.sessionCode = null;
    localStorage.removeItem('luth_session');
    emit('session');
  };
  // Host only: take a judge out of the session (left early, phone died). Their votes stay.
  Cloud.removeJudge = uid => {
    if (!Cloud.isHost() || uid === Cloud.uid) return;
    F.deleteDoc(ref('sessions', Cloud.sessionCode, 'judges', uid)).catch(console.error);
  };
  // Host hands hosting to another judge in the session.
  Cloud.makeHost = uid => {
    const j = Cloud.judges.find(j => j.uid === uid);
    if (!Cloud.isHost() || !j) return Promise.resolve();
    return F.updateDoc(ref('sessions', Cloud.sessionCode), { hostUid: uid, hostName: j.name });
  };
  // Any judge takes over hosting (the host is stuck or gone).
  Cloud.claimHost = name => F.updateDoc(ref('sessions', Cloud.sessionCode), { hostUid: Cloud.uid, hostName: name });
  Cloud.isHost = () => !!(Cloud.session && Cloud.session.hostUid === Cloud.uid);
  // Host only: send every judge in the session to this house.
  Cloud.callHouse = (street, num) => {
    if (!Cloud.isHost()) return;
    if (street && Cloud.session.current) return; // one open house at a time: close it first
    const current = street ? { street, num: String(num), callId: Date.now().toString(36) } : null;
    F.updateDoc(ref('sessions', Cloud.sessionCode), { current }).catch(console.error);
  };
  // Tell the host this judge is finished with the called house (scored or skipped).
  Cloud.markDone = callId => {
    if (!Cloud.sessionCode) return;
    F.updateDoc(ref('sessions', Cloud.sessionCode, 'judges', Cloud.uid), { doneCallId: callId }).catch(console.error);
  };
})();
