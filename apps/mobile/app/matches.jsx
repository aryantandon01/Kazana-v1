import { useEffect, useState } from 'react';
import { Text, FlatList, StyleSheet, ActivityIndicator, View } from 'react-native';
import { apiFetch } from '../lib/api';

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/matches?page=1&limit=20')
      .then(({ data }) => setMatches(data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={matches}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No matches yet. Upload a resume on web and run matching.</Text>}
      renderItem={({ item }) => {
        const job = item.jobs;
        if (!job) return null;
        return (
        <View style={styles.card}>
          <Text style={styles.title}>{job.title} @ {job.company_name}</Text>
          <Text style={styles.score}>{Math.round(item.score * 100)}% match</Text>
        </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12 },
  title: { fontWeight: '600' },
  score: { color: '#2563eb', marginTop: 4 },
  empty: { color: '#6b7280', padding: 16 },
  error: { color: '#ef4444', padding: 16 },
});
