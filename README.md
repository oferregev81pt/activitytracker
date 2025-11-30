# Family Activity & Chore Tracker 🏠❤️

A comprehensive React application designed to help families track their daily health habits, household chores, and nutrition in a fun and collaborative way.

## 🌟 Features

### 1. **Home Dashboard** 🏠
- A central hub showing a quick summary of your daily progress across all categories.
- Quick navigation to detailed sections.
- Preview of your weekly activity trends.

### 2. **Health Tracker** ❤️
- **Hydration Tracking**: Log water intake with specific volumes (Cup: 180ml, Bottle: 750ml).
- **Activity Logging**: Track daily bathroom habits (Pee/Poo) with a simple tap.
- **Goals**: Set personalized daily goals for hydration and activities.
- **Undo Functionality**: Accidentally clicked? Easily undo your last entry.
- **Celebrations**: Get a celebratory message when you hit your daily goals! 🎉

### 3. **Chore Gamification** 🧹
- **Chore List**: Pre-defined list of household chores (Dishes, Laundry, Trash, etc.).
- **Points System**: Earn points for every chore completed.
- **Leaderboard Integration**: Chore points contribute to your total score on the family leaderboard.

### 4. **Food Journal** 🍎
- Simple text entry to log your daily meals.
- *Upcoming*: AI-powered nutritional analysis.

### 5. **Trends & Analytics** 📊
- **Interactive Charts**: Visualize your family's activity over the last week or month.
- **Dual-Axis Graphs**: Smartly displays drink volume (ml) alongside activity counts on the same chart.
- **Global Filtering**: Filter charts by specific family members or activity types.

### 6. **Family Leaderboard** 🏆
- **Real-time Rankings**: See who is leading the family in healthy habits and helping out around the house.
- **Time Ranges**: View rankings for Today, This Week, This Month, or All Time.

### 7. **Group Management** 👨‍👩‍👧‍👦
- **Easy Onboarding**: Sign in with Google.
- **Family Groups**: Create a new family group or join an existing one using a unique 6-character code.
- **Real-time Sync**: All data is synced instantly across all family members' devices using Firebase.

## 🛠️ Tech Stack

- **Frontend**: React.js, Vite
- **Styling**: Vanilla CSS (Mobile-first design)
- **Database & Auth**: Firebase (Firestore, Google Auth)
- **Visualization**: Recharts for data analytics
- **Deployment**: Firebase Hosting

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- A Firebase project with Authentication and Firestore enabled

### Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd activitytracker
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Firebase**
    - Create a `src/firebase.js` file with your Firebase configuration keys.

4.  **Run Locally**
    ```bash
    npm run dev
    ```

5.  **Build for Production**
    ```bash
    npm run build
    ```

## 📱 Mobile Optimized
The application is designed with a "mobile-first" approach, ensuring a native-app-like experience on smartphones with touch-friendly buttons and responsive layouts.
