
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { db, auth, googleProvider, ai, analytics } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { logEvent } from "firebase/analytics";
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc, getDocs, where,
  collection, addDoc, onSnapshot, query, orderBy, limit, deleteField
} from 'firebase/firestore'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { getGenerativeModel } from "firebase/ai";
import ReactMarkdown from 'react-markdown';
import './App.css'
import { translations } from './translations';
import { encryptData, decryptData } from './security';

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

const BADGES = [
  {
    id: 'hydration_hero',
    name: 'Hydration Hero',
    icon: '💧',
    description: 'Drank 1500ml+ in a day',
    criteria: (acts) => {
      const today = getIsraelDateString();
      const todayActs = acts.filter(a => getIsraelDateString(a.timestamp) === today);
      return todayActs.some(a => a.type === 'drink' && a.amount >= 250) &&
        todayActs.filter(a => a.type === 'drink').reduce((sum, a) => sum + a.amount, 0) >= 1500;
    }
  },
  { id: 'chore_champion', name: 'Chore Champion', icon: '👑', description: 'Completed 10 chores', criteria: (acts) => acts.filter(a => a.type === 'chore').length >= 10 },
  { id: 'early_bird', name: 'Early Bird', icon: '🌅', description: 'Logged activity before 7 AM', criteria: (acts) => acts.some(a => new Date(a.timestamp).getHours() < 7) },
  { id: 'night_owl', name: 'Night Owl', icon: '🦉', description: 'Logged activity after 10 PM', criteria: (acts) => acts.some(a => new Date(a.timestamp).getHours() >= 22) },
  { id: 'protein_power', name: 'Protein Power', icon: '💪', description: 'Logged a high protein meal (30g+)', criteria: (acts) => acts.some(a => a.type === 'food' && a.details?.totalProtein >= 30) }
];

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

// Version check removed to prevent loops
function App() {
  const logAppEvent = (eventName, params = {}) => {
    try {
      logEvent(analytics, eventName, params);
    } catch (e) {
      console.log("Analytics error", e);
    }
  };

  const [user, setUser] = useState(null);
  const [groupCode, setGroupCode] = useState(localStorage.getItem('tracker_group_code') || null);
  const [groupData, setGroupData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // For forcing re-renders on visibility change
  const [activeTab, setActiveTab] = useState('home');
  // Removed localStorage persistence for activeTab to always default to Home
  const [showSettings, setShowSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved'

  // Version Check
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch('/version.json?t=' + Date.now());
        if (response.ok) {
          const data = await response.json();
          const localVersion = localStorage.getItem('app_version');
          if (localVersion && localVersion !== data.version) {
            console.log('New version found, reloading...');
            localStorage.setItem('app_version', data.version);
            window.location.reload();
          } else if (!localVersion) {
            localStorage.setItem('app_version', data.version);
          }
        }
      } catch (e) {
        console.error("Failed to check version", e);
      }
    };

    checkVersion();
    const onFocus = () => checkVersion();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(checkVersion, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);
  const [goals, setGoals] = useState({ pee: 0, drink: 0, poo: 0 });
  const [bottleSize, setBottleSize] = useState(750);
  const [trendRange, setTrendRange] = useState('week'); // 'week' or 'month'
  const [selectedTrendCategory, setSelectedTrendCategory] = useState('drink'); // 'drink', 'pee', 'poo', 'chore'
  const [newBadge, setNewBadge] = useState(null);
  const [healthInsight, setHealthInsight] = useState(null);
  const [isAnalyzingHealth, setIsAnalyzingHealth] = useState(false);
  const [currentUserWeight, setCurrentUserWeight] = useState(null);

  // Gazette State
  const [latestGazette, setLatestGazette] = useState(null);
  const [isGeneratingGazette, setIsGeneratingGazette] = useState(false);
  const [showGazetteModal, setShowGazetteModal] = useState(false);

  // AI Chef & Shopping List State
  const [shoppingList, setShoppingList] = useState([]);
  const [suggestedRecipe, setSuggestedRecipe] = useState(null);
  const [isSuggestingRecipe, setIsSuggestingRecipe] = useState(false);

  // Sticky Notes State
  const [stickyNotes, setStickyNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);

  // Shopping List Edit State
  const [editingShoppingItem, setEditingShoppingItem] = useState(null);
  const [editingShoppingText, setEditingShoppingText] = useState('');

  // Chat State
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatRecipient, setChatRecipient] = useState('all');
  const messagesEndRef = useRef(null);

  // Load insight and weight on user change
  useEffect(() => {
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.healthInsight) {
            setHealthInsight(data.healthInsight.text);
          }
          if (data.weight) {
            setCurrentUserWeight(data.weight);
          }
        }
      });
    }
  }, [user]);

  const dailyCaloriesTarget = currentUserWeight ? Math.round(currentUserWeight * 30) : 2000;
  const dailyProteinTarget = currentUserWeight ? Math.round(currentUserWeight * 1.6) : 100;

  // Load latest gazette
  useEffect(() => {
    if (groupCode) {
      const q = query(collection(db, 'groups', groupCode, 'gazettes'), orderBy('createdAt', 'desc'), limit(1));
      getDocs(q).then(snap => {
        if (!snap.empty) {
          setLatestGazette(snap.docs[0].data());
        }
      });
    }
  }, [groupCode]);

  // Load Shopping List & Sticky Notes
  useEffect(() => {
    if (groupCode) {
      const qList = query(collection(db, 'groups', groupCode, 'shoppingList'), orderBy('createdAt', 'desc'));
      const unsubList = onSnapshot(qList, (snapshot) => {
        setShoppingList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const qNotes = query(collection(db, 'groups', groupCode, 'stickyNotes'), orderBy('createdAt', 'desc'));
      const unsubNotes = onSnapshot(qNotes, (snapshot) => {
        setStickyNotes(snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            text: decryptData(data.text)
          };
        }));
      });

      const qChat = query(collection(db, 'groups', groupCode, 'messages'), orderBy('timestamp', 'asc'), limit(50));
      const unsubChat = onSnapshot(qChat, (snapshot) => {
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        // Simple unread logic: if chat is closed and new messages arrive (length increased), increment.
        // For a real app, we'd track 'lastReadTimestamp'. Here we just check if it's a new update while closed.
        // To do it properly, we'd need a ref or effect dependency.
        // Let's just set unread to 1 if closed and there are messages, or maybe track length.
      });

      return () => {
        unsubList();
        unsubNotes();
        unsubChat();
      };
    }
  }, [groupCode]);

  // Unread Count & Mark as Read Logic
  useEffect(() => {
    if (!user) return;

    const updateUnread = () => {
      const lastRead = localStorage.getItem('chatLastRead') || '1970-01-01T00:00:00.000Z';

      // Filter for messages relevant to me
      const relevantMsgs = messages.filter(msg => {
        const isPublic = !msg.recipientId || msg.recipientId === 'all';
        const isToMe = msg.recipientId === user.uid;
        const isFromMe = msg.userId === user.uid;
        // Only count if it's NOT from me, AND (Public OR To Me)
        return !isFromMe && (isPublic || isToMe);
      });

      if (showChat) {
        // If chat is open, mark all as read
        if (relevantMsgs.length > 0) {
          const latestTimestamp = relevantMsgs[relevantMsgs.length - 1].timestamp;
          if (latestTimestamp > lastRead) {
            localStorage.setItem('chatLastRead', latestTimestamp);
          }
        }
        setUnreadCount(0);
      } else {
        // If chat is closed, count unread
        const unread = relevantMsgs.filter(msg => msg.timestamp > lastRead);
        setUnreadCount(unread.length);
      }
    };

    updateUnread();
  }, [messages, user, showChat]);
  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (showChat) {
      // Small timeout to ensure DOM is rendered
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, showChat, chatRecipient]);


  const generateGazette = async (lang = 'he') => {
    if (!groupCode) return;
    setIsGeneratingGazette(true);
    try {
      // Fetch last 24 hours of activities
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const q = query(
        collection(db, 'groups', groupCode, 'activities'),
        where('timestamp', '>=', oneDayAgo.toISOString()),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const dayActs = snapshot.docs.map(d => d.data());

      if (dayActs.length < 3) {
        alert(lang === 'he' ? "אין מספיק חדשות לעיתון היומי! תמשיכו לעקוב." : "Not enough news for the Daily Gazette! Keep tracking.");
        setIsGeneratingGazette(false);
        return;
      }

      const summary = dayActs.map(a =>
        `${a.userName} did ${a.type} (${a.amount || ''} ${a.details ? JSON.stringify(a.details) : ''})`
      ).join('\n');

      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

      const prompt = `
      Write a fun, humorous DAILY newsletter for the family based on this activity log from the last 24 hours.
      Title: 'The Daily Gazette 📰'
      Sections:
      1. 🚨 **Headline News**: The biggest achievement or event of the day.
      2. 👑 **Daily MVP**: Who did the most today?
      3. 🕵️ **The Gossip Column**: Funny observations.
      4. 🔮 **Tomorrow's Forecast**: Encouragement.
      
      Style: Witty, exciting, newspaper style. Use emojis.
      Format: Markdown.
      Output Language: ${lang === 'he' ? 'Hebrew' : 'English'}
      IMPORTANT: Use gender-neutral language (in Hebrew use plural or avoid gendered verbs).
      
      Log:
      ${summary}
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const newGazette = {
        content: text,
        createdAt: new Date().toISOString(),
        weekOf: new Date().toISOString(), // Keeping 'weekOf' key for compatibility, but it represents the issue date
        lang
      };

      await addDoc(collection(db, 'groups', groupCode, 'gazettes'), newGazette);

      setLatestGazette(newGazette);
      setShowGazetteModal(true);

    } catch (error) {
      console.error("Gazette generation failed:", error);
      alert(lang === 'he' ? "המכונה נתקעה! (שגיאת AI)" : "The printing press is jammed! (AI Error)");
    } finally {
      setIsGeneratingGazette(false);
    }
  };

  // Helper to check if we can generate a new gazette (reset at 8 PM)
  const canGenerateGazette = () => {
    if (!latestGazette) return true;

    const now = new Date();
    const today8PM = new Date();
    today8PM.setHours(20, 0, 0, 0);

    const lastGazetteDate = new Date(latestGazette.createdAt);

    if (now >= today8PM) {
      // It's after 8 PM today. 
      // We can generate if the last gazette is from BEFORE today's 8 PM.
      return lastGazetteDate < today8PM;
    } else {
      // It's before 8 PM today.
      // We can generate if the last gazette is from BEFORE yesterday's 8 PM.
      const yesterday8PM = new Date(today8PM);
      yesterday8PM.setDate(yesterday8PM.getDate() - 1);
      return lastGazetteDate < yesterday8PM;
    }
  };

  const analyzeHealthPatterns = async (lang = 'he') => {
    if (!user) return;
    setIsAnalyzingHealth(true);
    try {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const userActs = activities.filter(a =>
        a.userId === user.uid && new Date(a.timestamp) > twoWeeksAgo
      );

      if (userActs.length < 5) {
        setHealthInsight(lang === 'he' ? "אין מספיק נתונים עדיין! תמשיכו לעקוב כדי לקבל תובנות." : "Not enough data yet! Keep tracking to unlock insights.");
        setIsAnalyzingHealth(false);
        return;
      }

      const summary = userActs.map(a =>
        `${new Date(a.timestamp).toLocaleDateString()} ${new Date(a.timestamp).toLocaleTimeString()}: ${a.type} ${a.amount ? `(${a.amount})` : ''} ${a.details ? JSON.stringify(a.details) : ''}`
      ).join('\n');

      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      const prompt = `Analyze this activity log for correlations between hydration, nutrition, chores, and time.
      Find ONE interesting, positive, or constructive pattern.
      Examples: "You drink more water on days you do chores", "Your protein intake drops on weekends".
      Keep it short (max 2 sentences), friendly, and actionable.
      Output Language: ${lang === 'he' ? 'Hebrew' : 'English'}
      IMPORTANT: Use gender-neutral language (in Hebrew use plural or avoid gendered verbs).
      Log:
      ${summary}`;

      const result = await model.generateContent(prompt);
      const insight = result.response.text();

      setHealthInsight(insight);
      await setDoc(doc(db, 'users', user.uid), {
        healthInsight: { text: insight, date: new Date().toISOString(), lang }
      }, { merge: true });

    } catch (error) {
      console.error("Health analysis failed:", error);
      setHealthInsight(lang === 'he' ? "לא הצלחתי לנתח את הנתונים כרגע. נסה שוב מאוחר יותר." : "Couldn't analyze patterns right now. Try again later.");
    } finally {
      setIsAnalyzingHealth(false);
    }
  };

  const handleSuggestRecipe = async () => {
    if (!user || !groupCode) return;
    setIsSuggestingRecipe(true);
    setSuggestedRecipe(null);

    try {
      // Gather today's food logs
      const todayStr = getIsraelDateString();
      const todayFood = activities.filter(a =>
        a.type === 'food' &&
        a.userId === user.uid &&
        getIsraelDateString(a.timestamp) === todayStr
      );

      const foodSummary = todayFood.map(f =>
        `${f.input || 'Meal'} (${f.details?.totalCalories || 0} cal, ${f.details?.totalProtein || 0}g protein)`
      ).join('; ');

      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      const prompt = `
        I have eaten the following today: ${foodSummary}.
        My daily goal is approx ${dailyCaloriesTarget} calories and ${dailyProteinTarget}g protein.
        
        Suggest a healthy, balanced dinner recipe that complements what I've eaten (filling nutritional gaps).
        
        Output strictly in valid JSON format.
        Language: Hebrew.
        {
          "name": "Recipe Name (Hebrew)",
          "description": "Brief description of why this is good for me (Hebrew)",
          "ingredients": [
            { "item": "Ingredient Name (Hebrew)", "amount": "Amount (Hebrew)" }
          ],
          "instructions": ["Step 1", "Step 2"]
        }
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Clean up markdown code blocks if present
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const recipe = JSON.parse(jsonStr);
      setSuggestedRecipe(recipe);

    } catch (error) {
      console.error("Recipe generation failed:", error);
      alert("The AI Chef is on a break! Try again later.");
    } finally {
      setIsSuggestingRecipe(false);
    }
  };

  const handleAddToShoppingList = async (ingredients) => {
    if (!groupCode) return;
    try {
      const promises = ingredients.map(ing =>
        addDoc(collection(db, 'groups', groupCode, 'shoppingList'), {
          name: `${ing.item} ${ing.amount ? `(${ing.amount})` : ''}`,
          checked: false,
          addedBy: user.uid,
          createdAt: new Date().toISOString()
        })
      );
      await Promise.all(promises);
      alert("Ingredients added to Shopping List! 🛒");
    } catch (error) {
      console.error("Failed to add to shopping list:", error);
    }
  };

  const handleToggleShoppingItem = async (itemId, currentStatus) => {
    if (!groupCode) return;
    await updateDoc(doc(db, 'groups', groupCode, 'shoppingList', itemId), {
      checked: !currentStatus
    });
  };

  const handleDeleteShoppingItem = async (itemId) => {
    if (!groupCode) return;
    await deleteDoc(doc(db, 'groups', groupCode, 'shoppingList', itemId));
  };

  const handleUpdateShoppingItem = async () => {
    if (!groupCode || !editingShoppingItem || !editingShoppingText.trim()) return;
    try {
      await updateDoc(doc(db, 'groups', groupCode, 'shoppingList', editingShoppingItem), {
        name: editingShoppingText.trim()
      });
      setEditingShoppingItem(null);
      setEditingShoppingText('');
    } catch (error) {
      console.error("Failed to update shopping item:", error);
    }
  };

  const handleAddManualShoppingItem = async (name) => {
    if (!groupCode || !name.trim()) return;
    await addDoc(collection(db, 'groups', groupCode, 'shoppingList'), {
      name: name.trim(),
      checked: false,
      addedBy: user.uid,
      createdAt: new Date().toISOString()
    });
  };

  const handleAddNote = async () => {
    if (!groupCode || !newNoteText.trim()) return;
    try {
      await addDoc(collection(db, 'groups', groupCode, 'stickyNotes'), {
        text: encryptData(newNoteText),
        addedBy: user.uid,
        createdAt: new Date().toISOString(),
        color: ['#fff9c4', '#ffccbc', '#b2dfdb', '#e1bee7'][Math.floor(Math.random() * 4)] // Random pastel color
      });
      setNewNoteText('');
      setIsAddingNote(false);
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!groupCode) return;
    setDeletingNoteId(noteId);
    setTimeout(async () => {
      try {
        await deleteDoc(doc(db, 'groups', groupCode, 'stickyNotes', noteId));
        setDeletingNoteId(null);
      } catch (error) {
        console.error("Failed to delete note:", error);
        setDeletingNoteId(null);
      }
    }, 600); // Wait for animation
  };

  const handleSendMessage = async () => {
    if (!groupCode || !newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'groups', groupCode, 'messages'), {
        text: newMessage.trim(),
        userId: user.uid,
        userName: user.displayName,
        recipientId: chatRecipient, // 'all' or specific userId
        timestamp: new Date().toISOString()
      });
      setNewMessage('');
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const checkBadges = async (userId, currentActs) => {
    if (!userId) return;
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data() || {};
      const earnedBadges = userData.badges || [];
      const userActs = currentActs.filter(a => a.userId === userId);

      for (const badge of BADGES) {
        if (!earnedBadges.includes(badge.id)) {
          if (badge.criteria(userActs)) {
            await setDoc(userDocRef, { badges: arrayUnion(badge.id) }, { merge: true });
            if (userId === user.uid) {
              setNewBadge(badge);
              // Play sound?
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'); // Success sound
              audio.play().catch(e => console.log("Audio play failed", e));
            }
            break;
          }
        }
      }
    } catch (e) {
      console.error("Error checking badges:", e);
    }
  };

  // Member Details StatedActivityTypes, setSelectedActivityTypes] = useState(['pee', 'drink', 'poo', 'chore']);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState(['pee', 'drink', 'poo', 'chore']);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [leaderboardRange, setLeaderboardRange] = useState('day'); // 'day', 'week', 'month', 'all'
  const [showDrinkSelection, setShowDrinkSelection] = useState(false);
  const [showFoodSelection, setShowFoodSelection] = useState(false);
  const [homeCategory, setHomeCategory] = useState('drink');

  // Lock body scroll when modal is open (iOS fix)
  useEffect(() => {
    if (showFoodSelection) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showFoodSelection]);
  const [showAllFood, setShowAllFood] = useState(false);
  const [showAllChores, setShowAllChores] = useState(false);
  const [expandedChoreUser, setExpandedChoreUser] = useState(null);

  // Food Tracker State
  const [foodInput, setFoodInput] = useState('');
  const [foodImage, setFoodImage] = useState(null);
  const [foodFilter, setFoodFilter] = useState('mine'); // 'mine' or 'all'
  const fileInputRef = useRef(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedFoodData, setAnalyzedFoodData] = useState(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = reader.result;
        setFoodImage(imageData);
        // Auto-trigger analysis with the new image
        handleAnalyzeFood('he', imageData);
      };
      reader.readAsDataURL(file);
    }
  };



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
  const [memberBadges, setMemberBadges] = useState([]);
  const [memberWeight, setMemberWeight] = useState('');

  const handleMemberClick = async (member) => {
    setSelectedMemberDetails(member);
    setShowMemberDetails(true);
    setMemberBadges([]); // Reset first
    setMemberWeight('');
    try {
      const userDoc = await getDoc(doc(db, 'users', member.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setMemberBadges(data.badges || []);
        setMemberWeight(data.weight || '');
      }
    } catch (e) {
      console.error("Error fetching member details:", e);
    }
  };

  const handleSaveWeight = async () => {
    if (!selectedMemberDetails || !memberWeight) return;
    try {
      await setDoc(doc(db, 'users', selectedMemberDetails.uid), { weight: parseFloat(memberWeight) }, { merge: true });
      alert('Weight saved!');
    } catch (e) {
      console.error("Error saving weight:", e);
      alert("Failed to save weight.");
    }
  };

  const calculateGoalsFromWeight = () => {
    if (!memberWeight) return;
    const w = parseFloat(memberWeight);
    const recommended = {
      pee: 10, // Standard
      poo: 1, // Standard
      drink: Math.round(w * 35), // 35ml per kg
    };
    if (confirm(`Recommended goals based on ${w}kg:\nDrink: ${recommended.drink}ml\n\nApply these goals?`)) {
      handleSaveGoals({ ...goals, ...recommended });
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

  // Force refresh on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("App became visible, refreshing...");
        setRefreshKey(prev => prev + 1);
        // Optional: Check for SW updates here if needed
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
          // Points for leaderboard: 1 point per 50ml
          const points = Math.round((act.amount || 0) / 50);
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
          if (data.bottleSize) {
            setBottleSize(data.bottleSize);
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
      const acts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          details: data.details ? decryptData(data.details) : data.details,
          input: data.input ? decryptData(data.input) : data.input
        };
      });
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

  useEffect(() => {
    if (activeTab) {
      logAppEvent('view_tab', { tab_name: activeTab });
    }
  }, [activeTab]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      logAppEvent('login', { method: 'google' });
    } catch (error) {
      console.error("Error signing in:", error);
      alert("Failed to sign in. Please try again.");
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
          code,
          createdAt: new Date().toISOString(),
          members: [memberData],
          activities: [],
          customChores: []
        });
        logAppEvent('create_group', { group_code: code });
      } else {
        const docSnap = await getDoc(groupRef);
        if (!docSnap.exists()) {
          alert("Group not found!");
          return;
        }
        // Check if already member
        const data = docSnap.data();
        if (data.members.some(m => m.uid === user.uid)) {
          // Already joined
        } else {
          await updateDoc(groupRef, {
            members: arrayUnion(memberData)
          });
          logAppEvent('join_group', { group_code: code, role: 'child' });
        }
      } await setDoc(doc(db, 'users', user.uid), { groupCode: code }, { merge: true });
      setGroupCode(code);
      localStorage.setItem('tracker_group_code', code);
    } catch (error) {
      console.error("Error joining group:", error);
      alert("Error joining group: " + error.message);
    }
  };

  const handleTrack = async (type, amount = 1, details = {}) => {
    if (!groupCode || !user) return;
    try {
      const activity = {
        type,
        amount,
        details: encryptData(details),
        timestamp: new Date().toISOString(),
        userId: user.uid,
        userName: user.displayName
      };
      await addDoc(collection(db, 'groups', groupCode, 'activities'), activity);

      logAppEvent('track_activity', { type, amount, name: details?.name || type });

      // Check badges(user.uid, [...activities, newActivity]);
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

  const getReactorNames = (act, emoji) => {
    if (!act.reactions) return [];
    return Object.entries(act.reactions)
      .filter(([uid, reaction]) => reaction === emoji)
      .map(([uid]) => {
        const member = groupData?.members?.find(m => m.uid === uid);
        return member ? member.name.split(' ')[0] : 'Unknown';
      });
  };

  const handleReaction = async (activityId, reactionType) => {
    if (!groupCode || !user) return;
    try {
      const activityRef = doc(db, 'groups', groupCode, 'activities', activityId);
      if (reactionType === null) {
        await updateDoc(activityRef, {
          [`reactions.${user.uid}`]: deleteField()
        });
      } else {
        await updateDoc(activityRef, {
          [`reactions.${user.uid}`]: reactionType
        });
      }
    } catch (error) {
      console.error("Error adding reaction:", error);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!groupCode || !activityId) return;
    if (!confirm(t('delete_confirm'))) return;

    try {
      await deleteDoc(doc(db, 'groups', groupCode, 'activities', activityId));
    } catch (error) {
      console.error("Error deleting activity:", error);
      alert("Failed to delete activity.");
    }
  };


  const handleAnalyzeFood = async (langInput, imageOverride = null) => {
    const lang = typeof langInput === 'string' ? langInput : 'he';
    const imageToUse = imageOverride || foodImage;

    if (!foodInput.trim() && !imageToUse) return;

    setIsAnalyzing(true);
    try {
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

      let promptParts = [];
      if (imageToUse) {
        promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageToUse.split(',')[1] } });
        promptParts.push({ text: "Analyze this image of food. Identify the items and estimate calories/protein." });
      }

      promptParts.push({
        text: `Analyze the following food input: "${foodInput}".
      Return a JSON object with the following structure:
    {
      "items": [
        {
          "name": "Food Name",
          "calories": 100,
          "protein": 5,
          "fat": 2,
          "carbs": 10,
          "emoji": "🍎"
        }
      ],
        "totalCalories": 100,
          "totalProtein": 5,
            "healthScore": 8, // 1-10
            "isHealthy": true, // true for nutritious food, false for sweets/junk/processed
            "classificationReason": "Brief reason for classification",
              "feedback": "Brief feedback sentence"
    }
    IMPORTANT: Output valid JSON only.
    Output Language for 'feedback', 'name', and 'classificationReason': ${lang === 'he' ? 'Hebrew' : 'English'}
    IMPORTANT: Use gender-neutral language (in Hebrew use plural or avoid gendered verbs).
    `});

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: promptParts }]
      });
      const response = await result.response;
      const text = response.text();

      // Clean up markdown if present
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(jsonStr);

      // Set data for confirmation instead of adding immediately
      setShowFoodSelection(false);
      setAnalyzedFoodData({
        data,
        input: foodInput,
        image: imageToUse
      });

    } catch (error) {
      console.error("Error analyzing food:", error);
      alert(lang === 'he' ? "שגיאה בניתוח המזון. נסה שוב." : "Failed to analyze food. Please check your API key or try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmFood = async () => {
    if (!analyzedFoodData) return;

    try {
      const isHealthy = analyzedFoodData.data.isHealthy;
      const points = isHealthy ? 1 : -1;

      await addDoc(collection(db, 'groups', groupCode, 'activities'), {
        type: 'food',
        amount: points,
        details: encryptData({
          ...analyzedFoodData.data,
          calories: analyzedFoodData.data.totalCalories,
          isHealthy: isHealthy
        }),
        input: encryptData(analyzedFoodData.input),
        image: analyzedFoodData.image, // Optional: save image if needed, or just keep it for the session
        userId: user.uid,
        userName: user.displayName,
        timestamp: new Date().toISOString()
      });

      setFoodInput('');
      setFoodImage(null);
      setAnalyzedFoodData(null);
    } catch (error) {
      console.error("Error saving food:", error);
      alert("Failed to save meal.");
    }
  };

  // Diet Analysis State
  const [showDietAnalysis, setShowDietAnalysis] = useState(false);
  const [dietAnalysisResult, setDietAnalysisResult] = useState('');
  const [isDietAnalyzing, setIsDietAnalyzing] = useState(false);

  const handleAnalyzeDiet = async (langInput) => {
    const lang = typeof langInput === 'string' ? langInput : 'he';


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
        setDietAnalysisResult(lang === 'he' ? "לא אכלת כלום היום! תרשום משהו קודם." : "You haven't logged any meals today yet! Log some food first.");
        setIsDietAnalyzing(false);
        return;
      }

      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });

      const prompt = `I have eaten the following today: ${todaysMeals}.
      Analyze my nutrition intake so far (calories, protein balance).
      Suggest what I should eat next to have a balanced day.
      Keep it brief, encouraging, and formatted with bullet points.
      Output Language: ${lang === 'he' ? 'Hebrew' : 'English'}
      IMPORTANT: Use gender-neutral language (in Hebrew use plural or avoid gendered verbs).
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      setDietAnalysisResult(text);

    } catch (error) {
      console.error("Error analyzing diet:", error);
      setDietAnalysisResult(lang === 'he' ? "שגיאה בניתוח התזונה." : "Failed to analyze diet. Please try again.");
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
  }


  const handleSaveBottleSize = async (newSize) => {
    if (!user) return;
    setSaveStatus('saving');
    try {
      const size = parseInt(newSize) || 750;
      await setDoc(doc(db, 'users', user.uid), { bottleSize: size }, { merge: true });
      setBottleSize(size);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Error saving bottle size:", error);
      alert("Failed to save bottle size.");
      setSaveStatus('idle');
    }
  };

  const analyzeChoreWithAI = async (name) => {
    try {
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
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
    console.log("Analyzing chore with AI...");
    aiData = await analyzeChoreWithAI(newChoreName);

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



  const myStats = user ? getScores(user.uid, 'day') : { pee: 0, poo: 0, drink: 0, chore: 0, food: 0, calories: 0, protein: 0 };
  console.log("DEBUG: myStats", myStats);
  console.log("DEBUG: activities sample", activities.slice(0, 3));
  console.log("DEBUG: user.uid", user?.uid);
  console.log("DEBUG: goals", goals);

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


  const currentUserMember = groupData?.members?.find(m => m.uid === user?.uid);
  const currentUserRole = currentUserMember?.role || 'parent';
  // Default to 'parent' if role is missing (legacy users) or explicitly set. New joiners are 'child'.
  // Actually, let's default to 'child' unless they are the first member (creator)?
  // For safety/legacy, let's assume if no role is set, they are 'parent' (since they created the group before this feature).
  const calculateStreak = (userId, memberGoals = null) => {
    const userActs = activities.filter(a => a.userId === userId);
    if (userActs.length === 0) return 0;

    // Group activities by date
    const actsByDate = {};
    userActs.forEach(a => {
      const date = getIsraelDateString(a.timestamp);
      if (!actsByDate[date]) actsByDate[date] = { pee: 0, poo: 0, drink: 0, chore: 0 };

      if (a.type === 'drink') actsByDate[date].drink += (a.amount || 0);
      if (a.type === 'pee') actsByDate[date].pee += (a.amount || 1);
      if (a.type === 'poo') actsByDate[date].poo += (a.amount || 1);
      if (a.type === 'chore') actsByDate[date].chore += 1;
    });

    // Define thresholds
    // Default goals: 10 pees, 1 poo, 1500ml water, 1 chore
    const thresholds = memberGoals || { pee: 10, poo: 1, drink: 1500, chore: 1 };

    const validDates = new Set();
    Object.keys(actsByDate).forEach(date => {
      const day = actsByDate[date];
      if (day.pee >= (thresholds.pee || 10) &&
        day.poo >= (thresholds.poo || 1) &&
        day.drink >= (thresholds.drink || 1500) &&
        day.chore >= (thresholds.chore || 1)) {
        validDates.add(date);
      }
    });

    let d = new Date();
    let dateStr = getIsraelDateString(d.toISOString());
    let currentStreak = 0;

    // If no activity today, check if streak is still active from yesterday
    if (!validDates.has(dateStr)) {
      d.setDate(d.getDate() - 1);
      dateStr = getIsraelDateString(d.toISOString());
      if (!validDates.has(dateStr)) return 0;
    }

    // Count backwards
    while (validDates.has(dateStr)) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
      dateStr = getIsraelDateString(d.toISOString());
    }

    return currentStreak;
  };

  return (
    <div key={refreshKey} className="animate-fade-in" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="main-content">
        {/* Header */}
        <div style={{ padding: '0 0 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px' }}>
              {t('hey')}, {user.displayName.split(' ')[0]} 👋
              {calculateStreak(user.uid) > 0 && <span style={{ marginLeft: '10px', fontSize: '24px' }}>🔥 {calculateStreak(user.uid)}</span>}
            </h1>
            <p style={{ marginTop: '5px' }}>
              {t('track_activities')}
              <span style={{ fontSize: '10px', color: '#ccc', marginLeft: '8px', opacity: 0.7 }}>v{__APP_VERSION__}</span>
            </p>
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
            <button
              onClick={() => setActiveTab('family')}
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
              ⚙️
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 0' }}>
          {activeTab === 'health' && (
            // ... (keep existing home tab)
            <div>
              {/* Health Detective Card */}
              <div style={{
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                borderRadius: '20px', padding: '20px', marginBottom: '20px',
                boxShadow: '0 4px 15px rgba(33, 150, 243, 0.2)',
                border: '1px solid #90caf9'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '24px' }}>🕵️‍♀️</div>
                  <h3 style={{ margin: 0, color: '#1565c0' }}>Health Detective</h3>
                </div>

                {healthInsight ? (
                  <div style={{ background: 'rgba(255,255,255,0.6)', padding: '15px', borderRadius: '15px', marginBottom: '15px' }}>
                    <p style={{ margin: 0, color: '#0d47a1', fontStyle: 'italic', lineHeight: '1.5' }}>"{healthInsight}"</p>
                  </div>
                ) : (
                  <p style={{ color: '#546e7a', marginBottom: '15px' }}>Let AI analyze your habits to find hidden patterns!</p>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => analyzeHealthPatterns('he')}
                    disabled={isAnalyzingHealth}
                    style={{
                      flex: 1,
                      background: isAnalyzingHealth ? '#cfd8dc' : '#1976d2',
                      color: 'white', border: 'none', padding: '10px', borderRadius: '25px',
                      fontWeight: 'bold', cursor: isAnalyzingHealth ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '14px'
                    }}
                  >
                    {isAnalyzingHealth ? '...' : '🇮🇱 נתח בעברית'}
                  </button>
                  <button
                    onClick={() => analyzeHealthPatterns('en')}
                    disabled={isAnalyzingHealth}
                    style={{
                      flex: 1,
                      background: isAnalyzingHealth ? '#cfd8dc' : '#1565c0',
                      color: 'white', border: 'none', padding: '10px', borderRadius: '25px',
                      fontWeight: 'bold', cursor: isAnalyzingHealth ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '14px'
                    }}
                  >
                    {isAnalyzingHealth ? '...' : '🇺🇸 Analyze (EN)'}
                  </button>
                </div>
              </div>



              {/* Today's Summary */}
              <div className="card">
                <h3 style={{ color: '#8b8b9e', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px' }}>Daily Summary</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '5px' }}>{ICONS.pee}</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>
                      {myStats.pee} <span style={{ fontSize: '14px', color: '#8b8b9e', fontWeight: '400' }}>/ {goals.pee || 10}</span>
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
                      {myStats.poo} <span style={{ fontSize: '14px', color: '#8b8b9e', fontWeight: '400' }}>/ {goals.poo || 1}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b8b9e' }}>Poop</div>
                  </div>
                </div>

                {/* Celebration Message */}
                {(() => {
                  const targetPee = goals.pee || 10;
                  const targetDrink = goals.drink || 1500;
                  const targetPoo = goals.poo || 1;

                  const peeMet = myStats.pee >= targetPee;
                  const drinkMet = myStats.drink >= targetDrink;
                  const pooMet = myStats.poo >= targetPoo;

                  return peeMet && drinkMet && pooMet;
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
                        onClick={() => { handleTrack('drink', bottleSize); setShowDrinkSelection(false); }}
                        style={{
                          padding: '20px', borderRadius: '16px', border: '2px solid #eee',
                          background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>🍾</span>
                        <span style={{ fontWeight: 'bold' }}>{t('bottle')}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>{bottleSize} ml</span>
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

              {/* Food Selection Modal */}
              {showFoodSelection && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', zIndex: 3000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '20px'
                }}>
                  <div className="card" style={{ width: '100%', maxWidth: '350px', textAlign: 'center' }}>
                    <h3>{t('what_did_you_eat')}</h3>

                    <textarea
                      value={foodInput}
                      onChange={(e) => setFoodInput(e.target.value)}
                      placeholder="e.g., Apple, Pizza, Salad..."
                      style={{
                        width: '100%', height: '80px', padding: '10px', borderRadius: '10px',
                        border: '1px solid #ddd', marginBottom: '20px', fontSize: '16px', resize: 'none'
                      }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <button
                        onClick={() => {
                          handleTrack('food', 1, { isHealthy: true, name: foodInput || 'Healthy Food' });
                          setShowFoodSelection(false);
                          setFoodInput('');
                        }}
                        style={{
                          background: '#e8f5e9', padding: '20px', borderRadius: '15px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>🥗</span>
                        <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>Healthy</span>
                        <span style={{ fontSize: '12px', color: '#666' }}>+1 Point</span>
                      </button>
                      <button
                        onClick={() => {
                          handleTrack('food', -1, { isHealthy: false, name: foodInput || 'Sweet/Junk' });
                          setShowFoodSelection(false);
                          setFoodInput('');
                        }}
                        style={{
                          background: '#ffebee', padding: '20px', borderRadius: '15px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '32px' }}>🍬</span>
                        <span style={{ fontWeight: 'bold', color: '#c62828' }}>Sweet/Junk</span>
                        <span style={{ fontSize: '12px', color: '#666' }}>-1 Point</span>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowFoodSelection(false)}
                      style={{ marginTop: '20px', padding: '10px', background: 'transparent', border: 'none', color: '#888' }}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}

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
            </div>
          )}






          {activeTab === 'home' && (
            <div className="animate-fade-in">
              {/* Sticky Notes Widget (Fridge Style) */}
              <div style={{
                marginBottom: '20px',
                background: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)', // Metallic fridge look
                padding: '20px',
                borderRadius: '20px',
                border: '4px solid #d0d0d0',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.05), 0 10px 20px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{
                    background: '#ff5252', color: 'white', padding: '5px 15px',
                    borderRadius: '20px', fontWeight: 'bold', fontSize: '14px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)', transform: 'rotate(-2deg)'
                  }}>
                    📌 Family Fridge
                  </div>
                  <button
                    onClick={() => setIsAddingNote(!isAddingNote)}
                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }}
                  >
                    {isAddingNote ? '❌' : '➕'}
                  </button>
                </div>



                {/* Sticky Notes */}


                {isAddingNote && (
                  <div className="card" style={{ padding: '15px', marginBottom: '15px', background: '#fff', transform: 'rotate(1deg)' }}>
                    <textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Write a new note..."
                      style={{
                        width: '100%', height: '60px', border: '1px solid #ddd', borderRadius: '8px',
                        padding: '10px', fontSize: '14px', marginBottom: '10px', resize: 'none'
                      }}
                    />
                    <button
                      onClick={handleAddNote}
                      style={{
                        width: '100%', padding: '10px', background: '#1a1a2e', color: 'white',
                        border: 'none', borderRadius: '8px', fontWeight: 'bold'
                      }}
                    >
                      Post Note
                    </button>
                  </div>
                )}

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '15px'
                }}>
                  {stickyNotes.length === 0 && !isAddingNote && (
                    <p style={{ color: '#888', fontSize: '14px', fontStyle: 'italic', gridColumn: '1/-1', textAlign: 'center', marginTop: '20px' }}>
                      The fridge is empty! Add a note.
                    </p>
                  )}
                  {stickyNotes.map(note => {
                    const creator = groupData?.members?.find(m => m.uid === note.addedBy);
                    return (
                      <div key={note.id} className={deletingNoteId === note.id ? 'animate-trash' : ''} style={{
                        background: note.color || '#fff9c4',
                        padding: '25px 15px 15px 15px', // Top padding for magnet
                        borderRadius: '2px',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.15)', // Lifted shadow
                        transform: `rotate(${Math.random() * 6 - 3}deg)`, // More rotation
                        position: 'relative',
                        minHeight: '110px',
                        display: 'flex', flexDirection: 'column'
                      }}>
                        {/* Magnet */}
                        <div style={{
                          position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: 'radial-gradient(circle at 30% 30%, #ff5252, #b71c1c)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4)',
                          zIndex: 2
                        }}></div>

                        <div style={{
                          fontFamily: 'Indie Flower, cursive, sans-serif',
                          fontSize: '14px', color: '#333', flex: 1, whiteSpace: 'pre-wrap', lineHeight: '1.3'
                        }}>
                          {note.text}
                        </div>

                        {/* Creator Info */}
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '5px', fontStyle: 'italic' }}>
                          - {creator ? creator.name : 'Unknown'}
                        </div>

                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          style={{
                            position: 'absolute', bottom: '5px', right: '5px',
                            background: 'none', border: 'none', fontSize: '10px',
                            cursor: 'pointer', opacity: 0.4, color: '#000'
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>

              </div>


              {/* Carousel / Arc Menu */}
              <div style={{ position: 'relative', height: '320px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', marginBottom: '10px' }}>

                {/* Central Progress Donut */}
                <div style={{ width: '140px', height: '140px', position: 'relative', zIndex: 10 }}>
                  {(() => {
                    const targetPee = Number(goals.pee) || 10;
                    const targetPoo = Number(goals.poo) || 1;
                    const targetDrink = Number(goals.drink) || 1500;

                    const peeProgress = Math.min(myStats.pee / targetPee, 1);
                    const pooProgress = Math.min(myStats.poo / targetPoo, 1);
                    const drinkProgress = Math.min(myStats.drink / targetDrink, 1);

                    const totalProgress = peeProgress + pooProgress + drinkProgress;
                    const remaining = Math.max(0, 3 - totalProgress);
                    const percentage = Math.round((totalProgress / 3) * 100);

                    const data = [
                      { name: 'Pee', value: peeProgress },
                      { name: 'Poo', value: pooProgress },
                      { name: 'Drink', value: drinkProgress },
                      { name: 'Remaining', value: remaining }
                    ];

                    return (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={60}
                              startAngle={90}
                              endAngle={-270}
                              dataKey="value"
                              stroke="none"
                            >
                              <Cell key="cell-pee" fill={COLORS.pee} />
                              <Cell key="cell-poo" fill={COLORS.poo} />
                              <Cell key="cell-drink" fill={COLORS.drink} />
                              <Cell key="cell-rem" fill="#f0f0f0" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexDirection: 'column',
                          pointerEvents: 'none'
                        }}>
                          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1a1a2e' }}>{percentage}%</div>
                          <div style={{ fontSize: '12px', color: '#888' }}>Daily Goal</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Orbiting Icons */}
                {['pee', 'poo', 'drink', 'food', 'chore'].map((type, index) => {
                  // Arc Layout: Top-Left to Top-Right
                  // Pee (Left), Poo (Top-Left), Drink (Top), Food (Top-Right), Chore (Right)
                  const angles = {
                    pee: 180,   // Left
                    poo: 225,   // Top-Left
                    drink: 270, // Top
                    food: 315,  // Top-Right
                    chore: 0    // Right
                  };

                  const radius = 110;
                  const angleRad = (angles[type] * Math.PI) / 180;
                  const x = radius * Math.cos(angleRad);
                  const y = radius * Math.sin(angleRad);

                  const isSelected = homeCategory === type;

                  return (
                    <button
                      key={type}
                      onClick={() => setHomeCategory(type)}
                      style={{
                        position: 'absolute',
                        left: `calc(50% + ${x}px)`,
                        top: `calc(50% + ${y}px)`,
                        transform: 'translate(-50%, -50%)',
                        width: isSelected ? '64px' : '50px',
                        height: isSelected ? '64px' : '50px',
                        borderRadius: '50%',
                        background: isSelected ? COLORS[type] : 'white',
                        border: isSelected ? `4px solid white` : `2px solid ${COLORS[type]}`,
                        boxShadow: isSelected ? `0 8px 20px ${COLORS[type]}66` : '0 4px 10px rgba(0,0,0,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isSelected ? '28px' : '22px',
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        zIndex: isSelected ? 30 : 20,
                        cursor: 'pointer'
                      }}
                    >
                      {ICONS[type]}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Action Area */}
              <div className="card" style={{ padding: '25px', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', transition: 'all 0.3s ease' }}>

                {/* Header for Action Area */}
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {ICONS[homeCategory]} {t(homeCategory) || homeCategory}
                  </h3>
                  <div style={{ fontSize: '14px', color: '#888' }}>
                    {homeCategory === 'drink' && `${myStats.drink} / ${goals.drink || 1500} ml`}
                    {homeCategory === 'pee' && `${myStats.pee} / ${goals.pee || 10} times`}
                    {homeCategory === 'poo' && `${myStats.poo} / ${goals.poo || 1} times`}
                    {homeCategory === 'food' && `${myStats.calories || 0} kcal`}
                    {homeCategory === 'chore' && `${myStats.chore} / ${goals.chore || 1} pts`}
                  </div>
                </div>

                {/* Content based on Category */}
                {homeCategory === 'drink' && (
                  <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
                    <button
                      onClick={() => handleTrack('drink', 180)}
                      style={{ flex: 1, padding: '20px', borderRadius: '16px', background: '#e1f5fe', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}
                    >
                      <span style={{ fontSize: '32px' }}>🥛</span>
                      <span style={{ fontWeight: 'bold' }}>Cup</span>
                      <span style={{ fontSize: '12px', color: '#666' }}>180 ml</span>
                    </button>
                    <button
                      onClick={() => handleTrack('drink', bottleSize)}
                      style={{ flex: 1, padding: '20px', borderRadius: '16px', background: '#e3f2fd', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}
                    >
                      <span style={{ fontSize: '32px' }}>🍾</span>
                      <span style={{ fontWeight: 'bold' }}>Bottle</span>
                      <span style={{ fontSize: '12px', color: '#666' }}>{bottleSize} ml</span>
                    </button>
                  </div>
                )}

                {(homeCategory === 'pee' || homeCategory === 'poo') && (
                  <button
                    onClick={() => handleTrack(homeCategory)}
                    style={{
                      width: '100%', padding: '20px', borderRadius: '20px',
                      background: `linear-gradient(135deg, ${COLORS[homeCategory]}, ${COLORS[homeCategory]}dd)`,
                      color: 'white', border: 'none', fontSize: '20px', fontWeight: 'bold',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px',
                      boxShadow: `0 10px 20px ${COLORS[homeCategory]}44`
                    }}
                  >
                    <span style={{ fontSize: '32px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {ICONS[homeCategory]}
                    </span>
                    <span>Log {t(homeCategory)}</span>
                  </button>
                )}

                {homeCategory === 'food' && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button
                      onClick={() => setShowFoodSelection(true)}
                      style={{
                        width: '100%', padding: '15px', borderRadius: '16px',
                        background: '#e8f5e9', color: '#2e7d32', border: '2px dashed #4caf50',
                        fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                      }}
                    >
                      <span>📸</span> {t('add_meal')}
                    </button>

                    {/* Recent Meals Mini-List */}
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
                      {activities.filter(a => a.type === 'food' && a.userId === user.uid).slice(0, 3).map(meal => (
                        <div key={meal.id} style={{ minWidth: '100px', padding: '10px', background: '#f5f5f5', borderRadius: '12px', fontSize: '12px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{meal.details?.name || meal.input || 'Meal'}</div>
                          <div style={{ color: '#888' }}>{meal.details?.totalCalories || 0} cal</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {homeCategory === 'chore' && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {chores.slice(0, 4).map(chore => (
                        <button
                          key={chore.id}
                          onClick={() => handleTrack('chore', chore.points, { name: chore.name })}
                          style={{
                            padding: '15px', borderRadius: '12px', background: '#f3e5f5', border: 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px'
                          }}
                        >
                          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{chore.name}</span>
                          <span style={{ fontSize: '12px', color: '#8e24aa' }}>+{chore.points} pts</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowAllChores(true)} style={{ background: 'none', border: 'none', color: '#8e24aa', textDecoration: 'underline' }}>
                      View All Chores
                    </button>
                  </div>
                )}

              </div>









            </div >
          )}

          {
            activeTab === 'trends' && (
              <div className="card" style={{ padding: '20px 10px', minHeight: '80vh' }}>
                {/* Header & Time Range */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px 20px 10px' }}>
                  <h3 style={{ margin: 0 }}>{t('leaderboard')} 🏆</h3>
                  <div style={{ background: '#f5f7fa', padding: '4px', borderRadius: '20px', display: 'flex' }}>
                    <button
                      onClick={() => setTrendRange('week')}
                      style={{
                        padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                        background: trendRange === 'week' ? 'white' : 'transparent',
                        color: trendRange === 'week' ? '#1a1a2e' : '#888',
                        boxShadow: trendRange === 'week' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                        border: 'none'
                      }}
                    >{t('week')}</button>
                    <button
                      onClick={() => setTrendRange('month')}
                      style={{
                        padding: '5px 15px', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold',
                        background: trendRange === 'month' ? 'white' : 'transparent',
                        color: trendRange === 'month' ? '#1a1a2e' : '#888',
                        boxShadow: trendRange === 'month' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                        border: 'none'
                      }}
                    >{t('month')}</button>
                  </div>
                </div>

                {/* Category Selectors */}
                <div style={{ display: 'flex', gap: '10px', padding: '0 10px 20px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {['drink', 'pee', 'poo', 'chore'].map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedTrendCategory(type)}
                      style={{
                        padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold',
                        background: selectedTrendCategory === type ? COLORS[type] : '#f0f0f0',
                        color: selectedTrendCategory === type ? 'white' : '#888',
                        border: 'none',
                        boxShadow: selectedTrendCategory === type ? '0 4px 10px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {ICONS[type]} {t(type)}
                    </button>
                  ))}
                </div>

                {/* Podium Logic */}
                {(() => {
                  // 1. Filter Data
                  const now = new Date();
                  const startDate = new Date();
                  if (trendRange === 'week') startDate.setDate(now.getDate() - 7);
                  else startDate.setMonth(now.getMonth() - 1);

                  const relevantActs = activities.filter(a => new Date(a.timestamp) >= startDate);

                  // 2. Calculate Scores
                  const scores = {};
                  const choreBreakdowns = {};
                  groupData?.members?.forEach(m => {
                    scores[m.uid] = 0;
                    choreBreakdowns[m.uid] = {};
                  });

                  relevantActs.forEach(a => {
                    if (a.type === selectedTrendCategory) {
                      if (a.type === 'drink') scores[a.userId] += (a.amount || 0) / 1000; // Liters
                      else if (a.type === 'chore') {
                        const pts = (a.amount || 0);
                        scores[a.userId] += pts;
                        const cName = a.details?.name || 'Unknown';
                        if (!choreBreakdowns[a.userId][cName]) choreBreakdowns[a.userId][cName] = 0;
                        choreBreakdowns[a.userId][cName] += pts;
                      }
                      else scores[a.userId] += 1; // Count
                    }
                  });

                  // 3. Sort
                  const sortedMembers = Object.entries(scores)
                    .sort(([, a], [, b]) => b - a)
                    .map(([uid, score]) => {
                      const member = groupData?.members?.find(m => m.uid === uid);
                      return { ...member, score, choreBreakdown: choreBreakdowns[uid] };
                    });

                  const top3 = sortedMembers.slice(0, 3);
                  const rest = sortedMembers.slice(3);
                  const unit = selectedTrendCategory === 'drink' ? 'L' : selectedTrendCategory === 'chore' ? 'pts' : '';

                  // Helper for colors
                  const stringToColor = (str) => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                      hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    const hue = Math.abs(hash % 360);
                    return `hsl(${hue}, 70%, 50%)`;
                  };

                  const renderPodiumItem = (member, rank, height, gradientColors) => {
                    if (!member) return <div style={{ width: '30%' }} />;

                    const isChore = selectedTrendCategory === 'chore';

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: rank === 1 ? '35%' : '30%', zIndex: rank === 1 ? 2 : 1 }}>
                        <div style={{ marginBottom: '35px', fontWeight: 'bold', color: rank === 1 ? '#f1c40f' : rank === 2 ? '#7f8c8d' : '#d35400' }}>
                          {member.name.split(' ')[0]}
                        </div>

                        <div style={{
                          width: '100%', height, position: 'relative',
                          boxShadow: `0 10px 20px ${rank === 1 ? 'rgba(241, 196, 15, 0.3)' : 'rgba(0,0,0,0.1)'}`
                        }}>
                          {/* Stacks */}
                          <div style={{
                            position: 'absolute', inset: 0, borderRadius: '15px 15px 0 0', overflow: 'hidden',
                            display: 'flex', flexDirection: 'column-reverse', background: '#f0f0f0'
                          }}>
                            {isChore ? (
                              Object.entries(member.choreBreakdown || {}).map(([cName, pts]) => (
                                <div
                                  key={cName}
                                  title={`${cName}: ${pts} pts`}
                                  onClick={(e) => { e.stopPropagation(); alert(`${cName}: ${pts} pts`); }}
                                  style={{
                                    height: `${(pts / (member.score || 1)) * 100}%`,
                                    background: stringToColor(cName),
                                    width: '100%',
                                    cursor: 'pointer'
                                  }}
                                />
                              ))
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: `linear-gradient(to top, ${gradientColors[0]}, ${gradientColors[1]})` }} />
                            )}
                          </div>

                          {/* Content Overlay */}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', pointerEvents: 'none' }}>
                            <div style={{ fontSize: rank === 1 ? '32px' : '24px', marginBottom: '5px' }}>{rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}</div>
                            <div style={{ fontWeight: '900', fontSize: rank === 1 ? '20px' : '16px', color: '#2c3e50', textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                              {Math.round(member.score * 10) / 10}<span style={{ fontSize: '10px' }}>{unit}</span>
                            </div>
                          </div>

                          {/* Avatar */}
                          <div style={{
                            width: rank === 1 ? '50px' : '40px', height: rank === 1 ? '50px' : '40px',
                            borderRadius: '50%', background: rank === 1 ? '#f1c40f' : rank === 2 ? '#bdc3c7' : '#d35400',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold', fontSize: rank === 1 ? '20px' : '14px',
                            position: 'absolute', top: rank === 1 ? '-25px' : '-20px', left: '50%', transform: 'translateX(-50%)',
                            border: '3px solid white', zIndex: 10
                          }}>
                            {member.name[0]}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* The Podium */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '220px', marginBottom: '30px', gap: '10px' }}>
                        {renderPodiumItem(top3[1], 2, '100px', ['#bdc3c7', '#ecf0f1'])}
                        {renderPodiumItem(top3[0], 1, '140px', ['#f1c40f', '#f9e79f'])}
                        {renderPodiumItem(top3[2], 3, '70px', ['#e67e22', '#f39c12'])}
                      </div>

                      {/* The Rest List */}
                      <div style={{ background: 'white', borderRadius: '20px', padding: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: '#888', fontSize: '14px' }}>Full Rankings</h4>
                        {sortedMembers.map((member, index) => (
                          <div key={member.uid} style={{
                            display: 'flex', alignItems: 'center', padding: '10px', marginBottom: '8px',
                            background: index < 3 ? '#fff' : '#f9f9f9', borderRadius: '12px',
                            border: index < 3 ? '1px solid #eee' : 'none'
                          }}>
                            <div style={{ width: '25px', fontWeight: 'bold', color: '#888' }}>#{index + 1}</div>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%', background: `hsl(${index * 137.5 % 360}, 70%, 50%)`,
                              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '10px', fontWeight: 'bold'
                            }}>
                              {member.name[0]}
                            </div>
                            <div style={{ flex: 1, fontWeight: '600' }}>{member.name}</div>
                            <div style={{ fontWeight: 'bold', color: '#333' }}>
                              {Math.round(member.score * 10) / 10} <span style={{ fontSize: '12px', color: '#888' }}>{unit}</span>
                            </div>
                            {/* Mini Bar */}
                            <div style={{ width: '80px', height: '8px', background: '#eee', borderRadius: '4px', marginLeft: '10px', overflow: 'hidden', display: 'flex' }}>
                              {selectedTrendCategory === 'chore' ? (
                                Object.entries(member.choreBreakdown || {}).map(([cName, pts]) => (
                                  <div
                                    key={cName}
                                    title={`${cName}: ${pts} pts`}
                                    onClick={(e) => { e.stopPropagation(); alert(`${cName}: ${pts} pts`); }}
                                    style={{
                                      width: `${(pts / (member.score || 1)) * 100}%`,
                                      height: '100%',
                                      background: stringToColor(cName),
                                      cursor: 'pointer'
                                    }}
                                  />
                                ))
                              ) : (
                                <div style={{
                                  width: `${(member.score / (sortedMembers[0].score || 1)) * 100}%`,
                                  height: '100%', background: COLORS[selectedTrendCategory] || '#333', borderRadius: '3px'
                                }} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )
          }

          {
            activeTab === 'chores' && (
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
            )
          }

          {
            activeTab === 'food' && (
              <div className="card">
                <h3 style={{ marginBottom: '20px' }}>{t('food_tracker')} 🍎</h3>

                {/* Daily Progress */}
                <div style={{ marginBottom: '20px', padding: '15px', background: '#fff', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                  <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>Daily Targets {currentUserWeight ? `(${currentUserWeight}kg)` : '(Default)'}</h4>

                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px', fontWeight: '500' }}>
                      <span>Calories</span>
                      <span>{myStats.calories} / {dailyCaloriesTarget}</span>
                    </div>
                    <div style={{ height: '12px', background: '#f5f5f5', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min((myStats.calories / dailyCaloriesTarget) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #ff8a65, #ff7043)', borderRadius: '6px',
                        transition: 'width 0.5s ease-out'
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', textAlign: 'right' }}>
                      {Math.max(0, dailyCaloriesTarget - myStats.calories)} remaining
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '5px', fontWeight: '500' }}>
                      <span>Protein</span>
                      <span>{myStats.protein}g / {dailyProteinTarget}g</span>
                    </div>
                    <div style={{ height: '12px', background: '#f5f5f5', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min((myStats.protein / dailyProteinTarget) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #64b5f6, #42a5f5)', borderRadius: '6px',
                        transition: 'width 0.5s ease-out'
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', textAlign: 'right' }}>
                      {Math.max(0, dailyProteinTarget - myStats.protein)}g remaining
                    </div>
                  </div>
                </div>

                {/* Food Trends Chart */}
                <div style={{ marginBottom: '30px', padding: '10px', background: '#fff', borderRadius: '12px', border: '1px solid #eee' }}>
                  <h4 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>{t('last_7_days')}</h4>
                  <div style={{ height: '200px', width: '100%', fontSize: '10px', minWidth: 0 }}>
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



                {/* Add Meal Button */}
                <button
                  onClick={() => setShowFoodSelection(true)}
                  style={{
                    width: '100%', padding: '20px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)',
                    color: 'white', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                    boxShadow: '0 10px 20px rgba(67, 160, 71, 0.3)',
                    marginBottom: '20px', cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '24px', fontWeight: 'bold' }}>+</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{t('add_meal')}</span>
                </button>

                {/* Add Meal Modal */}
                {showFoodSelection && (
                  <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', zIndex: 3000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '20px', backdropFilter: 'blur(8px)'
                  }} onClick={() => setShowFoodSelection(false)}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', textAlign: 'center', padding: '30px' }} onClick={e => e.stopPropagation()}>
                      <h3 style={{ marginBottom: '25px', fontSize: '22px' }}>{t('what_did_you_eat')}</h3>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '25px' }}>
                        <textarea
                          value={foodInput}
                          onChange={(e) => setFoodInput(e.target.value)}
                          placeholder={t('describe_meal')}
                          style={{
                            width: '100%', height: '120px', padding: '15px', borderRadius: '15px',
                            border: '2px solid #eee', fontSize: '18px', resize: 'none',
                            background: '#f9f9f9', fontFamily: 'inherit'
                          }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageSelect}
                          />
                          <button
                            onClick={() => fileInputRef.current.click()}
                            style={{
                              background: foodImage ? '#e8f5e9' : '#f5f5f5',
                              color: foodImage ? '#2e7d32' : '#666',
                              border: foodImage ? '2px solid #4caf50' : '2px dashed #ccc',
                              borderRadius: '15px', padding: '15px 30px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                              fontSize: '16px', fontWeight: '600', width: '100%', cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: '24px' }}>{foodImage ? '✅' : '📷'}</span>
                            <span>{foodImage ? t('image_attached') : t('add_photo')}</span>
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          handleAnalyzeFood();
                        }}
                        disabled={isAnalyzing || (!foodInput && !foodImage)}
                        style={{
                          width: '100%', padding: '18px', borderRadius: '18px',
                          background: (isAnalyzing || (!foodInput && !foodImage)) ? '#e0e0e0' : 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)',
                          color: (isAnalyzing || (!foodInput && !foodImage)) ? '#999' : 'white',
                          border: 'none', fontWeight: 'bold', fontSize: '18px',
                          cursor: (isAnalyzing || (!foodInput && !foodImage)) ? 'not-allowed' : 'pointer',
                          boxShadow: (isAnalyzing || (!foodInput && !foodImage)) ? 'none' : '0 10px 20px rgba(67, 160, 71, 0.3)'
                        }}
                      >
                        {isAnalyzing ? t('analyzing') : t('analyze_food')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Food Analysis Confirmation Modal */}
                {analyzedFoodData && (
                  <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                    backdropFilter: 'blur(5px)'
                  }} onClick={() => setAnalyzedFoodData(null)}>
                    <div style={{
                      background: 'white', padding: '25px', borderRadius: '20px', width: '90%', maxWidth: '350px',
                      maxHeight: '80vh', overflowY: 'auto'
                    }} onClick={e => e.stopPropagation()}>
                      <h3 style={{ marginTop: 0 }}>{t('confirm_meal')}</h3>

                      {analyzedFoodData.image && (
                        <img src={analyzedFoodData.image} alt="Meal" style={{ width: '100%', borderRadius: '12px', marginBottom: '15px', maxHeight: '200px', objectFit: 'cover' }} />
                      )}

                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e' }}>
                          {analyzedFoodData.data.totalCalories} cal
                        </div>
                        <div style={{ fontSize: '14px', color: '#666' }}>
                          {analyzedFoodData.data.totalProtein}g protein
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                        {analyzedFoodData.data.items?.map((item, idx) => (
                          <div key={idx} style={{ background: '#f5f7fa', padding: '10px', borderRadius: '8px', fontSize: '14px' }}>
                            <span style={{ marginRight: '8px' }}>{item.emoji}</span>
                            <strong>{item.name}</strong>
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                              {item.calories} cal • {item.protein}g protein
                            </div>
                          </div>
                        ))}
                      </div>

                      {analyzedFoodData.data.feedback && (
                        <div style={{ fontSize: '13px', color: '#2e7d32', background: '#e8f5e9', padding: '10px', borderRadius: '8px', marginBottom: '20px', fontStyle: 'italic' }}>
                          "{analyzedFoodData.data.feedback}"
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <button
                          onClick={() => setAnalyzedFoodData({ ...analyzedFoodData, data: { ...analyzedFoodData.data, isHealthy: true } })}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid #4caf50',
                            background: analyzedFoodData.data.isHealthy ? '#e8f5e9' : 'white',
                            color: analyzedFoodData.data.isHealthy ? '#2e7d32' : '#666', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          {t('healthy_plus_one')}
                        </button>
                        <button
                          onClick={() => setAnalyzedFoodData({ ...analyzedFoodData, data: { ...analyzedFoodData.data, isHealthy: false } })}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid #ef5350',
                            background: !analyzedFoodData.data.isHealthy ? '#ffebee' : 'white',
                            color: !analyzedFoodData.data.isHealthy ? '#c62828' : '#666', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          {t('junk_minus_one')}
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => setAnalyzedFoodData(null)}
                          style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#eee', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          {t('cancel')}
                        </button>
                        <button
                          onClick={handleConfirmFood}
                          style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: COLORS.food, color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          {t('add_meal')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Chef Section */}
                <div className="card" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', border: '1px solid #ffcc80' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <div style={{ fontSize: '24px' }}>👨‍🍳</div>
                    <h3 style={{ margin: 0, color: '#e65100' }}>AI Chef</h3>
                  </div>

                  {!suggestedRecipe ? (
                    <div>
                      <p style={{ color: '#bf360c', fontSize: '14px', marginBottom: '15px' }}>
                        Not sure what to eat? I can suggest a dinner based on what you've had today!
                      </p>
                      <button
                        onClick={handleSuggestRecipe}
                        disabled={isSuggestingRecipe}
                        style={{
                          width: '100%', padding: '12px', background: '#e65100', color: 'white',
                          border: 'none', borderRadius: '12px', fontWeight: 'bold',
                          cursor: isSuggestingRecipe ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                      >
                        {isSuggestingRecipe ? 'Thinking...' : '🍽️ Suggest Dinner'}
                      </button>
                    </div>
                  ) : (
                    <div className="animate-fade-in">
                      <h4 style={{ margin: '0 0 5px 0', color: '#d84315' }}>{suggestedRecipe.name}</h4>
                      <p style={{ fontSize: '13px', color: '#bf360c', fontStyle: 'italic', marginBottom: '15px' }}>{suggestedRecipe.description}</p>

                      <div style={{ background: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                        <strong style={{ fontSize: '12px', color: '#d84315' }}>Ingredients:</strong>
                        <ul style={{ margin: '5px 0 0 20px', padding: 0, fontSize: '13px', color: '#3e2723' }}>
                          {suggestedRecipe.ingredients.map((ing, i) => (
                            <li key={i}>
                              <strong>{ing.item}</strong> <span style={{ color: '#bf360c' }}>{ing.amount}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => setSuggestedRecipe(null)}
                          style={{ flex: 1, padding: '8px', background: 'white', border: '1px solid #e65100', color: '#e65100', borderRadius: '8px', fontWeight: 'bold' }}
                        >
                          Close
                        </button>
                        <button
                          onClick={() => handleAddToShoppingList(suggestedRecipe.ingredients)}
                          style={{ flex: 2, padding: '8px', background: '#e65100', border: 'none', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}
                        >
                          🛒 Add to List
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shopping List Section */}
                <div className="card" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0 }}>Shopping List 🛒</h3>
                    <span style={{ fontSize: '12px', color: '#888', background: '#f5f5f5', padding: '2px 8px', borderRadius: '10px' }}>
                      {shoppingList.filter(i => !i.checked).length} items
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <input
                      type="text"
                      placeholder="Add item..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddManualShoppingItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f9f9f9' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {shoppingList.length === 0 && <p style={{ color: '#ccc', textAlign: 'center', fontSize: '14px' }}>List is empty</p>}
                    {shoppingList.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: item.checked ? '#f0f0f0' : 'white', borderRadius: '8px', borderBottom: '1px solid #eee' }}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => handleToggleShoppingItem(item.id, item.checked)}
                          style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />

                        {editingShoppingItem === item.id ? (
                          <div style={{ flex: 1, display: 'flex', gap: '5px' }}>
                            <input
                              type="text"
                              value={editingShoppingText}
                              onChange={(e) => setEditingShoppingText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdateShoppingItem()}
                              autoFocus
                              style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #42a5f5' }}
                            />
                            <button onClick={handleUpdateShoppingItem} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✅</button>
                            <button onClick={() => setEditingShoppingItem(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>❌</button>
                          </div>
                        ) : (
                          <span
                            onClick={() => {
                              setEditingShoppingItem(item.id);
                              setEditingShoppingText(item.name);
                            }}
                            style={{ flex: 1, textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#aaa' : '#333', cursor: 'text' }}
                          >
                            {item.name}
                          </span>
                        )}

                        <button onClick={() => handleDeleteShoppingItem(item.id)} style={{ color: '#ff5252', fontSize: '18px', padding: '0 5px', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', color: '#666', margin: 0 }}>{t('todays_meals')}</h4>
                  <div style={{ background: '#f5f7fa', padding: '3px', borderRadius: '12px', display: 'flex' }}>
                    <button
                      onClick={() => setFoodFilter('mine')}
                      style={{
                        padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                        background: foodFilter === 'mine' ? 'white' : 'transparent',
                        color: foodFilter === 'mine' ? '#1a1a2e' : '#888',
                        boxShadow: foodFilter === 'mine' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >My Food</button>
                    <button
                      onClick={() => setFoodFilter('all')}
                      style={{
                        padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                        background: foodFilter === 'all' ? 'white' : 'transparent',
                        color: foodFilter === 'all' ? '#1a1a2e' : '#888',
                        boxShadow: foodFilter === 'all' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >Everyone</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activities.filter(a => a.type === 'food' && getIsraelDateString(a.timestamp) === getIsraelDateString() && (foodFilter === 'all' || a.userId === user?.uid)).length === 0 && (
                    <p style={{ color: '#aaa', fontSize: '14px', fontStyle: 'italic' }}>{t('no_meals')}</p>
                  )}
                  {activities
                    .filter(a => a.type === 'food' && getIsraelDateString(a.timestamp) === getIsraelDateString() && (foodFilter === 'all' || a.userId === user?.uid))
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
                        {meal.userId === user?.uid && (
                          <button
                            onClick={() => handleDeleteActivity(meal.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                          >
                            🗑️
                          </button>
                        )}
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
                    <span>✨</span> {isDietAnalyzing ? t('analyzing_diet') : t('analyze_diet_suggest')}
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
            )
          }

          {
            activeTab === 'leaderboard' && (
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
            )
          }

          {
            activeTab === 'family' && (
              <div className="card" style={{ textAlign: 'center', padding: '20px', paddingBottom: '80px' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>⚙️</div>
                <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>{t('settings')} & {t('family')}</h3>

                {/* Family Section */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#f5f7fa', borderRadius: '16px' }}>
                  <h4 style={{ marginBottom: '15px', color: '#666', fontSize: '14px', textAlign: 'left' }}>Family Group</h4>
                  <div style={{ background: 'white', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #eee' }}>
                    <p style={{ marginBottom: '5px', fontSize: '12px', color: '#888' }}>{t('group_code')}</p>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a2e', letterSpacing: '2px' }}>{groupCode}</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {groupData?.members?.map(member => (
                      <div key={member.uid} onClick={() => handleMemberClick(member)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'white', borderRadius: '10px', border: '1px solid #eee', cursor: 'pointer' }}>
                        {member.photoURL ? <img src={member.photoURL} style={{ width: '30px', height: '30px', borderRadius: '50%' }} /> : <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>{member.name?.[0]}</div>}
                        <div style={{ flex: 1, textAlign: 'left', fontWeight: '500', fontSize: '14px' }}>{member.name} {member.uid === user.uid && '(You)'}</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{member.role}</div>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleShare} style={{ marginTop: '15px', width: '100%', padding: '10px', background: '#1a1a2e', color: 'white', borderRadius: '10px', fontWeight: 'bold' }}>
                    {t('invite_family')} 📤
                  </button>
                </div>

                {/* Profile Section */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#fff', borderRadius: '16px', border: '1px solid #eee', textAlign: 'left' }}>
                  <h4 style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>My Profile</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    {user.photoURL ? <img src={user.photoURL} style={{ width: '50px', height: '50px', borderRadius: '50%' }} /> : <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#1a1a2e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{user.displayName?.[0]}</div>}
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{user.displayName}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{user.email}</div>
                    </div>
                  </div>

                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Weight (kg)</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="number" value={currentUserWeight || ''} onChange={(e) => handleUpdateWeight(e.target.value)} placeholder="e.g. 70" style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f9f9f9' }} />
                  </div>
                </div>

                {/* Preferences */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#fff', borderRadius: '16px', border: '1px solid #eee', textAlign: 'left' }}>
                  <h4 style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>Preferences</h4>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Language</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setLanguage('en')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #eee', background: language === 'en' ? '#e3f2fd' : 'white', color: language === 'en' ? '#1565c0' : '#333', fontWeight: 'bold' }}>🇺🇸 English</button>
                      <button onClick={() => setLanguage('he')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #eee', background: language === 'he' ? '#e3f2fd' : 'white', color: language === 'he' ? '#1565c0' : '#333', fontWeight: 'bold' }}>🇮🇱 Hebrew</button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: '#333' }}>My Bottle Size (ml)</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input type="number" value={bottleSize} onChange={(e) => setBottleSize(e.target.value === '' ? '' : parseInt(e.target.value))} placeholder="e.g. 750" style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #ddd', background: '#f9f9f9' }} />
                      <button onClick={() => handleSaveBottleSize(bottleSize)} disabled={saveStatus === 'saving'} style={{ background: saveStatus === 'saved' ? '#4caf50' : '#1a1a2e', color: 'white', border: 'none', padding: '0 20px', borderRadius: '10px', fontWeight: 'bold' }}>{saveStatus === 'saved' ? '✓' : 'Save'}</button>
                    </div>
                  </div>
                </div>

                {/* Daily Goals */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#fff', borderRadius: '16px', border: '1px solid #eee', textAlign: 'left' }}>
                  <h4 style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>Daily Goals 🎯</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {['pee', 'drink', 'poo'].map(type => (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${COLORS[type]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{ICONS[type]}</div>
                          <div style={{ fontWeight: '600', textTransform: 'capitalize', fontSize: '14px' }}>{t(type)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#f5f7fa', padding: '4px', borderRadius: '12px' }}>
                          <button onClick={() => handleSaveGoals({ ...goals, [type]: Math.max(0, (goals[type] || 0) - (type === 'drink' ? 250 : 1)) })} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'white', border: 'none', fontWeight: 'bold' }}>-</button>
                          <span style={{ width: '40px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold' }}>{goals[type] || 0}</span>
                          <button onClick={() => handleSaveGoals({ ...goals, [type]: (goals[type] || 0) + (type === 'drink' ? 250 : 1) })} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'white', border: 'none', fontWeight: 'bold' }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What's New */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#e3f2fd', borderRadius: '16px', border: '1px solid #bbdefb', textAlign: 'left' }}>
                  <h4 style={{ marginBottom: '10px', color: '#1565c0', fontSize: '14px' }}>What's New 🚀</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px', color: '#333', lineHeight: '1.6' }}>
                    <li><strong>Safari Login Fix:</strong> Improved login reliability.</li>
                    <li><strong>Reaction Names:</strong> See who reacted to your activities!</li>
                    <li><strong>Food Analysis:</strong> AI-powered food tracking with photos.</li>
                    <li><strong>Settings Page:</strong> Dedicated page for better configuration.</li>
                  </ul>
                </div>

                {/* System */}
                <div style={{ marginBottom: '25px', padding: '15px', background: '#fff', borderRadius: '16px', border: '1px solid #eee', textAlign: 'left' }}>
                  <h4 style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>System</h4>
                  <button onClick={() => window.location.reload()} style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '14px' }}>🔄 Refresh App Data</button>
                  <button onClick={handleExitGroup} style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '14px' }}>{t('change_group')}</button>
                  {currentUserRole === 'parent' && (
                    <button onClick={handleResetData} style={{ width: '100%', padding: '12px', marginBottom: '10px', background: '#ffebee', color: '#d32f2f', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '14px' }}>{t('reset_data')} 🗑️</button>
                  )}
                  <button onClick={handleLogout} style={{ width: '100%', padding: '12px', background: '#ffebee', color: '#d32f2f', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '14px' }}>🚪 {t('logout')}</button>
                </div>

                <div style={{ textAlign: 'center', color: '#aaa', fontSize: '12px', marginTop: '20px' }}>
                  Activity Tracker v{__APP_VERSION__}<br />
                  Group: {groupCode}
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

                      {/* Badges Section */}
                      {(currentUserRole === 'parent' || selectedMemberDetails.uid === user.uid) && (
                        <div style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '12px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Weight (kg)</label>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                              type="number"
                              value={memberWeight}
                              onChange={(e) => setMemberWeight(e.target.value)}
                              placeholder="e.g. 70"
                              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
                            />
                            <button
                              onClick={handleSaveWeight}
                              style={{ background: '#1a1a2e', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold' }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}

                      {memberBadges.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4 style={{ marginBottom: '10px', color: '#666' }}>Badges 🏆</h4>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {memberBadges.map(badgeId => {
                              const badge = BADGES.find(b => b.id === badgeId);
                              if (!badge) return null;
                              return (
                                <div key={badgeId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px' }} title={badge.name + ': ' + badge.description}>
                                  <div style={{ fontSize: '30px', marginBottom: '5px' }}>{badge.icon}</div>
                                  <div style={{ fontSize: '10px', textAlign: 'center', lineHeight: '1.2' }}>{badge.name}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

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
                                {/* Reactions */}
                                {(act.type === 'chore' || act.type === 'food') && (
                                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                    {['👍', '❤️', '👎'].map(emoji => {
                                      const hasReacted = act.reactions?.[user.uid] === emoji;
                                      const count = Object.values(act.reactions || {}).filter(r => r === emoji).length;
                                      return (
                                        <button
                                          key={emoji}
                                          onClick={(e) => { e.stopPropagation(); handleReaction(act.id, hasReacted ? null : emoji); }}
                                          style={{
                                            background: hasReacted ? '#e3f2fd' : 'transparent',
                                            border: '1px solid #eee', borderRadius: '12px',
                                            padding: '2px 6px', fontSize: '12px', cursor: 'pointer',
                                            opacity: hasReacted ? 1 : 0.6
                                          }}
                                        >
                                          {emoji} {count > 0 && count}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
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
            )
          }
        </div >

      </div >

      {/* Badge Celebration Modal */}
      {
        newBadge && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(5px)'
          }} onClick={() => setNewBadge(null)}>
            <div style={{
              background: 'linear-gradient(135deg, #fff 0%, #f0f0f0 100%)',
              padding: '40px', borderRadius: '30px',
              width: '80%', maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '4px solid #ffd700',
              animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '80px', marginBottom: '20px', filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.2))' }}>{newBadge.icon}</div>
              <h2 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '28px', fontWeight: '900' }}>New Badge Unlocked!</h2>
              <h3 style={{ margin: '0 0 15px 0', color: '#e65100', fontSize: '24px' }}>{newBadge.name}</h3>
              <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.5' }}>{newBadge.description}</p>
              <button
                onClick={() => setNewBadge(null)}
                style={{
                  marginTop: '30px',
                  background: 'linear-gradient(45deg, #FFD700, #FFA500)',
                  color: 'white', border: 'none',
                  padding: '15px 40px', borderRadius: '50px',
                  fontSize: '18px', fontWeight: 'bold',
                  cursor: 'pointer', boxShadow: '0 5px 15px rgba(255, 165, 0, 0.4)',
                  transform: 'scale(1)', transition: 'transform 0.2s'
                }}
              >
                Awesome! 🤩
              </button>
            </div>
          </div>
        )
      }




      {/* Floating Chat Button */}
      {
        user && groupCode && (
          <>
            <button
              onClick={() => setShowChat(!showChat)}
              style={{
                position: 'fixed', bottom: '110px', right: '20px',
                width: '60px', height: '60px', borderRadius: '50%',
                background: '#1a1a2e', color: 'white', border: 'none',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2001, cursor: 'pointer'
              }}
            >
              💬
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  background: '#ff5252', color: 'white', borderRadius: '50%',
                  width: '24px', height: '24px', fontSize: '12px', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid white'
                }}>
                  {unreadCount}
                </div>
              )}
            </button>

            {/* Chat Window */}
            {showChat && (
              <div className="animate-fade-in" style={{
                position: 'fixed', bottom: '180px', right: '20px',
                width: '300px', height: '400px', background: 'white',
                borderRadius: '20px', boxShadow: '0 5px 25px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                zIndex: 2001, border: '1px solid #eee'
              }}>
                <div style={{ padding: '15px', background: '#1a1a2e', color: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0 }}>Family Chat</h4>
                    <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}>×</button>
                  </div>
                  {/* Recipient Selector */}
                  <select
                    value={chatRecipient}
                    onChange={(e) => setChatRecipient(e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '8px', border: 'none',
                      background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '14px', outline: 'none'
                    }}
                  >
                    <option value="all" style={{ color: 'black' }}>📣 Everyone</option>
                    {(groupData?.members || []).filter(m => m.uid !== user.uid).map(m => (
                      <option key={m.uid} value={m.uid} style={{ color: 'black' }}>🤫 {m.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f5f7fa' }}>
                  {messages.filter(msg => {
                    // Show if:
                    // 1. It's a public message (recipientId === 'all')
                    // 2. It's a private message sent TO me
                    // 3. It's a private message sent BY me
                    // AND (Optional filtering based on selected tab)
                    // If I selected 'all', show public messages.
                    // If I selected a person, show private messages with them.

                    const isPublic = !msg.recipientId || msg.recipientId === 'all';
                    const isToMe = msg.recipientId === user.uid;
                    const isFromMe = msg.userId === user.uid;
                    const isToSelected = msg.recipientId === chatRecipient;
                    const isFromSelected = msg.userId === chatRecipient;

                    if (chatRecipient === 'all') {
                      return isPublic;
                    } else {
                      // Private chat mode: Show msgs between me and selected user
                      return (isFromMe && isToSelected) || (isToMe && isFromSelected);
                    }
                  }).length === 0 && <p style={{ textAlign: 'center', color: '#aaa', fontSize: '12px' }}>No messages yet.</p>}

                  {messages.filter(msg => {
                    const isPublic = !msg.recipientId || msg.recipientId === 'all';
                    const isToMe = msg.recipientId === user.uid;
                    const isFromMe = msg.userId === user.uid;
                    const isToSelected = msg.recipientId === chatRecipient;
                    const isFromSelected = msg.userId === chatRecipient;

                    if (chatRecipient === 'all') {
                      return isPublic;
                    } else {
                      return (isFromMe && isToSelected) || (isToMe && isFromSelected);
                    }
                  }).map(msg => {
                    const isMe = msg.userId === user.uid;
                    return (
                      <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px', marginLeft: isMe ? 0 : '5px', textAlign: isMe ? 'right' : 'left' }}>
                          {!isMe && msg.userName.split(' ')[0]}
                        </div>
                        <div style={{
                          background: isMe ? (msg.recipientId && msg.recipientId !== 'all' ? '#7e57c2' : '#1a1a2e') : 'white', // Purple for private
                          color: isMe ? 'white' : '#333',
                          padding: '8px 12px', borderRadius: '15px',
                          borderBottomRightRadius: isMe ? '2px' : '15px',
                          borderBottomLeftRadius: isMe ? '15px' : '2px',
                          fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                          {msg.text}
                        </div>
                        {msg.recipientId && msg.recipientId !== 'all' && (
                          <div style={{ fontSize: '9px', color: '#aaa', textAlign: isMe ? 'right' : 'left', marginTop: '2px' }}>🔒 Private</div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div style={{ padding: '10px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', background: 'white' }}>
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', fontSize: '14px', outline: 'none' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    style={{ background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    ➤
                  </button>
                </div>
              </div>
            )}
          </>
        )
      }

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
      {
        showInstallPrompt && (
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
        )
      }
      {/* Gazette Modal */}
      {
        showGazetteModal && latestGazette && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(5px)'
          }} onClick={() => setShowGazetteModal(false)}>
            <div style={{
              background: '#fdfbf7', // Newspaper color
              padding: '30px', borderRadius: '5px',
              width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              border: '1px solid #d7d7d7',
              fontFamily: '"Times New Roman", Times, serif' // Newspaper font
            }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '10px', marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '32px', textTransform: 'uppercase', letterSpacing: '2px' }}>The Daily Gazette</h1>
                <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
                  {new Date(latestGazette.weekOf).toLocaleDateString()} • Vol. {Math.floor(Math.random() * 100) + 1}
                </p>
              </div>

              <div style={{ lineHeight: '1.6', fontSize: '18px', color: '#333', direction: latestGazette.lang === 'he' ? 'rtl' : 'ltr' }}>
                <ReactMarkdown>{latestGazette.content}</ReactMarkdown>
              </div>

              <div style={{ marginTop: '30px', textAlign: 'center' }}>
                <button
                  onClick={() => generateGazette(latestGazette.lang === 'he' ? 'en' : 'he')}
                  disabled={isGeneratingGazette}
                  style={{
                    background: '#333', color: 'white', border: 'none',
                    padding: '10px 20px', borderRadius: '5px',
                    fontSize: '14px', cursor: 'pointer', marginRight: '10px'
                  }}
                >
                  {isGeneratingGazette ? 'Printing...' : (latestGazette.lang === 'he' ? '🇺🇸 Read in English' : '🇮🇱 לקרוא בעברית')}
                </button>
                <button
                  onClick={() => setShowGazetteModal(false)}
                  style={{
                    background: 'none', color: '#333', border: '1px solid #333',
                    padding: '10px 20px', borderRadius: '5px',
                    fontSize: '14px', cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      }

      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div >
  );
}

export default App
