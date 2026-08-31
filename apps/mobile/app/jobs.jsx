import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Linking, Pressable } from 'react-native';
import { apiFetch } from '../lib/api';

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/jobs?page=1&limit=20')
      .then(({ data }) => setJobs(data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={jobs}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>{item.company_name}{item.location ? ` · ${item.location}` : ''}</Text>
          <Pressable onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.link}>Apply →</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontWeight: '600', marginBottom: 4 },
  meta: { color: '#6b7280', fontSize: 14, marginBottom: 8 },
  link: { color: '#2563eb', fontWeight: '600' },
});
