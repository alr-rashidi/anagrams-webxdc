// webxdc.js - WebXDC API shim and dev simulator for WebXDC mini-app
(function () {
  if (window.webxdc) {
    console.log('[WebXDC] Native webxdc object detected.');
    return;
  }

  console.log('[WebXDC] Initializing WebXDC simulation environment.');

  // Mock users
  const MOCK_USERS = [
    { addr: 'host@webxdc.local', name: 'میزبان (بازیکن ۱)' },
    { addr: 'ali@webxdc.local', name: 'علی' },
    { addr: 'meryem@webxdc.local', name: 'مریم' },
    { addr: 'reza@webxdc.local', name: 'رضا' }
  ];

  let currentUserId = localStorage.getItem('webxdc_sim_user_idx') || '0';
  let currentUser = MOCK_USERS[parseInt(currentUserId, 10)] || MOCK_USERS[0];

  const STORAGE_KEY = 'webxdc_updates_store_v1';
  const CHANNEL_NAME = 'webxdc_game_updates_channel';

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  let updateListener = null;
  let lastSerialProcessed = 0;

  function getStoredUpdates() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveStoredUpdates(updates) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
    } catch (e) {
      console.error('Error saving updates:', e);
    }
  }

  function dispatchUpdates() {
    if (!updateListener) return;
    const all = getStoredUpdates();
    for (let i = lastSerialProcessed; i < all.length; i++) {
      const update = all[i];
      lastSerialProcessed = update.serial;
      try {
        updateListener(update);
      } catch (err) {
        console.error('Error in webxdc update listener:', err);
      }
    }
  }

  if (channel) {
    channel.onmessage = function (event) {
      if (event.data && event.data.type === 'NEW_UPDATE') {
        dispatchUpdates();
      } else if (event.data && event.data.type === 'CLEAR_STORAGE') {
        lastSerialProcessed = 0;
        dispatchUpdates();
      }
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      dispatchUpdates();
    }
  });

  window.webxdc = {
    get selfAddr() {
      return currentUser.addr;
    },
    get selfName() {
      return currentUser.name;
    },

    sendUpdate: function (updateInfo, description) {
      const updates = getStoredUpdates();
      const serial = updates.length + 1;

      const fullUpdate = {
        payload: updateInfo.payload,
        info: updateInfo.info || description || '',
        serial: serial,
        max_serial: serial
      };

      updates.push(fullUpdate);
      saveStoredUpdates(updates);

      if (channel) {
        channel.postMessage({ type: 'NEW_UPDATE', serial: serial });
      }

      setTimeout(dispatchUpdates, 0);
    },

    setUpdateListener: function (cb, serial) {
      updateListener = cb;
      lastSerialProcessed = serial || 0;
      setTimeout(dispatchUpdates, 0);
      return Promise.resolve();
    },

    // Dev helper to switch user identity in simulator
    _switchSimUser: function (idx) {
      if (MOCK_USERS[idx]) {
        currentUser = MOCK_USERS[idx];
        localStorage.setItem('webxdc_sim_user_idx', idx.toString());
        window.location.reload();
      }
    },

    _clearSimStore: function () {
      localStorage.removeItem(STORAGE_KEY);
      if (channel) {
        channel.postMessage({ type: 'CLEAR_STORAGE' });
      }
      window.location.reload();
    },

    _getSimUsers: function () {
      return MOCK_USERS;
    },

    _getCurrentSimIndex: function () {
      return parseInt(currentUserId, 10);
    }
  };
})();
