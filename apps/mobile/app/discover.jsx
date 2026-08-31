import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { apiFetch } from '../lib/api';

export default function Discover() {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/resumes?page=1&limit=20')
      .then(({ data }) => setResumes(data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={resumes}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text>No resumes found</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.job_family} · {item.level}</Text>
          <Text style={styles.meta}>{(item.companies || []).join(', ')}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontWeight: '600', marginBottom: 4 },
  meta: { color: '#6b7280', fontSize: 14 },
  error: { color: '#ef4444', padding: 16 },
});
