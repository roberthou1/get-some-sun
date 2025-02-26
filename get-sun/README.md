# Get Some Sun

Get Some Sun is a mobile app built with React Native and Expo that helps you balance your digital life by encouraging you to go outside. The app locks your social media apps until you take a selfie outside, promoting healthier screen time habits and encouraging outdoor activity.

## Features

- **Social Media App Locking**: Locks selected social media apps until you take a selfie
- **Daily Unlock System**: After taking a selfie, apps are unlocked for the rest of the day
- **Reminder Notifications**: Sends notifications to remind you to take a selfie and unlock your apps
- **Customizable App List**: Choose which social media apps you want to lock
- **Simple and Intuitive UI**: Beautiful, user-friendly interface

## How It Works

1. Choose which social media apps you want to lock
2. Each day, these apps will be locked until you take a selfie
3. Take a selfie through the app to unlock your social media apps for the day
4. Enjoy your social media with the satisfaction of having gone outside first!

## Getting Started

### Prerequisites

- Node.js
- Expo CLI
- iOS or Android device or emulator

### Installation

1. Clone the repository
```
git clone https://github.com/yourusername/get-some-sun.git
cd get-some-sun
```

2. Install dependencies
```
npm install
```

3. Start the development server
```
npx expo start
```

4. Follow the instructions to open the app on your device or emulator

## Technical Details

This app is built with:
- React Native
- Expo
- TypeScript
- Expo Camera
- Expo Notifications
- AsyncStorage for data persistence

## Notes on Implementation

Because of iOS and Android platform restrictions, this app uses a "trust-based" system. It cannot actually prevent you from opening other apps, but it serves as a mindful reminder to get outside before diving into social media.

For a real-world app that could actually restrict app usage, you would need:
- On Android: Build a launcher or use the UsageStatsManager API (requires special permissions)
- On iOS: This functionality is not possible due to platform restrictions

## License

MIT
