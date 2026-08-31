import { useEffect, useState } from 'react';
import { View, Text, Switch, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';

export default function Settings() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [minScore, setMinScore] = useState('0.6');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/preferences')
      .then(({ data }) => {
        if (data?.notifications) setPushEnabled(data.notifications.push_enabled);
        if (data?.profile?.min_match_score != null) setMinScore(String(data.profile.min_match_score));
      })
      .catch(() => {});
  }, []);

  const registerPushToken = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await apiFetch('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ token: tokenData.data, platform: 'ios' }),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          notifications: { push_enabled: pushEnabled },
          profile: { min_match_score: parseFloat(minScore) },
        }),
      });
      if (pushEnabled) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await registerPushToken();
      }
      Alert.alert('Saved', 'Settings updated');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text>Push notifications</Text>
        <Switch value={pushEnabled} onValueChange={setPushEnabled} />
      </View>
      <Text style={styles.label}>Min match score</Text>
      <TextInput style={styles.input} value={minScore} onChangeText={setMinScore} keyboardType="decimal-pad" />
      <Pressable style={styles.btn} onPress={save} disabled={saving}>
        <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  label: { marginBottom: 8, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 24 },
  btn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
