// js/firebase-config.js

/**
 * Firebase Config - Replace with your own project config!
 * You can find this in your Firebase Console -> Project Settings
 */
const firebaseConfig = {
    apiKey: "dummy-api-key-for-rtdb",
    authDomain: "boardgame-591a4.firebaseapp.com",
    databaseURL: "https://boardgame-591a4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-591a4",
    storageBucket: "boardgame-591a4.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:dummy"
};

// Initialize Firebase only if the script is loaded and config is set
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
        } catch(e) {
            console.error("Firebase Initialization Error:", e);
        }
    }
}

const FirebaseManager = {
    myUserId: null,
    
    initOnlineStatus: function() {
        if (typeof firebase === 'undefined' || !firebase.apps.length) return;
        if (!localStorage.getItem("isLoggedIn")) return;
        
        const database = firebase.database();
        const phone = localStorage.getItem("phone") || "unknown_" + Math.random().toString(36).substr(2, 5);
        let name = "Player";
        let avatar = "😎";
        
        try {
            const profileStr = localStorage.getItem('29card_profile');
            if (profileStr) {
                const profile = JSON.parse(profileStr);
                if (profile.name) name = profile.name;
                if (profile.avatarEmoji) avatar = profile.avatarEmoji;
            }
        } catch(e) {}
        
        this.myUserId = phone; // Using phone number as unique ID
        
        const userRef = database.ref('online_users/' + this.myUserId);
        
        // Listen for connection state
        const connectedRef = database.ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                // When I disconnect, remove my node
                userRef.onDisconnect().remove().then(() => {
                    // Set my status to online
                    userRef.set({
                        name: name,
                        phone: phone,
                        avatar: avatar,
                        status: 'online',
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                });
            }
        });
    },

    listenForOnlineUsers: function(callback) {
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.warn("Firebase not loaded! Simulating empty online list.");
            if (callback) callback([]);
            return;
        }

        const database = firebase.database();
        const usersRef = database.ref('online_users');
        
        usersRef.on('value', (snapshot) => {
            const users = [];
            snapshot.forEach((childSnapshot) => {
                const data = childSnapshot.val();
                if (data.phone !== this.myUserId) {
                    users.push(data);
                }
            });
            
            // --- AI BOTS ---
            const staticBots = [
                { phone: 'bot_1', name: 'হাসান (Bot)', avatar: '👦', status: 'online' },
                { phone: 'bot_2', name: 'রহিম (Bot)', avatar: '👨', status: 'online' },
                { phone: 'bot_3', name: 'আয়েশা (Bot)', avatar: '👩', status: 'online' },
                { phone: 'bot_4', name: 'করিম (Bot)', avatar: '🧔', status: 'online' },
                { phone: 'bot_5', name: 'সুমি (Bot)', avatar: '👱‍♀️', status: 'online' }
            ];
            users.push(...staticBots);

            if (callback) callback(users);
        });
    },
    
    // ---- Invite System ----
    
    sendInvite: function(recipientPhone) {
        if (typeof firebase === 'undefined' || !this.myUserId || !firebase.apps || !firebase.apps.length) return;
        
        let name = "Player";
        let avatar = "😎";
        try {
            const profileStr = localStorage.getItem('29card_profile');
            if (profileStr) {
                const profile = JSON.parse(profileStr);
                if (profile.name) name = profile.name;
                if (profile.avatarEmoji) avatar = profile.avatarEmoji;
            }
        } catch(e) {}
        
        // --- BOT INTERCEPTION ---
        if (recipientPhone.startsWith('bot_')) {
            // Simulate bot accepting the invite after a delay
            setTimeout(() => {
                if (this._inviteResponseCallback) {
                    // Extract bot name from the bots array
                    const bots = [
                        { phone: 'bot_1', name: 'Hasan (Bot)', avatar: '👦' },
                        { phone: 'bot_2', name: 'Rahim (Bot)', avatar: '👨' },
                        { phone: 'bot_3', name: 'Ayesha (Bot)', avatar: '👩' },
                        { phone: 'bot_4', name: 'Karim (Bot)', avatar: '🧔' },
                        { phone: 'bot_5', name: 'Sumi (Bot)', avatar: '👱‍♀️' }
                    ];
                    const bot = bots.find(b => b.phone === recipientPhone) || { name: 'Bot', avatar: '🤖' };
                    
                    this._inviteResponseCallback(recipientPhone, {
                        status: 'accepted',
                        responderName: bot.name,
                        responderAvatar: bot.avatar
                    });
                }
            }, 2000 + Math.random() * 2000); // 2-4 seconds delay
            return;
        }
        
        const database = firebase.database();
        const inviteRef = database.ref(`invites/${recipientPhone}/${this.myUserId}`);
        
        inviteRef.set({
            hostPhone: this.myUserId,
            hostName: name,
            hostAvatar: avatar,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Auto remove invite after 30 seconds if no response
        setTimeout(() => {
            inviteRef.once('value').then(snap => {
                if(snap.exists() && snap.val().status === 'pending') {
                    inviteRef.remove();
                }
            });
        }, 30000);
    },
    
    listenForInvites: function(onInviteReceived) {
        if (!this.myUserId || !firebase.apps.length) return;
        
        const database = firebase.database();
        const myInvitesRef = database.ref(`invites/${this.myUserId}`);
        
        myInvitesRef.on('child_added', (snapshot) => {
            const inviteData = snapshot.val();
            if (inviteData && inviteData.status === 'pending') {
                if (onInviteReceived) onInviteReceived(inviteData);
            }
        });
        
        myInvitesRef.on('child_changed', (snapshot) => {
            const inviteData = snapshot.val();
            if (inviteData && inviteData.status === 'pending') {
                if (onInviteReceived) onInviteReceived(inviteData);
            }
        });
    },
    
    respondToInvite: function(hostPhone, responseStatus) {
        if (typeof firebase === 'undefined' || !this.myUserId || !firebase.apps.length) return;
        
        let name = "Player";
        let avatar = "😎";
        try {
            const profileStr = localStorage.getItem('29card_profile');
            if (profileStr) {
                const profile = JSON.parse(profileStr);
                if (profile.name) name = profile.name;
                if (profile.avatarEmoji) avatar = profile.avatarEmoji;
            }
        } catch(e) {}
        
        const database = firebase.database();
        const inviteRef = database.ref(`invites/${this.myUserId}/${hostPhone}`);
        
        inviteRef.update({
            status: responseStatus,
            responderName: name,
            responderAvatar: avatar
        });
        
        // If rejected, remove it after a bit
        if (responseStatus === 'rejected') {
            setTimeout(() => inviteRef.remove(), 5000);
        } else if (responseStatus === 'accepted') {
            localStorage.setItem('currentHost', hostPhone);
            // Leave it for the host to see, host will clear it
        }
    },
    
    clearInvite: function(recipientPhone) {
        if (!this.myUserId || !firebase.apps.length) return;
        if (recipientPhone.startsWith('bot_')) return; // Bots don't have real invites to clear
        
        const database = firebase.database();
        const inviteRef = database.ref(`invites/${recipientPhone}/${this.myUserId}`);
        if(inviteRef) inviteRef.remove();
    },
    
    _inviteResponseCallback: null,
    
    listenForInviteResponses: function(onResponse) {
        if (typeof firebase === 'undefined' || !this.myUserId || !firebase.apps || !firebase.apps.length) return;
        
        this._inviteResponseCallback = onResponse;
        
        const database = firebase.database();
        const usersRef = database.ref('invites');
        
        // Listen to all invites where I am the host
        usersRef.on('value', (snapshot) => {
            snapshot.forEach(recipientSnap => {
                const recipientPhone = recipientSnap.key;
                const myInviteSnap = recipientSnap.child(this.myUserId);
                
                if (myInviteSnap.exists()) {
                    const data = myInviteSnap.val();
                    if (data.status === 'accepted' || data.status === 'rejected') {
                        // Pass back the recipient's phone and their response
                        if (onResponse) onResponse(recipientPhone, data);
                    }
                }
            });
        });
    },
    
    // ---- Guest Lobby Sync ----
    
    syncLobbyState: function(playersArray) {
        if (typeof firebase === 'undefined' || !this.myUserId || !firebase.apps || !firebase.apps.length) return;
        const database = firebase.database();
        const lobbyRef = database.ref(`online_lobby/${this.myUserId}`);
        
        lobbyRef.update({
            players: playersArray,
            status: 'waiting',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Remove lobby when host disconnects
        lobbyRef.onDisconnect().remove();
    },
    
    listenToLobby: function(hostPhone, callback) {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
        const database = firebase.database();
        const lobbyRef = database.ref(`online_lobby/${hostPhone}`);
        
        lobbyRef.on('value', (snapshot) => {
            if (callback) callback(snapshot.val());
        });
    },
    
    startOnlineGame: function(deck, players) {
        if (typeof firebase === 'undefined' || !this.myUserId || !firebase.apps || !firebase.apps.length) return;
        const database = firebase.database();
        const lobbyRef = database.ref(`online_lobby/${this.myUserId}`);
        
        let updateData = {
            status: 'started',
            deck: deck || null
        };
        if (players) updateData.players = players;
        
        lobbyRef.update(updateData);
        
        // Clear previous match actions
        database.ref(`online_match/${this.myUserId}/actions`).remove();
    },
    
    // ---- Multiplayer Sync ----
    
    sendGameAction: function(hostPhone, action, data, playerIndex) {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length || !hostPhone) return;
        const database = firebase.database();
        const actionsRef = database.ref(`online_match/${hostPhone}/actions`);
        
        actionsRef.push({
            action: action,
            data: data !== undefined ? data : null,
            playerIndex: playerIndex,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },
    
    listenForGameActions: function(hostPhone, callback) {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length || !hostPhone) return;
        const database = firebase.database();
        const actionsRef = database.ref(`online_match/${hostPhone}/actions`);
        
        // Listen for new actions added
        actionsRef.on('child_added', (snapshot) => {
            if (callback) callback(snapshot.val());
        });
    },

    // Aliases for compatibility
    startGame: function(players) {
        this.startOnlineGame(null, players);
    },
    listenForGameStart: function(callback) {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
        const database = firebase.database();
        const hostPhone = localStorage.getItem('currentHost');
        if (hostPhone) {
            database.ref(`online_lobby/${hostPhone}`).on('value', (snapshot) => {
                const data = snapshot.val();
                if (data && data.status === 'started' && callback) callback(data);
            });
        }
    },
    listenForGameData: function(callback) {
        const hostPhone = localStorage.getItem('currentHost') || this.myUserId;
        this.listenForGameActions(hostPhone, (actionObj) => {
            if (actionObj && callback) callback(actionObj.action, actionObj.data);
        });
    }
};
