import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kazana</Text>
      <Text style={styles.subtitle}>Career intelligence on the go</Text>
      <Link href="/discover" asChild>
        <Pressable style={styles.btn}><Text style={styles.btnText}>Discover resumes</Text></Pressable>
      </Link>
      <Link href="/jobs" asChild>
        <Pressable style={[styles.btn, styles.btnOutline]}><Text style={styles.btnTextOutline}>Browse jobs</Text></Pressable>
      </Link>
      <Link href="/matches" asChild>
        <Pressable style={[styles.btn, styles.btnOutline]}><Text style={styles.btnTextOutline}>Your matches</Text></Pressable>
      </Link>
      <Link href="/settings" asChild>
        <Pressable style={styles.link}><Text style={styles.linkText}>Settings</Text></Pressable>
      </Link>
      <Link href="/login" asChild>
        <Pressable style={styles.link}><Text style={styles.linkText}>Login</Text></Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f9fafb' },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6b7280', marginBottom: 32, textAlign: 'center' },
  btn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, marginBottom: 12 },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb' },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  btnTextOutline: { color: '#2563eb', textAlign: 'center', fontWeight: '600' },
  link: { padding: 12 },
  linkText: { color: '#2563eb', textAlign: 'center' },
});
