import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import useNotifications from '../../hooks/useNotifications';

export default function HomeScreen() {
  const [code, setCode] = useState('');
  const { sendLocalNotification, expoPushToken } = useNotifications();

  const handleSubmit = () => {
    if (code.trim() === '') {
      Alert.alert('Error', 'Please enter a code');
      return;
    }
    
    // Send a notification when code is submitted
    sendLocalNotification(
      '🏀 Team Code Submitted!',
      `Welcome to team ${code}! Get ready to dominate!`
    );
    
    // For now, just show the entered code
    Alert.alert('Code Submitted', `You entered: ${code}`);
    
    // TODO: Add your code validation logic here
    // Example: navigate to next screen, validate code, etc.
  };

  const testGameNotification = () => {
    sendLocalNotification(
      '🏀 Game Alert!',
      'Lakers vs Warriors starts in 30 minutes!'
    );
  };

  const testScoreUpdate = () => {
    sendLocalNotification(
      '🏆 Score Update',
      'Lakers 95 - Warriors 92 (Final Quarter)'
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#FF6600" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🏀</Text>
        <Text style={styles.titleText}>Basketball Monster</Text>
        <Text style={styles.subtitle}>Enter Your Team Code</Text>
        
        {/* Notification status */}
        <View style={styles.notificationStatus}>
          {expoPushToken ? (
            <Text style={styles.statusText}>🔔 Notifications Ready</Text>
          ) : (
            <Text style={styles.statusText}>⏳ Setting up notifications...</Text>
          )}
        </View>
      </View>

      {/* Main Content */} 
      <View style={styles.content}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Team Code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Enter code here..."
            placeholderTextColor="#FF9966"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
          />
        </View>

        <TouchableOpacity 
          style={styles.submitButton}
          onPress={handleSubmit}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>SUBMIT</Text>
        </TouchableOpacity>

        {/* Notification Test Buttons */}
        <View style={styles.testSection}>
          <Text style={styles.testTitle}>Test Notifications:</Text>
          
          <TouchableOpacity 
            style={styles.testButton}
            onPress={testGameNotification}
            activeOpacity={0.8}
          >
            <Text style={styles.testButtonText}>🏀 Game Alert</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.testButton, styles.testButton2]}
            onPress={testScoreUpdate}
            activeOpacity={0.8}
          >
            <Text style={styles.testButtonText}>🏆 Score Update</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Ready to dominate the court!</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FF6600', // Main orange background
  },
  header: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  title: {
    fontSize: 80,
    marginBottom: 10,
  },
  titleText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#FFE5CC',
    marginTop: 10,
    fontWeight: '500',
  },
  notificationStatus: {
    marginTop: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 30,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#FF6600',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  submitButton: {
    backgroundColor: '#CC3300',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 150,
    marginBottom: 30,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  testSection: {
    width: '100%',
    alignItems: 'center',
  },
  testTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 10,
    minWidth: 150,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  testButton2: {
    backgroundColor: 'rgba(204, 51, 0, 0.3)',
  },
  testButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  footerText: {
    color: '#FFE5CC',
    fontSize: 16,
    fontStyle: 'italic',
  },
});