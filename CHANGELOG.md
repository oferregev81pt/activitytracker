# Changelog

## [1.5.4] - 2025-12-03
### Fixed
- **Daily Goals**: Included "Chores" in the daily goal progress donut chart calculation and visualization

## [1.5.3] - 2025-12-03
### Fixed
- **Settings**: Added missing "Chores" goal configuration to Daily Goals settings (default: 10)

## [1.5.2] - 2025-12-03
### Changed
- **Bathroom Update**: Combined Pee and Poo into a single "Bathroom" category with a new icon (🧻)
- **Carousel Layout**: Improved carousel symmetry for better visual balance
- **iOS Improvements**: Fixed "Add Meal" modal visibility and scrolling on iOS devices
- **Language Settings**: Language preference is now saved and persists across app reloads
- **Activity Logs**: Added icons to activity log entries for better readability

## [1.5.1] - 2025-12-03
### Added
- **Auto-Generated What's New**: Created build-time script that automatically generates What's New content from CHANGELOG.md
- **Dynamic Changelog Display**: What's New section now automatically updates when CHANGELOG.md is modified

### Changed
- **Build Process**: Added `generate-changelog.js` script to build pipeline
- **What's New UI**: Replaced hardcoded version cards with dynamic rendering from changelog data

## [1.5.0] - 2025-12-03
### Added
- **Comprehensive Hebrew Translations**: Added 100+ translation keys covering all major UI elements
- **What's New from CHANGELOG**: Dynamic version-based sections with color-coded cards showing update history
- **Desktop Responsiveness**: Increased max-width from 480px to 768px for better tablet/desktop experience

### Changed
- **UI Spacing Improvements**: Reduced spacing between carousel and streak, improved overall layout density
- **Translation Coverage**: Side menu, navigation, settings, profile, chat, shopping, leaderboard all fully bilingual
- **Header Behavior**: Dynamic header titles that change based on active settings page

### Fixed
- **Login Error**: Added missing handleGoogleLogin function
- **Scroll Issues**: Fixed overflow and scroll behavior across all pages
- **Header Icons**: Removed redundant refresh and settings icons from header

## [1.4.0] - 2025-12-03
### Changed
- **Navigation Overhaul**: Streamlined bottom navigation with Trends, Home, Shopping, and Menu.
- **Side Menu**: New slide-out menu for quick access to Family, Profile, Goals, and System settings.
- **Settings Pages**: Dedicated full-screen pages for each settings category.
- **Home Tab**: Centered and emphasized in the navigation bar.
- **Logout**: Added explicit Logout option in the side menu.

## [1.2.0] - 2025-12-02
### Added
- **Settings Page**: Converted settings modal to a full page integrated with Family view.
- **Analytics**: Integrated Firebase Analytics for tracking user engagement.
- **What's New**: Added a section to view recent app updates.

### Fixed
- **Daily Goals Chart**: Fixed percentage calculation to consistently use goal defaults.
- **Reaction Hover**: Improved reaction button UI to show names on hover/click.

## [1.3.0] - 2025-12-02
### Added
- **Data Encryption**: Implemented AES encryption for all new user data (sticky notes, food logs, activities) to enhance privacy.
- **iOS Improvements**: Fixed modal scrolling issues on iOS devices.
### Fixed
- **Streak Calculation**: Corrected weekly streak logic to only count the current user's activities.
- **Analytics**: Restored analytics functionality.

## [1.2.1] - 2025-12-02
### Fixed
- **Safari Login Issue**: Switched to `signInWithPopup` to resolve "missing initial state" errors on Safari and other browsers with strict privacy settings.
- **Reaction Names**: Added tooltip and count display for who reacted to activities.

## [1.1.0] - 2025-12-02
### Added
- **Food Tracking Overhaul**: New "Add Meal" modal with AI analysis, photo upload, and healthy/junk classification.
- **Activity Reactions**: Added Like (👍), Love (❤️), and Dislike (👎) reactions to food and chores.
- **Improved Leaderboard**: Expandable chore lists per user with reaction support.
- **Translations**: Full Hebrew support for new features.
- **UI Improvements**: Better "Add Meal" modal layout, delete buttons for own meals.

## [1.0.0] - 2025-12-02
### Added
- Initial release with version tracking.
- Added version display in the main UI.
- Implemented "Podium" view for Trends.
- Added stacked bar charts for Chores breakdown.
