
import { useState, useEffect, useMemo } from 'react'
import { db, auth, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc, getDocs, where,
  collection, addDoc, onSnapshot, query, orderBy, limit
} from 'firebase/firestore'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import './App.css'

// Utility to generate random group code
const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Icons
const ICONS = {
  pee: '💧',
  poo: '💩',
  drink: '🥤',
  chore: '🧹',
  food: '🍎'
};

const COLORS = {
  pee: '#fbc02d',
  poo: '#e65100',
  drink: '#40c4ff',
  chore: '#8e24aa',
  food: '#43a047'
};

// Timezone Helper
const TIMEZONE = 'Asia/Jerusalem';
const getIsraelDateString = (date = new Date()) => {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
};

function App() {
  const [user, setUser] = useState(null);
  const [groupCode, setGroupCode] = useState(localStorage.getItem('tracker_group_code') || null);
  const [groupData, setGroupData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [goals, setGoals] = useState({ pee: 0, drink: 0, poo: 0 });
  const [trendRange, setTrendRange] = useState('week'); // 'week' or 'month'
  const [selectedActivityTypes, setSelectedActivityTypes] = useState(['pee', 'drink', 'poo']);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [leaderboardRange, setLeaderboardRange] = useState('day'); // 'day', 'week', 'month', 'all'
  const [showDrinkSelection, setShowDrinkSelection] = useState(false);

  // ... (existing useEffects)

  // ... (existing handlers)

  const getLeaderboardScores = (memberUid) => {
    const todayStr = getIsraelDateString();

    let startDateStr = '';

    if (leaderboardRange === 'week') {
      const parts = todayStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay(); // 0 is Sunday
      d.setDate(d.getDate() - day);
      startDateStr = getIsraelDateString(d);
    } else if (leaderboardRange === 'month') {
      const parts = todayStr.split('-');
      startDateStr = `${parts[0]}-${parts[1]}-01`;
    }

    return activities.reduce((acc, act) => {
      if (act.userId !== memberUid) return acc;

      const actDateStr = getIsraelDateString(act.timestamp);

      let include = false;
      if (leaderboardRange === 'day') {
        include = actDateStr === todayStr;
      } else if (leaderboardRange === 'all') {
        include = true;
      } else {
        include = actDateStr >= startDateStr;
      }

      if (include) {
        if (act.type === 'drink') {
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0);
        } else if (act.type === 'chore') {
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0); // Points
        } else {
          acc[act.type] = (acc[act.type] || 0) + 1;
        }
      }
      return acc;
    }, { pee: 0, poo: 0, drink: 0, chore: 0 });
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has a saved group in Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.groupCode) {
            const savedCode = data.groupCode;
            setGroupCode(savedCode);
            localStorage.setItem('tracker_group_code', savedCode);
          }
          if (data.goals) {
            setGoals(data.goals);
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Group & Activity Listener
  useEffect(() => {
    if (!groupCode) return;

    // Listen to Group Data (Members)
    const groupRef = doc(db, 'groups', groupCode);
    const unsubGroup = onSnapshot(groupRef, (docSnap) => {
      if (docSnap.exists()) {
        setGroupData(docSnap.data());
      } else {
        setGroupCode(null);
        localStorage.removeItem('tracker_group_code');
      }
    });

    // Listen to Activities (Increased limit for trends)
    const activitiesRef = collection(db, 'groups', groupCode, 'activities');
    const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(500));
    const unsubActivities = onSnapshot(q, (snapshot) => {
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivities(acts);
    });

    return () => {
      unsubGroup();
      unsubActivities();
    };
  }, [groupCode]);

  // Initialize selected members when group data loads
  useEffect(() => {
    if (groupData?.members && selectedMembers.length === 0) {
      setSelectedMembers(groupData.members.map(m => m.uid));
    }
  }, [groupData]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed: " + error.message);
    }
  };

  const handleJoin = async () => {
    if (!user) return;

    let code = joinCode.trim().toUpperCase();
    let isNewGroup = false;

    if (!code) {
      code = generateCode();
      isNewGroup = true;
    }

    const groupRef = doc(db, 'groups', code);
    const memberData = {
      uid: user.uid,
      name: user.displayName,
      photoURL: user.photoURL
    };

    try {
      if (isNewGroup) {
        await setDoc(groupRef, {
          createdAt: new Date().toISOString(),
          members: [memberData]
        });
      } else {
        const docSnap = await getDoc(groupRef);
        if (!docSnap.exists()) {
          return alert("Group not found! Please check the code.");
        }
        await updateDoc(groupRef, {
          members: arrayUnion(memberData)
        });
      }

      await setDoc(doc(db, 'users', user.uid), { groupCode: code }, { merge: true });
      setGroupCode(code);
      localStorage.setItem('tracker_group_code', code);
    } catch (error) {
      console.error("Error joining group:", error);
      alert("Error joining group: " + error.message);
    }
  };

  const handleTrack = async (type, amount = 0) => {
    if (!groupCode || !user) return;
    try {
      await addDoc(collection(db, 'groups', groupCode, 'activities'), {
        type,
        amount: amount, // Store amount in ml (0 for non-drink activities)
        userId: user.uid,
        userName: user.displayName,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error adding activity:", error);
    }
  };

  const handleUndo = async (type) => {
    if (!groupCode || !user) return;
    try {
      // Find the last activity of this type for this user today
      const todayStr = getIsraelDateString();
      // We need to query recent activities. Since we have 'activities' state, we can find it there first to get ID.
      // But 'activities' might not be fully synced instantly (though it should be fast).
      // Let's rely on the 'activities' state which is sorted desc.

      const lastActivity = activities.find(act =>
        act.userId === user.uid &&
        act.type === type &&
        getIsraelDateString(act.timestamp) === todayStr
      );

      if (lastActivity) {
        if (window.confirm(`Undo last ${type}?`)) {
          await deleteDoc(doc(db, 'groups', groupCode, 'activities', lastActivity.id));
        }
      } else {
        alert(`No ${type} activity found for today to undo.`);
      }
    } catch (error) {
      console.error("Error undoing activity:", error);
      alert("Failed to undo.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setGroupCode(null);
    setGroupData(null);
    setActivities([]);
    localStorage.removeItem('tracker_group_code');
  };

  const handleExitGroup = async () => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid), { groupCode: null }, { merge: true });
    }
    setGroupCode(null);
    setGroupData(null);
    setActivities([]);
    localStorage.removeItem('tracker_group_code');
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Family Activity Tracker',
      text: `Join my Family Activity Tracker group! Code: ${groupCode} `,
      url: window.location.origin
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) { console.error(err); }
    } else {
      navigator.clipboard.writeText(`${shareData.text} \n${shareData.url} `);
      alert('Invite copied to clipboard!');
    }
  };

  const handleResetData = async () => {
    if (!confirm('Are you sure you want to delete ALL your activity history? This cannot be undone.')) return;

    try {
      console.log("Attempting to delete activities for user:", user.uid, "in group:", groupCode);
      const q = query(collection(db, 'groups', groupCode, 'activities'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);

      console.log("Found", querySnapshot.size, "activities to delete.");

      if (querySnapshot.empty) {
        alert('No activity history found to delete.');
        return;
      }

      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      console.log("Successfully deleted", deletePromises.length, "activities.");
      alert(`Successfully deleted ${deletePromises.length} activities.`);
    } catch (error) {
      console.error("Error resetting data:", error);
      alert('Failed to reset data: ' + error.message);
    }
  };

  const handleSaveGoals = async (newGoals) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { goals: newGoals }, { merge: true });
      setGoals(newGoals);
      // alert('Goals saved successfully! 🎯');
    } catch (error) {
      console.error("Error saving goals:", error);
      alert("Failed to save goals.");
    }
  };

  const toggleActivityType = (type) => {
    setSelectedActivityTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleMember = (uid) => {
    setSelectedMembers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // --- Statistics Logic ---

  // Get daily scores for a specific user (Israel Time)


  // Prepare Trend Data
  const trendData = useMemo(() => {
    const typeData = [];
    const memberData = [];
    const today = new Date();
    const daysToLookBack = trendRange === 'week' ? 7 : 30;

    // Generate date range
    for (let i = daysToLookBack - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getIsraelDateString(d);

      // Filter activities for this day AND global filters
      const dayActs = activities.filter(a =>
        getIsraelDateString(a.timestamp) === dateStr &&
        selectedActivityTypes.includes(a.type) &&
        selectedMembers.includes(a.userId)
      );

      // Type Stats
      const dayTypeStats = {
        name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        date: dateStr,
        pee: 0,
        poo: 0,
        drink: 0
      };

      // Member Stats
      const dayMemberStats = {
        name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        date: dateStr,
      };

      // Initialize member counts
      if (groupData?.members) {
        groupData.members.forEach(m => {
          dayMemberStats[m.name] = 0;
        });
      }

      dayActs.forEach(act => {
        if (act.type) {
          if (act.type === 'drink') {
            dayTypeStats[act.type] += (act.amount || 0);
          } else {
            dayTypeStats[act.type]++;
          }
        }
        if (act.userName) {
          // For member stats, we probably still want "activity count" or maybe "score"?
          // The user asked for "how much water did we drink".
          // If we mix types in member stats, it's tricky.
          // Let's stick to "Activity Count" for member leaderboard/trends for now,
          // OR if the user wants to see who drank the most, we might need separate charts.
          // Given the "Total activities" label in leaderboard, let's keep it as count for now for members,
          // BUT for the "By Activity Type" chart, 'drink' should definitely be volume.

          // Wait, if I change 'drink' to volume in Type chart, the scale will be huge (1500) vs (5).
          // This will break the chart scale.
          // I should probably use a separate axis or normalize?
          // Or maybe just keep it as count for the main trend?
          // The user said "Adjust all the goal of the drinking to be in ml".
          // This implies they want to track volume.

          // Let's increment member stats by 1 for any activity for now to keep "Activity Count" consistent,
          // UNLESS we want a "Hydration Leaderboard".
          // For the "By Activity Type" chart, if I plot Pee (count) and Drink (ml) on the same chart,
          // Pee will be a flat line at bottom.
          // I will need to use a right Y-axis for Drink (ml).

          dayMemberStats[act.userName] = (dayMemberStats[act.userName] || 0) + 1;
        }
      });

      typeData.push(dayTypeStats);
      memberData.push(dayMemberStats);
    }
    return { typeData, memberData };
  }, [activities, trendRange, groupData, selectedActivityTypes, selectedMembers]);

  const getScores = (memberUid, range) => {
    const todayStr = getIsraelDateString();
    let startDateStr = '';

    if (range === 'week') {
      const parts = todayStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      startDateStr = getIsraelDateString(d);
    } else if (range === 'month') {
      const parts = todayStr.split('-');
      startDateStr = `${parts[0]}-${parts[1]}-01`;
    }

    return activities.reduce((acc, act) => {
      if (act.userId !== memberUid) return acc;
      const actDateStr = getIsraelDateString(act.timestamp);
      let include = false;
      if (range === 'day') include = actDateStr === todayStr;
      else if (range === 'all') include = true;
      else include = actDateStr >= startDateStr;

      if (include) {
        if (act.type === 'drink') {
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0);
        } else if (act.type === 'chore') {
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0);
        } else {
          acc[act.type] = (acc[act.type] || 0) + 1;
        }
      }
      return acc;
    }, { pee: 0, poo: 0, drink: 0, chore: 0 });
  };

  if (loading) return <div className="animate-fade-in" style={{ padding: '20px' }}>Loading...</div>;

  if (!user) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', padding: '20px' }}>
        <h1 style={{ marginBottom: '1rem', color: '#1a1a2e' }}>Family Tracker</h1>
        <div className="card">
          <p style={{ marginBottom: '2rem' }}>Sign in to track your family's daily habits!</p>
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%', padding: '1rem', background: '#1a1a2e', color: 'white',
              borderRadius: 'var(--btn-radius)', fontWeight: 'bold', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: '10px'
            }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px' }} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!groupCode) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>Welcome, {user.displayName.split(' ')[0]}!</h2>
          <button onClick={handleLogout} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Logout</button>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>Join or Create a Family Group</h3>
          <input
            type="text"
            placeholder="Enter Group Code (e.g. X7K9L2)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            style={{
              width: '100%', marginBottom: '1.5rem', textAlign: 'center',
              letterSpacing: '2px', textTransform: 'uppercase', padding: '15px',
              borderRadius: '12px', border: '1px solid #ddd', background: '#f9f9f9'
            }}
          />
          <button
            onClick={handleJoin}
            style={{
              width: '100%', padding: '1rem', background: '#1a1a2e', color: 'white',
              borderRadius: 'var(--btn-radius)', fontWeight: 'bold'
            }}
          >
            {joinCode ? 'Join Group' : 'Create New Group'}
          </button>
        </div>
      </div>
    );
  }

  const myStats = getScores(user.uid, 'day');

  return (
    <div className="animate-fade-in" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="main-content">
        {/* Header */}
        <div style={{ padding: '0 0 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px' }}>Hey, {user.displayName.split(' ')[0]} 👋</h1>
            <p style={{ marginTop: '5px' }}>Track your daily activities</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'white',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              border: '1px solid #eee'
            }}
          >
            🔄
          </button>
        </div>

        <div style={{ padding: '20px 0' }}>
          {activeTab === 'health' && (
            // ... (keep existing home tab)
            <>
              {/* Today's Summary */}
              {/* Today's Summary */}
              <div className="card">
                <h3 style={{ color: '#8b8b9e', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px' }}>Today's Summary</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '5px' }}>{ICONS.pee}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.pee} <span style={{ fontSize: '14px', color: '#8b8b9e', fontWeight: '400' }}>/ {goals.pee || 0}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b8b9e' }}>Pee</div>
                  </div>
                  <div style={{ width: '1px', background: '#eee' }}></div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '5px' }}>{ICONS.drink}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.drink} <span style={{ fontSize: '10px', color: '#8b8b9e', fontWeight: '400' }}>ml / {goals.drink || 1500} ml</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b8b9e' }}>Drinks</div>
                  </div>
                  <div style={{ width: '1px', background: '#eee' }}></div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '5px' }}>{ICONS.poo}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.poo} <span style={{ fontSize: '14px', color: '#8b8b9e', fontWeight: '400' }}>/ {goals.poo || 0}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b8b9e' }}>Poop</div>
                  </div>
                </div>

                {/* Celebration Message */}
                {(() => {
                  const hasGoals = goals.pee > 0 || goals.drink > 0 || goals.poo > 0;
                  const peeMet = goals.pee === 0 || myStats.pee >= goals.pee;
                  const drinkMet = goals.drink === 0 || myStats.drink >= (goals.drink || 1500);
                  const pooMet = goals.poo === 0 || myStats.poo >= goals.poo;

                  return hasGoals && peeMet && drinkMet && pooMet;
                })() && (
                    <div style={{
                      marginTop: '20px',
                      background: '#e8f5e9',
                      color: '#2e7d32',
                      padding: '10px',
                      borderRadius: '12px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}>
                      <span>🎉</span> Well Done! Goal Reached! <span>🎉</span>
                    </div>
                  )}
              </div>

              {/* Drink Selection Modal */}
              {showDrinkSelection && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '20px'
                }} onClick={() => setShowDrinkSelection(false)}>
                  <div style={{
                    background: 'white', borderRadius: '24px', padding: '30px',
                    width: '100%', maxWidth: '320px', textAlign: 'center',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                  }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ marginBottom: '20px' }}>Select Amount 💧</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <button
                        onClick={() => { handleTrack('drink', 180); setShowDrinkSelection(false); }}
                        style={{
                          padding: '20px', borderRadius: '16px', border: '2px solid #eee',
                          background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>☕</span>
                        <span style={{ fontWeight: 'bold' }}>Cup</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>180 ml</span>
                      </button>
                      <button
                        onClick={() => { handleTrack('drink', 750); setShowDrinkSelection(false); }}
                        style={{
                          padding: '20px', borderRadius: '16px', border: '2px solid #eee',
                          background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>🍾</span>
                        <span style={{ fontWeight: 'bold' }}>Bottle</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>750 ml</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowDrinkSelection(false)}
                      style={{ marginTop: '20px', padding: '10px', background: 'transparent', border: 'none', color: '#888' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {['pee', 'drink', 'poo'].map((type) => (
                  <div key={type} style={{ position: 'relative' }}>
                    <button
                      onClick={() => type === 'drink' ? setShowDrinkSelection(true) : handleTrack(type)}
                      style={{
                        background: `linear-gradient(135deg, ${COLORS[type]}, ${COLORS[type]}dd)`,
                        borderRadius: '24px',
                        padding: '20px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        boxShadow: '0 10px 20px -5px rgba(0,0,0,0.15)',
                        position: 'relative',
                        height: '140px',
                        width: '100%'
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: 'white', borderRadius: '50%', width: 'auto', minWidth: '24px', height: '24px', padding: '0 5px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 'bold', color: '#333'
                      }}>
                        {type === 'drink' ? `${myStats[type]}ml` : myStats[type]}
                      </div>
                      <span style={{ fontSize: '32px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>{ICONS[type]}</span>
                      <span style={{ color: 'white', fontWeight: '700', fontSize: '16px', textTransform: 'capitalize' }}>
                        {type === 'poo' ? 'Poop' : type}
                      </span>
                    </button>
                    <button
                      onClick={() => handleUndo(type)}
                      style={{
                        position: 'absolute', bottom: '-10px', right: '10px',
                        background: 'white', borderRadius: '50%', width: '24px', height: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 'bold', color: '#d32f2f',
                        border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                      }}
                      title="Undo last"
                    >
                      ↩️
                    </button>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '15px' }}>Recent Activity</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activities.slice(0, 3).map(act => (
                    <div key={act.id} className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '0' }}>
                      <span style={{ fontSize: '24px' }}>{ICONS[act.type]}</span>
                      <div>
                        <p style={{ fontSize: '14px', margin: 0, color: '#1a1a2e', fontWeight: '600' }}>
                          {act.userName}
                        </p>
                        <p style={{ fontSize: '12px', margin: 0, color: '#8b8b9e' }}>
                          {act.type === 'drink' && act.amount ? `${act.amount}ml • ` : ''}
                          {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini Leaderboard Teaser */}
              <div className="card" onClick={() => setActiveTab('leaderboard')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Family Leaderboard</h3>
                  <p>See how you rank today</p>
                </div>
                <span style={{ fontSize: '24px' }}>🏆</span>
              </div>
            </>
          )}

          {activeTab === 'goals' && (
            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>Daily Goals 🎯</h3>
              <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>Set your daily targets to stay on track!</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                {['pee', 'drink', 'poo'].map(type => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{
                        width: '50px', height: '50px', borderRadius: '12px',
                        background: `${COLORS[type]}20`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '24px'
                      }}>
                        {ICONS[type]}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', textTransform: 'capitalize', fontSize: '16px' }}>
                          {type === 'poo' ? 'Poop' : type}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          Target: {goals[type] || (type === 'drink' ? 1500 : 0)} {type === 'drink' ? 'ml' : ''} / day
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f5f7fa', padding: '5px', borderRadius: '20px' }}>
                      <button
                        onClick={() => {
                          const step = type === 'drink' ? 250 : 1;
                          handleSaveGoals({ ...goals, [type]: Math.max(0, (goals[type] || (type === 'drink' ? 1500 : 0)) - step) });
                        }}
                        style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                          fontWeight: 'bold', color: '#1a1a2e'
                        }}
                      >-</button>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', minWidth: '24px', textAlign: 'center' }}>
                        {goals[type] || (type === 'drink' ? 1500 : 0)}
                      </span>
                      <button
                        onClick={() => {
                          const step = type === 'drink' ? 250 : 1;
                          handleSaveGoals({ ...goals, [type]: (goals[type] || (type === 'drink' ? 1500 : 0)) + step });
                        }}
                        style={{
                          width: '32px', height: '32px', borderRadius: '50%',
                          background: '#1a1a2e', color: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                          fontWeight: 'bold'
                        }}
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'home' && (
            <div className="animate-fade-in">
              {/* Health Summary Card */}
              <div className="card" onClick={() => setActiveTab('health')} style={{ cursor: 'pointer', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Health ❤️</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View Details &gt;</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px' }}>{ICONS.pee}</div>
                    <div style={{ fontWeight: 'bold' }}>{myStats.pee}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px' }}>{ICONS.drink}</div>
                    <div style={{ fontWeight: 'bold' }}>{myStats.drink}ml</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px' }}>{ICONS.poo}</div>
                    <div style={{ fontWeight: 'bold' }}>{myStats.poo}</div>
                  </div>
                </div>
              </div>

              {/* Chores Summary Card */}
              <div className="card" onClick={() => setActiveTab('chores')} style={{ cursor: 'pointer', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Chores 🧹</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View Details &gt;</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{
                    width: '50px', height: '50px', borderRadius: '12px',
                    background: `${COLORS.chore}20`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '24px'
                  }}>
                    {ICONS.chore}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Points Earned Today</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.chore || 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Food Summary Card */}
              <div className="card" onClick={() => setActiveTab('food')} style={{ cursor: 'pointer', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Food 🍎</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View Details &gt;</span>
                </div>
                <div style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
                  Tap to log your meals for today.
                </div>
              </div>

              {/* Trends Chart Preview */}
              <div className="card" onClick={() => setActiveTab('trends')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Weekly Trends 📊</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View Full &gt;</span>
                </div>
                <div style={{ height: '150px', width: '100%', fontSize: '10px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData.typeData.slice(-7)} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} dy={5} interval={1} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} hide />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} hide />
                      <Line yAxisId="left" type="monotone" dataKey="pee" stroke={COLORS.pee} strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="drink" stroke={COLORS.drink} strokeWidth={2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="poo" stroke={COLORS.poo} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="card" style={{ padding: '20px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px 20px 10px' }}>
                <h3 style={{ margin: 0 }}>Trends 📊</h3>
                <div style={{ background: '#f5f7fa', padding: '4px', borderRadius: '20px', display: 'flex' }}>
                  <button
                    onClick={() => setTrendRange('week')}
                    style={{
                      padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                      background: trendRange === 'week' ? 'white' : 'transparent',
                      color: trendRange === 'week' ? '#1a1a2e' : '#888',
                      boxShadow: trendRange === 'week' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >Week</button>
                  <button
                    onClick={() => setTrendRange('month')}
                    style={{
                      padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                      background: trendRange === 'month' ? 'white' : 'transparent',
                      color: trendRange === 'month' ? '#1a1a2e' : '#888',
                      boxShadow: trendRange === 'month' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >Month</button>
                </div>
              </div>

              {/* Global Filters */}
              <div style={{ padding: '0 10px 20px 10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Type Filter */}
                <div>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>Filter by Type:</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['pee', 'drink', 'poo'].map(type => (
                      <button
                        key={type}
                        onClick={() => toggleActivityType(type)}
                        style={{
                          padding: '6px 12px', borderRadius: '15px', fontSize: '11px', fontWeight: 'bold',
                          background: selectedActivityTypes.includes(type) ? COLORS[type] : '#f0f0f0',
                          color: selectedActivityTypes.includes(type) ? 'white' : '#888',
                          border: 'none', opacity: selectedActivityTypes.includes(type) ? 1 : 0.6,
                          flex: 1
                        }}
                      >
                        {ICONS[type]} {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Member Filter */}
                <div>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>Filter by Member:</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {groupData?.members?.map((member, index) => (
                      <button
                        key={member.uid}
                        onClick={() => toggleMember(member.uid)}
                        style={{
                          padding: '6px 12px', borderRadius: '15px', fontSize: '11px', fontWeight: 'bold',
                          background: selectedMembers.includes(member.uid) ? `hsl(${index * 137.5 % 360}, 70%, 50%)` : '#f0f0f0',
                          color: selectedMembers.includes(member.uid) ? 'white' : '#888',
                          border: 'none', opacity: selectedMembers.includes(member.uid) ? 1 : 0.6
                        }}
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity Type Chart */}
              <h4 style={{ fontSize: '14px', color: '#666', paddingLeft: '10px', marginBottom: '10px' }}>By Activity Type</h4>
              <div style={{ height: '250px', width: '100%', fontSize: '10px', marginBottom: '30px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData.typeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} dy={10} interval={trendRange === 'month' ? 6 : 0} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    {selectedActivityTypes.includes('pee') && <Line yAxisId="left" type="monotone" dataKey="pee" stroke={COLORS.pee} strokeWidth={3} dot={false} name="Pee (count)" />}
                    {selectedActivityTypes.includes('drink') && <Line yAxisId="right" type="monotone" dataKey="drink" stroke={COLORS.drink} strokeWidth={3} dot={false} name="Drink (ml)" />}
                    {selectedActivityTypes.includes('poo') && <Line yAxisId="left" type="monotone" dataKey="poo" stroke={COLORS.poo} strokeWidth={3} dot={false} name="Poop (count)" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Member Activity Chart */}
              <h4 style={{ fontSize: '14px', color: '#666', paddingLeft: '10px', marginBottom: '10px' }}>By Family Member (Activity Count)</h4>
              <div style={{ height: '250px', width: '100%', fontSize: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData.memberData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} dy={10} interval={trendRange === 'month' ? 6 : 0} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    {groupData?.members?.map((member, index) => (
                      selectedMembers.includes(member.uid) && (
                        <Line
                          key={member.uid}
                          type="monotone"
                          dataKey={member.name}
                          stroke={`hsl(${index * 137.5 % 360}, 70%, 50%)`}
                          strokeWidth={3}
                          dot={false}
                          name={member.name}
                        />
                      )
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'chores' && (
            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>House Chores 🧹</h3>
              <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>Keep the house clean and earn points!</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {[
                  { id: 'dishes', name: 'Wash Dishes', points: 10 },
                  { id: 'trash', name: 'Take out Trash', points: 5 },
                  { id: 'laundry', name: 'Do Laundry', points: 15 },
                  { id: 'tidy', name: 'Tidy Up Room', points: 8 },
                  { id: 'plants', name: 'Water Plants', points: 5 }
                ].map(chore => (
                  <button
                    key={chore.id}
                    onClick={() => handleTrack('chore', chore.points)} // Store points as amount? Or separate field? handleTrack uses amount for drink. Let's use amount for points for now.
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '15px', borderRadius: '16px', border: 'none',
                      background: '#f9f9f9', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                      cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span style={{ fontSize: '24px' }}>{ICONS.chore}</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{chore.name}</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{chore.points} points</div>
                      </div>
                    </div>
                    <div style={{
                      background: COLORS.chore, color: 'white', padding: '5px 12px',
                      borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'
                    }}>
                      Done
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'food' && (
            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>Food Tracker 🍎</h3>
              <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>Log what you eat (AI Analysis coming soon!)</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="What did you eat? (e.g. 'Avocado Toast')"
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '16px' }}
                />
                <button style={{ background: COLORS.food, color: 'white', border: 'none', borderRadius: '12px', padding: '0 20px', fontWeight: 'bold' }}>
                  Add
                </button>
              </div>

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>Today's Meals</h4>
                {/* Placeholder for food list */}
                <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontStyle: 'italic' }}>
                  No meals logged yet today.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Leaderboard 🏆</h3>
              </div>

              {/* Range Switcher */}
              <div style={{ background: '#f5f7fa', padding: '4px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                {['day', 'week', 'month', 'all'].map(range => (
                  <button
                    key={range}
                    onClick={() => setLeaderboardRange(range)}
                    style={{
                      flex: 1,
                      padding: '8px 0', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold',
                      background: leaderboardRange === range ? 'white' : 'transparent',
                      color: leaderboardRange === range ? '#1a1a2e' : '#888',
                      boxShadow: leaderboardRange === range ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                      textTransform: 'capitalize'
                    }}
                  >
                    {range}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {groupData?.members?.map((member) => {
                  const scores = getLeaderboardScores(member.uid);
                  const total = scores.pee + scores.poo + scores.drink + scores.chore;
                  return { ...member, scores, total };
                })
                  .sort((a, b) => b.total - a.total)
                  .map((member, index) => (
                    <div key={member.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '15px', borderBottom: index < groupData.members.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontWeight: 'bold', color: '#8b8b9e', width: '20px' }}>#{index + 1}</div>
                        {member.photoURL ? (
                          <img src={member.photoURL} alt={member.name} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                        ) : (
                          <div style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold', fontSize: '16px'
                          }}>
                            {member.name ? member.name[0].toUpperCase() : '?'}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: '700', color: '#1a1a2e' }}>{member.name} {member.uid === user.uid && '(You)'}</div>
                          <div style={{ fontSize: '12px', color: '#8b8b9e' }}>{member.total} activities</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#555' }}>
                        <span>{ICONS.pee} {member.scores.pee}</span>
                        <span>{ICONS.poo} {member.scores.poo}</span>
                        <span>{ICONS.drink} {member.scores.drink}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'family' && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '20px' }}>👨‍👩‍👧‍👦</div>
              <h3 style={{ fontSize: '22px', marginBottom: '10px' }}>Your Family Group</h3>
              <div style={{ background: '#f5f7fa', padding: '15px', borderRadius: '12px', margin: '20px 0' }}>
                <p style={{ marginBottom: '5px' }}>Group Code</p>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '2px' }}>{groupCode}</div>
              </div>
              <button
                onClick={handleShare}
                style={{
                  background: '#1a1a2e', color: 'white', padding: '15px 30px',
                  borderRadius: '30px', fontWeight: 'bold', fontSize: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
                }}
              >
                Invite Family 📤
              </button>
              <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                <button onClick={handleExitGroup} style={{ color: '#e65100', fontWeight: '600' }}>Change Group</button>
                <button onClick={handleResetData} style={{ color: '#d32f2f', fontWeight: '600' }}>Reset My Data 🗑️</button>
                <button onClick={handleLogout} style={{ color: '#8b8b9e' }}>Logout</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <div className="bottom-nav-content">
          <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <span className="nav-icon">🏠</span>
            <span>Home</span>
          </div>
          <div className={`nav-item ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
            <span className="nav-icon">❤️</span>
            <span>Health</span>
          </div>
          <div className={`nav-item ${activeTab === 'food' ? 'active' : ''}`} onClick={() => setActiveTab('food')}>
            <span className="nav-icon">🍎</span>
            <span>Food</span>
          </div>
          <div className={`nav-item ${activeTab === 'chores' ? 'active' : ''}`} onClick={() => setActiveTab('chores')}>
            <span className="nav-icon">🧹</span>
            <span>Chores</span>
          </div>
          <div className={`nav-item ${activeTab === 'trends' ? 'active' : ''}`} onClick={() => setActiveTab('trends')}>
            <span className="nav-icon">📊</span>
            <span>Trends</span>
          </div>
          <div className={`nav-item ${activeTab === 'family' ? 'active' : ''}`} onClick={() => setActiveTab('family')}>
            <span className="nav-icon">👨‍👩‍👧‍👦</span>
            <span>Family</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
