import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Image, 
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  Switch,
  Modal,
  Animated,
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set up notifications handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Define camera types
type CameraFacing = 'front' | 'back';

// Define social media apps to be monitored
const SOCIAL_MEDIA_APPS = [
  { name: 'Instagram', icon: '📸', packageName: 'com.instagram.android', bundleId: 'com.burbn.instagram' },
  { name: 'Facebook', icon: '👤', packageName: 'com.facebook.katana', bundleId: 'com.facebook.Facebook' },
  { name: 'TikTok', icon: '🎵', packageName: 'com.zhiliaoapp.musically', bundleId: 'com.zhiliaoapp.musically' },
  { name: 'Twitter', icon: '🐦', packageName: 'com.twitter.android', bundleId: 'com.atebits.Tweetie2' },
  { name: 'Snapchat', icon: '👻', packageName: 'com.snapchat.android', bundleId: 'com.toyopagroup.picaboo' },
  { name: 'YouTube', icon: '▶️', packageName: 'com.google.android.youtube', bundleId: 'com.google.ios.youtube' },
];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [type, setType] = useState<CameraFacing>('front');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lastUnlockTime, setLastUnlockTime] = useState<Date | null>(null);
  const [lockedApps, setLockedApps] = useState<string[]>([]);
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const [notification, setNotification] = useState<boolean>(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [scanningModalVisible, setScanningModalVisible] = useState(false);
  const [isOutside, setIsOutside] = useState<boolean | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  
  const cameraRef = useRef<any>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  // Check if two dates are the same day
  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Load settings from AsyncStorage
  const loadFromStorage = async () => {
    try {
      const storedLockedApps = await AsyncStorage.getItem('lockedApps');
      const storedUnlockTime = await AsyncStorage.getItem('lastUnlockTime');
      
      if (storedLockedApps) {
        setLockedApps(JSON.parse(storedLockedApps));
      } else {
        // Default to all apps locked on first run
        setLockedApps(SOCIAL_MEDIA_APPS.map(app => app.name));
        await AsyncStorage.setItem('lockedApps', JSON.stringify(SOCIAL_MEDIA_APPS.map(app => app.name)));
      }
      
      if (storedUnlockTime) {
        setLastUnlockTime(new Date(JSON.parse(storedUnlockTime)));
      }
    } catch (error) {
      console.error('Error loading from storage:', error);
    }
  };

  // Schedule a reminder notification
  const scheduleReminderNotification = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Schedule for 10am if it's before 10am, or for tomorrow if it's after
    const now = new Date();
    const scheduledTime = new Date();
    
    scheduledTime.setHours(10, 0, 0, 0);
    
    if (now.getHours() >= 10) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const secondsUntilReminder = Math.floor((scheduledTime.getTime() - now.getTime()) / 1000);
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time to get some sun! ☀️",
        body: "Take a selfie outside to unlock your social media apps for today.",
        sound: true,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilReminder,
      },
    });
  };

  // Check and schedule reminder if needed
  const checkAndScheduleReminder = async () => {
    // Check if we should schedule a reminder (if apps are locked and no selfie taken today)
    if (lockedApps.length > 0 && (!lastUnlockTime || !isSameDay(new Date(), lastUnlockTime))) {
      await scheduleReminderNotification();
    }
  };

  // Register for push notifications
  const registerForPushNotificationsAsync = async () => {
    let token;
    
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Failed to get push token for push notification!');
        return;
      }
      
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } else {
      Alert.alert('Must use physical device for Push Notifications');
    }
    
    return token;
  };

  // Prepare app and hide splash screen
  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load any resources, fetch data, etc.
        await loadFromStorage();
        
        // Get media library permissions for saving photos
        await MediaLibrary.requestPermissionsAsync();
        
        // Register for push notifications
        registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

        // Set up reminder notification if needed
        await checkAndScheduleReminder();
        
        // Artificial delay to show splash screen (remove in production)
        await new Promise(resolve => setTimeout(resolve, 2500));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
    
    // Listen for notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(true);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      setCameraVisible(true);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  // Effect to clean up camera state when component unmounts
  useEffect(() => {
    return () => {
      // Reset camera state when component unmounts
      setIsCameraReady(false);
    };
  }, []);

  // Effect to handle scan completion
  useEffect(() => {
    if (scanComplete && isOutside !== null) {
      // Add a small delay to allow the animation to finish
      const timer = setTimeout(() => {
        // No need to auto-close if it's already closed
        if (scanningModalVisible) {
          // Only auto-close if successful
          if (isOutside) {
            handleScanComplete();
          } else {
            // Also handle the case when not outside
            handleScanComplete();
          }
        }
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [scanComplete, isOutside, scanningModalVisible]);

  // Check if apps should be locked
  const areAppsLocked = () => {
    // If no last unlock time or it's not today, apps are locked
    if (!lastUnlockTime || !isSameDay(new Date(), lastUnlockTime)) {
      return true;
    }
    return false;
  };

  // Handle scan completion
  const handleScanComplete = () => {
    setScanningModalVisible(false);
    
    if (isOutside) {
      // Show success message
      Alert.alert(
        "Great job! 🌞",
        "You've unlocked your social media apps for today. Get some sun and enjoy your day!",
        [{ text: "OK" }]
      );
    } else {
      // Show failure message
      Alert.alert(
        "Hmm... 🤔",
        "It doesn't look like you're outside. Please go outside and take another selfie to unlock your apps.",
        [{ text: "OK" }]
      );
    }
  };

  // Take a selfie and unlock apps
  const takePicture = async () => {
    if (!isCameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for the camera to initialize.');
      return;
    }
    
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        
        // Save photo to media library
        await MediaLibrary.saveToLibraryAsync(photo.uri);
        
        setCapturedImage(photo.uri);
        setCameraVisible(false);
        setIsCameraReady(false); // Reset camera ready state
        
        // Show scanning modal and start detection
        setScanningModalVisible(true);
        startScanAnimation();
        detectIfOutside(photo.uri);
      } catch (error) {
        console.error('Error taking picture:', error);
        Alert.alert('Error', 'Failed to take picture. Please try again.');
      }
    }
  };

  // Start scanning animation
  const startScanAnimation = () => {
    setScanComplete(false);
    setIsOutside(null);
    
    // Reset animation value
    scanLineAnim.setValue(0);
    
    // Create animation sequence
    Animated.timing(scanLineAnim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        // Start another animation for a total of 4 passes
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            Animated.timing(scanLineAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) {
                Animated.timing(scanLineAnim, {
                  toValue: 0,
                  duration: 2000,
                  useNativeDriver: true,
                }).start(({ finished }) => {
                  if (finished) {
                    setScanComplete(true);
                  }
                });
              }
            });
          }
        });
      }
    });
  };

  // Detect if the photo was taken outside based on brightness and colors
  const detectIfOutside = async (imageUri: string) => {
    // Simulate detection with a timeout
    // In a real app, you would analyze the image here
    setTimeout(() => {
      try {
        // Random detection for demo purposes
        // In a real implementation, you would analyze the image for:
        // - Overall brightness (outdoor photos are usually brighter)
        // - Sky detection (look for blue pixels at the top of the image)
        // - Green detection (look for natural elements like grass, trees)
        // - Shadows and lighting patterns typical of outdoor environments
        
        // For demo, we'll use a random result with 80% chance of success
        const result = Math.random() > 0.2;
        setIsOutside(result);
        
        // If detected as outside, update last unlock time
        if (result) {
          const now = new Date();
          setLastUnlockTime(now);
          AsyncStorage.setItem('lastUnlockTime', JSON.stringify(now.toISOString()));
          
          // Cancel scheduled notifications since user has taken a selfie
          Notifications.cancelAllScheduledNotificationsAsync();
        }
        
        // Ensure scan is marked as complete
        setScanComplete(true);
      } catch (error) {
        console.error('Error in detection:', error);
        // In case of error, default to not outside
        setIsOutside(false);
        setScanComplete(true);
      }
    }, 4000); // Reduced to 4 seconds for better user experience
  };

  if (!appIsReady) {
    return null;
  }

  // Handle toggling app lock status
  const toggleAppLock = async (appName: string) => {
    let newLockedApps;
    
    if (lockedApps.includes(appName)) {
      newLockedApps = lockedApps.filter(app => app !== appName);
    } else {
      newLockedApps = [...lockedApps, appName];
    }
    
    setLockedApps(newLockedApps);
    await AsyncStorage.setItem('lockedApps', JSON.stringify(newLockedApps));
    
    // Update reminder notification based on new lock status
    checkAndScheduleReminder();
  };

  // Render camera for taking selfie
  const renderCamera = () => {
    if (!permission?.granted) {
      // If permission is not granted, show permission request modal
      return (
        <Modal
          animationType="slide"
          transparent={true}
          visible={cameraVisible}
          onRequestClose={() => setCameraVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Camera Permission Required</Text>
              <Text style={styles.modalText}>
                We need camera permission to take outdoor selfies.
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={async () => {
                  const result = await requestPermission();
                  if (!result.granted) {
                    Alert.alert(
                      "Permission Required",
                      "Camera access is required to use this feature. Please enable it in your device settings.",
                      [{ text: "OK", onPress: () => setCameraVisible(false) }]
                    );
                  }
                }}
              >
                <Text style={styles.modalButtonText}>Grant Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#6c757d', marginTop: 10 }]}
                onPress={() => setCameraVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      );
    }

    if (cameraVisible) {
      return (
        <View style={styles.cameraContainer}>
          <CameraView
            style={{ flex: 1 }}
            facing={type}
            ref={cameraRef}
            onCameraReady={() => setIsCameraReady(true)}
            onMountError={(error) => {
              console.error('Camera mount error:', error);
              Alert.alert('Camera Error', 'Failed to start camera. Please try again.');
            }}
          />
          {isCameraReady && (
            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={styles.cameraCloseButton}
                onPress={() => {
                  setCameraVisible(false);
                  setIsCameraReady(false);
                }}
              >
                <Text style={{ color: 'white', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.cameraTakePictureButton}
                onPress={takePicture}
              >
                <View style={styles.cameraTakePictureInner} />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.cameraFlipButton}
                onPress={() => setType(type === 'front' ? 'back' : 'front')}
              >
                <Text style={{ color: 'white', fontSize: 18 }}>⟲</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }
    
    return null;
  };

  // Render about modal
  const renderAboutModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={aboutModalVisible}
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Image 
              source={require('./assets/sun-logo.png')} 
              style={styles.aboutModalLogo} 
            />
            <Text style={styles.modalTitle}>About Get Some Sun</Text>
            <Text style={styles.modalText}>
              This app helps you balance your digital life by encouraging you to go outside.
            </Text>
            <Text style={styles.modalText}>
              Take a selfie outside once a day to unlock your social media apps.
            </Text>
            <Text style={styles.modalText}>
              Remember, a little sunshine is good for your physical and mental health!
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setAboutModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Render scanning modal
  const renderScanningModal = () => {
    const { width, height } = Dimensions.get('window');
    const scanLineTranslateY = scanLineAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, height]
    });

    return (
      <Modal
        animationType="fade"
        transparent={false}
        visible={scanningModalVisible}
        onRequestClose={() => setScanningModalVisible(false)}
      >
        <View style={styles.fullScreenModalContainer}>
          {capturedImage && (
            <View style={{ width: '100%', height: '100%', position: 'relative' }}>
              <Image 
                source={{ uri: capturedImage }} 
                style={styles.fullScreenBackgroundImage} 
                blurRadius={0}
              />
              
              {!scanComplete && (
                <Animated.View 
                  style={[
                    styles.fullScreenScanLine, 
                    { 
                      transform: [{ translateY: scanLineTranslateY }],
                      width: width,
                      position: 'absolute',
                      zIndex: 10
                    }
                  ]}
                />
              )}
            </View>
          )}
          
          <View style={styles.scanOverlayContainer}>
            <View style={styles.scanningHeader}>
              <Image 
                source={require('./assets/sun-logo.png')} 
                style={styles.scanModalLogo} 
              />
              <Text style={styles.scanningTitle}>
                {scanComplete 
                  ? isOutside 
                    ? "Outdoor Selfie Detected! ☀️" 
                    : "Indoor Selfie Detected 🏠"
                  : "Analyzing your selfie..."}
              </Text>
            </View>
            
            {scanComplete && (
              <TouchableOpacity
                style={[
                  styles.scanningButton,
                  isOutside ? { backgroundColor: '#28a745' } : { backgroundColor: '#dc3545' }
                ]}
                onPress={handleScanComplete}
              >
                <Text style={styles.scanningButtonText}>
                  {isOutside ? "Great! Continue" : "Try Again Outside"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.container} onLayout={onLayoutRootView}>
      <StatusBar style="dark" />
      
      {renderCamera()}
      {renderAboutModal()}
      {renderScanningModal()}
      
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image 
            source={require('./assets/sun-logo.png')} 
            style={styles.headerLogo} 
          />
          <Text style={styles.title}>Get Some Sun</Text>
        </View>
        <TouchableOpacity onPress={() => setAboutModalVisible(true)}>
          <Text style={styles.infoButton}>ℹ️</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Status: 
            <Text style={areAppsLocked() ? styles.statusLocked : styles.statusUnlocked}>
              {areAppsLocked() ? ' Locked' : ' Unlocked'}
            </Text>
          </Text>
          {lastUnlockTime && (
            <Text style={styles.statusText}>
              Last unlocked: {lastUnlockTime.toLocaleDateString()}
            </Text>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={() => setCameraVisible(true)}
        >
          <Text style={styles.buttonText}>Take Outdoor Selfie</Text>
        </TouchableOpacity>
        
        <Text style={styles.sectionTitle}>Manage App Locks</Text>
        <View style={styles.appList}>
          {SOCIAL_MEDIA_APPS.map((app, index) => (
            <View key={index} style={styles.appItem}>
              <Text style={styles.appName}>{app.icon} {app.name}</Text>
              <Switch
                value={lockedApps.includes(app.name)}
                onValueChange={() => toggleAppLock(app.name)}
                trackColor={{ false: '#e9ecef', true: '#a5d8ff' }}
                thumbColor={lockedApps.includes(app.name) ? '#4dabf7' : '#f8f9fa'}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#343a40',
  },
  infoButton: {
    fontSize: 20,
    padding: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#343a40',
  },
  appList: {
    marginBottom: 20,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  appName: {
    fontSize: 16,
    color: '#495057',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    marginRight: 10,
    color: '#495057',
  },
  statusLocked: {
    color: '#dc3545',
    fontWeight: '500',
  },
  statusUnlocked: {
    color: '#28a745',
    fontWeight: '500',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  primaryButton: {
    backgroundColor: '#4dabf7',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  failureButton: {
    backgroundColor: '#dc3545',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
  },
  cameraTakePictureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  cameraTakePictureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#000',
  },
  cameraFlipButton: {
    padding: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 30,
  },
  cameraCloseButton: {
    padding: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 30,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scanningModalContent: {
    height: 300,
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
    color: '#343a40',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
    color: '#495057',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
    backgroundColor: '#4dabf7',
    marginTop: 10,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanContainer: {
    width: '100%',
    height: 200,
    overflow: 'hidden',
    marginVertical: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    backgroundColor: '#f8f9fa',
  },
  scanLine: {
    height: 2,
    backgroundColor: '#4dabf7',
    width: '100%',
  },
  aboutModalLogo: {
    width: 60,
    height: 60,
    marginBottom: 20,
  },
  scanModalLogo: {
    width: 60,
    height: 60,
    marginBottom: 15,
  },
  fullScreenModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  scanOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
  },
  scanOverlay: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scanningHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  scanningTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  fullScreenScanLine: {
    height: 4,
    backgroundColor: 'rgba(77, 171, 247, 0.8)',
    shadowColor: '#4dabf7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
    left: 0,
    right: 0,
  },
  scanningButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  scanningButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
