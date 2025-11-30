
import { useState, useEffect, useMemo } from 'react'
import { db, auth, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc, getDocs, where,
  collection, addDoc, onSnapshot, query, orderBy, limit
} from 'firebase/firestore'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import './App.css'
import { translations } from './translations';

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

// Fun Chore Designs
const getChoreDesign = (chore) => {
  const name = typeof chore === 'string' ? chore : chore.name;
  const category = typeof chore === 'object' ? chore.category : null;
  const storedIcon = typeof chore === 'object' ? chore.icon : null;
  const lowerName = name.toLowerCase();

  const designs = {
    trash: { icon: '🗑️', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)', color: '#d81b60' },
    dish: { icon: '🍽️', gradient: 'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)', color: '#01579b' },
    laundry: { icon: '👕', gradient: 'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)', color: '#4a148c' },
    pet: { icon: '🐕', gradient: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)', color: '#1b5e20' },
    tidy: { icon: '🛏️', gradient: 'linear-gradient(120deg, #fccb90 0%, #d57eeb 100%)', color: '#e65100' },
    plant: { icon: '🪴', gradient: 'linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)', color: '#006064' },
    other: { icon: '✨', gradient: 'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)', color: '#880e4f' }
  };

  // Determine category
  let matchedCategory = category;
  if (!matchedCategory) {
    if (lowerName.includes('trash') || lowerName.includes('garbage') || lowerName.includes('bin') || lowerName.includes('זבל') || lowerName.includes('פח') || lowerName.includes('אשפה')) matchedCategory = 'trash';
    else if (lowerName.includes('dish') || lowerName.includes('plate') || lowerName.includes('kitchen') || lowerName.includes('cook') || lowerName.includes('meal') || lowerName.includes('dinner') || lowerName.includes('lunch') || lowerName.includes('breakfast') || lowerName.includes('כלים') || lowerName.includes('מטבח') || lowerName.includes('מדיח') || lowerName.includes('ארוח') || lowerName.includes('אוכל') || lowerName.includes('בישול')) matchedCategory = 'dish';
    else if (lowerName.includes('laundry') || lowerName.includes('cloth') || lowerName.includes('fold') || lowerName.includes('כביסה') || lowerName.includes('בגדים') || lowerName.includes('לקפל')) matchedCategory = 'laundry';
    else if (lowerName.includes('dog') || lowerName.includes('cat') || lowerName.includes('pet') || lowerName.includes('walk') || lowerName.includes('כלב') || lowerName.includes('חתול') || lowerName.includes('חיה') || lowerName.includes('לטיול')) matchedCategory = 'pet';
    else if (lowerName.includes('bed') || lowerName.includes('room') || lowerName.includes('tidy') || lowerName.includes('clean') || lowerName.includes('toy') || lowerName.includes('vacuum') || lowerName.includes('mop') || lowerName.includes('sweep') || lowerName.includes('לסדר') || lowerName.includes('חדר') || lowerName.includes('מיטה') || lowerName.includes('לנקות') || lowerName.includes('צעצוע') || lowerName.includes('שואב') || lowerName.includes('ספונג')) matchedCategory = 'tidy';
    else if (lowerName.includes('plant') || lowerName.includes('water') || lowerName.includes('עציץ') || lowerName.includes('להשקות') || lowerName.includes('צמח')) matchedCategory = 'plant';
    else matchedCategory = 'other';
  }

  const design = designs[matchedCategory] || designs.other;

  // Override icon if stored
  if (storedIcon) {
    return { ...design, icon: storedIcon };
  }

  return design;
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
  const [selectedActivityTypes, setSelectedActivityTypes] = useState(['pee', 'drink', 'poo', 'chore']);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [leaderboardRange, setLeaderboardRange] = useState('day'); // 'day', 'week', 'month', 'all'
  const [showDrinkSelection, setShowDrinkSelection] = useState(false);

  // Food Tracker State
  const [foodInput, setFoodInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '');
  const [showKeyInput, setShowKeyInput] = useState(false);


  // Chores State
  const [showAddChore, setShowAddChore] = useState(false);
  const [newChoreName, setNewChoreName] = useState('');
  const [newChorePoints, setNewChorePoints] = useState(5);
  const [chores, setChores] = useState([
    { id: 'dishes', name: 'Wash Dishes', points: 10 },
    { id: 'trash', name: 'Take out Trash', points: 5 },
    { id: 'laundry', name: 'Do Laundry', points: 15 },
    { id: 'tidy', name: 'Tidy Up Room', points: 8 },
    { id: 'plants', name: 'Water Plants', points: 5 }
  ]);
  const [showAssignChore, setShowAssignChore] = useState(false);
  const [choreToAssign, setChoreToAssign] = useState(null);
  const [assignments, setAssignments] = useState([]); // { choreId, assignedTo: uid, assignedBy: uid, createdAt }

  // Edit Chore State
  const [showEditChore, setShowEditChore] = useState(false);
  const [editingChore, setEditingChore] = useState(null);
  const [editChoreName, setEditChoreName] = useState('');
  const [editChorePoints, setEditChorePoints] = useState(5);

  // PWA Install Prompt State
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  // Language State
  const [language, setLanguage] = useState('en');

  // Helper for translations
  const t = (key) => {
    return translations[language][key] || translations['en'][key] || key;
  };

  // Detect Language
  useEffect(() => {
    const userLang = navigator.language || navigator.userLanguage;
    if (userLang.startsWith('he')) {
      setLanguage('he');
      document.body.dir = 'rtl';
    } else {
      setLanguage('en');
      document.body.dir = 'ltr';
    }
  }, []);

  // Member Details State
  const [selectedMemberDetails, setSelectedMemberDetails] = useState(null);
  const [showMemberDetails, setShowMemberDetails] = useState(false);

  const handleMemberClick = (member) => {
    setSelectedMemberDetails(member);
    setShowMemberDetails(true);
  };

  const handleDeleteActivity = async (activityId) => {
    if (!confirm("Are you sure you want to delete this activity?")) return;
    try {
      await deleteDoc(doc(db, 'groups', groupCode, 'activities', activityId));
    } catch (error) {
      console.error("Error deleting activity:", error);
      alert("Failed to delete activity.");
    }
  };

  // Detect PWA install capability
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered:', reg))
        .catch(err => console.log('Service Worker registration failed:', err));
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // Detect Android
    const android = /Android/.test(navigator.userAgent);
    setIsAndroid(android);

    // Check if already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    // Show prompt if not installed and not dismissed before
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (!isInstalled && !dismissed && (iOS || android)) {
      setTimeout(() => setShowInstallPrompt(true), 3000); // Show after 3 seconds
    }

    // Listen for beforeinstallprompt (Android)
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('beforeinstallprompt event fired');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

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
          // Points for leaderboard: Cup (180ml) = 3, Bottle (750ml) = 5
          const points = act.amount === 750 ? 5 : 3;
          acc[act.type] = (acc[act.type] || 0) + points;
        } else if (act.type === 'chore') {
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0); // Points
        } else if (act.type === 'food') {
          // For food, we might want to track calories?
          // But getScores returns a single number per type.
          // Let's return calories for now.
          acc[act.type] = (acc[act.type] || 0) + (act.amount || 0);
          // We might need a more complex object return if we want protein too.
          // But for now, let's stick to the existing structure.
          // Maybe we can add extra properties to the accumulator?
          acc.calories = (acc.calories || 0) + (act.details?.totalCalories || 0);
          acc.protein = (acc.protein || 0) + (act.details?.totalProtein || 0);
        } else {
          acc[act.type] = (acc[act.type] || 0) + 1;
        }
      }
      return acc;
    }, { pee: 0, poo: 0, drink: 0, chore: 0, food: 0, calories: 0, protein: 0 });
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

    // Listen to Group Data (Members & Custom Chores)
    const unsubGroup = onSnapshot(doc(db, 'groups', groupCode), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGroupData(data);
        if (data.members && selectedMembers.length === 0) {
          // Initialize selected members to all members on first load
          setSelectedMembers(data.members.map(m => m.uid));
        }

        // Load custom chores
        if (data.customChores || true) { // Always load defaults even if customChores is undefined
          const defaultChores = [
            { id: 'dishes', name: 'Wash Dishes', points: 10 },
            { id: 'trash', name: 'Take out Trash', points: 5 },
            { id: 'laundry', name: 'Do Laundry', points: 15 },
            { id: 'tidy', name: 'Tidy Up Room', points: 8 },
            { id: 'plants', name: 'Water Plants', points: 5 }
          ];

          const customChores = data.customChores || [];
          const mergedChores = [...defaultChores];

          customChores.forEach(custom => {
            const index = mergedChores.findIndex(d => d.id === custom.id);
            if (index !== -1) {
              mergedChores[index] = custom; // Override default
            } else {
              mergedChores.push(custom); // Add new
            }
          });

          setChores(mergedChores);
        }
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

    // Listen to Chore Assignments
    const assignmentsRef = collection(db, 'groups', groupCode, 'choreAssignments');
    const unsubAssignments = onSnapshot(assignmentsRef, (snapshot) => {
      const assigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssignments(assigns);
    });

    return () => {
      unsubGroup();
      unsubActivities();
      unsubAssignments();
    };
  }, [groupCode]);

  // Initialize selected members when group data loads
  useEffect(() => {
    if (groupData?.members && selectedMembers.length === 0) {
      setSelectedMembers(groupData.members.map(m => m.uid));
    }
  }, [groupData]);

  // Auto-promote specific admin
  useEffect(() => {
    if (user?.email === 'oferregev@gmail.com' && groupCode && groupData?.members) {
      const me = groupData.members.find(m => m.uid === user.uid);
      if (me && me.role !== 'parent') {
        console.log("Auto-promoting admin to parent...");
        const groupRef = doc(db, 'groups', groupCode);
        const updatedMembers = groupData.members.map(m =>
          m.uid === user.uid ? { ...m, role: 'parent' } : m
        );
        updateDoc(groupRef, { members: updatedMembers });
      }
    }
  }, [user, groupData, groupCode]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      alert("Login failed: " + error.message);
    }
  };

  const handleUpdateRole = async (memberUid, newRole) => {
    try {
      const groupRef = doc(db, 'groups', groupCode);
      const groupDoc = await getDoc(groupRef);
      if (groupDoc.exists()) {
        const data = groupDoc.data();
        const updatedMembers = data.members.map(m =>
          m.uid === memberUid ? { ...m, role: newRole } : m
        );
        await updateDoc(groupRef, { members: updatedMembers });
      }
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role.");
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
      photoURL: user.photoURL,
      role: isNewGroup ? 'parent' : 'child'
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

  const handleTrack = async (type, amount = 0, details = {}) => {
    if (!groupCode || !user) return;
    try {
      await addDoc(collection(db, 'groups', groupCode, 'activities'), {
        type,
        amount: amount, // Store amount in ml (0 for non-drink activities)
        details,
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
  }


  const handleAnalyzeFood = async () => {
    if (!foodInput.trim()) return;
    if (!geminiKey) {
      setShowKeyInput(true);
      return;
    }

    setIsAnalyzing(true);
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `Analyze the following food input: "${foodInput}". 
      Return a JSON object with the following structure:
      {
        "items": [
          {
            "name": "Food Name",
            "category": "Food Category (e.g. Dairy, Meat, Vegetable, Grain)",
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0
          }
        ],
        "totalCalories": 0,
        "totalProtein": 0
      }
      Do not include markdown formatting, just the raw JSON string.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Clean up markdown if present (Gemini sometimes adds ```json ... ```)
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(jsonStr);

      // Log to Firestore
      // We'll store the raw input and the analyzed data
      // For now, let's just add a 'food' activity with the summary
      // In a real app, we might want a separate 'meals' collection

      await addDoc(collection(db, 'groups', groupCode, 'activities'), {
        type: 'food',
        amount: data.totalCalories, // Store calories as amount for now? Or maybe 1 for count?
        // Let's store detailed data in a separate field
        details: data,
        input: foodInput,
        userId: user.uid,
        userName: user.displayName,
        timestamp: new Date().toISOString()
      });

      setFoodInput('');
      // Removed alert - user can see the logged food in the list below


    } catch (error) {
      console.error("Error analyzing food:", error);
      alert("Failed to analyze food. Please check your API key or try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Diet Analysis State
  const [showDietAnalysis, setShowDietAnalysis] = useState(false);
  const [dietAnalysisResult, setDietAnalysisResult] = useState('');
  const [isDietAnalyzing, setIsDietAnalyzing] = useState(false);

  const handleAnalyzeDiet = async () => {
    if (!geminiKey) {
      setShowKeyInput(true);
      return;
    }

    setIsDietAnalyzing(true);
    setShowDietAnalysis(true);
    setDietAnalysisResult('');

    try {
      const todayStr = getIsraelDateString();
      const todaysMeals = activities
        .filter(a => a.type === 'food' && getIsraelDateString(a.timestamp) === todayStr && a.userId === user.uid)
        .map(a => `${a.input || 'Meal'} (${a.details?.totalCalories || 0} cal, ${a.details?.totalProtein || 0}g protein)`)
        .join(', ');

      if (!todaysMeals) {
        setDietAnalysisResult("You haven't logged any meals today yet! Log some food first.");
        setIsDietAnalyzing(false);
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `I have eaten the following today: ${todaysMeals}. 
      Analyze my nutrition intake so far (calories, protein balance). 
      Suggest what I should eat next to have a balanced day. 
      Keep it brief, encouraging, and formatted with bullet points.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      setDietAnalysisResult(text);

    } catch (error) {
      console.error("Error analyzing diet:", error);
      setDietAnalysisResult("Failed to analyze diet. Please try again.");
    } finally {
      setIsDietAnalyzing(false);
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

  const analyzeChoreWithAI = async (name) => {
    if (!geminiKey) return null;
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const prompt = `Classify the chore "${name}" into one of these categories: [trash, dish, laundry, pet, tidy, plant, other]. 
      Also suggest a single emoji icon that best represents it.
      Return ONLY a JSON object: { "category": "...", "icon": "..." }`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("AI Chore Analysis failed:", error);
      return null;
    }
  };

  const handleAddChore = async () => {
    if (!newChoreName.trim() || newChorePoints <= 0) {
      alert("Please enter a valid name and points.");
      return;
    }

    let aiData = null;
    if (geminiKey) {
      console.log("Analyzing chore with AI...");
      aiData = await analyzeChoreWithAI(newChoreName);
    }

    try {
      const newChore = {
        id: newChoreName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
        name: newChoreName,
        points: parseInt(newChorePoints),
        category: aiData?.category || null,
        icon: aiData?.icon || null
      };

      await updateDoc(doc(db, 'groups', groupCode), {
        customChores: arrayUnion(newChore)
      });

      setNewChoreName('');
      setNewChorePoints(5);
      setShowAddChore(false);
    } catch (error) {
      console.error("Error adding chore:", error);
      alert("Failed to add chore.");
    }
  };

  const handleAssignChore = async (memberId) => {
    if (!choreToAssign || !memberId) return;

    try {
      await addDoc(collection(db, 'groups', groupCode, 'choreAssignments'), {
        choreId: choreToAssign.id,
        choreName: choreToAssign.name,
        chorePoints: choreToAssign.points,
        assignedTo: memberId,
        assignedBy: user.uid,
        status: 'todo', // todo, inprogress, complete
        createdAt: new Date().toISOString(),
        date: getIsraelDateString()
      });

      setShowAssignChore(false);
      setChoreToAssign(null);
    } catch (error) {
      console.error("Error assigning chore:", error);
      alert("Failed to assign chore.");
    }
  };

  const handleUpdateChoreStatus = async (assignmentId, newStatus) => {
    try {
      await updateDoc(doc(db, 'groups', groupCode, 'choreAssignments', assignmentId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // If marking as complete, also track the activity
      if (newStatus === 'complete') {
        const assignment = assignments.find(a => a.id === assignmentId);
        if (assignment) {
          await handleTrack('chore', assignment.chorePoints, { name: assignment.choreName });
        }
      }
    } catch (error) {
      console.error("Error updating chore status:", error);
      alert("Failed to update status.");
    }
  };

  const handleEditChore = async () => {
    if (!editingChore || !editChoreName.trim()) return;

    try {
      const groupRef = doc(db, 'groups', groupCode);
      const groupDoc = await getDoc(groupRef);

      if (groupDoc.exists()) {
        const data = groupDoc.data();
        const currentChores = data.customChores || [];

        const choreIndex = currentChores.findIndex(c => c.id === editingChore.id);
        let updatedChores;

        if (choreIndex !== -1) {
          // Update existing custom chore
          updatedChores = currentChores.map(c =>
            c.id === editingChore.id
              ? { ...c, name: editChoreName, points: parseInt(editChorePoints) }
              : c
          );
        } else {
          // It's a default chore (or new), add to customChores to override
          updatedChores = [...currentChores, {
            id: editingChore.id,
            name: editChoreName,
            points: parseInt(editChorePoints)
          }];
        }

        await updateDoc(groupRef, { customChores: updatedChores });

        setShowEditChore(false);
        setEditingChore(null);
      }
    } catch (error) {
      console.error("Error updating chore:", error);
      alert("Failed to update chore.");
    }
  };

  const handleDeleteChore = async (choreId) => {
    if (!confirm(t('delete_confirm'))) return;

    try {
      const groupRef = doc(db, 'groups', groupCode);
      const groupDoc = await getDoc(groupRef);

      if (groupDoc.exists()) {
        const data = groupDoc.data();
        const currentChores = data.customChores || [];
        const updatedChores = currentChores.filter(c => c.id !== choreId);

        await updateDoc(groupRef, { customChores: updatedChores });
      }
    } catch (error) {
      console.error("Error deleting chore:", error);
      alert("Failed to delete chore.");
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
        drink: 0,
        chore: 0
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
            // Points for leaderboard: Cup (180ml) = 3, Bottle (750ml) = 5
            const points = act.amount === 750 ? 5 : 3;
            dayTypeStats[act.type] += points;
          } else if (act.type === 'chore') {
            dayTypeStats[act.type] += (act.amount || 0); // Points
          } else {
            dayTypeStats[act.type]++; // 1 point for pee, poo, etc.
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
    return { typeData, memberData };
  }, [activities, trendRange, groupData, selectedActivityTypes, selectedMembers]);

  const foodTrendData = useMemo(() => {
    const data = [];
    const today = new Date();
    // Always show last 7 days for food trends for now
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getIsraelDateString(d);

      const dayActs = activities.filter(a =>
        a.type === 'food' &&
        getIsraelDateString(a.timestamp) === dateStr &&
        a.userId === user?.uid // Only show my food trends? Or group? Usually food is personal. Let's show personal.
      );

      const stats = {
        name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        calories: 0,
        protein: 0
      };

      dayActs.forEach(act => {
        stats.calories += (act.details?.totalCalories || 0);
        stats.protein += (act.details?.totalProtein || 0);
      });

      data.push(stats);
    }
    return data;
  }, [activities, user]);

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
        } else if (act.type === 'food') {
          acc[act.type] = (acc[act.type] || 0) + 1;
          acc.calories = (acc.calories || 0) + (act.details?.totalCalories || 0);
          acc.protein = (acc.protein || 0) + (act.details?.totalProtein || 0);
        } else {
          acc[act.type] = (acc[act.type] || 0) + 1;
        }
      }
      return acc;
    }, { pee: 0, poo: 0, drink: 0, chore: 0, food: 0, calories: 0, protein: 0 });
  };

  if (loading) return <div className="animate-fade-in" style={{ padding: '20px' }}>Loading...</div>;

  if (!user) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', padding: '20px' }}>
        <h1 style={{ marginBottom: '1rem', color: '#1a1a2e' }}>{t('welcome_title')}</h1>
        <div className="card">
          <p style={{ marginBottom: '2rem' }}>{t('welcome_subtitle')}</p>
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%', padding: '1rem', background: '#1a1a2e', color: 'white',
              borderRadius: 'var(--btn-radius)', fontWeight: 'bold', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: '10px'
            }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px' }} />
            {t('sign_in_google')}
          </button>
        </div>
      </div>
    );
  }

  if (!groupCode) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', width: '100%', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>{t('hey')}, {user.displayName.split(' ')[0]}!</h2>
          <button onClick={handleLogout} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('logout')}</button>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>{t('join_group')} {t('or')} {t('create_group')}</h3>
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
  const currentUserMember = groupData?.members?.find(m => m.uid === user?.uid);
  // Default to 'parent' if role is missing (legacy users) or explicitly set. New joiners are 'child'.
  // Actually, let's default to 'child' unless they are the first member (creator)?
  // For safety/legacy, let's assume if no role is set, they are 'parent' (since they created the group before this feature).
  // But wait, if a child joined before, they would be parent too.
  // Let's use the logic: if role is present, use it. If not, default to 'parent' (assuming existing users are parents).
  // New joiners will have 'child' set by handleJoin.
  const currentUserRole = currentUserMember?.role || 'parent';

  return (
    <div className="animate-fade-in" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="main-content">
        {/* Header */}
        <div style={{ padding: '0 0 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px' }}>{t('hey')}, {user.displayName.split(' ')[0]} 👋</h1>
            <p style={{ marginTop: '5px' }}>{t('track_activities')}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Install Button */}
            {!window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone && (isIOS || isAndroid) && (
              <button
                onClick={async () => {
                  // If Android and we have the deferred prompt, trigger it immediately
                  if (isAndroid && deferredPrompt) {
                    try {
                      deferredPrompt.prompt();
                      const { outcome } = await deferredPrompt.userChoice;
                      if (outcome === 'accepted') {
                        console.log('User accepted the install prompt');
                      }
                      setDeferredPrompt(null);
                    } catch (error) {
                      console.error('Error showing install prompt:', error);
                      setShowInstallPrompt(true);
                    }
                  } else {
                    // Otherwise show instructions
                    setShowInstallPrompt(true);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                📱 {t('install')}
              </button>
            )}
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
                    <h3 style={{ marginBottom: '20px' }}>{t('log_drink')} 💧</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <button
                        onClick={() => { handleTrack('drink', 180); setShowDrinkSelection(false); }}
                        style={{
                          padding: '20px', borderRadius: '16px', border: '2px solid #eee',
                          background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>☕</span>
                        <span style={{ fontWeight: 'bold' }}>{t('cup')}</span>
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
                        <span style={{ fontWeight: 'bold' }}>{t('bottle')}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>750 ml</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowDrinkSelection(false)}
                      style={{ marginTop: '20px', padding: '10px', background: 'transparent', border: 'none', color: '#888' }}
                    >
                      {t('cancel')}
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
                      title={t('undo')}
                    >
                      ↩️
                    </button>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '15px' }}>{t('recent_activity')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activities
                    .filter(act => ['pee', 'drink', 'poo'].includes(act.type))
                    .slice(0, 3)
                    .map(act => (
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
              {/* Daily Progress Donut */}
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', marginBottom: '15px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{t('daily_goals')}</h3>
                  <p style={{ margin: '5px 0 0', color: '#666', fontSize: '14px' }}>{t('keep_it_up')}</p>
                </div>
                <div style={{ width: '80px', height: '80px', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Pee', value: Math.min(myStats.pee / (goals.pee || 1), 1) },
                          { name: 'Poo', value: Math.min(myStats.poo / (goals.poo || 1), 1) },
                          { name: 'Drink', value: Math.min(myStats.drink / (goals.drink || 1), 1) },
                          { name: 'Remaining', value: Math.max(0, 3 - (Math.min(myStats.pee / (goals.pee || 1), 1) + Math.min(myStats.poo / (goals.poo || 1), 1) + Math.min(myStats.drink / (goals.drink || 1), 1))) }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={35}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                      >
                        <Cell key="cell-pee" fill={COLORS.pee} />
                        <Cell key="cell-poo" fill={COLORS.poo} />
                        <Cell key="cell-drink" fill={COLORS.drink} />
                        <Cell key="cell-rem" fill="#f0f0f0" />
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [name === 'Remaining' ? '' : `${Math.round(value * 100)}%`, name]}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 'bold', color: '#1a1a2e',
                    pointerEvents: 'none'
                  }}>
                    {Math.round(((Math.min(myStats.pee / (goals.pee || 1), 1) + Math.min(myStats.poo / (goals.poo || 1), 1) + Math.min(myStats.drink / (goals.drink || 1), 1)) / 3) * 100)}%
                  </div>
                </div>
              </div>

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

                {/* My Points */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
                  <div style={{
                    width: '50px', height: '50px', borderRadius: '12px',
                    background: `${COLORS.chore}20`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '24px'
                  }}>
                    {ICONS.chore}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Your Points Today</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.chore || 0}
                    </div>
                  </div>
                </div>

                {/* What I Did Today */}
                {activities.filter(act => act.type === 'chore' && act.userId === user?.uid && getIsraelDateString(act.timestamp) === getIsraelDateString()).length > 0 && (
                  <div style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
                    <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>You Completed:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {activities
                        .filter(act => act.type === 'chore' && act.userId === user?.uid && getIsraelDateString(act.timestamp) === getIsraelDateString())
                        .map(act => {
                          const choreInfo = chores.find(c => c.points === act.amount);
                          return (
                            <span key={act.id} style={{ fontSize: '11px', background: `${COLORS.chore}20`, color: COLORS.chore, padding: '3px 8px', borderRadius: '10px', fontWeight: '600' }}>
                              {choreInfo?.name || `${act.amount} pts`}
                            </span>
                          );
                        })
                      }
                    </div>
                  </div>
                )}

                {/* Family Leaderboard */}
                <div>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>Family Chore Scores:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {groupData?.members?.map(member => {
                      const scores = getLeaderboardScores(member.uid);
                      return { ...member, choreScore: scores.chore };
                    })
                      .sort((a, b) => b.choreScore - a.choreScore)
                      .map((member, index) => (
                        <div key={member.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#999', width: '15px' }}>#{index + 1}</span>
                            <span style={{ fontWeight: member.uid === user?.uid ? '700' : '400' }}>
                              {member.name} {member.uid === user?.uid && '(You)'}
                            </span>
                          </div>
                          <span style={{ fontWeight: '600', color: COLORS.chore }}>{member.choreScore} pts</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>

              {/* Food Summary Card */}
              <div className="card" onClick={() => setActiveTab('food')} style={{ cursor: 'pointer', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Food 🍎</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View Details &gt;</span>
                </div>
                {myStats.calories > 0 || myStats.protein > 0 ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '20px' }}>🔥</div>
                        <div style={{ fontWeight: 'bold' }}>{myStats.calories} kcal</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '20px' }}>🥩</div>
                        <div style={{ fontWeight: 'bold' }}>{myStats.protein}g</div>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #eee', paddingTop: '10px' }}>
                      <p style={{ fontSize: '12px', color: '#888', marginBottom: '5px', fontWeight: '600' }}>Eaten Today:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {activities
                          .filter(act => act.type === 'food' && act.userId === user?.uid && getIsraelDateString(act.timestamp) === getIsraelDateString())
                          .map(act => (
                            <span key={act.id} style={{ fontSize: '11px', background: '#f0f0f0', padding: '2px 8px', borderRadius: '10px', color: '#555' }}>
                              {act.input || (act.details?.items?.map(i => i.name).join(', ')) || 'Food'}
                            </span>
                          ))
                        }
                        {activities.filter(act => act.type === 'food' && act.userId === user?.uid && getIsraelDateString(act.timestamp) === getIsraelDateString()).length === 0 && (
                          <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No meals logged yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
                    Tap to log your meals for today.
                  </div>
                )}
              </div>

              {/* Mini Leaderboard Widget */}
              <div className="card" onClick={() => setActiveTab('leaderboard')} style={{ cursor: 'pointer', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Today's Champions 🏆</h3>
                  <span style={{ fontSize: '12px', color: '#888' }}>View All &gt;</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {groupData?.members?.map(member => {
                    const scores = getLeaderboardScores(member.uid);
                    const total = scores.pee + scores.poo + scores.drink + scores.chore;
                    return { ...member, scores, total };
                  })
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 3)
                    .map((member, index) => (
                      <div key={member.uid} style={{ padding: '10px', background: index === 0 ? '#fffbf0' : '#f9f9f9', borderRadius: '12px', border: index === 0 ? '2px solid #FFD700' : '1px solid #eee' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '50%',
                              background: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#eee',
                              color: index < 3 ? 'white' : '#666',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 'bold', fontSize: '12px'
                            }}>
                              {index + 1}
                            </div>
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>{member.name}</div>
                          </div>
                          <div style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{member.total} pts</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#666', paddingLeft: '34px' }}>
                          {member.scores.pee > 0 && <span>{ICONS.pee} {member.scores.pee}</span>}
                          {member.scores.poo > 0 && <span>{ICONS.poo} {member.scores.poo}</span>}
                          {member.scores.drink > 0 && <span>{ICONS.drink} {member.scores.drink}</span>}
                          {member.scores.chore > 0 && <span>{ICONS.chore} {member.scores.chore}</span>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>


            </div>
          )}

          {activeTab === 'trends' && (
            <div className="card" style={{ padding: '20px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px 20px 10px' }}>
                <h3 style={{ margin: 0 }}>{t('trends')} 📊</h3>
                <div style={{ background: '#f5f7fa', padding: '4px', borderRadius: '20px', display: 'flex' }}>
                  <button
                    onClick={() => setTrendRange('week')}
                    style={{
                      padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                      background: trendRange === 'week' ? 'white' : 'transparent',
                      color: trendRange === 'week' ? '#1a1a2e' : '#888',
                      boxShadow: trendRange === 'week' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >{t('week')}</button>
                  <button
                    onClick={() => setTrendRange('month')}
                    style={{
                      padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                      background: trendRange === 'month' ? 'white' : 'transparent',
                      color: trendRange === 'month' ? '#1a1a2e' : '#888',
                      boxShadow: trendRange === 'month' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >{t('month')}</button>
                </div>
              </div>

              {/* Global Filters */}
              <div style={{ padding: '0 10px 20px 10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Type Filter */}
                <div>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>Filter by Type:</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['pee', 'drink', 'poo', 'chore'].map(type => (
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
                        {ICONS[type]} {t(type) || type}
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
              <h4 style={{ fontSize: '14px', color: '#666', paddingLeft: '10px', marginBottom: '10px' }}>{t('by_activity_type')}</h4>
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
                    {selectedActivityTypes.includes('chore') && <Line yAxisId="left" type="monotone" dataKey="chore" stroke={COLORS.chore} strokeWidth={3} dot={false} name="Chores (pts)" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Member Activity Chart */}
              <h4 style={{ fontSize: '14px', color: '#666', paddingLeft: '10px', marginBottom: '10px' }}>{t('by_family_member')}</h4>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>{t('house_chores')} 🧹</h3>
                {currentUserRole === 'parent' && (
                  <button
                    onClick={() => setShowAddChore(true)}
                    style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '20px', cursor: 'pointer' }}
                  >
                    +
                  </button>
                )}
              </div>

              {/* Grouped Assigned Chores */}
              {(() => {
                const todayAssignments = assignments.filter(a => a.date === getIsraelDateString() && a.status !== 'complete');
                if (todayAssignments.length === 0) return null;

                const assignmentsByMember = todayAssignments.reduce((acc, curr) => {
                  if (!acc[curr.assignedTo]) acc[curr.assignedTo] = [];
                  acc[curr.assignedTo].push(curr);
                  return acc;
                }, {});

                return (
                  <div style={{ marginBottom: '25px' }}>
                    <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>Assigned Chores</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {Object.entries(assignmentsByMember).map(([uid, memberAssignments]) => {
                        const member = groupData?.members?.find(m => m.uid === uid);
                        if (!member) return null;

                        return (
                          <div key={uid} style={{ background: '#fff', borderRadius: '16px', padding: '15px', border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f0f0f0' }}>
                              <div style={{
                                width: '24px', height: '24px', borderRadius: '50%',
                                background: '#1a1a2e', color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 'bold', fontSize: '12px'
                              }}>
                                {member.name ? member.name[0].toUpperCase() : '?'}
                              </div>
                              <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>{member.name} {member.uid === user?.uid && '(You)'}</div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {memberAssignments.map(assignment => (
                                <div key={assignment.id} style={{ padding: '10px', background: '#f9f9f9', borderRadius: '10px', border: '1px solid #eee' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{t(assignment.choreName)}</div>
                                      <div style={{ fontSize: '11px', color: '#888' }}>{assignment.chorePoints} {t('points')}</div>
                                    </div>
                                    <select
                                      value={assignment.status}
                                      onChange={(e) => handleUpdateChoreStatus(assignment.id, e.target.value)}
                                      disabled={currentUserRole === 'child' && assignment.assignedTo !== user.uid}
                                      style={{
                                        padding: '4px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '11px', fontWeight: '600',
                                        background: assignment.status === 'todo' ? '#fff3e0' : assignment.status === 'inprogress' ? '#e3f2fd' : '#e8f5e9',
                                        color: assignment.status === 'todo' ? '#e65100' : assignment.status === 'inprogress' ? '#1565c0' : '#2e7d32',
                                        opacity: (currentUserRole === 'child' && assignment.assignedTo !== user.uid) ? 0.5 : 1
                                      }}
                                    >
                                      <option value="todo">{t('todo')}</option>
                                      <option value="inprogress">{t('inprogress')}</option>
                                      <option value="complete">{t('complete')}</option>
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>{t('quick_complete')}</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
                {chores.map(chore => {
                  const design = getChoreDesign(chore);
                  return (
                    <div key={chore.id} style={{
                      background: design.gradient,
                      borderRadius: '20px',
                      padding: '15px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                      position: 'relative',
                      minHeight: '160px',
                      cursor: 'pointer',
                      border: '2px solid white'
                    }}
                      onClick={() => handleTrack('chore', chore.points, { name: chore.name })}
                    >
                      <div style={{ fontSize: '48px', marginBottom: '10px', filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.1))' }}>{design.icon}</div>
                      <div style={{ fontWeight: '800', fontSize: '16px', color: design.color, textAlign: 'center', lineHeight: '1.2', marginBottom: '8px', textShadow: '0 1px 0 rgba(255,255,255,0.5)' }}>{t(chore.name)}</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: design.color, background: 'rgba(255,255,255,0.6)', padding: '4px 12px', borderRadius: '12px' }}>
                        {chore.points} {t('points')}
                      </div>

                      {currentUserRole === 'parent' && (
                        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setChoreToAssign(chore); setShowAssignChore(true); }}
                            style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >👤</button>
                          <button
                            onClick={() => { setEditingChore(chore); setEditChoreName(chore.name); setEditChorePoints(chore.points); setShowEditChore(true); }}
                            style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >✏️</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Chore Modal */}
              {showAddChore && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                  <div style={{ background: 'white', padding: '25px', borderRadius: '20px', width: '80%', maxWidth: '300px' }} onClick={(e) => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0, marginBottom: '15px' }}>{t('add_new_chore')}</h3>
                    <input
                      type="text"
                      placeholder={t('chore_name')}
                      value={newChoreName}
                      onChange={(e) => setNewChoreName(e.target.value)}
                      style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                    <input
                      type="number"
                      placeholder={t('chore_points')}
                      value={newChorePoints}
                      onChange={(e) => setNewChorePoints(e.target.value)}
                      style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setShowAddChore(false)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#eee' }}>{t('cancel')}</button>
                      <button onClick={handleAddChore} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: COLORS.chore, color: 'white', fontWeight: 'bold' }}>{t('add')}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Chore Modal */}
              {showEditChore && editingChore && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                  <div style={{ background: 'white', padding: '25px', borderRadius: '20px', width: '80%', maxWidth: '300px' }} onClick={(e) => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Edit Chore</h3>
                    <input
                      type="text"
                      placeholder={t('chore_name')}
                      value={editChoreName}
                      onChange={(e) => setEditChoreName(e.target.value)}
                      style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                    <input
                      type="number"
                      placeholder={t('chore_points')}
                      value={editChorePoints}
                      onChange={(e) => setEditChorePoints(e.target.value)}
                      style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <button onClick={() => setShowEditChore(false)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#eee' }}>{t('cancel')}</button>
                      <button onClick={handleEditChore} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: COLORS.chore, color: 'white', fontWeight: 'bold' }}>Save</button>
                    </div>
                    <button
                      onClick={() => { setShowEditChore(false); handleDeleteChore(editingChore.id); }}
                      style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: '#ffebee', color: '#d32f2f' }}
                    >
                      Delete Chore
                    </button>
                  </div>
                </div>
              )}

              {/* Assign Chore Modal */}
              {showAssignChore && choreToAssign && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                  <div style={{ background: 'white', padding: '25px', borderRadius: '20px', width: '80%', maxWidth: '300px' }} onClick={(e) => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0, marginBottom: '10px' }}>{t('assign_chore')}</h3>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>{t(choreToAssign.name)} ({choreToAssign.points} {t('points')})</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {groupData?.members?.map(member => (
                        <button
                          key={member.uid}
                          onClick={() => handleAssignChore(member.uid)}
                        >
                          {member.name} {member.uid === user?.uid && '(You)'}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setShowAssignChore(false); setChoreToAssign(null); }} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: '#eee' }}>{t('cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'food' && (
            <div className="card">
              <h3 style={{ marginBottom: '20px' }}>{t('food_tracker')} 🍎</h3>

              {/* Food Trends Chart */}
              <div style={{ marginBottom: '30px', padding: '10px', background: '#fff', borderRadius: '12px', border: '1px solid #eee' }}>
                <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>{t('last_7_days')}</h4>
                <div style={{ height: '200px', width: '100%', fontSize: '10px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={foodTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} dy={5} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="calories" fill="#ff7043" name="Calories" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="protein" fill="#42a5f5" name="Protein (g)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>{t('log_meal')}</p>

              {showKeyInput && (
                <div style={{ marginBottom: '20px', padding: '15px', background: '#fff3e0', borderRadius: '12px' }}>
                  <p style={{ fontSize: '12px', marginBottom: '10px', color: '#e65100' }}>Please enter your Gemini API Key to enable AI analysis:</p>
                  <input
                    type="password"
                    placeholder="Gemini API Key"
                    value={geminiKey}
                    onChange={(e) => {
                      setGeminiKey(e.target.value);
                      localStorage.setItem('gemini_api_key', e.target.value);
                    }}
                    style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ffcc80', marginBottom: '10px' }}
                  />
                  <button
                    onClick={() => setShowKeyInput(false)}
                    style={{ background: '#e65100', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontSize: '12px' }}
                  >
                    Save Key
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder={t('describe_meal')}
                  value={foodInput}
                  onChange={(e) => setFoodInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeFood()}
                  disabled={isAnalyzing}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '16px' }}
                />
                <button
                  onClick={handleAnalyzeFood}
                  disabled={isAnalyzing}
                  style={{
                    background: isAnalyzing ? '#ccc' : COLORS.food,
                    color: 'white', border: 'none', borderRadius: '12px', padding: '0 20px', fontWeight: 'bold',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isAnalyzing ? t('analyzing') : t('add')}
                </button>
              </div>

              <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>{t('todays_meals')}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activities.filter(a => a.type === 'food' && getIsraelDateString(a.timestamp) === getIsraelDateString()).length === 0 && (
                  <p style={{ color: '#aaa', fontSize: '14px', fontStyle: 'italic' }}>{t('no_meals')}</p>
                )}
                {activities
                  .filter(a => a.type === 'food' && getIsraelDateString(a.timestamp) === getIsraelDateString())
                  .map(meal => (
                    <div key={meal.id} style={{ padding: '12px', background: '#f9f9f9', borderRadius: '12px', border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>
                          {meal.input || meal.details?.items?.map(i => i.name).join(', ') || 'Meal'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {meal.details?.totalCalories} cal • {meal.details?.totalProtein}g protein • <span style={{ color: '#1a1a2e', fontWeight: '500' }}>{meal.userName?.split(' ')[0]}</span>
                        </div>
                        {/* Optional: Show individual items if available */}
                        {meal.details?.items && meal.details.items.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                            {meal.details.items.map(i => i.name).join(', ')}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteFood(meal.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
              </div>

              {/* AI Diet Analysis */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <button
                  onClick={handleAnalyzeDiet}
                  disabled={isDietAnalyzing}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
                    background: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)',
                    color: 'white', fontWeight: 'bold', fontSize: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 4px 15px rgba(86, 171, 47, 0.3)', cursor: 'pointer'
                  }}
                >
                  <span>✨</span> {isDietAnalyzing ? 'Analyzing...' : 'Analyze My Diet & Suggest Next Meal'}
                </button>

                {showDietAnalysis && (
                  <div style={{ marginTop: '15px', background: '#f1f8e9', padding: '15px', borderRadius: '12px', border: '1px solid #c5e1a5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, color: '#33691e' }}>AI Nutritionist</h4>
                      <button onClick={() => setShowDietAnalysis(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#558b2f' }}>×</button>
                    </div>
                    {isDietAnalyzing ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#558b2f' }}>
                        Thinking... 🥗
                      </div>
                    ) : (
                      <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#1b5e20', whiteSpace: 'pre-line' }}>
                        <ReactMarkdown>{dietAnalysisResult}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
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
                        <span>{ICONS.chore} {member.scores.chore}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'family' && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '20px' }}>👨‍👩‍👧‍👦</div>
              <h3 style={{ fontSize: '22px', marginBottom: '10px' }}>{t('your_family_group')}</h3>
              <div style={{ background: '#f5f7fa', padding: '15px', borderRadius: '12px', margin: '20px 0' }}>
                <p style={{ marginBottom: '5px' }}>{t('group_code')}</p>
                <div style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '2px' }}>{groupCode}</div>
              </div>

              {/* Family Members List */}
              <div style={{ marginTop: '30px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '16px', marginBottom: '15px', color: '#666', textAlign: 'left' }}>{t('family_members')} ({groupData?.members?.length || 0})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {groupData?.members?.map(member => {
                    const scores = getLeaderboardScores(member.uid);
                    const total = scores.pee + scores.poo + scores.drink + scores.chore;
                    return (
                      <div key={member.uid}
                        onClick={() => handleMemberClick(member)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '15px',
                          background: member.uid === user?.uid ? '#f0f8ff' : '#f9f9f9',
                          borderRadius: '12px',
                          border: member.uid === user?.uid ? '2px solid #1a1a2e' : '1px solid #eee',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {member.photoURL ? (
                            <img src={member.photoURL} alt={member.name} style={{ width: '50px', height: '50px', borderRadius: '50%' }} />
                          ) : (
                            <div style={{
                              width: '50px', height: '50px', borderRadius: '50%',
                              background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 'bold', fontSize: '20px', color: 'white'
                            }}>
                              {member.name ? member.name[0].toUpperCase() : '?'}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a2e' }}>
                              {member.name} {member.uid === user?.uid && '(You)'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                              {total} {t('points_today')}
                            </div>
                            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>{member.role === 'parent' ? 'Parent 🛡️' : 'Child 👶'}</span>
                              {currentUserRole === 'parent' && member.uid !== user.uid && (
                                <select
                                  value={member.role || 'child'}
                                  onChange={(e) => handleUpdateRole(member.uid, e.target.value)}
                                  style={{ padding: '2px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                                >
                                  <option value="child">Child</option>
                                  <option value="parent">Parent</option>
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#666' }}>
                          {scores.pee > 0 && <span>{ICONS.pee} {scores.pee}</span>}
                          {scores.poo > 0 && <span>{ICONS.poo} {scores.poo}</span>}
                          {scores.drink > 0 && <span>{ICONS.drink} {scores.drink}</span>}
                          {scores.chore > 0 && <span>{ICONS.chore} {scores.chore}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleShare}
                style={{
                  background: '#1a1a2e', color: 'white', padding: '15px 30px',
                  borderRadius: '30px', fontWeight: 'bold', fontSize: '16px',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
                }}
              >
                {t('invite_family')} 📤
              </button>
              <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                <button onClick={handleExitGroup} style={{ color: '#e65100', fontWeight: '600' }}>{t('change_group')}</button>
                {currentUserRole === 'parent' && (
                  <button onClick={handleResetData} style={{ color: '#d32f2f', fontWeight: '600' }}>{t('reset_data')} 🗑️</button>
                )}
                <button onClick={handleLogout} style={{ color: '#8b8b9e' }}>{t('logout')}</button>
              </div>

              {/* Member Details Modal */}
              {showMemberDetails && selectedMemberDetails && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }} onClick={() => setShowMemberDetails(false)}>
                  <div style={{ background: 'white', padding: '25px', borderRadius: '20px', width: '90%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0 }}>{selectedMemberDetails.name}</h3>
                      <button onClick={() => setShowMemberDetails(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
                    </div>

                    <h4 style={{ marginBottom: '15px', color: '#666' }}>Recent Activities</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {activities
                        .filter(a => a.userId === selectedMemberDetails.uid)
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .slice(0, 20)
                        .map(act => (
                          <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f9f9f9', borderRadius: '10px' }}>
                            <div>
                              <div style={{ fontWeight: 'bold' }}>{ICONS[act.type] || '❓'} {t(act.type)}</div>
                              <div style={{ fontSize: '12px', color: '#888' }}>
                                {new Date(act.timestamp).toLocaleString()}
                                {act.type === 'food' && ` • ${act.input || act.details?.items?.map(i => i.name).join(', ') || act.details?.totalCalories + ' cal'}`}
                                {act.type === 'chore' && ` • ${act.details?.name || act.amount + ' pts'}`}
                                {act.type === 'drink' && ` • ${act.amount} ml`}
                              </div>
                            </div>
                            {(currentUserRole === 'parent' || act.userId === user.uid) && (
                              <button
                                onClick={() => handleDeleteActivity(act.id)}
                                style={{ background: '#ffebee', color: '#c62828', border: 'none', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                Delete 🗑️
                              </button>
                            )}
                          </div>
                        ))}
                      {activities.filter(a => a.userId === selectedMemberDetails.uid).length === 0 && (
                        <p style={{ color: '#888', fontStyle: 'italic' }}>No recent activities.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div >

      {/* Bottom Navigation */}
      < div className="bottom-nav" >
        <div className="bottom-nav-content">
          <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <span className="nav-icon">🏠</span>
            <span>{t('home')}</span>
          </div>
          <div className={`nav-item ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
            <span className="nav-icon">❤️</span>
            <span>{t('health')}</span>
          </div>
          <div className={`nav-item ${activeTab === 'food' ? 'active' : ''}`} onClick={() => setActiveTab('food')}>
            <span className="nav-icon">🍎</span>
            <span>{t('food')}</span>
          </div>
          <div className={`nav-item ${activeTab === 'chores' ? 'active' : ''}`} onClick={() => setActiveTab('chores')}>
            <span className="nav-icon">🧹</span>
            <span>{t('chores')}</span>
          </div>
          <div className={`nav-item ${activeTab === 'trends' ? 'active' : ''}`} onClick={() => setActiveTab('trends')}>
            <span className="nav-icon">📊</span>
            <span>{t('trends')}</span>
          </div>
          <div className={`nav-item ${activeTab === 'family' ? 'active' : ''}`} onClick={() => setActiveTab('family')}>
            <span className="nav-icon">👨‍👩‍👧‍👦</span>
            <span>{t('family')}</span>
          </div>
        </div>
      </div>

      {/* PWA Install Prompt */}
      {showInstallPrompt && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white', padding: '20px', boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
          zIndex: 2000, animation: 'slideUp 0.3s ease-out'
        }}>
          <button
            onClick={() => {
              setShowInstallPrompt(false);
              localStorage.setItem('pwa_install_dismissed', 'true');
            }}
            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}
          >
            ×
          </button>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            📱 {t('install_title')}
          </div>
          <div style={{ fontSize: '14px', marginBottom: '15px', opacity: 0.9 }}>
            {t('install_desc')}
          </div>

          {isIOS && (
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
              {t('install_ios_1')} <span style={{ fontSize: '16px' }}>⎙</span><br />
              {t('install_ios_2')} <span style={{ fontSize: '16px' }}>➕</span><br />
              {t('install_ios_3')}
            </div>
          )}


          {isAndroid && (
            deferredPrompt ? (
              <button
                onClick={async () => {
                  deferredPrompt.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  if (outcome === 'accepted') {
                    setShowInstallPrompt(false);
                  }
                  setDeferredPrompt(null);
                }}
                style={{
                  background: 'white', color: '#667eea', border: 'none',
                  padding: '12px 24px', borderRadius: '25px', fontWeight: 'bold',
                  width: '100%', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                }}
              >
                {t('install_now')}
              </button>
            ) : (
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                {t('install_android_1')} <span style={{ fontSize: '16px' }}>⋮</span><br />
                {t('install_android_2')} <span style={{ fontSize: '16px' }}>➕</span><br />
                {t('install_android_3')}
              </div>
            )
          )}
        </div>
      )}
    </div >
  )
}

export default App
